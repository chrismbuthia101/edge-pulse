from typing import List, Optional

from pydantic import BaseModel


class SyncStatusBase(BaseModel):
    online: Optional[bool] = None
    queue_depth: int = 0
    total_enqueued: int = 0
    total_processed: int = 0
    total_failed: int = 0
    total_retries: int = 0
    unsynced_alerts: int = 0


class SyncStatusResponse(SyncStatusBase):
    max_retry_attempts: int = 5


class DeadLetterItem(BaseModel):
    id: int
    item_type: str
    item_id: Optional[str] = None
    data_json: str
    attempts: int = 0
    error_info: Optional[str] = None
    failed_at: str


class SyncDeadLetterResponse(BaseModel):
    items: List[DeadLetterItem]
    total: int
