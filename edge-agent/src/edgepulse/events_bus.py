"""
Re-export shim for EdgePulse Event Bus

This module re-exports EventBus components from the core module
to maintain backward compatibility while keeping the implementation
in a single location.
"""

# Re-export event bus components
from edgepulse.core.events_bus import EventBus
from edgepulse.core.events_bus import Event
from edgepulse.core.events_bus import EventType
from edgepulse.core.events_bus import get_event_bus

__all__ = ["EventBus", "Event", "EventType", "get_event_bus"]
