import sys
from typing import Optional, Type

LINUX_AVAILABLE = sys.platform.startswith("linux")

EdgePulseLinuxService: Optional[Type[object]] = None
ServiceInstaller: Optional[Type[object]] = None

if LINUX_AVAILABLE:
    from edgepulse.platform.linux.linux_service.service import (
        EdgePulseLinuxService as _EdgePulseLinuxService,
    )
    from edgepulse.platform.linux.linux_service.installer import (
        ServiceInstaller as _ServiceInstaller,
    )

    EdgePulseLinuxService = _EdgePulseLinuxService
    ServiceInstaller = _ServiceInstaller

__all__ = [
    "EdgePulseLinuxService",
    "ServiceInstaller",
    "LINUX_AVAILABLE",
]
