"""Utility modules."""

from edgepulse_win.utils.path_manager import PathManager
from edgepulse_win.utils.error_handler import (
    EdgePulseError,
    ConfigurationError,
    ModelError,
    DetectionError,
    LoggingError,
    SyncError,
    PrivacyError,
    ValidationError,
    StorageError,
    NetworkError,
    AuthenticationError,
    PermissionError,
    TimeoutError,
    ResourceError,
)

__all__ = [
    "PathManager",
    "EdgePulseError",
    "ConfigurationError",
    "ModelError",
    "DetectionError",
    "LoggingError",
    "SyncError",
    "PrivacyError",
    "ValidationError",
    "StorageError",
    "NetworkError",
    "AuthenticationError",
    "PermissionError",
    "TimeoutError",
    "ResourceError",
]
