import sys

LINUX_AVAILABLE = sys.platform.startswith("linux")

if LINUX_AVAILABLE:
    from edgepulse.platform.linux.linux_service.service import EdgePulseLinuxService
    from edgepulse.platform.linux.linux_service.installer import ServiceInstaller
else:
    EdgePulseLinuxService = None
    ServiceInstaller = None

__all__ = [
    "EdgePulseLinuxService",
    "ServiceInstaller",
    "LINUX_AVAILABLE",
]
