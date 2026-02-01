# Custom exceptions for EdgePulse Agent.

from typing import Optional


class EdgePulseError(Exception):
    """Base exception for all EdgePulse errors."""

    def __init__(self, message: str, details: Optional[dict] = None) -> None:
        super().__init__(message)
        self.message = message
        self.details = details or {}

    def __str__(self) -> str:
        if self.details:
            return f"{self.message} (Details: {self.details})"
        return self.message


class ConfigurationError(EdgePulseError):
    """Raised when configuration is invalid or missing."""
    pass


class ModelError(EdgePulseError):
    """Raised when model operations fail."""
    pass


class DetectionError(EdgePulseError):
    """Raised when detection operations fail."""
    pass


class LoggingError(EdgePulseError):
    """Raised when logging operations fail."""
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
