from typing import Optional

from pydantic import BaseModel
from edgepulse.api.schemas.sync import SyncStatusBase


class DetectorHealth(BaseModel):
    status: str
    detail: Optional[str] = None
    action_required: Optional[str] = None


class SyncStatus(SyncStatusBase):
    pass


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
