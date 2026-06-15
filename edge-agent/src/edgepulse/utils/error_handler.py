from edgepulse.utils.log_handler import get_logger, EdgePulseError, ConfigurationError, LoggingError

logger = get_logger(__name__)

class ModelError(EdgePulseError):
    pass

class DetectionError(EdgePulseError):
    pass

class SyncError(EdgePulseError):
    pass

class PrivacyError(EdgePulseError):
    pass

class ValidationError(EdgePulseError):
    pass

class StorageError(EdgePulseError):
    pass

class NetworkError(EdgePulseError):
    pass

class AuthenticationError(EdgePulseError):
    pass

class PermissionError(EdgePulseError):
    pass

class TimeoutError(EdgePulseError):
    pass

class ResourceError(EdgePulseError):
    pass

def log_sync_operation(
    operation: str,
    item_type: str,
    item_count: int,
    device_id: str | None = None,
    status: str = 'success',
    error_details: str | None = None,
    **kwargs
) -> None:
    log_context = {
        'operation': operation,
        'event_type': f"sync.{operation}",
        'component': 'sync',
        'item_type': item_type,
        'item_count': item_count,
        'status': status,
    }

    if device_id:
        log_context['device_id'] = device_id

    if error_details:
        log_context['error_details'] = error_details

    log_context.update(kwargs)

    if status == 'success':
        logger.info("sync_operation_completed", **log_context)
    else:
        logger.error("sync_operation_failed", **log_context)
