from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from edgepulse.api.deps import get_db
from edgepulse.storage.database import Database

router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.get("")
async def get_alerts(
    db: Database = Depends(get_db),
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    severity: Optional[str] = None,
    synced: Optional[int] = None,
    since: Optional[str] = None,
):
    return await db.get_alerts(
        limit=limit, offset=offset, severity=severity, synced=synced, since=since
    )


@router.get("/summary")
async def get_alert_summary(
    db: Database = Depends(get_db),
):
    return await db.get_alert_summary()


@router.post("/{alert_id}/acknowledge")
async def acknowledge_alert(
    alert_id: str,
    db: Database = Depends(get_db),
):
    ok = await db.acknowledge_alert(alert_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Alert not found")
    return {"status": "acknowledged", "alert_id": alert_id}
