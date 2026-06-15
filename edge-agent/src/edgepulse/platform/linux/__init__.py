

import sys

LINUX_AVAILABLE = sys.platform.startswith("linux")

if LINUX_AVAILABLE:
    try:
        from edgepulse.platform.linux.linux_service.service import EdgePulseLinuxService
        from edgepulse.platform.linux.linux_service.installer import ServiceInstaller
    except ImportError:
        EdgePulseLinuxService = None  # type: ignore
        ServiceInstaller = None  # type: ignore
else:
    EdgePulseLinuxService = None  # type: ignore
    ServiceInstaller = None  # type: ignore

__all__ = [
    "EdgePulseLinuxService",
    "ServiceInstaller",
    "LINUX_AVAILABLE",
]