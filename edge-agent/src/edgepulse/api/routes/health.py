import psutil
from fastapi import APIRouter, Request

from edgepulse.api.deps import get_detector_health, get_sync_status

router = APIRouter(tags=["health"])


@router.get("/health")
async def health(request: Request):
    detector = get_detector_health(request)
    overall = "healthy" if detector.get("status") == "ok" else "degraded"
    result = {
        "status": overall,
        "server": "fastapi",
        "detector": detector,
    }
    sync = get_sync_status(request)
    if sync.get("online") is not None:
        result["sync"] = sync
        if sync.get("total_failed", 0) > 0 or sync.get("unsynced_alerts", 0) > 0:
            result["status"] = "degraded"
    return result


@router.get("/metrics")
async def metrics():
    return {
        "cpu_usage": psutil.cpu_percent(),
        "memory_usage": psutil.virtual_memory().percent,
        "server": "fastapi",
    }


@router.get("/status")
async def status():
    return {"status": "running", "server": "fastapi", "version": "1.0.0"}
