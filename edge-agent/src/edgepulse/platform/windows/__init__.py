import sys

WINDOWS_AVAILABLE = sys.platform == "win32"

if WINDOWS_AVAILABLE:
    try:
        import win32service  # noqa: F401
        import win32serviceutil  # noqa: F401
        import win32event  # noqa: F401
        import servicemanager  # noqa: F401
    except ImportError:
        WINDOWS_AVAILABLE = False

if WINDOWS_AVAILABLE:
    try:
        from edgepulse.platform.windows.windows_service.service import EdgePulseWindowsService
        from edgepulse.platform.windows.windows_service.installer import ServiceInstaller
    except ImportError:
        EdgePulseWindowsService = None
        ServiceInstaller = None
else:
    EdgePulseWindowsService = None
    ServiceInstaller = None

__all__ = [
    "EdgePulseWindowsService",
    "ServiceInstaller",
    "WINDOWS_AVAILABLE",
]
