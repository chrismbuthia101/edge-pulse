from datetime import datetime
from typing import Any, Dict, Optional

import numpy as np

from edgepulse.agent.events import Event
from edgepulse.analysis.service import ExplainerService
from edgepulse.models.metrics import MetricCollector, StandardMetrics
from edgepulse.pipeline.alert.handler import AlertHandler
from edgepulse.pipeline.extract.normalizer import DeviceNormalizer
from edgepulse.sync.sync_queue import SyncQueue
from edgepulse.utils.log_handler import get_logger

logger = get_logger(__name__)

_WARMUP_CYCLES = 1


def _utcnow_iso() -> str:
    return datetime.utcnow().isoformat() + "Z"


class AnomalyEventHandler:

    def __init__(
        self,
        alert_handler: AlertHandler,
        sync_queue: Optional[SyncQueue],
        explainer_service: ExplainerService,
        normalizer: DeviceNormalizer,
        metrics: MetricCollector,
        device_id: str,
    ) -> None:
        self._alert_handler = alert_handler
        self._sync_queue = sync_queue
        self._explainer_service = explainer_service
        self._normalizer = normalizer
        self._metrics = metrics
        self._device_id = device_id
        self._warmup_cycles_remaining: int = _WARMUP_CYCLES

    @property
    def warmup_remaining(self) -> int:
        return self._warmup_cycles_remaining

    @warmup_remaining.setter
    def warmup_remaining(self, value: int) -> None:
        self._warmup_cycles_remaining = value

    async def __call__(self, event: Event) -> None:
        data = event.data or {}
        detection = data.get("detection", {}) or {}
        features = data.get("features")
        severity_label = data.get("severity", detection.get("severity", "medium"))

        if self._warmup_cycles_remaining > 0:
            self._warmup_cycles_remaining -= 1
            logger.info(
                "warmup_cycle_suppressed",
                cycles_remaining=self._warmup_cycles_remaining,
                anomaly_score=detection.get("anomaly_score", 0.0),
            )
            if features is not None:
                try:
                    feat_array = np.asarray(features, dtype=float)
                    if feat_array.ndim == 1:
                        feat_array = feat_array.reshape(1, -1)
                    self._normalizer.update_baseline(feat_array)
                except Exception as e:
                    logger.debug("warmup_baseline_update_error", error=str(e))
            return

        logger.info(
            "anomaly_detected",
            severity=severity_label,
            detector=detection.get("detector"),
        )

        await self._alert_handler.handle(
            detection,
            features,
            severity_label,
            explainer=self._explainer_service if self._explainer_service.is_available else None,
        )

        await self._enqueue_anomaly_data(detection, features)

    async def _enqueue_anomaly_data(
        self, detection: Dict[str, Any], features: Optional[Any]
    ) -> None:
        if self._sync_queue is None:
            return

        try:
            detector_name = str(detection.get("detector", "iforest")).lower()
            model_id = f"{detector_name}-{self._device_id[:8]}"
            now = _utcnow_iso()

            anomaly_payload = {
                "model_id": model_id,
                "score": detection.get("anomaly_score", 0.0),
                "label": str(detection.get("label", 0)),
                "threshold_applied": detection.get("detection_threshold_applied", 0.75),
                "above_threshold": detection.get("is_alert_triggered", False),
                "inference_latency_ms": detection.get("inference_latency_ms", 0),
                "connectivity_state": "online",
                "scored_at": now,
                "created_at": now,
            }
            await self._sync_queue.enqueue("anomaly_scores", anomaly_payload, priority=3)

            if features is not None:
                feat_arr = np.asarray(features, dtype=float).flatten()
                feature_dict = {f"feature_{i}": float(v) for i, v in enumerate(feat_arr)}
                fv_payload = {
                    "model_id": model_id,
                    "features": feature_dict,
                    "feature_version": "v1.0",
                    "computed_at": now,
                    "created_at": now,
                }
                await self._sync_queue.enqueue("feature_vectors", fv_payload, priority=3)
        except Exception as e:
            logger.error("alert_sync_queue_error", error=str(e))


class SyncEventHandler:

    def __init__(self, metrics: MetricCollector) -> None:
        self._metrics = metrics

    async def __call__(self, event: Event) -> None:
        data = event.data
        logger.info("sync_completed", items=data.get("count", 0))
        self._metrics.increment_counter(StandardMetrics.SYNC_ATTEMPTS_TOTAL)
        self._metrics.set_gauge(StandardMetrics.SYNC_SUCCESS_RATE, 1.0)
