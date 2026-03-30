"""
Sync Finite State Machine for EdgePulse

Implements explicit sync states (ONLINE/DEGRADED/OFFLINE/RECONNECTING)
with exponential backoff, queue-first semantics, and offline anchors.
"""

import time
import asyncio
import hashlib
import json
from enum import Enum, auto
from typing import Dict, List, Any, Optional, Callable
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta

from edgepulse_win.utils.log_handler import get_logger
from edgepulse_win.sync.async_queue import AsyncSyncQueue
from edgepulse_win.sync.supabase import SupabaseSync

logger = get_logger(__name__)


class SyncState(Enum):
    """Sync states as specified in checklist"""
    ONLINE = auto()
    DEGRADED = auto()
    OFFLINE = auto()
    RECONNECTING = auto()


@dataclass
class SyncMetrics:
    """Metrics for sync performance monitoring"""
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
    """Merkle root anchor for offline continuity verification"""
    merkle_root: str
    timestamp: str
    event_count: int
    last_event_hash: str


class SyncFSM:
    """Finite State Machine for sync operations with checklist requirements"""
    
    def __init__(self, supabase_sync: SupabaseSync, sync_queue: AsyncSyncQueue):
        self.supabase_sync = supabase_sync
        self.sync_queue = sync_queue
        
        # FSM state
        self._state = SyncState.OFFLINE
        self._last_state_change = datetime.utcnow()
        
        # Backoff configuration (per checklist: 60→900s exponential)
        self._base_backoff = 60.0
        self._max_backoff = 900.0
        self._current_backoff = self._base_backoff
        self._backoff_multiplier = 2.0
        
        # Metrics
        self._successful_syncs = 0
        self._failed_syncs = 0
        self._consecutive_failures = 0
        self._last_successful_sync = None
        self._latency_samples = []
        
        # Offline anchor
        self._offline_anchor: Optional[OfflineAnchor] = None
        
        # FSM task
        self._fsm_task: Optional[asyncio.Task] = None
        self._running = False
        
        # Event callbacks
        self._state_change_callbacks: List[Callable[[SyncState, SyncState], None]] = []
        
        logger.info("Sync FSM initialized")
    
    async def start(self) -> None:
        """Start the sync FSM"""
        if self._running:
            logger.warning("Sync FSM already running")
            return
        
        self._running = True
        self._fsm_task = asyncio.create_task(self._fsm_loop())
        logger.info("Sync FSM started")
    
    async def stop(self) -> None:
        """Stop the sync FSM"""
        self._running = False
        
        if self._fsm_task:
            self._fsm_task.cancel()
            try:
                await self._fsm_task
            except asyncio.CancelledError:
                pass
        
        logger.info("Sync FSM stopped")
    
    def add_state_change_callback(self, callback: Callable[[SyncState, SyncState], None]) -> None:
        """Add callback for state changes"""
        self._state_change_callbacks.append(callback)
    
    def get_state(self) -> SyncState:
        """Get current sync state"""
        return self._state
    
    async def get_metrics(self) -> SyncMetrics:
        """Get current sync metrics"""
        avg_latency = sum(self._latency_samples) / len(self._latency_samples) if self._latency_samples else 0.0
        
        return SyncMetrics(
            state=self._state,
            last_state_change=self._last_state_change.isoformat(),
            successful_syncs=self._successful_syncs,
            failed_syncs=self._failed_syncs,
            queue_size=await self._get_queue_size(),
            last_successful_sync=self._last_successful_sync.isoformat() if self._last_successful_sync else None,
            average_latency_ms=avg_latency,
            backoff_seconds=self._current_backoff,
            consecutive_failures=self._consecutive_failures
        )
    
    async def _fsm_loop(self) -> None:
        """Main FSM loop"""
        logger.info(f"Sync FSM loop started in state: {self._state.name}")
        
        while self._running:
            try:
                # Execute state-specific logic
                if self._state == SyncState.ONLINE:
                    await self._handle_online_state()
                elif self._state == SyncState.DEGRADED:
                    await self._handle_degraded_state()
                elif self._state == SyncState.OFFLINE:
                    await self._handle_offline_state()
                elif self._state == SyncState.RECONNECTING:
                    await self._handle_reconnecting_state()
                
                # Small delay to prevent tight loop
                await asyncio.sleep(1)
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in FSM loop: {e}")
                await asyncio.sleep(5)
    
    async def _handle_online_state(self) -> None:
        """Handle ONLINE state - normal operation"""
        try:
            # Check connectivity
            if not await self._check_connectivity():
                logger.warning("Connectivity check failed, transitioning to DEGRADED")
                self._transition_to_state(SyncState.DEGRADED)
                return
            
            # Process sync queue
            await self._process_sync_queue()
            
            # Update device heartbeat
            await self._update_device_heartbeat()
            
            # Check for degraded performance
            if self._consecutive_failures >= 3:
                logger.warning("Multiple failures detected, transitioning to DEGRADED")
                self._transition_to_state(SyncState.DEGRADED)
            
        except Exception as e:
            logger.error(f"Error in ONLINE state: {e}")
            self._consecutive_failures += 1
            if self._consecutive_failures >= 3:
                self._transition_to_state(SyncState.DEGRADED)
    
    async def _handle_degraded_state(self) -> None:
        """Handle DEGRADED state - limited connectivity"""
        try:
            # Check connectivity with longer timeout
            if await self._check_connectivity():
                logger.info("Connectivity restored, transitioning to ONLINE")
                self._transition_to_state(SyncState.ONLINE)
                return
            
            # Try limited sync operations
            await self._process_priority_sync_queue()
            
            # If degraded for too long, go to offline
            time_in_degraded = datetime.utcnow() - self._last_state_change
            if time_in_degraded > timedelta(minutes=5):
                logger.warning("Degraded state timeout, transitioning to OFFLINE")
                self._transition_to_state(SyncState.OFFLINE)
            
        except Exception as e:
            logger.error(f"Error in DEGRADED state: {e}")
            self._consecutive_failures += 1
            if self._consecutive_failures >= 5:
                self._transition_to_state(SyncState.OFFLINE)
    
    async def _handle_offline_state(self) -> None:
        """Handle OFFLINE state - no connectivity"""
        try:
            # Create offline anchor if not exists
            if not self._offline_anchor:
                await self._create_offline_anchor()
            
            # Wait for backoff period before trying to reconnect
            await asyncio.sleep(self._current_backoff)
            
            # Try to reconnect
            logger.info("Attempting to reconnect from OFFLINE state")
            self._transition_to_state(SyncState.RECONNECTING)
            
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.error(f"Error in OFFLINE state: {e}")
            await asyncio.sleep(30)  # Wait before retry
    
    async def _handle_reconnecting_state(self) -> None:
        """Handle RECONNECTING state - attempting to restore connectivity"""
        try:
            # Check connectivity
            if await self._check_connectivity():
                logger.info("Reconnection successful, transitioning to ONLINE")
                self._transition_to_state(SyncState.ONLINE)
                self._reset_backoff()
                return
            
            # Reconnection failed
            self._consecutive_failures += 1
            self._increase_backoff()
            
            logger.warning(f"Reconnection failed, backoff: {self._current_backoff}s")
            self._transition_to_state(SyncState.OFFLINE)
            
        except Exception as e:
            logger.error(f"Error in RECONNECTING state: {e}")
            self._consecutive_failures += 1
            self._increase_backoff()
            self._transition_to_state(SyncState.OFFLINE)
    
    async def _check_connectivity(self) -> bool:
        """Check connectivity to backend"""
        try:
            start_time = time.perf_counter()
            success = await self.supabase_sync.check_connectivity()
            latency_ms = (time.perf_counter() - start_time) * 1000
            
            if success:
                self._latency_samples.append(latency_ms)
                # Keep only last 100 samples
                if len(self._latency_samples) > 100:
                    self._latency_samples = self._latency_samples[-100:]
            
            return success
            
        except Exception as e:
            logger.error(f"Connectivity check error: {e}")
            return False
    
    async def _process_sync_queue(self) -> None:
        """Process sync queue with queue-first semantics"""
        try:
            queue_size = await self._get_queue_size()
            if queue_size == 0:
                return
            
            # Process items in priority order
            processed = 0
            max_batch_size = 50  # Process in batches to prevent overwhelming
            
            while processed < max_batch_size and await self._get_queue_size() > 0:
                item = await self.sync_queue.get_next()
                if not item:
                    break
                
                success = await self._sync_item(item)
                if success:
                    self._successful_syncs += 1
                    self._last_successful_sync = datetime.utcnow()
                    self._consecutive_failures = 0
                    await self.sync_queue.mark_completed(item['id'])
                else:
                    self._failed_syncs += 1
                    self._consecutive_failures += 1
                    await self.sync_queue.mark_failed(item['id'])
                
                processed += 1
            
            if processed > 0:
                logger.debug(f"Processed {processed} sync items")
            
        except Exception as e:
            logger.error(f"Error processing sync queue: {e}")
            raise
    
    async def _process_priority_sync_queue(self) -> None:
        """Process only high-priority items in degraded state"""
        try:
            # Get only priority 1-2 items
            priority_items = await self.sync_queue.get_items_by_priority(max_priority=2)
            
            processed = 0
            for item in priority_items[:10]:  # Limit batch size in degraded state
                success = await self._sync_item(item)
                if success:
                    self._successful_syncs += 1
                    await self.sync_queue.mark_completed(item['id'])
                    processed += 1
                else:
                    self._failed_syncs += 1
                    await self.sync_queue.mark_failed(item['id'])
            
            if processed > 0:
                logger.debug(f"Processed {processed} priority items in degraded state")
            
        except Exception as e:
            logger.error(f"Error processing priority queue: {e}")
    
    async def _sync_item(self, item: Dict[str, Any]) -> bool:
        """Sync individual item"""
        try:
            record_type = item['record_type']
            record_data = item['data']
            
            if record_type == 'telemetry_events':
                return await self.supabase_sync.sync_telemetry_events([record_data])
            elif record_type == 'alert_records':
                return await self.supabase_sync.sync_alert_records([record_data])
            elif record_type == 'device_heartbeat':
                return await self.supabase_sync.update_device_heartbeat(record_data)
            else:
                logger.warning(f"Unknown record type: {record_type}")
                return False
                
        except Exception as e:
            logger.error(f"Error syncing item {item.get('id')}: {e}")
            return False
    
    async def _update_device_heartbeat(self) -> None:
        """Update device heartbeat"""
        try:
            heartbeat_data = {
                "device_id": await self._get_device_id(),
                "status": "online",
                "timestamp": datetime.utcnow().isoformat()
            }
            
            await self.supabase_sync.update_device_heartbeat(heartbeat_data)
            
        except Exception as e:
            logger.error(f"Error updating heartbeat: {e}")
    
    async def _create_offline_anchor(self) -> None:
        """Create Merkle root anchor for offline continuity"""
        try:
            # Get all queued items
            queued_items = await self.sync_queue.get_all_items()
            
            if not queued_items:
                logger.debug("No items for offline anchor")
                return
            
            # Calculate Merkle root
            merkle_root = self._calculate_merkle_root(queued_items)
            
            # Create anchor
            self._offline_anchor = OfflineAnchor(
                merkle_root=merkle_root,
                timestamp=datetime.utcnow().isoformat(),
                event_count=len(queued_items),
                last_event_hash=self._hash_item(queued_items[-1]) if queued_items else ""
            )
            
            logger.info(f"Created offline anchor: {merkle_root[:16]}... ({len(queued_items)} items)")
            
        except Exception as e:
            logger.error(f"Error creating offline anchor: {e}")
    
    def _calculate_merkle_root(self, items: List[Dict[str, Any]]) -> str:
        """Calculate Merkle root of queued items"""
        try:
            if not items:
                return hashlib.sha256(b"").hexdigest()
            
            # Hash all items
            item_hashes = [self._hash_item(item) for item in items]
            
            # Build Merkle tree
            while len(item_hashes) > 1:
                next_level = []
                
                for i in range(0, len(item_hashes), 2):
                    if i + 1 < len(item_hashes):
                        combined = item_hashes[i] + item_hashes[i + 1]
                    else:
                        combined = item_hashes[i] + item_hashes[i]  # Odd number, duplicate last
                    
                    next_level.append(hashlib.sha256(combined.encode()).hexdigest())
                
                item_hashes = next_level
            
            return item_hashes[0] if item_hashes else hashlib.sha256(b"").hexdigest()
            
        except Exception as e:
            logger.error(f"Error calculating Merkle root: {e}")
            return hashlib.sha256(b"error").hexdigest()
    
    def _hash_item(self, item: Dict[str, Any]) -> str:
        """Hash individual item"""
        try:
            item_json = json.dumps(item, sort_keys=True, separators=(',', ':'))
            return hashlib.sha256(item_json.encode()).hexdigest()
        except Exception as e:
            logger.error(f"Error hashing item: {e}")
            return hashlib.sha256(str(item).encode()).hexdigest()
    
    def _transition_to_state(self, new_state: SyncState) -> None:
        """Transition to new state"""
        if new_state == self._state:
            return
        
        old_state = self._state
        self._state = new_state
        self._last_state_change = datetime.utcnow()
        
        logger.info(f"Sync state transition: {old_state.name} -> {new_state.name}")
        
        # Call callbacks
        for callback in self._state_change_callbacks:
            try:
                callback(old_state, new_state)
            except Exception as e:
                logger.error(f"Error in state change callback: {e}")
    
    def _increase_backoff(self) -> None:
        """Increase backoff delay"""
        self._current_backoff = min(
            self._current_backoff * self._backoff_multiplier,
            self._max_backoff
        )
    
    def _reset_backoff(self) -> None:
        """Reset backoff to base value"""
        self._current_backoff = self._base_backoff
    
    async def _get_queue_size(self) -> int:
        """Get current queue size"""
        try:
            return await self.sync_queue.size()
        except Exception as e:
            logger.error(f"Error getting queue size: {e}")
            return 0
    
    async def _get_device_id(self) -> str:
        """Get device ID"""
        try:
            from ..auth.credentials import CredentialManager
            cred_manager = CredentialManager()
            credentials = cred_manager.get_device_credentials()
            return credentials.device_id if credentials else "unknown"
        except Exception as e:
            logger.error(f"Error getting device ID: {e}")
            return "unknown"
    
    def get_offline_anchor(self) -> Optional[OfflineAnchor]:
        """Get current offline anchor"""
        return self._offline_anchor
    
    def verify_offline_continuity(self, remote_anchor: OfflineAnchor) -> bool:
        """Verify offline continuity against remote anchor"""
        try:
            if not self._offline_anchor:
                logger.warning("No local offline anchor to verify")
                return False
            
            # Compare Merkle roots
            if self._offline_anchor.merkle_root != remote_anchor.merkle_root:
                logger.error("Merkle root mismatch - continuity violation")
                return False
            
            # Compare event counts
            if self._offline_anchor.event_count != remote_anchor.event_count:
                logger.error("Event count mismatch - continuity violation")
                return False
            
            logger.info("Offline continuity verified successfully")
            return True
            
        except Exception as e:
            logger.error(f"Error verifying offline continuity: {e}")
            return False
    
    async def force_sync(self) -> bool:
        """Force immediate sync attempt"""
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
        """Get detailed sync statistics"""
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
            "offline_anchor": asdict(self._offline_anchor) if self._offline_anchor else None,
            "uptime_seconds": (datetime.utcnow() - self._last_state_change).total_seconds()
        }
