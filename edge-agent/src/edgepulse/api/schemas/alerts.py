from typing import Dict, Optional

from pydantic import BaseModel


class AlertResponse(BaseModel):
    id: int
    alert_id: str
    timestamp: str
    device_id: str
    severity: str
    anomaly_score: float
    alert_type: str
    detector_type: str
    explanation_summary: Optional[str] = None
    feature_importance: Optional[str] = None
    data_json: Optional[str] = None
    acknowledged: bool = False
    acknowledged_at: Optional[str] = None
    acknowledged_by: Optional[str] = None
    synced: bool = False
    created_at: str
    updated_at: str


class AlertSummaryResponse(BaseModel):
    total: int
    by_severity: Dict[str, int]
    synced: int
    unsynced: int


class AcknowledgeResponse(BaseModel):
    status: str
    alert_id: str
