from typing import TYPE_CHECKING

from fastapi import APIRouter, Depends, HTTPException, Request

from edgepulse.api.deps import get_deps, get_sync_status

if TYPE_CHECKING:
    pass

router = APIRouter(prefix="/sync", tags=["sync"])


@router.get("/status")
async def sync_status(
    stats: dict = Depends(get_sync_status),
):
    return stats


@router.get("/dead-letter")
async def sync_dead_letter(request: Request):
    deps = get_deps(request)
    provider = deps.sync_dead_letter_provider
    if provider is None:
        return {"items": [], "total": 0}
    try:
        return await provider()
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc))
