import sys
from typing import Optional, Type

WINDOWS_AVAILABLE = sys.platform == "win32"

if WINDOWS_AVAILABLE:
    try:
        import win32service  # noqa: F401
        import win32serviceutil  # noqa: F401
        import win32event  # noqa: F401
        import servicemanager  # noqa: F401
    except ImportError:
        WINDOWS_AVAILABLE = False

EdgePulseWindowsService: Optional[Type[object]] = None
ServiceInstaller: Optional[Type[object]] = None

if WINDOWS_AVAILABLE:
    try:
        from edgepulse.platform.windows.windows_service.service import (
            EdgePulseWindowsService as _EdgePulseWindowsService,
        )
        from edgepulse.platform.windows.windows_service.installer import (
            ServiceInstaller as _ServiceInstaller,
        )

        EdgePulseWindowsService = _EdgePulseWindowsService
        ServiceInstaller = _ServiceInstaller
    except ImportError:
        pass

__all__ = [
    "EdgePulseWindowsService",
    "ServiceInstaller",
    "WINDOWS_AVAILABLE",
]
