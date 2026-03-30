import asyncio
import json
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Any, Union
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

from edgepulse_win.storage.database import DatabaseManager
from edgepulse_win.utils.log_handler import get_logger
from edgepulse_win.utils.error_handler import ( log_operation, log_sync_operation, RetryHandler, SyncError, NetworkError )
from edgepulse_win.shared import ( create_metrics_collector, StandardMetrics )

logger = get_logger(__name__)

class AsyncSyncQueue:
    """Persistent async queue for sync operations with retry logic"""
    
    def __init__(
        self, 
        storage_path: Path, 
        max_size: int = 10000,
        max_retry_attempts: int = 5,
        batch_size: int = 50,
        device_id: str = "unknown"
    ):
        self.storage_path = storage_path
        self.max_size = max_size
        self.max_retry_attempts = max_retry_attempts
        self.batch_size = batch_size
        self.device_id = device_id
        
        # In-memory queue for fast access
        self.queue: Optional[asyncio.Queue] = None
        
        # Database for persistence
        self.db = DatabaseManager(storage_path / "sync_queue.db")
        
        # Worker task
        self._worker_task: Optional[asyncio.Task] = None
        self._running = False
        
        # Shared metrics collector
        self.metrics = create_metrics_collector(f"sync_queue_{device_id}", device_id)
        
        # Retry handler
        self.retry_handler = RetryHandler(
            max_attempts=max_retry_attempts,
            base_delay=1.0,
            max_delay=60.0
        )
        
        # Statistics (kept for compatibility)
        self.stats = {
            "total_enqueued": 0,
            "total_processed": 0,
            "total_failed": 0,
            "total_retries": 0,
            "queue_size": 0
        }
        
        logger.info(
            "async_sync_queue_initialized",
            storage_path=str(storage_path),
            max_size=max_size,
            max_retry_attempts=max_retry_attempts,
            batch_size=batch_size,
            device_id=device_id
        )
    
    @log_operation("initialize", "sync_queue", device_id=lambda self: self.device_id)
    async def initialize(self) -> None:
        """Initialize the sync queue"""
        if self.queue is None:
            self.queue = asyncio.Queue(maxsize=self.max_size)
        await self.db.initialize()
        await self._load_persisted_items()
    
    @log_operation("start_worker", "sync_queue", device_id=lambda self: self.device_id)
    async def start_worker(self, sync_client: Any) -> None:
        """Start the background sync worker"""
        if self._running:
            logger.warning("sync_queue_worker_already_running", device_id=self.device_id)
            return
        
        self._running = True
        self._worker_task = asyncio.create_task(
            self._sync_worker(sync_client),
            name="sync_queue_worker"
        )
        
        logger.info("sync_queue_worker_started", device_id=self.device_id)
    
    async def stop(self) -> None:
        """Stop the sync queue and persist remaining items"""
        if not self._running:
            return
        
        self._running = False
        
        if self._worker_task:
            self._worker_task.cancel()
            try:
                await self._worker_task
            except asyncio.CancelledError:
                pass
        
        # Persist remaining items
        if self.queue is not None:
            await self._persist_queue()
        
        logger.info("sync_queue_stopped", stats=self.stats)
    
    async def enqueue(self, item_type: str, item_data: Dict, priority: int = 0) -> bool:
        """Add an item to the sync queue"""
        if self.queue is None:
            raise RuntimeError("Sync queue not initialized")

        if self.queue.qsize() >= self.max_size:
            logger.warning(
                "sync_queue_full",
                item_type=item_type,
                item_id=item_data.get('id'),
                queue_size=self.queue.qsize(),
                device_id=self.device_id
            )
            return False
        
        queue_item = {
            "type": item_type,
            "data": item_data,
            "priority": priority,
            "attempts": 0,
            "first_queued": datetime.utcnow(),
            "last_attempt": None,
            "next_retry": datetime.utcnow()
        }
        
        try:
            self.queue.put_nowait(queue_item)
            self.stats["total_enqueued"] += 1
            self.stats["queue_size"] = self.queue.qsize()
            
            # Record standardized metric
            self.metrics.increment_counter(
                StandardMetrics.SYNC_QUEUE_SIZE,
                value=self.queue.qsize(),
                labels={"item_type": item_type}
            )
            
            # Persist immediately for critical items
            if priority > 0:
                await self._persist_single_item(queue_item)
            
            logger.debug(
                "item_enqueued",
                item_type=item_type,
                item_id=item_data.get('id'),
                queue_size=self.queue.qsize(),
                device_id=self.device_id
            )
            return True
            
        except asyncio.QueueFull:
            logger.warning(
                "queue_full_on_enqueue",
                item_type=item_type,
                item_id=item_data.get('id'),
                device_id=self.device_id
            )
            return False
    
    async def get_batch(self, max_size: Optional[int] = None, timeout: float = 5.0) -> List[Dict]:
        """Get a batch of items ready for processing"""
        if self.queue is None:
            raise RuntimeError("Sync queue not initialized")

        batch_size = max_size or self.batch_size
        batch = []
        loop = asyncio.get_running_loop()
        deadline = loop.time() + timeout
        
        while len(batch) < batch_size:
            remaining = deadline - loop.time()
            if remaining <= 0:
                break
            
            try:
                item = await asyncio.wait_for(
                    self.queue.get(), 
                    timeout=remaining
                )
                
                # Check if item is ready for retry
                if self._is_ready_for_retry(item):
                    batch.append(item)
                else:
                    # Put it back if not ready
                    await self.queue.put(item)
                    
            except asyncio.TimeoutError:
                break
        
        return batch
    
    async def _sync_worker(self, sync_client: Any) -> None:
        """Background worker that processes sync items"""
        logger.info("sync_worker_started")
        
        while self._running:
            try:
                # Get a batch of items
                batch = await self.get_batch(timeout=1.0)
                
                if batch:
                    await self._process_batch(sync_client, batch)
                else:
                    # No items to process, brief sleep
                    await asyncio.sleep(0.1)
                    
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("sync_worker_error", error=str(e))
                await asyncio.sleep(5.0)  # Back off on error
        
        logger.info("sync_worker_stopped")
    
    async def _process_batch(self, sync_client: Any, batch: List[Dict]) -> None:
        """Process a batch of sync items"""
        if not batch:
            return
        
        logger.debug("processing_sync_batch", batch_size=len(batch))
        
        # Group items by type for batch processing
        items_by_type = {}
        for item in batch:
            item_type = item["type"]
            if item_type not in items_by_type:
                items_by_type[item_type] = []
            items_by_type[item_type].append(item)
        
        # Process each type
        for item_type, items in items_by_type.items():
            try:
                await self._sync_items_by_type(sync_client, item_type, items)
            except Exception as e:
                logger.error(
                    "batch_sync_error",
                    item_type=item_type,
                    error=str(e)
                )
                # Re-queue failed items
                for item in items:
                    await self._handle_failed_item(item)
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=4, max=60),
        retry=retry_if_exception_type(NetworkError)
    )
    async def _sync_items_by_type(self, sync_client: Any, item_type: str, items: List[Dict]) -> None:
        """Sync items of a specific type"""
        start_time = datetime.utcnow()
        
        try:
            if item_type == "alert":
                await self._sync_alerts(sync_client, items)
            elif item_type == "telemetry":
                await self._sync_telemetry(sync_client, items)
            else:
                logger.warning("unknown_item_type", item_type=item_type, device_id=self.device_id)
                return
            
            # Record successful sync
            duration_ms = (datetime.utcnow() - start_time).total_seconds() * 1000
            self.metrics.record_sync_operation(
                operation_type=item_type,
                item_type=item_type,
                item_count=len(items),
                success=True,
                duration_ms=duration_ms
            )
            
            log_sync_operation(
                operation=f"sync_{item_type}",
                item_type=item_type,
                item_count=len(items),
                device_id=self.device_id,
                status="success",
                duration_ms=duration_ms
            )
            
        except Exception as e:
            # Record failed sync
            duration_ms = (datetime.utcnow() - start_time).total_seconds() * 1000
            self.metrics.record_sync_operation(
                operation_type=item_type,
                item_type=item_type,
                item_count=len(items),
                success=False,
                duration_ms=duration_ms
            )
            
            log_sync_operation(
                operation=f"sync_{item_type}",
                item_type=item_type,
                item_count=len(items),
                device_id=self.device_id,
                status="error",
                error_details=str(e),
                duration_ms=duration_ms
            )
            
            raise
    
    async def _sync_alerts(self, sync_client: Any, items: List[Dict]) -> None:
        """Sync alert items"""
        alert_data = []
        for item in items:
            # Validate and normalize alert data
            try:
                alert_event = AlertEvent(**item["data"])
                alert_data.append(alert_event.dict())
            except Exception as e:
                logger.error(
                    "alert_validation_failed",
                    item_id=item.get("data", {}).get("id"),
                    error=str(e),
                    device_id=self.device_id
                )
                continue
        
        if not alert_data:
            logger.warning("no_valid_alerts_to_sync", device_id=self.device_id)
            return
        
        success = False
        if hasattr(sync_client, 'batch_sync_alerts'):
            if asyncio.iscoroutinefunction(sync_client.batch_sync_alerts):
                success = await sync_client.batch_sync_alerts(alert_data)
            else:
                success = await asyncio.to_thread(
                    sync_client.batch_sync_alerts,
                    alert_data
                )
        else:
            # Fallback to individual sync
            success = True
            for alert_dict in alert_data:
                if hasattr(sync_client, 'sync_alert'):
                    if asyncio.iscoroutinefunction(sync_client.sync_alert):
                        item_success = await sync_client.sync_alert(alert_dict)
                    else:
                        item_success = await asyncio.to_thread(
                            sync_client.sync_alert,
                            alert_dict
                        )
                    success = success and item_success
                    # Record alert metrics
                    if item_success:
                        self.metrics.record_alert(
                            severity=alert_dict.get('severity', 'medium'),
                            anomaly_score=alert_dict.get('anomaly_score'),
                            alert_type=alert_dict.get('alert_type'),
                            detector_type=alert_dict.get('detector_type')
                        )
        
        if success:
            self.stats["total_processed"] += len(items)
            logger.info(
                "alerts_synced_successfully", 
                count=len(alert_data),
                device_id=self.device_id
            )
        else:
            raise SyncError("Alert batch sync failed")
    
    async def _sync_telemetry(self, sync_client: Any, items: List[Dict]) -> None:
        """Sync telemetry items"""
        telemetry_data = [item["data"] for item in items]
        
        # Similar pattern to alerts but for telemetry
        if hasattr(sync_client, 'batch_sync_telemetry'):
            if asyncio.iscoroutinefunction(sync_client.batch_sync_telemetry):
                success = await sync_client.batch_sync_telemetry(telemetry_data)
            else:
                success = await asyncio.to_thread(
                    sync_client.batch_sync_telemetry,
                    telemetry_data
                )
        else:
            success = True  # Assume success for now
        
        if success:
            self.stats["total_processed"] += len(items)
            logger.info("telemetry_synced_successfully", count=len(items))
        else:
            raise SyncError("Telemetry batch sync failed")
    
    async def _handle_failed_item(self, item: Dict) -> None:
        """Handle a failed sync item"""
        item["attempts"] += 1
        item["last_attempt"] = datetime.utcnow()
        
        if item["attempts"] >= self.max_retry_attempts:
            # Max attempts reached, give up
            self.stats["total_failed"] += 1
            logger.error(
                "item_max_attempts_reached",
                item_type=item["type"],
                item_id=item["data"].get('id'),
                attempts=item["attempts"]
            )
        else:
            # Calculate next retry time with exponential backoff
            backoff_seconds = min(300, 2 ** item["attempts"])  # Max 5 minutes
            item["next_retry"] = datetime.utcnow() + timedelta(seconds=backoff_seconds)
            
            # Re-queue for retry
            try:
                if self.queue is None:
                    raise RuntimeError("Sync queue not initialized")
                await self.queue.put(item)
                self.stats["total_retries"] += 1
                logger.debug(
                    "item_requeued_for_retry",
                    item_type=item["type"],
                    item_id=item["data"].get('id'),
                    attempts=item["attempts"],
                    next_retry=backoff_seconds
                )
            except asyncio.QueueFull:
                logger.error(
                    "queue_full_on_retry",
                    item_type=item["type"],
                    item_id=item["data"].get('id')
                )
    
    def _is_ready_for_retry(self, item: Dict) -> bool:
        """Check if an item is ready for retry"""
        if item["attempts"] == 0:
            return True  # First attempt
        
        next_retry = item.get("next_retry")
        if not next_retry:
            return True
        
        return datetime.utcnow() >= next_retry
    
    async def _load_persisted_items(self) -> None:
        """Load persisted items from database on startup"""
        try:
            if self.queue is None:
                raise RuntimeError("Sync queue not initialized")

            persisted_items = await self.db.get_sync_queue_items(limit=self.max_size)
            
            for item_dict in persisted_items:
                item = {
                    "type": item_dict["item_type"],
                    "data": json.loads(item_dict["data_json"]),
                    "attempts": item_dict["attempts"],
                    "first_queued": datetime.fromisoformat(item_dict["created_at"]),
                    "last_attempt": datetime.fromisoformat(item_dict["last_attempt"]) if item_dict["last_attempt"] else None,
                    "priority": 0
                }
                
                if self._is_ready_for_retry(item):
                    try:
                        await self.queue.put(item)
                    except asyncio.QueueFull:
                        logger.warning("queue_full_during_load")
                        break
            
            logger.info(
                "persisted_items_loaded",
                count=len(persisted_items),
                queue_size=self.queue.qsize()
            )
            
        except Exception as e:
            logger.error("error_loading_persisted_items", error=str(e))
    
    async def _persist_queue(self) -> None:
        """Persist all items in the queue to database"""
        if self.queue is None:
            return

        items = []
        while not self.queue.empty():
            try:
                item = self.queue.get_nowait()
                items.append(item)
            except asyncio.QueueEmpty:
                break
        
        if items:
            params_list = [
                (
                    item["type"],
                    item["data"].get("id", "unknown"),
                    json.dumps(item["data"]),
                    item["attempts"],
                    item["last_attempt"].isoformat() if item["last_attempt"] else None
                )
                for item in items
            ]
            
            await self.db.execute_many(
                """INSERT INTO sync_queue (item_type, item_id, data_json, attempts, last_attempt)
                   VALUES (?, ?, ?, ?, ?)""",
                params_list
            )
            
            # Re-queue items
            for item in items:
                await self.queue.put(item)
            
            logger.debug("queue_persisted", count=len(items))
    
    async def _persist_single_item(self, item: Dict) -> None:
        """Persist a single item immediately"""
        await self.db.enqueue_sync_item(
            item["type"],
            item["data"].get("id", "unknown"),
            item["data"]
        )
    
    def get_stats(self) -> Dict[str, Any]:
        """Get current queue statistics"""
        if self.queue is not None:
            self.stats["queue_size"] = self.queue.qsize()
        return self.stats.copy()
    
    async def clear_queue(self) -> int:
        """Clear all items from the queue"""
        if self.queue is None:
            count = 0
        else:
            count = self.queue.qsize()
        
        # Clear in-memory queue
        if self.queue is not None:
            while not self.queue.empty():
                try:
                    self.queue.get_nowait()
                except asyncio.QueueEmpty:
                    break
        
        # Clear persisted queue
        await self.db.execute_update("DELETE FROM sync_queue")
        
        logger.info("queue_cleared", count=count)
        return count
