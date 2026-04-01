"""
Async Sync Queue for EdgePulse
"""

import asyncio
import json
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from edgepulse_win.shared import AlertEvent, create_metrics_collector, StandardMetrics
from edgepulse_win.storage.database import DatabaseManager
from edgepulse_win.utils.log_handler import get_logger
from edgepulse_win.utils.error_handler import (
    SyncError,
    NetworkError,
    log_operation,
    log_sync_operation,
    RetryHandler,
)

logger = get_logger(__name__)


class AsyncSyncQueue:
    """Persistent async queue for sync operations with retry logic"""

    def __init__(
        self,
        storage_path: Path,
        max_size: int = 10_000,
        max_retry_attempts: int = 5,
        batch_size: int = 50,
        device_id: str = "unknown",
    ):
        self.storage_path = storage_path
        self.max_size = max_size
        self.max_retry_attempts = max_retry_attempts
        self.batch_size = batch_size
        self.device_id = device_id

        self.queue: Optional[asyncio.Queue] = None
        self.db = DatabaseManager(storage_path / "sync_queue.db")

        self._worker_task: Optional[asyncio.Task] = None
        self._running = False

        self.metrics = create_metrics_collector(f"sync_queue_{device_id}", device_id)
        self.retry_handler = RetryHandler(
            max_attempts=max_retry_attempts,
            base_delay=1.0,
            max_delay=60.0,
        )

        self.stats: Dict[str, int] = {
            "total_enqueued": 0,
            "total_processed": 0,
            "total_failed": 0,
            "total_retries": 0,
            "queue_size": 0,
        }

        logger.info(
            "async_sync_queue_initialized",
            storage_path=str(storage_path),
            max_size=max_size,
            max_retry_attempts=max_retry_attempts,
            batch_size=batch_size,
            device_id=device_id,
        )

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def initialize(self) -> None:
        """Initialize the sync queue"""
        if self.queue is None:
            self.queue = asyncio.Queue(maxsize=self.max_size)
        await self.db.initialize()
        await self._load_persisted_items()

    async def start_worker(self, sync_client: Any) -> None:
        """Start the background sync worker"""
        if self._running:
            logger.warning("sync_queue_worker_already_running", device_id=self.device_id)
            return

        self._running = True
        self._worker_task = asyncio.create_task(
            self._sync_worker(sync_client), name="sync_queue_worker"
        )
        logger.info("sync_queue_worker_started", device_id=self.device_id)

    async def stop(self) -> None:
        """Stop the sync queue and persist remaining items."""
        if not self._running:
            return

        self._running = False

        if self._worker_task:
            self._worker_task.cancel()
            try:
                await self._worker_task
            except asyncio.CancelledError:
                pass

        if self.queue is not None:
            await self._persist_queue()

        logger.info("sync_queue_stopped", stats=self.stats)

    async def close(self) -> None:
        """Alias for stop() – keeps backward-compat with agent_core.stop()."""
        await self.stop()

    # ------------------------------------------------------------------
    # Size helpers (called by SyncFSM)
    # ------------------------------------------------------------------

    async def size(self) -> int:
        """Return the number of items currently in the in-memory queue."""
        if self.queue is None:
            return 0
        return self.queue.qsize()

    # ------------------------------------------------------------------
    # Item operations (called by SyncFSM._process_sync_queue)
    # ------------------------------------------------------------------

    async def get_next(self) -> Optional[Dict[str, Any]]:
        """Return the next item ready for processing, or None if empty."""
        if self.queue is None or self.queue.empty():
            return None

        try:
            item = self.queue.get_nowait()
        except asyncio.QueueEmpty:
            return None

        if self._is_ready_for_retry(item):
            return item

        # Not yet due for retry – put it back and signal nothing ready
        await self.queue.put(item)
        return None

    async def mark_completed(self, item_id: Any) -> None:
        """Mark an item as successfully processed (removes from DB)."""
        try:
            await self.db.execute_update(
                "DELETE FROM sync_queue WHERE id = ?", (item_id,)
            )
            self.stats["total_processed"] += 1
            self.stats["queue_size"] = self.queue.qsize() if self.queue else 0
        except Exception as e:
            logger.error("mark_completed_error", item_id=item_id, error=str(e))

    async def mark_failed(self, item_id: Any) -> None:
        """Increment attempt count; remove from DB when max attempts reached."""
        try:
            rows = await self.db.execute_query(
                "SELECT * FROM sync_queue WHERE id = ?", (item_id,)
            )
            if not rows:
                return

            row = rows[0]
            new_attempts = row["attempts"] + 1

            if new_attempts >= self.max_retry_attempts:
                await self.db.execute_update(
                    "DELETE FROM sync_queue WHERE id = ?", (item_id,)
                )
                self.stats["total_failed"] += 1
                logger.error(
                    "item_max_attempts_reached",
                    item_id=item_id,
                    attempts=new_attempts,
                )
            else:
                backoff_secs = min(300, 2 ** new_attempts)
                next_retry = (
                    datetime.utcnow() + timedelta(seconds=backoff_secs)
                ).isoformat()
                await self.db.execute_update(
                    """
                    UPDATE sync_queue
                    SET attempts = ?, last_attempt = ?, next_retry = ?
                    WHERE id = ?
                    """,
                    (new_attempts, datetime.utcnow().isoformat(), next_retry, item_id),
                )
                self.stats["total_retries"] += 1

        except Exception as e:
            logger.error("mark_failed_error", item_id=item_id, error=str(e))

    async def get_items_by_priority(
        self, max_priority: int = 2
    ) -> List[Dict[str, Any]]:
        """Return DB-persisted items up to *max_priority* for degraded-state sync."""
        try:
            return await self.db.get_sync_queue_items(
                priority_threshold=max_priority, limit=self.batch_size
            )
        except Exception as e:
            logger.error("get_items_by_priority_error", error=str(e))
            return []

    async def get_all_items(self) -> List[Dict[str, Any]]:
        """Return all DB-persisted queue items (used for Merkle anchor)."""
        try:
            return await self.db.get_sync_queue_items(limit=self.max_size)
        except Exception as e:
            logger.error("get_all_items_error", error=str(e))
            return []

    # ------------------------------------------------------------------
    # Enqueue / batch-get (existing public API)
    # ------------------------------------------------------------------

    async def enqueue(
        self, item_type: str, item_data: Dict[str, Any], priority: int = 0
    ) -> bool:
        """Add an item to the sync queue."""
        if self.queue is None:
            raise RuntimeError("Sync queue not initialized")

        if self.queue.qsize() >= self.max_size:
            logger.warning(
                "sync_queue_full",
                item_type=item_type,
                queue_size=self.queue.qsize(),
                device_id=self.device_id,
            )
            return False

        queue_item: Dict[str, Any] = {
            "type": item_type,
            "data": item_data,
            "priority": priority,
            "attempts": 0,
            "first_queued": datetime.utcnow(),
            "last_attempt": None,
            "next_retry": datetime.utcnow(),
        }

        try:
            self.queue.put_nowait(queue_item)
            self.stats["total_enqueued"] += 1
            self.stats["queue_size"] = self.queue.qsize()

            self.metrics.set_gauge(
                StandardMetrics.SYNC_QUEUE_SIZE,
                self.queue.qsize(),
                labels={"item_type": item_type},
            )

            if priority > 0:
                await self._persist_single_item(queue_item)

            return True

        except asyncio.QueueFull:
            logger.warning("queue_full_on_enqueue", item_type=item_type)
            return False

    async def get_batch(
        self, max_size: Optional[int] = None, timeout: float = 5.0
    ) -> List[Dict[str, Any]]:
        """Get a batch of items ready for processing."""
        if self.queue is None:
            raise RuntimeError("Sync queue not initialized")

        batch_size = max_size or self.batch_size
        batch: List[Dict[str, Any]] = []
        loop = asyncio.get_running_loop()
        deadline = loop.time() + timeout

        while len(batch) < batch_size:
            remaining = deadline - loop.time()
            if remaining <= 0:
                break

            try:
                item = await asyncio.wait_for(self.queue.get(), timeout=remaining)
                if self._is_ready_for_retry(item):
                    batch.append(item)
                else:
                    await self.queue.put(item)
            except asyncio.TimeoutError:
                break

        return batch

    # ------------------------------------------------------------------
    # Worker
    # ------------------------------------------------------------------

    async def _sync_worker(self, sync_client: Any) -> None:
        """Background worker that processes sync items."""
        logger.info("sync_worker_started")

        while self._running:
            try:
                batch = await self.get_batch(timeout=1.0)
                if batch:
                    await self._process_batch(sync_client, batch)
                else:
                    await asyncio.sleep(0.1)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("sync_worker_error", error=str(e))
                await asyncio.sleep(5.0)

        logger.info("sync_worker_stopped")

    async def _process_batch(
        self, sync_client: Any, batch: List[Dict[str, Any]]
    ) -> None:
        """Process a batch of sync items grouped by type."""
        if not batch:
            return

        items_by_type: Dict[str, List[Dict[str, Any]]] = {}
        for item in batch:
            item_type = item["type"]
            items_by_type.setdefault(item_type, []).append(item)

        for item_type, items in items_by_type.items():
            try:
                await self._sync_items_by_type(sync_client, item_type, items)
            except Exception as e:
                logger.error("batch_sync_error", item_type=item_type, error=str(e))
                for item in items:
                    await self._handle_failed_item(item)

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=4, max=60),
        retry=retry_if_exception_type(NetworkError),
    )
    async def _sync_items_by_type(
        self,
        sync_client: Any,
        item_type: str,
        items: List[Dict[str, Any]],
    ) -> None:
        """Sync items of a specific type (with retry on NetworkError)."""
        try:
            if item_type in ("alert", "alert_records"):
                await self._sync_alerts(sync_client, items)
            elif item_type in ("telemetry", "telemetry_events"):
                await self._sync_telemetry(sync_client, items)
            else:
                logger.warning("unknown_item_type", item_type=item_type)
                return

            self.metrics.increment_counter(
                StandardMetrics.SYNC_ATTEMPTS_TOTAL,
                labels={"item_type": item_type, "status": "success"},
            )
            log_sync_operation(
                operation=f"sync_{item_type}",
                item_type=item_type,
                item_count=len(items),
                device_id=self.device_id,
                status="success",
            )

        except Exception as e:
            self.metrics.increment_counter(
                StandardMetrics.SYNC_ATTEMPTS_TOTAL,
                labels={"item_type": item_type, "status": "error"},
            )
            log_sync_operation(
                operation=f"sync_{item_type}",
                item_type=item_type,
                item_count=len(items),
                device_id=self.device_id,
                status="error",
                error_details=str(e),
            )
            raise

    async def _sync_alerts(
        self, sync_client: Any, items: List[Dict[str, Any]]
    ) -> None:
        """Validate and upload alert items."""
        alert_data: List[Dict[str, Any]] = []

        for item in items:
            raw = item.get("data", {})
            try:
                # Validate against AlertEvent schema if possible
                AlertEvent(**raw)
                alert_data.append(raw)
            except Exception as e:
                # Schema validation failed – still try to sync raw dict
                logger.warning(
                    "alert_schema_validation_failed",
                    item_id=raw.get("alert_id"),
                    error=str(e),
                )
                alert_data.append(raw)

        if not alert_data:
            logger.warning("no_valid_alerts_to_sync", device_id=self.device_id)
            return

        success = False
        if hasattr(sync_client, "batch_sync_alerts"):
            if asyncio.iscoroutinefunction(sync_client.batch_sync_alerts):
                success = await sync_client.batch_sync_alerts(alert_data)
            else:
                success = await asyncio.to_thread(
                    sync_client.batch_sync_alerts, alert_data
                )
        else:
            success = True  # No alert sync capability; silently skip

        if success:
            self.stats["total_processed"] += len(items)
        else:
            raise SyncError("Alert batch sync failed")

    async def _sync_telemetry(
        self, sync_client: Any, items: List[Dict[str, Any]]
    ) -> None:
        """Upload telemetry items."""
        telemetry_data = [item["data"] for item in items]

        if hasattr(sync_client, "batch_sync_telemetry"):
            if asyncio.iscoroutinefunction(sync_client.batch_sync_telemetry):
                success = await sync_client.batch_sync_telemetry(telemetry_data)
            else:
                success = await asyncio.to_thread(
                    sync_client.batch_sync_telemetry, telemetry_data
                )
        else:
            success = True  # No telemetry sync capability; silently skip

        if success:
            self.stats["total_processed"] += len(items)
        else:
            raise SyncError("Telemetry batch sync failed")

    # ------------------------------------------------------------------
    # Failure handling
    # ------------------------------------------------------------------

    async def _handle_failed_item(self, item: Dict[str, Any]) -> None:
        """Re-queue or discard a failed item with exponential backoff."""
        item["attempts"] += 1
        item["last_attempt"] = datetime.utcnow()

        if item["attempts"] >= self.max_retry_attempts:
            self.stats["total_failed"] += 1
            logger.error(
                "item_max_attempts_reached",
                item_type=item["type"],
                attempts=item["attempts"],
            )
        else:
            backoff_seconds = min(300, 2 ** item["attempts"])
            item["next_retry"] = datetime.utcnow() + timedelta(
                seconds=backoff_seconds
            )

            try:
                if self.queue is None:
                    raise RuntimeError("Sync queue not initialized")
                await self.queue.put(item)
                self.stats["total_retries"] += 1
            except asyncio.QueueFull:
                logger.error("queue_full_on_retry", item_type=item["type"])

    def _is_ready_for_retry(self, item: Dict[str, Any]) -> bool:
        """Return True if the item is due for a retry attempt."""
        if item["attempts"] == 0:
            return True
        next_retry = item.get("next_retry")
        if not next_retry:
            return True
        if isinstance(next_retry, str):
            try:
                next_retry = datetime.fromisoformat(next_retry)
            except ValueError:
                return True
        return datetime.utcnow() >= next_retry

    # ------------------------------------------------------------------
    # Persistence helpers
    # ------------------------------------------------------------------

    async def _load_persisted_items(self) -> None:
        """Reload persisted items from DB into the in-memory queue on startup."""
        try:
            if self.queue is None:
                raise RuntimeError("Sync queue not initialized")

            persisted = await self.db.get_sync_queue_items(limit=self.max_size)

            for row in persisted:
                item: Dict[str, Any] = {
                    "id": row["id"],
                    "type": row["item_type"],
                    "data": json.loads(row["data_json"]),
                    "attempts": row["attempts"],
                    "first_queued": datetime.fromisoformat(row["created_at"]),
                    "last_attempt": (
                        datetime.fromisoformat(row["last_attempt"])
                        if row["last_attempt"]
                        else None
                    ),
                    "next_retry": (
                        datetime.fromisoformat(row["next_retry"])
                        if row.get("next_retry")
                        else datetime.utcnow()
                    ),
                    "priority": row.get("priority", 0),
                }
                if self._is_ready_for_retry(item):
                    try:
                        await self.queue.put(item)
                    except asyncio.QueueFull:
                        logger.warning("queue_full_during_load")
                        break

            logger.info(
                "persisted_items_loaded",
                count=len(persisted),
                queue_size=self.queue.qsize(),
            )

        except Exception as e:
            logger.error("error_loading_persisted_items", error=str(e))

    async def _persist_queue(self) -> None:
        """Flush in-memory queue items to DB on shutdown."""
        if self.queue is None:
            return

        items: List[Dict[str, Any]] = []
        while not self.queue.empty():
            try:
                items.append(self.queue.get_nowait())
            except asyncio.QueueEmpty:
                break

        if items:
            params_list = [
                (
                    item["type"],
                    item.get("data", {}).get("id", "unknown"),
                    json.dumps(item.get("data", {})),
                    item.get("attempts", 0),
                    (
                        item["last_attempt"].isoformat()
                        if item.get("last_attempt")
                        else None
                    ),
                )
                for item in items
            ]
            await self.db.execute_many(
                """
                INSERT OR IGNORE INTO sync_queue
                    (item_type, item_id, data_json, attempts, last_attempt)
                VALUES (?, ?, ?, ?, ?)
                """,
                params_list,
            )
            # Restore items so they're available if initialize() is called again
            for item in items:
                await self.queue.put(item)

        logger.debug("queue_persisted", count=len(items))

    async def _persist_single_item(self, item: Dict[str, Any]) -> None:
        """Persist a single high-priority item immediately."""
        await self.db.enqueue_sync_item(
            item["type"],
            item.get("data", {}).get("id", "unknown"),
            item.get("data", {}),
            priority=item.get("priority", 0),
        )

    # ------------------------------------------------------------------
    # Stats / control
    # ------------------------------------------------------------------

    def get_stats(self) -> Dict[str, Any]:
        """Return current queue statistics."""
        if self.queue is not None:
            self.stats["queue_size"] = self.queue.qsize()
        return self.stats.copy()

    async def clear_queue(self) -> int:
        """Remove all items from the queue."""
        count = self.queue.qsize() if self.queue else 0

        if self.queue:
            while not self.queue.empty():
                try:
                    self.queue.get_nowait()
                except asyncio.QueueEmpty:
                    break

        await self.db.execute_update("DELETE FROM sync_queue")
        logger.info("queue_cleared", count=count)
        return count