import psutil
from fastapi import APIRouter, Request

from edgepulse.api.deps import get_detector_health, get_sync_status
from edgepulse.api.schemas.health import (
    DetectorHealth,
    HealthResponse,
    MetricsResponse,
    StatusResponse,
    SyncStatus,
)

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health(request: Request):
    detector_data = get_detector_health(request)
    overall = "healthy" if detector_data.get("status") == "ok" else "degraded"
    detector = DetectorHealth(**detector_data)
    sync_data = get_sync_status(request)
    response = HealthResponse(status=overall, server="fastapi", detector=detector)
    if sync_data.get("online") is not None:
        response.sync = SyncStatus(**sync_data)
        if sync_data.get("total_failed", 0) > 0 or sync_data.get("unsynced_alerts", 0) > 0:
            response.status = "degraded"
    return response


@router.get("/metrics", response_model=MetricsResponse)
async def metrics():
    return MetricsResponse(
        cpu_usage=psutil.cpu_percent(),
        memory_usage=psutil.virtual_memory().percent,
        server="fastapi",
    )


@router.get("/status", response_model=StatusResponse)
async def status():
    return StatusResponse(status="running", server="fastapi", version="1.0.0")
