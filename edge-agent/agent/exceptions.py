"""
Custom exceptions for EdgePulse Agent.
"""


class EdgePulseError(Exception):
    """Base exception for all EdgePulse errors."""

    pass


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
