from fastapi import APIRouter, Depends, HTTPException, Request

from edgepulse.api.deps import get_deps, get_sync_status
from edgepulse.api.schemas.sync import SyncDeadLetterResponse, SyncStatusResponse

router = APIRouter(prefix="/sync", tags=["sync"])


@router.get("/status", response_model=SyncStatusResponse)
async def sync_status(
    stats: dict = Depends(get_sync_status),
):
    return stats


@router.get("/dead-letter", response_model=SyncDeadLetterResponse)
async def sync_dead_letter(request: Request):
    deps = get_deps(request)
    provider = deps.sync_dead_letter_provider
    if provider is None:
        return SyncDeadLetterResponse(items=[], total=0)
    try:
        return await provider()
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc))
