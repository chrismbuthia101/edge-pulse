from typing import Any, Dict, Optional

from pydantic import BaseModel


class DetectionResult(BaseModel):
    anomaly_score: float
    detection_threshold_applied: float
    is_alert_triggered: bool
    inference_latency_ms: int
    model_id: str
    model_version: str
    timestamp: str
    features_hash: Optional[str] = None
    explanation: Optional[Dict[str, Any]] = None

    def to_dict(self) -> Dict[str, Any]:
        return self.model_dump()
