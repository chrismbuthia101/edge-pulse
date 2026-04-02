import asyncio
from datetime import datetime
from typing import Callable, Dict, List, Optional
from dataclasses import dataclass

from edgepulse_win.utils.log_handler import get_logger
from edgepulse_win.utils.error_handler import EdgePulseError
from edgepulse_win.shared import EventType

logger = get_logger(__name__)

LEGACY_EVENT_TYPES = {
    "anomaly_detected": EventType.DETECTION,
    "model_trained": EventType.SYSTEM,
    "sync_completed": EventType.SYNC,
    "alert_generated": EventType.ALERT,
    "agent_started": EventType.SYSTEM,
    "agent_stopped": EventType.SYSTEM,
    "pipeline_error": EventType.SYSTEM,
}


@dataclass
class Event:
    type: EventType
    data: Dict
    timestamp: datetime
    source: str

    def __post_init__(self):
        if isinstance(self.timestamp, str):
            self.timestamp = datetime.fromisoformat(self.timestamp)


class EventBus:
    """Event bus for decoupled communication between components"""

    def __init__(self):
        self._subscribers: Dict[EventType, List[Callable]] = {}
        self._running = False
        self._event_queue: Optional[asyncio.Queue] = None
        self._processor_task: Optional[asyncio.Task] = None
        self._loop: Optional[asyncio.AbstractEventLoop] = None

        self._start_lock: Optional[asyncio.Lock] = None

    def _get_or_create_lock(self) -> asyncio.Lock:
        """Return the shared start/stop lock, creating it on first call.
        """
        if self._start_lock is None:
            self._start_lock = asyncio.Lock()
        return self._start_lock

    # ------------------------------------------------------------------
    # Subscribe / publish
    # ------------------------------------------------------------------

    def subscribe(self, event_type: EventType, handler: Callable) -> None:
        if event_type not in self._subscribers:
            self._subscribers[event_type] = []
        self._subscribers[event_type].append(handler)
        logger.debug("event_subscribed", event_type=event_type.value, handler=handler.__name__)

    def unsubscribe(self, event_type: EventType, handler: Callable) -> None:
        if event_type in self._subscribers:
            try:
                self._subscribers[event_type].remove(handler)
                logger.debug(
                    "event_unsubscribed",
                    event_type=event_type.value,
                    handler=handler.__name__,
                )
            except ValueError:
                pass

    async def publish(self, event: Event) -> None:
        """Publish an event to the queue.
        """
        if not self._running or not self._event_queue:
            logger.debug("event_bus_not_running_drop", event_type=event.type.value)
            return
        await self._event_queue.put(event)
        logger.debug("event_published", event_type=event.type.value, source=event.source)

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def start(self) -> None:
        """Start the event processor."""
        lock = self._get_or_create_lock()
        async with lock:
            if self._running:
                return

            self._loop = asyncio.get_running_loop()
            self._event_queue = asyncio.Queue()
            self._running = True
            self._processor_task = asyncio.create_task(self._process_events())
            logger.info("event_bus_started")

    async def stop(self) -> None:
        """Stop the event processor and drain remaining events."""
        lock = self._get_or_create_lock()
        async with lock:
            if not self._running:
                return

            self._running = False

            if self._processor_task:
                self._processor_task.cancel()
                try:
                    await self._processor_task
                except asyncio.CancelledError:
                    pass

            if self._event_queue:
                while not self._event_queue.empty():
                    try:
                        event = self._event_queue.get_nowait()
                        await self._handle_event(event)
                    except asyncio.QueueEmpty:
                        break

            self._loop = None
            self._event_queue = None
            logger.info("event_bus_stopped")

    # ------------------------------------------------------------------
    # Internal event processing
    # ------------------------------------------------------------------

    async def _process_events(self) -> None:
        while self._running and self._event_queue:
            try:
                event = await asyncio.wait_for(self._event_queue.get(), timeout=1.0)
                await self._handle_event(event)
            except asyncio.TimeoutError:
                continue
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("event_processor_error", error=str(e))
                await asyncio.sleep(0.1)

    async def _handle_event(self, event: Event) -> None:
        handlers = self._subscribers.get(event.type, [])
        if not handlers:
            logger.debug("no_handlers", event_type=event.type.value)
            return

        tasks = [self._safe_handle(handler, event) for handler in handlers]
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

    async def _safe_handle(self, handler: Callable, event: Event) -> None:
        try:
            if asyncio.iscoroutinefunction(handler):
                await handler(event)
            else:
                await asyncio.to_thread(handler, event)
        except Exception as e:
            logger.error(
                "event_handler_failed",
                event=event.type.value,
                handler=handler.__name__,
                error=str(e),
            )


# Global event bus instance
_event_bus: Optional[EventBus] = None


def get_event_bus() -> EventBus:
    """Get the global event bus instance"""
    global _event_bus
    if _event_bus is None:
        _event_bus = EventBus()
    return _event_bus