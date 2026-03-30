"""
Windows Service implementation for EdgePulse Agent

This module provides Windows Service functionality using pywin32,
allowing the EdgePulse agent to run as a proper Windows Service
under LocalSystem account with auto-start capability.
"""

import sys

# Add conditional import for Windows-specific modules
if sys.platform == "win32":
    try:
        import win32service
        import win32serviceutil
        import win32event
        import servicemanager
        import win32api
        import win32con
        import winerror
        WINDOWS_AVAILABLE = True
    except ImportError:
        WINDOWS_AVAILABLE = False
        print("Warning: pywin32 not available. Windows Service functionality disabled.")
else:
    WINDOWS_AVAILABLE = False

from edgepulse_win.windows_service.service import EdgePulseWindowsService
from edgepulse_win.windows_service.installer import ServiceInstaller

__all__ = [
    'EdgePulseWindowsService',
    'ServiceInstaller',
    'WINDOWS_AVAILABLE'
]
