from __future__ import annotations

import asyncio
from datetime import datetime
from typing import Any, Dict, Optional, TYPE_CHECKING

from edgepulse.utils.log_handler import get_logger
from edgepulse.models.metrics import MetricCollector, StandardMetrics
from edgepulse.models import AlertEvent, DetectionEvent, SeverityLevel

if TYPE_CHECKING:
    from edgepulse.pipeline.protocols import AlertEngine
    from edgepulse.pipeline.alert.notifier import LocalNotifier
    from edgepulse.analysis.alert_report import AlertReportBuilder
    from edgepulse.storage.database import Database
    from edgepulse.sync.sync_queue import SyncQueue

logger = get_logger(__name__)


class AlertHandler:
    def __init__(
        self,
        device_id: str,
        report_generator: AlertReportBuilder,
        alert_engine: AlertEngine,
        database: Database,
        sync_queue: Optional[SyncQueue],
        metrics: MetricCollector,
        notifier: Optional[LocalNotifier] = None,
    ) -> None:
        self.device_id = device_id
        self.report_generator = report_generator
        self.alert_engine = alert_engine
        self.database = database
        self.sync_queue = sync_queue
        self.metrics = metrics
        self.notifier = notifier

    async def handle(
        self,
        detection: Dict[str, Any],
        features: Optional[Any],
        severity_label: str,
        explainer: Optional[Any] = None,
    ) -> None:

        await self._persist_detection(detection)

        self.metrics.increment_counter(
            StandardMetrics.ANOMALIES_DETECTED_TOTAL,
            labels={"severity": severity_label},
        )
        self.metrics.observe_histogram(
            StandardMetrics.ALERT_ANOMALY_SCORE,
            detection.get("anomaly_score", 0.5),
            labels={"severity": severity_label},
        )

        explanation: Dict[str, Any] = await self._get_explanation(features, detection, explainer)

        alert = await self._run_alert_engine(detection, explanation)
        if not alert:
            return

        anomaly_data = {
            "anomaly_score": detection.get("anomaly_score", 0.0),
            "label": detection.get("label", 0),
            "confidence": detection.get("confidence", 0.0),
            "detector": detection.get("detector"),
        }
        report = await asyncio.to_thread(
            self.report_generator.generate_alert_report,
            anomaly_data,
            explanation,
            {"raw_detection": detection},
        )
        alert.update({"report": report})

        await self._persist_alert(alert, detection, explanation, severity_label)

        alert_severity = str(alert.get("severity", severity_label))
        self.metrics.record_alert(alert_severity)

        await self._notify(alert)

        await self._enqueue_for_sync(alert, severity_label)

    async def _persist_detection(self, detection: Dict[str, Any]) -> None:
        try:
            event = DetectionEvent(
                device_id=self.device_id,
                component="detector",
                detector_name=detection.get("detector", "unknown"),
                label=detection.get("label", 0),
                anomaly_score=detection.get("anomaly_score"),
                confidence=detection.get("confidence"),
                model_version=detection.get("model_version", "1.0"),
                detection_metadata={"raw_detection": detection},
            )
            await self.database.insert_detection(event)
        except Exception as exc:
            logger.error("detection_persist_error", error=str(exc))

    async def _get_explanation(
        self,
        features: Optional[Any],
        detection: Dict[str, Any],
        explainer: Optional[Any],
    ) -> Dict[str, Any]:
        if explainer is None or features is None:
            return {}
        try:
            anomaly_score = detection.get("anomaly_score", 0.0)
            result = explainer.explain(features, anomaly_score)

            if hasattr(result, "to_dict"):
                return result.to_dict()
            return result or {}
        except Exception as exc:
            logger.error("shap_explanation_error", error=str(exc))
            return {}

    async def _run_alert_engine(
        self, detection: Dict[str, Any], explanation: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        try:
            return await asyncio.to_thread(
                self.alert_engine.process_anomaly,
                detection,
                explanation,
            )
        except Exception as exc:
            logger.error("alert_engine_error", error=str(exc))
            return None

    async def _persist_alert(
        self,
        alert: Dict[str, Any],
        detection: Dict[str, Any],
        explanation: Dict[str, Any],
        severity_label: str,
    ) -> None:
        try:
            raw_severity = str(alert.get("severity", severity_label)).lower()
            try:
                sev = SeverityLevel(raw_severity)
            except ValueError:
                sev = SeverityLevel.MEDIUM

            alert_event = AlertEvent(
                device_id=self.device_id,
                component="alert_engine",
                severity=sev,
                anomaly_score=alert.get("anomaly_score", 0.0),
                alert_type=alert.get("anomaly", {}).get("anomaly_type", "behavioral_deviation"),
                detector_type=detection.get("detector", "unknown"),
                explanation=alert.get("explanation", {}),
                feature_importance=explanation.get("feature_importance"),
                acknowledged=False,
            )
            await self.database.insert_alert(alert_event)
            logger.debug("alert_saved_to_database", alert_id=alert.get("alert_id"))
        except Exception as exc:
            logger.error("alert_persist_error", error=str(exc))

    async def _notify(self, alert: Dict[str, Any]) -> None:
        if self.notifier is None:
            return
        try:
            await asyncio.to_thread(self.notifier.notify_all, alert)
        except Exception as exc:
            logger.error("local_notification_error", error=str(exc))

    async def _enqueue_for_sync(
        self,
        alert: Dict[str, Any],
        severity_label: str,
    ) -> None:
        if self.sync_queue is None:
            return
        try:
            raw_severity = alert.get("severity", severity_label)
            if hasattr(raw_severity, "value"):
                severity_val = raw_severity.value
            else:
                severity_val = str(raw_severity).lower()

            anomaly_type = alert.get("anomaly", {}).get("anomaly_type", "behavioral_deviation")

            detector = alert.get("anomaly", {}).get("detector", "unknown")

            payload = {
                "alert_id": alert.get("alert_id"),
                "device_id": self.device_id,
                "title": anomaly_type,
                "description": alert.get("anomaly", {}).get("description", "Anomaly detected"),
                "severity": severity_val,
                "status": "PENDING",
                "category": anomaly_type,
                "alert_type": anomaly_type,
                "detector_type": detector,
                "confidence": alert.get("anomaly", {}).get("confidence", 0.0),
                "anomaly_score": alert.get("anomaly_score", 0.0),
                "model_id": f"iforest-{self.device_id[:8]}",
                "inference_latency_ms": 0,
                "telemetry_source": "PROCESS",
                "created_at": datetime.utcnow().isoformat() + "Z",
                "updated_at": datetime.utcnow().isoformat() + "Z",
                "read": False,
            }
            await self.sync_queue.enqueue("alert_records", payload, priority=5)
            logger.info("alert_queued_for_sync", alert_id=alert.get("alert_id"))
        except Exception as exc:
            logger.error("alert_sync_queue_error", error=str(exc))
