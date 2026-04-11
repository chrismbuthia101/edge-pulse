"""
Shared exceptions for EdgePulse

This module re-exports common exception classes to provide a centralized
location for exception imports across the codebase.
"""

from edgepulse.utils.log_handler import EdgePulseError

__all__ = ["EdgePulseError"]
