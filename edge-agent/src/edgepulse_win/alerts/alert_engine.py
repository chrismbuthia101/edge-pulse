# Alert Engine

# Intelligent alert generation, correlation, and deduplication.

import logging
from typing import Dict, List, Optional
from datetime import datetime, timedelta
from collections import deque

logger = logging.getLogger(__name__)


class AlertEngine:
    def __init__(
        self,
        correlation_window: int = 300,
        deduplication_threshold: float = 0.8,
        rate_limit: int = 10,
        rate_window: int = 3600,
        min_severity: str = "medium",
    ):
        self.correlation_window = correlation_window
        self.deduplication_threshold = deduplication_threshold
        self.rate_limit = rate_limit
        self.rate_window = rate_window
        self.min_severity = min_severity
        
        # Alert history for correlation and deduplication
        self.alert_history: deque = deque(maxlen=1000)
        self.active_alerts: List[Dict] = []
        
        # Severity levels for comparison
        self.severity_levels = {
            "low": 1,
            "medium": 2,
            "high": 3,
            "critical": 4,
        }

    def should_alert(self, anomaly_score: float, severity: str) -> bool:
        # Check severity threshold
        if self.severity_levels.get(severity, 0) < self.severity_levels.get(self.min_severity, 0):
            return False
        
        return True

    def process_anomaly(
        self,
        anomaly: Dict,
        explanation: Dict,
    ) -> Optional[Dict]:

        # Handle both AlertReport structure and legacy structure
        if isinstance(anomaly, dict):
            anomaly_score = anomaly.get("anomaly_score", 0.0)
            severity = anomaly.get("severity", "low")
            alert_id = anomaly.get("alert_id")
        else:
            # If it's a Pydantic model
            anomaly_score = getattr(anomaly, "anomaly_score", 0.0)
            severity = getattr(anomaly, "severity", "low")
            alert_id = getattr(anomaly, "alert_id", None)
            anomaly = anomaly.model_dump() if hasattr(anomaly, "model_dump") else anomaly
        
        # Check if alert should be generated
        if not self.should_alert(anomaly_score, severity):
            return None
        
        # Check rate limiting
        if not self._check_rate_limit():
            logger.warning("Rate limit exceeded, suppressing alert")
            return None
        
        # Check deduplication
        if self.deduplicate_alerts(anomaly):
            logger.debug("Duplicate alert suppressed")
            return None
        
        # Create alert
        alert = {
            "alert_id": alert_id or anomaly.get("alert_id"),
            "timestamp": datetime.utcnow().isoformat(),
            "anomaly": anomaly,
            "explanation": explanation,
            "severity": severity,
            "anomaly_score": anomaly_score,
        }
        
        # Add to history
        self.alert_history.append({
            "alert": alert,
            "timestamp": datetime.utcnow(),
        })
        
        # Correlate with existing alerts
        correlated_alerts = self.correlate_alerts(self.correlation_window)
        if correlated_alerts:
            alert["correlated_alerts"] = [a.get("alert_id") for a in correlated_alerts if a.get("alert_id")]
            alert["correlation_count"] = len(correlated_alerts)
        
        return alert

    def correlate_alerts(self, timeframe: int = None) -> List[Dict]:
        if timeframe is None:
            timeframe = self.correlation_window
        
        cutoff_time = datetime.utcnow() - timedelta(seconds=timeframe)
        
        correlated = []
        for alert_entry in self.alert_history:
            if alert_entry["timestamp"] >= cutoff_time:
                correlated.append(alert_entry["alert"])
        
        return correlated

    def deduplicate_alerts(self, new_anomaly: Dict) -> bool:
        if not self.alert_history:
            return False
        
        # Get recent alerts (last hour)
        cutoff_time = datetime.utcnow() - timedelta(hours=1)
        
        for alert_entry in self.alert_history:
            if alert_entry["timestamp"] < cutoff_time:
                continue
            
            existing_anomaly = alert_entry["alert"].get("anomaly", {})
            
            # Calculate similarity
            similarity = self._calculate_similarity(new_anomaly, existing_anomaly)
            
            if similarity >= self.deduplication_threshold:
                return True
        
        return False

    def _calculate_similarity(self, anomaly1: Dict, anomaly2: Dict) -> float:
        # Compare anomaly types
        type_match = 1.0 if anomaly1.get("anomaly_type") == anomaly2.get("anomaly_type") else 0.0
        
        # Compare scores (normalized difference)
        score1 = anomaly1.get("anomaly_score", 0.0)
        score2 = anomaly2.get("anomaly_score", 0.0)
        score_diff = 1.0 - abs(score1 - score2)
        
        # Compare top features (if available)
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
        
        # Weighted average
        similarity = (type_match * 0.3 + score_diff * 0.3 + feature_similarity * 0.4)
        
        return similarity

    def _check_rate_limit(self) -> bool:
        cutoff_time = datetime.utcnow() - timedelta(seconds=self.rate_window)
        
        recent_count = sum(
            1 for entry in self.alert_history
            if entry["timestamp"] >= cutoff_time
        )
        
        return recent_count < self.rate_limit

    def get_active_alerts(self) -> List[Dict]:
        return self.active_alerts.copy()

    def detect_attack_patterns(self) -> List[Dict]:
        patterns = []
        
        # Get recent alerts
        recent_alerts = self.correlate_alerts(timeframe=3600)  # Last hour
        
        if len(recent_alerts) < 2:
            return patterns
        
        # Pattern: Recon -> Exploit -> Exfiltration
        recon_alerts = [a for a in recent_alerts if "network" in a.get("anomaly", {}).get("anomaly_type", "").lower()]
        exploit_alerts = [a for a in recent_alerts if "process" in a.get("anomaly", {}).get("anomaly_type", "").lower()]
        exfil_alerts = [a for a in recent_alerts if "network" in a.get("anomaly", {}).get("anomaly_type", "").lower() and "burst" in str(a.get("anomaly", {})).lower()]
        
        if recon_alerts and exploit_alerts and exfil_alerts:
            patterns.append({
                "pattern_type": "recon_exploit_exfiltration",
                "description": "Potential attack progression detected",
                "alerts": [a.get("alert_id") for a in recon_alerts + exploit_alerts + exfil_alerts],
                "confidence": 0.7,
            })
        
        return patterns
