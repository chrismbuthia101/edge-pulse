

import sys

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

if WINDOWS_AVAILABLE:
    try:
        from edgepulse.platform.windows.windows_service.service import EdgePulseWindowsService
        from edgepulse.platform.windows.windows_service.installer import ServiceInstaller
    except ImportError:
        EdgePulseWindowsService = None  # type: ignore
        ServiceInstaller = None  # type: ignore
else:
    EdgePulseWindowsService = None  # type: ignore
    ServiceInstaller = None  # type: ignore

__all__ = [
    'EdgePulseWindowsService',
    'ServiceInstaller',
    'WINDOWS_AVAILABLE'
]
