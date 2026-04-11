"""
EdgePulse Linux Platform Module

Provides Linux-specific service management (systemd), credential storage,
and daemon process control.
"""

import sys

LINUX_AVAILABLE = sys.platform.startswith("linux")

from edgepulse.platform.linux.linux_service.service import EdgePulseLinuxService
from edgepulse.platform.linux.linux_service.installer import ServiceInstaller

__all__ = [
    "EdgePulseLinuxService",
    "ServiceInstaller",
    "LINUX_AVAILABLE",
]