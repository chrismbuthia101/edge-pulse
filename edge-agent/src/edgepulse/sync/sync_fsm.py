"""
Sync Finite State Machine for EdgePulse
"""

import asyncio
import hashlib
import json
import time
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta
from enum import Enum, auto
from typing import Any, Callable, Dict, List, Optional

from edgepulse.utils.log_handler import get_logger
from edgepulse.sync.async_queue import AsyncSyncQueue
from edgepulse.sync.supabase import SupabaseSync

logger = get_logger(__name__)


class SyncState(Enum):
    ONLINE = auto()
    DEGRADED = auto()
    OFFLINE = auto()
    RECONNECTING = auto()


@dataclass
class SyncMetrics:
    state: SyncState
    last_state_change: str
    successful_syncs: int
    failed_syncs: int
    queue_size: int
    last_successful_sync: Optional[str]
    average_latency_ms: float
    backoff_seconds: float
    consecutive_failures: int


@dataclass
class OfflineAnchor:
    merkle_root: str
    timestamp: str
    event_count: int
    last_event_hash: str


class SyncFSM:
    """Finite State Machine for sync operations"""

    def __init__(self, supabase_sync: SupabaseSync, sync_queue: AsyncSyncQueue):
        self.supabase_sync = supabase_sync
        self.sync_queue = sync_queue

        self._state = SyncState.OFFLINE
        self._last_state_change = datetime.utcnow()

        # Exponential backoff: 60 s → 900 s
        self._base_backoff = 60.0
        self._max_backoff = 900.0
        self._current_backoff = self._base_backoff
        self._backoff_multiplier = 2.0

        self._successful_syncs = 0
        self._failed_syncs = 0
        self._consecutive_failures = 0
        self._last_successful_sync: Optional[datetime] = None
        self._latency_samples: List[float] = []

        self._offline_anchor: Optional[OfflineAnchor] = None

        self._fsm_task: Optional[asyncio.Task] = None
        self._running = False

        self._state_change_callbacks: List[Callable[[SyncState, SyncState], None]] = []

        logger.info("Sync FSM initialized")

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def start(self) -> None:
        if self._running:
            logger.warning("Sync FSM already running")
            return

        self._running = True
        self._fsm_task = asyncio.create_task(self._fsm_loop())
        logger.info("Sync FSM started")

    async def stop(self) -> None:
        self._running = False

        if self._fsm_task:
            self._fsm_task.cancel()
            try:
                await self._fsm_task
            except asyncio.CancelledError:
                pass

        logger.info("Sync FSM stopped")

    # ------------------------------------------------------------------
    # Callbacks & state inspection
    # ------------------------------------------------------------------

    def add_state_change_callback(
        self, callback: Callable[[SyncState, SyncState], None]
    ) -> None:
        self._state_change_callbacks.append(callback)

    def get_state(self) -> SyncState:
        return self._state

    async def get_metrics(self) -> SyncMetrics:
        avg_latency = (
            sum(self._latency_samples) / len(self._latency_samples)
            if self._latency_samples
            else 0.0
        )
        return SyncMetrics(
            state=self._state,
            last_state_change=self._last_state_change.isoformat(),
            successful_syncs=self._successful_syncs,
            failed_syncs=self._failed_syncs,
            queue_size=await self._get_queue_size(),
            last_successful_sync=(
                self._last_successful_sync.isoformat()
                if self._last_successful_sync
                else None
            ),
            average_latency_ms=avg_latency,
            backoff_seconds=self._current_backoff,
            consecutive_failures=self._consecutive_failures,
        )

    # ------------------------------------------------------------------
    # FSM loop
    # ------------------------------------------------------------------

    async def _fsm_loop(self) -> None:
        logger.info(f"Sync FSM loop started in state: {self._state.name}")

        while self._running:
            try:
                if self._state == SyncState.ONLINE:
                    await self._handle_online_state()
                elif self._state == SyncState.DEGRADED:
                    await self._handle_degraded_state()
                elif self._state == SyncState.OFFLINE:
                    await self._handle_offline_state()
                elif self._state == SyncState.RECONNECTING:
                    await self._handle_reconnecting_state()

                await asyncio.sleep(1)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in FSM loop: {e}")
                await asyncio.sleep(5)

    # ------------------------------------------------------------------
    # State handlers
    # ------------------------------------------------------------------

    async def _handle_online_state(self) -> None:
        try:
            if not await self._check_connectivity():
                logger.warning("Connectivity check failed → DEGRADED")
                self._transition_to_state(SyncState.DEGRADED)
                return

            await self._process_sync_queue()
            await self._update_device_heartbeat()

            if self._consecutive_failures >= 3:
                self._transition_to_state(SyncState.DEGRADED)

        except Exception as e:
            logger.error(f"Error in ONLINE state: {e}")
            self._consecutive_failures += 1
            if self._consecutive_failures >= 3:
                self._transition_to_state(SyncState.DEGRADED)

    async def _handle_degraded_state(self) -> None:
        try:
            if await self._check_connectivity():
                logger.info("Connectivity restored → ONLINE")
                self._transition_to_state(SyncState.ONLINE)
                return

            await self._process_priority_sync_queue()

            if datetime.utcnow() - self._last_state_change > timedelta(minutes=5):
                logger.warning("Degraded timeout → OFFLINE")
                self._transition_to_state(SyncState.OFFLINE)

        except Exception as e:
            logger.error(f"Error in DEGRADED state: {e}")
            self._consecutive_failures += 1
            if self._consecutive_failures >= 5:
                self._transition_to_state(SyncState.OFFLINE)

    async def _handle_offline_state(self) -> None:
        try:
            if not self._offline_anchor:
                await self._create_offline_anchor()

            await asyncio.sleep(self._current_backoff)

            logger.info("Attempting reconnect from OFFLINE")
            self._transition_to_state(SyncState.RECONNECTING)

        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.error(f"Error in OFFLINE state: {e}")
            await asyncio.sleep(30)

    async def _handle_reconnecting_state(self) -> None:
        try:
            if await self._check_connectivity():
                logger.info("Reconnected → ONLINE")
                self._transition_to_state(SyncState.ONLINE)
                self._reset_backoff()
                return

            self._consecutive_failures += 1
            self._increase_backoff()
            logger.warning(f"Reconnection failed, backoff: {self._current_backoff}s")
            self._transition_to_state(SyncState.OFFLINE)

        except Exception as e:
            logger.error(f"Error in RECONNECTING state: {e}")
            self._consecutive_failures += 1
            self._increase_backoff()
            self._transition_to_state(SyncState.OFFLINE)

    # ------------------------------------------------------------------
    # Connectivity
    # ------------------------------------------------------------------

    async def _check_connectivity(self) -> bool:
        try:
            start = time.perf_counter()
            success = await self.supabase_sync.check_connectivity()
            latency_ms = (time.perf_counter() - start) * 1000

            if success:
                self._latency_samples.append(latency_ms)
                if len(self._latency_samples) > 100:
                    self._latency_samples = self._latency_samples[-100:]

            return success

        except Exception as e:
            logger.error(f"Connectivity check error: {e}")
            return False

    # ------------------------------------------------------------------
    # Sync queue processing
    # ------------------------------------------------------------------

    async def _process_sync_queue(self) -> None:
        """Drain the queue using AsyncSyncQueue.get_batch()."""
        try:
            queue_size = await self._get_queue_size()
            if queue_size == 0:
                return

            processed = 0
            max_items = 50

            while processed < max_items:
                batch = await self.sync_queue.get_batch(
                    max_size=min(10, max_items - processed), timeout=1.0
                )
                if not batch:
                    break

                for item in batch:
                    success = await self._sync_item(item)
                    if success:
                        self._successful_syncs += 1
                        self._last_successful_sync = datetime.utcnow()
                        self._consecutive_failures = 0
                        # Remove from DB if it was persisted
                        item_id = item.get("id")
                        if item_id:
                            await self.sync_queue.mark_completed(item_id)
                    else:
                        self._failed_syncs += 1
                        self._consecutive_failures += 1
                        item_id = item.get("id")
                        if item_id:
                            await self.sync_queue.mark_failed(item_id)

                    processed += 1

        except Exception as e:
            logger.error(f"Error processing sync queue: {e}")

    async def _process_priority_sync_queue(self) -> None:
        """Process only a small batch in degraded-state (limits load)."""
        try:
            batch = await self.sync_queue.get_batch(max_size=10, timeout=2.0)
            processed = 0

            for item in batch:
                success = await self._sync_item(item)
                if success:
                    self._successful_syncs += 1
                    item_id = item.get("id")
                    if item_id:
                        await self.sync_queue.mark_completed(item_id)
                    processed += 1
                else:
                    item_id = item.get("id")
                    if item_id:
                        await self.sync_queue.mark_failed(item_id)

            if processed:
                logger.debug(f"Processed {processed} items in degraded state")

        except Exception as e:
            logger.error(f"Error in priority queue processing: {e}")

    async def _sync_item(self, item: Dict[str, Any]) -> bool:
        """Route a single queue item to the correct SupabaseSync method."""
        try:
            record_type: str = item.get("type") or item.get("record_type", "")
            record_data: Dict[str, Any] = item.get("data", {})

            # telemetry_events  (canonical type name from agent_core)
            if record_type in ("telemetry_events", "telemetry"):
                return await self.supabase_sync.sync_telemetry_events([record_data])

            # alert_records  (canonical type name from agent_core)
            elif record_type in ("alert_records", "alert"):
                return await self.supabase_sync.sync_alert_records([record_data])

            # anomaly_scores – no dedicated Supabase endpoint yet; skip gracefully
            elif record_type == "anomaly_scores":
                logger.debug("anomaly_scores sync not yet implemented, skipping")
                return True

            # device_health_snapshots
            elif record_type == "health_snapshots":
                return await self.supabase_sync.sync_health_snapshots([record_data])

            # tamper_evident_log
            elif record_type == "tamper_logs":
                return await self.supabase_sync.sync_tamper_logs([record_data])

            # device heartbeat
            elif record_type == "device_heartbeat":
                return await self.supabase_sync.update_device_heartbeat(record_data)

            else:
                logger.warning(f"Unknown record type: {record_type!r}")
                return False

        except Exception as e:
            logger.error(f"Error syncing item {item.get('id')}: {e}")
            return False

    async def _update_device_heartbeat(self) -> None:
        """Push a heartbeat record to Supabase."""
        try:
            device_id = await self._get_device_id()
            heartbeat_data = {
                "device_id": device_id,
                "status": "online",
                "timestamp": datetime.utcnow().isoformat(),
            }
            await self.supabase_sync.update_device_heartbeat(heartbeat_data)

        except Exception as e:
            logger.error(f"Error updating heartbeat: {e}")

    # ------------------------------------------------------------------
    # Offline anchor (Merkle root)
    # ------------------------------------------------------------------

    async def _create_offline_anchor(self) -> None:
        try:
            queued_items = await self.sync_queue.get_all_items()

            if not queued_items:
                logger.debug("No items for offline anchor")
                return

            merkle_root = self._calculate_merkle_root(queued_items)

            self._offline_anchor = OfflineAnchor(
                merkle_root=merkle_root,
                timestamp=datetime.utcnow().isoformat(),
                event_count=len(queued_items),
                last_event_hash=self._hash_item(queued_items[-1]),
            )

            logger.info(
                f"Created offline anchor: {merkle_root[:16]}… ({len(queued_items)} items)"
            )

        except Exception as e:
            logger.error(f"Error creating offline anchor: {e}")

    def _calculate_merkle_root(self, items: List[Dict[str, Any]]) -> str:
        if not items:
            return hashlib.sha256(b"").hexdigest()

        hashes = [self._hash_item(item) for item in items]

        while len(hashes) > 1:
            next_level: List[str] = []
            for i in range(0, len(hashes), 2):
                left = hashes[i]
                right = hashes[i + 1] if i + 1 < len(hashes) else left
                combined = hashlib.sha256((left + right).encode()).hexdigest()
                next_level.append(combined)
            hashes = next_level

        return hashes[0]

    def _hash_item(self, item: Dict[str, Any]) -> str:
        try:
            return hashlib.sha256(
                json.dumps(item, sort_keys=True, separators=(",", ":")).encode()
            ).hexdigest()
        except Exception:
            return hashlib.sha256(str(item).encode()).hexdigest()

    # ------------------------------------------------------------------
    # Transition helpers
    # ------------------------------------------------------------------

    def _transition_to_state(self, new_state: SyncState) -> None:
        if new_state == self._state:
            return

        old_state = self._state
        self._state = new_state
        self._last_state_change = datetime.utcnow()

        logger.info(f"Sync state: {old_state.name} → {new_state.name}")

        for cb in self._state_change_callbacks:
            try:
                cb(old_state, new_state)
            except Exception as e:
                logger.error(f"State-change callback error: {e}")

    def _increase_backoff(self) -> None:
        self._current_backoff = min(
            self._current_backoff * self._backoff_multiplier, self._max_backoff
        )

    def _reset_backoff(self) -> None:
        self._current_backoff = self._base_backoff

    # ------------------------------------------------------------------
    # Utilities
    # ------------------------------------------------------------------

    async def _get_queue_size(self) -> int:
        try:
            return await self.sync_queue.size()
        except Exception as e:
            logger.error(f"Error getting queue size: {e}")
            return 0

    async def _get_device_id(self) -> str:
        try:
            from edgepulse.auth.credentials import CredentialManager

            cred_manager = CredentialManager()
            credentials = cred_manager.get_device_credentials()
            return credentials.device_id if credentials else "unknown"
        except Exception as e:
            logger.error(f"Error getting device ID: {e}")
            return "unknown"

    def get_offline_anchor(self) -> Optional[OfflineAnchor]:
        return self._offline_anchor

    def verify_offline_continuity(self, remote_anchor: OfflineAnchor) -> bool:
        try:
            if not self._offline_anchor:
                logger.warning("No local offline anchor to verify")
                return False

            if self._offline_anchor.merkle_root != remote_anchor.merkle_root:
                logger.error("Merkle root mismatch – continuity violation")
                return False

            if self._offline_anchor.event_count != remote_anchor.event_count:
                logger.error("Event count mismatch – continuity violation")
                return False

            logger.info("Offline continuity verified")
            return True

        except Exception as e:
            logger.error(f"Error verifying offline continuity: {e}")
            return False

    async def force_sync(self) -> bool:
        """Force immediate sync attempt (only valid in ONLINE state)."""
        try:
            if self._state == SyncState.ONLINE:
                await self._process_sync_queue()
                return True
            else:
                logger.warning(f"Cannot force sync in {self._state.name} state")
                return False
        except Exception as e:
            logger.error(f"Error forcing sync: {e}")
            return False

    async def get_sync_statistics(self) -> Dict[str, Any]:
        metrics = await self.get_metrics()
        return {
            "state": metrics.state.name,
            "last_state_change": metrics.last_state_change,
            "successful_syncs": metrics.successful_syncs,
            "failed_syncs": metrics.failed_syncs,
            "queue_size": metrics.queue_size,
            "last_successful_sync": metrics.last_successful_sync,
            "average_latency_ms": metrics.average_latency_ms,
            "backoff_seconds": metrics.backoff_seconds,
            "consecutive_failures": metrics.consecutive_failures,
            "offline_anchor": (
                asdict(self._offline_anchor) if self._offline_anchor else None
            ),
            "uptime_seconds": (
                datetime.utcnow() - self._last_state_change
            ).total_seconds(),
        }