import platform
import re
import socket
from typing import Optional, Tuple


def get_hostname() -> str:
    try:
        hostname = platform.node()
        if hostname and hostname != 'localhost':
            return hostname
    except Exception:
        pass

    try:
        hostname = socket.gethostname()
        if hostname and hostname != 'localhost':
            return hostname
    except Exception:
        pass

    raise RuntimeError("Unable to determine system hostname")


def sanitize_hostname(hostname: str) -> str:
    if not hostname:
        return "unknown-device"

    hostname = hostname.lower().strip()
    hostname = re.sub(r'[^a-z0-9_-]', '', hostname)
    hostname = hostname.strip('-_')

    if not hostname:
        return "unknown-device"

    if len(hostname) > 63:
        hostname = hostname[:63]

    return hostname


def generate_device_id_from_hostname(hostname: Optional[str] = None,
                                     include_platform: bool = True) -> str:
    if hostname is None:
        hostname = get_hostname()

    device_id = sanitize_hostname(hostname)

    if include_platform:
        try:
            system = platform.system().lower()
            if system:
                device_id = f"{device_id}-{system}"
        except Exception:
            pass

    return device_id


def validate_device_id(device_id: str) -> Tuple[bool, Optional[str]]:
    if not device_id:
        return False, "Device ID cannot be empty"

    if len(device_id) < 3:
        return False, "Device ID must be at least 3 characters long"

    if len(device_id) > 253:
        return False, "Device ID cannot exceed 253 characters"

    if re.search(r'[^a-zA-Z0-9_-]', device_id):
        return False, "Device ID can only contain letters, numbers, hyphens, and underscores"

    if device_id.startswith('-') or device_id.startswith('_'):
        return False, "Device ID cannot start with hyphen or underscore"

    if device_id.endswith('-') or device_id.endswith('_'):
        return False, "Device ID cannot end with hyphen or underscore"

    return True, None


def get_default_device_id() -> str:
    return generate_device_id_from_hostname()
