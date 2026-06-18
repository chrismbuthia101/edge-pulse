from dataclasses import dataclass
from typing import Any, Callable, Dict, Optional

from fastapi import Request

from edgepulse.storage.database import Database
from edgepulse.sync.sync_queue import SyncQueue


@dataclass
class APIDependencies:
    database: Database
    sync_queue: Optional[SyncQueue] = None
    detector_health_provider: Optional[Callable[[], Dict[str, Any]]] = None
    sync_dead_letter_provider: Optional[Callable[[], Any]] = None


def get_deps(request: Request) -> APIDependencies:
    return request.app.state.deps  # type: ignore[union-attr]


def get_db(request: Request) -> Database:
    return get_deps(request).database


def get_sync_status(request: Request) -> Dict[str, Any]:
    deps = get_deps(request)
    if deps.sync_queue is not None:
        return deps.sync_queue.get_stats()
    return {
        "online": None,
        "queue_depth": 0,
        "total_enqueued": 0,
        "total_processed": 0,
        "total_failed": 0,
        "total_retries": 0,
        "unsynced_alerts": 0,
    }


def get_detector_health(request: Request) -> Dict[str, Any]:
    deps = get_deps(request)
    provider = deps.detector_health_provider
    if provider is not None:
        try:
            return provider()
        except Exception:
            from edgepulse.utils.log_handler import get_logger

            get_logger(__name__).warning("detector_health_provider_error")
    return {
        "status": "unknown",
        "detail": "No detector health provider registered",
        "action_required": "Model not found — ensure the package is properly installed.",
    }
