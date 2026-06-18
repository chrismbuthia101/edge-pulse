import uuid
from typing import Dict, List, Optional, Union
from datetime import datetime, timedelta
from collections import deque

from edgepulse.utils.log_handler import get_logger
from edgepulse.models import SeverityLevel

logger = get_logger(__name__)


class AlertEngine:
    def __init__(
        self,
        correlation_window: int = 300,
        deduplication_threshold: float = 0.8,
        rate_limit: int = 10,
        rate_window: int = 3600,
        min_severity: Union[SeverityLevel, str] = SeverityLevel.MEDIUM,
    ):
        self.correlation_window = correlation_window
        self.deduplication_threshold = deduplication_threshold
        self.rate_limit = rate_limit
        self.rate_window = rate_window

        if isinstance(min_severity, str):
            try:
                min_severity = SeverityLevel(min_severity.lower())
            except ValueError:
                logger.warning(
                    f"Unknown min_severity value '{min_severity}', " "defaulting to MEDIUM"
                )
                min_severity = SeverityLevel.MEDIUM

        self.min_severity: SeverityLevel = min_severity

        self.alert_history: deque = deque(maxlen=1000)

        self.severity_order = {
            SeverityLevel.LOW: 1,
            SeverityLevel.MEDIUM: 2,
            SeverityLevel.HIGH: 3,
            SeverityLevel.CRITICAL: 4,
        }

    def should_alert(self, anomaly_score: float, severity: Union[SeverityLevel, str]) -> bool:

        if isinstance(severity, str):
            try:
                severity = SeverityLevel(severity.lower())
            except ValueError:
                logger.warning(f"Unknown severity '{severity}', treating as LOW")
                severity = SeverityLevel.LOW

        if self.severity_order.get(severity, 0) < self.severity_order.get(self.min_severity, 0):
            return False

        return True

    def process_anomaly(
        self,
        anomaly: Dict,
        explanation: Dict,
    ) -> Optional[Dict]:

        if isinstance(anomaly, dict):
            anomaly_score = anomaly.get("anomaly_score", 0.0)
            severity = anomaly.get("severity", "low")
        else:
            anomaly_score = getattr(anomaly, "anomaly_score", 0.0)
            severity = getattr(anomaly, "severity", "low")

        if not self.should_alert(anomaly_score, severity):
            return None

        if not self._check_rate_limit():
            logger.warning("Rate limit exceeded, suppressing alert")
            return None

        if self.deduplicate_alerts(anomaly if isinstance(anomaly, dict) else {}, explanation):
            logger.debug("Duplicate alert suppressed")
            return None

        alert_id = str(uuid.uuid4())
        alert = {
            "alert_id": alert_id,
            "timestamp": datetime.utcnow().isoformat(),
            "anomaly": anomaly if isinstance(anomaly, dict) else {},
            "explanation": explanation,
            "severity": severity,
            "anomaly_score": anomaly_score,
        }

        correlated_alerts = self.correlate_alerts(self.correlation_window)
        self.alert_history.append({"alert": alert, "timestamp": datetime.utcnow()})
        if correlated_alerts:
            alert["correlated_alerts"] = [
                a.get("alert_id") for a in correlated_alerts if a.get("alert_id")
            ]
            alert["correlation_count"] = len(correlated_alerts)

        return alert

    def correlate_alerts(self, timeframe: Optional[int] = None) -> List[Dict]:
        if timeframe is None:
            timeframe = self.correlation_window

        cutoff_time = datetime.utcnow() - timedelta(seconds=timeframe)

        return [entry["alert"] for entry in self.alert_history if entry["timestamp"] >= cutoff_time]

    def deduplicate_alerts(self, new_anomaly: Dict, explanation: Optional[Dict] = None) -> bool:
        if explanation is not None:
            new_anomaly = dict(new_anomaly)
            new_anomaly["explanation"] = explanation

        if not self.alert_history:
            return False

        cutoff_time = datetime.utcnow() - timedelta(hours=1)

        for alert_entry in self.alert_history:
            if alert_entry["timestamp"] < cutoff_time:
                continue

            existing_anomaly = dict(alert_entry["alert"].get("anomaly", {}))
            existing_explanation = alert_entry["alert"].get("explanation")
            if existing_explanation and "explanation" not in existing_anomaly:
                existing_anomaly["explanation"] = existing_explanation

            similarity = self._calculate_similarity(new_anomaly, existing_anomaly)

            if similarity >= self.deduplication_threshold:
                return True

        return False

    def _calculate_similarity(self, anomaly1: Dict, anomaly2: Dict) -> float:
        type_match = 1.0 if anomaly1.get("anomaly_type") == anomaly2.get("anomaly_type") else 0.0

        score1 = anomaly1.get("anomaly_score", 0.0)
        score2 = anomaly2.get("anomaly_score", 0.0)
        score_diff = max(0.0, 1.0 - abs(score1 - score2))

        features1 = anomaly1.get("explanation", {}).get("contributing_factors", [])
        features2 = anomaly2.get("explanation", {}).get("contributing_factors", [])

        feature_similarity = 0.0
        if features1 and features2:
            feat_names1 = {f.get("feature") for f in features1[:3]}
            feat_names2 = {f.get("feature") for f in features2[:3]}
            if feat_names1 or feat_names2:
                intersection = len(feat_names1 & feat_names2)
                union = len(feat_names1 | feat_names2)
                feature_similarity = intersection / union if union > 0 else 0.0

        return type_match * 0.3 + score_diff * 0.3 + feature_similarity * 0.4

    def _check_rate_limit(self) -> bool:
        cutoff_time = datetime.utcnow() - timedelta(seconds=self.rate_window)

        recent_count = sum(1 for entry in self.alert_history if entry["timestamp"] >= cutoff_time)

        return recent_count <= self.rate_limit

    def get_active_alerts(self) -> List[Dict]:
        return [entry["alert"] for entry in self.alert_history]
