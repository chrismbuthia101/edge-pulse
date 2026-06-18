from typing import Optional

from pydantic import BaseModel


class DetectorHealth(BaseModel):
    status: str
    detail: Optional[str] = None
    action_required: Optional[str] = None


class SyncStatus(BaseModel):
    online: Optional[bool] = None
    queue_depth: int = 0
    total_enqueued: int = 0
    total_processed: int = 0
    total_failed: int = 0
    total_retries: int = 0
    unsynced_alerts: int = 0


class HealthResponse(BaseModel):
    status: str
    server: str
    detector: DetectorHealth
    sync: Optional[SyncStatus] = None


class MetricsResponse(BaseModel):
    cpu_usage: float
    memory_usage: float
    server: str


class StatusResponse(BaseModel):
    status: str
    server: str
    version: str
