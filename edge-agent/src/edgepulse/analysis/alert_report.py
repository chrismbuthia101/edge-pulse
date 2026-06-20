from edgepulse.utils.log_handler import get_logger
import uuid
from typing import Dict, Optional, Any
from datetime import datetime

from edgepulse.models import SeverityLevel

logger = get_logger(__name__)


class AlertReportBuilder:

    def __init__(self, device_id: str):
        self.device_id = device_id

    def assign_severity(self, anomaly_score: float) -> SeverityLevel:
        if anomaly_score > 0.9:
            return SeverityLevel.CRITICAL
        elif anomaly_score > 0.7:
            return SeverityLevel.HIGH
        elif anomaly_score > 0.5:
            return SeverityLevel.MEDIUM
        else:
            return SeverityLevel.LOW

    def generate_alert_report(
        self,
        anomaly_data: Dict,
        explanation: Dict,
        context: Optional[Dict] = None,
    ) -> Dict:
        anomaly_score = anomaly_data.get("anomaly_score", anomaly_data.get("score", 0.0))
        anomaly_label = anomaly_data.get("label", 0)

        severity = self.assign_severity(anomaly_score)

        top_features = explanation.get("top_features", [])
        explanation_text = explanation.get("explanation_text", "No explanation available")

        anomaly_type = self._determine_anomaly_type(top_features, context)

        recommended_actions = self._generate_recommended_actions(
            severity, anomaly_type, top_features
        )

        report: Dict[str, Any] = {
            "alert_id": str(uuid.uuid4()),
            "timestamp": datetime.utcnow().isoformat(),
            "device_id": self.device_id,
            "severity": severity.value,
            "anomaly_score": float(anomaly_score),
            "anomaly_label": int(anomaly_label),
            "anomaly_type": anomaly_type,
            "explanation": {
                "summary": explanation_text,
                "contributing_factors": top_features,
                "confidence": anomaly_data.get("confidence", 0.0),
            },
            "context": context or {},
            "recommended_actions": recommended_actions,
            "forensic_data": {
                "log_hash": None,
                "related_events": [],
            },
        }

        return report

    def _determine_anomaly_type(
        self,
        top_features: list,
        context: Optional[Dict],
    ) -> str:

        feature_names = [f.get("feature", "") for f in top_features]

        if any("network" in name.lower() for name in feature_names):
            if any(
                "unusual" in name.lower() or "entropy" in name.lower() for name in feature_names
            ):
                return "network_anomaly"
            return "network_behavior_deviation"

        if any("process" in name.lower() for name in feature_names):
            if any("rare" in name.lower() or "spawn" in name.lower() for name in feature_names):
                return "process_anomaly"
            return "process_behavior_deviation"

        if any("cpu" in name.lower() for name in feature_names):
            if any("spike" in name.lower() or "max" in name.lower() for name in feature_names):
                return "cpu_spike"
            return "cpu_behavior_deviation"

        if any("memory" in name.lower() for name in feature_names):
            if any("spike" in name.lower() or "growth" in name.lower() for name in feature_names):
                return "memory_anomaly"
            return "memory_behavior_deviation"

        if any("disk" in name.lower() for name in feature_names):
            if any("burst" in name.lower() or "spike" in name.lower() for name in feature_names):
                return "disk_io_anomaly"
            return "disk_behavior_deviation"

        return "behavioral_deviation"

    def _generate_recommended_actions(
        self,
        severity: SeverityLevel,
        anomaly_type: str,
        top_features: list,
    ) -> list:

        actions = []

        if severity == SeverityLevel.CRITICAL:
            actions.append("Immediate investigation required")
            actions.append("Consider isolating the device from network")
            actions.append("Review system logs for related events")
        elif severity == SeverityLevel.HIGH:
            actions.append("Investigate within 1 hour")
            actions.append("Review recent system changes")
            actions.append("Monitor for additional anomalies")
        elif severity == SeverityLevel.MEDIUM:
            actions.append("Review during next maintenance window")
            actions.append("Monitor trends over time")
        else:
            actions.append("Log for future analysis")
            actions.append("Monitor if pattern persists")

        if "network" in anomaly_type:
            actions.append("Review network connections and firewall rules")
            actions.append("Check for unauthorized network access")

        if "process" in anomaly_type:
            actions.append("Review running processes")
            actions.append("Check process tree for suspicious parent processes")

        if "cpu" in anomaly_type or "memory" in anomaly_type:
            actions.append("Review system resource usage")
            actions.append("Check for resource-intensive processes")

        if "disk" in anomaly_type:
            actions.append("Review disk I/O patterns")
            actions.append("Check for unusual file access")

        return actions
