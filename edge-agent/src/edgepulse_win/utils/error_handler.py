# Standardized error handling and logging utilities for EdgePulse.

import asyncio
import traceback
from datetime import datetime
from typing import Dict, Any, Optional, Union
from functools import wraps

from edgepulse_win.utils.log_handler import get_logger, EdgePulseError, ConfigurationError, LoggingError

logger = get_logger(__name__)

class ModelError(EdgePulseError):
    """Raised when model operations fail."""
    pass


class DetectionError(EdgePulseError):
    """Raised when detection operations fail."""
    pass


class SyncError(EdgePulseError):
    """Raised when sync operations fail."""
    pass


class PrivacyError(EdgePulseError):
    """Raised when privacy operations fail."""
    pass


class ValidationError(EdgePulseError):
    """Raised when validation fails."""
    pass


class StorageError(EdgePulseError):
    """Raised when storage operations fail."""
    pass


class NetworkError(EdgePulseError):
    """Raised when network operations fail."""
    pass


class AuthenticationError(EdgePulseError):
    """Raised when authentication fails."""
    pass


class PermissionError(EdgePulseError):
    """Raised when permission is denied."""
    pass


class TimeoutError(EdgePulseError):
    """Raised when operations timeout."""
    pass


class ResourceError(EdgePulseError):
    """Raised when resources are unavailable or exhausted."""
    pass

# Standard logging field names
LOG_FIELDS = {
    'device_id': 'device_id',
    'timestamp': 'timestamp', 
    'event_type': 'event_type',
    'severity': 'severity',
    'anomaly_score': 'anomaly_score',
    'component': 'component',
    'operation': 'operation',
    'duration_ms': 'duration_ms',
    'error_code': 'error_code',
    'error_details': 'error_details',
    'retry_count': 'retry_count',
    'queue_size': 'queue_size',
    'status': 'status'
}

# Standard severity levels
SEVERITY_LEVELS = {
    'low': 1,
    'medium': 2, 
    'high': 3,
    'critical': 4
}

def log_operation(
    operation: str,
    component: str,
    device_id: Optional[str] = None,
    include_duration: bool = True,
    log_errors: bool = True
):
    """Decorator for standardized operation logging"""
    def decorator(func):
        @wraps(func)
        async def async_wrapper(*args, **kwargs):
            start_time = datetime.utcnow()
            log_context = {
                LOG_FIELDS['operation']: operation,
                LOG_FIELDS['component']: component,
                LOG_FIELDS['event_type']: f"{component}.{operation}"
            }
            
            # Handle device_id - it could be a callable (like lambda self: self.device_id)
            device_id_value = device_id
            if callable(device_id):
                # For methods, the first arg should be self
                if args:
                    device_id_value = device_id(args[0])
                else:
                    device_id_value = device_id()
            
            if device_id_value:
                log_context[LOG_FIELDS['device_id']] = device_id_value
                
            try:
                logger.info(f"{operation}_started", **log_context)
                
                if asyncio.iscoroutinefunction(func):
                    result = await func(*args, **kwargs)
                else:
                    result = func(*args, **kwargs)
                
                if include_duration:
                    duration_ms = (datetime.utcnow() - start_time).total_seconds() * 1000
                    log_context[LOG_FIELDS['duration_ms']] = duration_ms
                
                log_context[LOG_FIELDS['status']] = 'success'
                logger.info(f"{operation}_completed", **log_context)
                
                return result
                
            except EdgePulseError as e:
                if include_duration:
                    duration_ms = (datetime.utcnow() - start_time).total_seconds() * 1000
                    log_context[LOG_FIELDS['duration_ms']] = duration_ms
                
                log_context.update({
                    LOG_FIELDS['status']: 'error',
                    LOG_FIELDS['error_code']: e.__class__.__name__,
                    LOG_FIELDS['error_details']: str(e)
                })
                
                if log_errors:
                    logger.error(f"{operation}_failed", **log_context)
                
                raise
                
            except Exception as e:
                if include_duration:
                    duration_ms = (datetime.utcnow() - start_time).total_seconds() * 1000
                    log_context[LOG_FIELDS['duration_ms']] = duration_ms
                
                log_context.update({
                    LOG_FIELDS['status']: 'error', 
                    LOG_FIELDS['error_code']: 'UnexpectedError',
                    LOG_FIELDS['error_details']: str(e),
                    LOG_FIELDS['error_details']: traceback.format_exc()
                })
                
                if log_errors:
                    logger.error(f"{operation}_failed", **log_context)
                
                raise EdgePulseError(
                    f"Unexpected error in {operation}",
                    details={'original_error': str(e), 'traceback': traceback.format_exc()}
                )
                
        @wraps(func)
        def sync_wrapper(*args, **kwargs):
            return asyncio.run(async_wrapper(*args, **kwargs))
            
        return async_wrapper if asyncio.iscoroutinefunction(func) else sync_wrapper
    return decorator

def log_error(
    error: Union[Exception, str],
    component: str,
    operation: str,
    device_id: Optional[str] = None,
    severity: str = 'medium',
    **kwargs
) -> None:
    """Standardized error logging"""
    log_context = {
        LOG_FIELDS['component']: component,
        LOG_FIELDS['operation']: operation,
        LOG_FIELDS['severity']: severity,
        LOG_FIELDS['event_type']: f"{component}.{operation}.error"
    }
    
    if device_id:
        log_context[LOG_FIELDS['device_id']] = device_id
    
    if isinstance(error, Exception):
        log_context.update({
            LOG_FIELDS['error_code']: error.__class__.__name__,
            LOG_FIELDS['error_details']: str(error)
        })
        
        if isinstance(error, EdgePulseError) and error.details:
            log_context[LOG_FIELDS['error_details']] = error.details
    else:
        log_context[LOG_FIELDS['error_details']] = error
    
    log_context.update(kwargs)
    
    logger.error(f"{operation}_error", **log_context)

def log_metric(
    metric_name: str,
    value: Union[int, float],
    component: str,
    device_id: Optional[str] = None,
    unit: Optional[str] = None,
    **kwargs
) -> None:
    """Standardized metric logging"""
    log_context = {
        LOG_FIELDS['component']: component,
        LOG_FIELDS['event_type']: f"{component}.metric",
        'metric_name': metric_name,
        'metric_value': value
    }
    
    if device_id:
        log_context[LOG_FIELDS['device_id']] = device_id
    
    if unit:
        log_context['metric_unit'] = unit
    
    log_context.update(kwargs)
    
    logger.info("metric_recorded", **log_context)

def log_alert(
    alert_type: str,
    severity: str,
    anomaly_score: Optional[float] = None,
    device_id: Optional[str] = None,
    explanation: Optional[Dict[str, Any]] = None,
    **kwargs
) -> None:
    """Standardized alert logging"""
    log_context = {
        LOG_FIELDS['event_type']: f"alert.{alert_type}",
        LOG_FIELDS['severity']: severity,
        'alert_type': alert_type
    }
    
    if device_id:
        log_context[LOG_FIELDS['device_id']] = device_id
    
    if anomaly_score is not None:
        log_context[LOG_FIELDS['anomaly_score']] = anomaly_score
    
    if explanation:
        log_context['explanation'] = explanation
    
    log_context.update(kwargs)
    
    logger.warning("alert_generated", **log_context)

def log_sync_operation(
    operation: str,
    item_type: str,
    item_count: int,
    device_id: Optional[str] = None,
    status: str = 'success',
    error_details: Optional[str] = None,
    **kwargs
) -> None:
    """Standardized sync operation logging"""
    log_context = {
        LOG_FIELDS['operation']: operation,
        LOG_FIELDS['event_type']: f"sync.{operation}",
        LOG_FIELDS['component']: 'sync',
        'item_type': item_type,
        'item_count': item_count,
        LOG_FIELDS['status']: status
    }
    
    if device_id:
        log_context[LOG_FIELDS['device_id']] = device_id
    
    if error_details:
        log_context[LOG_FIELDS['error_details']] = error_details
    
    log_context.update(kwargs)
    
    if status == 'success':
        logger.info("sync_operation_completed", **log_context)
    else:
        logger.error("sync_operation_failed", **log_context)

def validate_severity(severity: str) -> str:
    """Validate and normalize severity level"""
    severity = severity.lower()
    if severity not in SEVERITY_LEVELS:
        logger.warning("invalid_severity", severity=severity, valid_levels=list(SEVERITY_LEVELS.keys()))
        return 'medium'  # Default to medium
    return severity

def create_error_context(
    component: str,
    operation: str,
    device_id: Optional[str] = None,
    **kwargs
) -> Dict[str, Any]:
    """Create standardized error context"""
    context = {
        LOG_FIELDS['component']: component,
        LOG_FIELDS['operation']: operation,
        LOG_FIELDS['timestamp']: datetime.utcnow().isoformat()
    }
    
    if device_id:
        context[LOG_FIELDS['device_id']] = device_id
    
    context.update(kwargs)
    return context

class RetryHandler:
    """Standardized retry logic with consistent logging"""
    
    def __init__(
        self,
        max_attempts: int = 3,
        base_delay: float = 1.0,
        max_delay: float = 60.0,
        backoff_factor: float = 2.0
    ):
        self.max_attempts = max_attempts
        self.base_delay = base_delay
        self.max_delay = max_delay
        self.backoff_factor = backoff_factor
    
    async def retry_with_backoff(
        self,
        func,
        component: str,
        operation: str,
        device_id: Optional[str] = None,
        **kwargs
    ):
        """Execute function with exponential backoff retry"""
        for attempt in range(self.max_attempts):
            try:
                if asyncio.iscoroutinefunction(func):
                    return await func(**kwargs)
                else:
                    return func(**kwargs)
                    
            except Exception as e:
                if attempt == self.max_attempts - 1:
                    log_error(
                        e, component, f"{operation}_retry_failed",
                        device_id=device_id,
                        retry_count=attempt + 1,
                        max_attempts=self.max_attempts
                    )
                    raise
                
                delay = min(self.base_delay * (self.backoff_factor ** attempt), self.max_delay)
                
                log_error(
                    e, component, f"{operation}_retry",
                    device_id=device_id,
                    retry_count=attempt + 1,
                    max_attempts=self.max_attempts,
                    next_retry_delay=delay
                )
                
                await asyncio.sleep(delay)
