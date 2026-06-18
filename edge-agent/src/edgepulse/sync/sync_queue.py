import asyncio
import json
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

from edgepulse.models import create_metrics_collector, StandardMetrics
from edgepulse.storage.database import Database
from edgepulse.utils.log_handler import get_logger
from edgepulse.utils.error_handler import SyncError, log_sync_operation
from edgepulse.sync.cloud_sync import CloudSync

logger = get_logger(__name__)

_ITEM_TYPE_ALERTS = frozenset({"alert", "alert_records"})
_ITEM_TYPE_TELEMETRY = frozenset({"telemetry", "telemetry_events"})


class SyncQueue:

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
        self.db = Database(storage_path / "sync_queue.db")

        self._worker_task: Optional[asyncio.Task] = None
        self._running = False
        self._flush_requested = False
        self._was_online = True

        self.metrics = create_metrics_collector(device_id=self.device_id)

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

    async def initialize(self) -> None:
        if self.queue is None:
            self.queue = asyncio.Queue(maxsize=self.max_size)
        await self.db.initialize(tables=["sync_queue"])
        await self._load_persisted_items()

    async def start_worker(self, sync_client: CloudSync) -> None:
        if self._running:
            logger.warning("sync_queue_worker_already_running", device_id=self.device_id)
            return

        self._running = True
        self._worker_task = asyncio.create_task(
            self._sync_worker(sync_client), name="sync_queue_worker"
        )
        logger.info("sync_queue_worker_started", device_id=self.device_id)

    async def stop(self) -> None:
        if not self._running:
            return

        self._running = False

        if self._worker_task:
            try:
                await asyncio.wait_for(self._worker_task, timeout=5.0)
            except (asyncio.TimeoutError, asyncio.CancelledError):
                self._worker_task.cancel()
                try:
                    await self._worker_task
                except (asyncio.CancelledError, asyncio.TimeoutError):
                    pass

        if self.queue is not None:
            await self._persist_queue()

        logger.info("sync_queue_stopped", stats=self.stats)

    async def enqueue(self, item_type: str, item_data: Dict[str, Any], priority: int = 0) -> bool:
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
                batch.append(item)
            except asyncio.TimeoutError:
                break

        return batch

    async def _sync_worker(self, sync_client: CloudSync) -> None:
        logger.info("sync_worker_started")

        while self._running:
            try:
                batch = await self.get_batch(timeout=1.0)
                if batch:
                    await self._process_batch(sync_client, batch)
                elif self._flush_requested:
                    self._flush_requested = False
                    batch = await self.get_batch(timeout=0.5)
                    if batch:
                        await self._process_batch(sync_client, batch)
                    continue
                else:
                    await asyncio.sleep(0.1)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("sync_worker_error", error=str(e))
                await asyncio.sleep(5.0)

        logger.info("sync_worker_stopped")

    async def _process_batch(self, sync_client: CloudSync, batch: List[Dict[str, Any]]) -> None:
        if not batch:
            return

        batch.sort(key=self._item_priority_key)

        for item in batch:
            try:
                item_type = item["type"]
                if item_type in _ITEM_TYPE_ALERTS:
                    await self._sync_alerts(sync_client, [item])
                elif item_type in _ITEM_TYPE_TELEMETRY:
                    await self._sync_telemetry(sync_client, [item])
                else:
                    logger.warning("unknown_item_type", item_type=item_type)
                    continue

                if not self._was_online:
                    self._was_online = True
                    self.request_flush()
                    logger.info("sync_connectivity_restored", device_id=self.device_id)

                self.metrics.increment_counter(
                    StandardMetrics.SYNC_ATTEMPTS_TOTAL,
                    labels={"item_type": item_type, "status": "success"},
                )
                log_sync_operation(
                    operation=f"sync_{item_type}",
                    item_type=item_type,
                    item_count=1,
                    device_id=self.device_id,
                    status="success",
                )

            except Exception as e:
                self._was_online = False
                self.metrics.increment_counter(
                    StandardMetrics.SYNC_ATTEMPTS_TOTAL,
                    labels={"item_type": item.get("type", "unknown"), "status": "error"},
                )
                log_sync_operation(
                    operation=f"sync_{item.get('type', 'unknown')}",
                    item_type=item.get("type", "unknown"),
                    item_count=1,
                    device_id=self.device_id,
                    status="error",
                    error_details=str(e),
                )
                await self._handle_failed_item(item)

    def _item_priority_key(self, item: Dict[str, Any]) -> int:
        item_type = item.get("type", "")
        if item_type in _ITEM_TYPE_ALERTS:
            return 0
        return 1

    async def _sync_alerts(self, sync_client: CloudSync, items: List[Dict[str, Any]]) -> None:
        alert_data = [item.get("data", {}) for item in items if item.get("data")]

        if not alert_data:
            logger.warning("no_valid_alerts_to_sync", device_id=self.device_id)
            return

        success = await sync_client.batch_sync_alerts(alert_data)

        if success:
            self.stats["total_processed"] += len(items)
        else:
            raise SyncError("Alert batch sync failed")

    async def _sync_telemetry(self, sync_client: CloudSync, items: List[Dict[str, Any]]) -> None:
        telemetry_data = [item["data"] for item in items]
        success = await sync_client.batch_sync_telemetry(telemetry_data)

        if success:
            self.stats["total_processed"] += len(items)
        else:
            raise SyncError("Telemetry batch sync failed")

    async def _handle_failed_item(self, item: Dict[str, Any]) -> None:
        item["attempts"] += 1
        item["last_attempt"] = datetime.utcnow()

        if item["attempts"] >= self.max_retry_attempts:
            self.stats["total_failed"] += 1
            logger.error(
                "item_moved_to_dead_letter",
                item_type=item["type"],
                attempts=item["attempts"],
            )
            try:
                await self.db.insert_dead_letter(
                    item_type=item["type"],
                    item_data=item.get("data", {}),
                    attempts=item["attempts"],
                )
            except Exception as exc:
                logger.error("dead_letter_persist_error", error=str(exc))
        else:
            backoff_seconds = min(300, 2 ** item["attempts"])
            item["next_retry"] = datetime.utcnow() + timedelta(seconds=backoff_seconds)

            try:
                if self.queue is None:
                    raise RuntimeError("Sync queue not initialized")
                await self.queue.put(item)
                self.stats["total_retries"] += 1
            except asyncio.QueueFull:
                logger.error("queue_full_on_retry", item_type=item["type"])

    async def _load_persisted_items(self) -> None:
        try:
            if self.queue is None:
                raise RuntimeError("Sync queue not initialized")

            persisted = await self.db.get_sync_queue_items(limit=self.max_size)
            persisted.sort(key=lambda r: (-r.get("priority", 0), r["created_at"]))

            for row in persisted:
                item: Dict[str, Any] = {
                    "id": row["id"],
                    "type": row["item_type"],
                    "data": json.loads(row["data_json"]),
                    "attempts": row["attempts"],
                    "first_queued": datetime.fromisoformat(row["created_at"]),
                    "last_attempt": (
                        datetime.fromisoformat(row["last_attempt"]) if row["last_attempt"] else None
                    ),
                    "next_retry": (
                        datetime.fromisoformat(row["next_retry"])
                        if row.get("next_retry")
                        else datetime.utcnow()
                    ),
                    "priority": row.get("priority", 0),
                }
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
                    (item["last_attempt"].isoformat() if item.get("last_attempt") else None),
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

        logger.debug("queue_persisted", count=len(items))

    async def _persist_single_item(self, item: Dict[str, Any]) -> None:
        data = item.get("data", {})
        item_id = data.get("alert_id") or data.get("id") or "unknown"
        await self.db.enqueue_sync_item(
            item["type"],
            item_id,
            data,
            priority=item.get("priority", 0),
        )

    def get_stats(self) -> Dict[str, Any]:
        if self.queue is not None:
            self.stats["queue_size"] = self.queue.qsize()
        return {
            "online": self._was_online,
            "queue_depth": self.stats["queue_size"],
            "total_enqueued": self.stats["total_enqueued"],
            "total_processed": self.stats["total_processed"],
            "total_failed": self.stats["total_failed"],
            "total_retries": self.stats["total_retries"],
            "max_retry_attempts": self.max_retry_attempts,
            "unsynced_alerts": self.stats["queue_size"],
        }

    def request_flush(self) -> None:
        self._flush_requested = True
        logger.info("sync_flush_requested", device_id=self.device_id)

    async def get_dead_letter_items(self) -> Dict[str, Any]:
        items = await self.db.get_dead_letter_items()
        return {"items": items, "total": len(items)}
