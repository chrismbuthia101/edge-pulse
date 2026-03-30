"""
Cross-platform device ID utilities for EdgePulse.

Provides utilities to generate consistent device identifiers across different operating systems
using hostname as the primary identifier with fallback mechanisms.
"""

import platform
import re
import hashlib
import socket
from typing import Optional, Tuple

def get_hostname() -> str:
    """
    Get the system hostname in a cross-platform manner.
    
    Returns:
        str: The system hostname
        
    Raises:
        RuntimeError: If hostname cannot be determined
    """
    try:
        # Try multiple methods to get hostname
        hostname = None
        
        # Method 1: platform.node() (most reliable)
        try:
            hostname = platform.node()
            if hostname and hostname != 'localhost':
                return hostname
        except Exception:
            pass
        
        # Method 2: socket.gethostname()
        try:
            hostname = socket.gethostname()
            if hostname and hostname != 'localhost':
                return hostname
        except Exception:
            pass
        
        # Method 3: socket.getfqdn() (fully qualified domain name)
        try:
            hostname = socket.getfqdn()
            if hostname and hostname != 'localhost':
                # Extract just the hostname part from FQDN
                hostname = hostname.split('.')[0]
                if hostname:
                    return hostname
        except Exception:
            pass
        
        # Method 4: Environment variables
        import os
        for env_var in ['HOSTNAME', 'COMPUTERNAME', 'HOST']:
            try:
                hostname = os.environ.get(env_var)
                if hostname and hostname != 'localhost':
                    return hostname
            except Exception:
                pass
        
        raise RuntimeError("Unable to determine system hostname")
        
    except Exception as e:
        raise RuntimeError(f"Failed to get hostname: {e}")


def sanitize_hostname(hostname: str) -> str:
    """
    Sanitize hostname for use as device ID.
    
    Args:
        hostname: Raw hostname string
        
    Returns:
        str: Sanitized hostname safe for use as device ID
    """
    if not hostname:
        return "unknown-device"
    
    # Convert to lowercase
    hostname = hostname.lower().strip()
    
    # Remove invalid characters (keep alphanumeric, hyphens, underscores)
    hostname = re.sub(r'[^a-z0-9_-]', '', hostname)
    
    # Remove leading/trailing hyphens and underscores
    hostname = hostname.strip('-_')
    
    # Ensure it's not empty after sanitization
    if not hostname:
        return "unknown-device"
    
    # Limit length to 63 characters (DNS label limit)
    if len(hostname) > 63:
        hostname = hostname[:63]
    
    return hostname


def generate_device_id_from_hostname(hostname: Optional[str] = None, 
                                   include_platform: bool = True,
                                   hash_suffix: bool = False) -> str:
    """
    Generate a device ID from hostname with optional platform information.
    
    Args:
        hostname: Optional hostname to use. If None, will be detected automatically
        include_platform: Whether to include platform information in the ID
        hash_suffix: Whether to add a hash suffix for uniqueness
        
    Returns:
        str: Generated device ID
    """
    try:
        # Get hostname if not provided
        if hostname is None:
            hostname = get_hostname()
        
        # Sanitize hostname
        device_id = sanitize_hostname(hostname)
        
        # Add platform information if requested
        if include_platform:
            try:
                system = platform.system().lower()
                if system:
                    device_id = f"{device_id}-{system}"
            except Exception:
                pass
        
        # Add hash suffix if requested
        if hash_suffix:
            try:
                # Create a unique hash from system information
                system_info = f"{platform.node()}-{platform.system()}-{platform.machine()}"
                hash_obj = hashlib.sha256(system_info.encode('utf-8'))
                hash_suffix = hash_obj.hexdigest()[:8]
                device_id = f"{device_id}-{hash_suffix}"
            except Exception:
                pass
        
        return device_id
        
    except Exception as e:
        # Fallback to a generic device ID
        import uuid
        fallback_id = f"device-{uuid.uuid4().hex[:12]}"
        return fallback_id


def get_device_fingerprint() -> str:
    """
    Generate a unique device fingerprint for additional identification.
    
    This combines multiple system attributes to create a stable identifier
    that can be used for device recognition even if hostname changes.
    
    Returns:
        str: Device fingerprint hash
    """
    try:
        import uuid
        
        # Collect system information
        components = []
        
        # Hostname
        try:
            components.append(get_hostname())
        except Exception:
            components.append("unknown")
        
        # Platform information
        try:
            components.append(platform.platform())
        except Exception:
            pass
        
        # Machine architecture
        try:
            components.append(platform.machine())
        except Exception:
            pass
        
        # Processor information
        try:
            components.append(platform.processor())
        except Exception:
            pass
        
        # Python version
        try:
            components.append(platform.python_version())
        except Exception:
            pass
        
        # MAC address (first available)
        try:
            import psutil
            for interface, addrs in psutil.net_if_addrs().items():
                for addr in addrs:
                    if hasattr(addr, 'family') and addr.family.name in ['AF_LINK', 'AF_PACKET']:
                        components.append(addr.address)
                        break
                if len(components) > 5:  # Found MAC address
                    break
        except Exception:
            pass
        
        # Create fingerprint
        fingerprint_data = '|'.join(str(comp) for comp in components if comp)
        fingerprint = hashlib.sha256(fingerprint_data.encode('utf-8')).hexdigest()[:16]
        
        return fingerprint
        
    except Exception:
        # Fallback to random UUID
        import uuid
        return str(uuid.uuid4()).replace('-', '')[:16]


def validate_device_id(device_id: str) -> Tuple[bool, Optional[str]]:
    """
    Validate a device ID format.
    
    Args:
        device_id: Device ID to validate
        
    Returns:
        Tuple[bool, Optional[str]]: (is_valid, error_message)
    """
    if not device_id:
        return False, "Device ID cannot be empty"
    
    if len(device_id) < 3:
        return False, "Device ID must be at least 3 characters long"
    
    if len(device_id) > 253:  # Full DNS name limit
        return False, "Device ID cannot exceed 253 characters"
    
    # Check for invalid characters
    if re.search(r'[^a-zA-Z0-9_-]', device_id):
        return False, "Device ID can only contain letters, numbers, hyphens, and underscores"
    
    # Check for invalid patterns
    if device_id.startswith('-') or device_id.startswith('_'):
        return False, "Device ID cannot start with hyphen or underscore"
    
    if device_id.endswith('-') or device_id.endswith('_'):
        return False, "Device ID cannot end with hyphen or underscore"
    
    return True, None


def get_cross_platform_device_info() -> dict:
    """
    Get comprehensive cross-platform device information.
    
    Returns:
        dict: Device information including hostname, platform, and fingerprint
    """
    try:
        info = {
            'hostname': None,
            'sanitized_hostname': None,
            'device_id': None,
            'platform': None,
            'system': None,
            'release': None,
            'version': None,
            'machine': None,
            'processor': None,
            'fingerprint': None,
            'python_version': None
        }
        
        # Get hostname
        try:
            hostname = get_hostname()
            info['hostname'] = hostname
            info['sanitized_hostname'] = sanitize_hostname(hostname)
        except Exception as e:
            info['hostname_error'] = str(e)
        
        # Get platform information
        try:
            info['platform'] = platform.platform()
            info['system'] = platform.system()
            info['release'] = platform.release()
            info['version'] = platform.version()
            info['machine'] = platform.machine()
            info['processor'] = platform.processor()
            info['python_version'] = platform.python_version()
        except Exception as e:
            info['platform_error'] = str(e)
        
        # Generate device ID
        try:
            info['device_id'] = generate_device_id_from_hostname()
        except Exception as e:
            info['device_id_error'] = str(e)
        
        # Generate fingerprint
        try:
            info['fingerprint'] = get_device_fingerprint()
        except Exception as e:
            info['fingerprint_error'] = str(e)
        
        return info
        
    except Exception as e:
        return {'error': str(e)}


# Convenience functions for common use cases
def get_default_device_id() -> str:
    """Get a default device ID using hostname with platform suffix."""
    return generate_device_id_from_hostname()


def get_simple_device_id() -> str:
    """Get a simple device ID using only hostname."""
    return generate_device_id_from_hostname(include_platform=False, hash_suffix=False)


def get_unique_device_id() -> str:
    """Get a unique device ID using hostname with hash suffix."""
    return generate_device_id_from_hostname(include_platform=True, hash_suffix=True)


if __name__ == "__main__":
    # Test the functions
    print("=== Device ID Utility Test ===")
    
    try:
        print(f"Hostname: {get_hostname()}")
        print(f"Sanitized: {sanitize_hostname(get_hostname())}")
        print(f"Default Device ID: {get_default_device_id()}")
        print(f"Simple Device ID: {get_simple_device_id()}")
        print(f"Unique Device ID: {get_unique_device_id()}")
        print(f"Fingerprint: {get_device_fingerprint()}")
        
        print("\n=== Device Info ===")
        device_info = get_cross_platform_device_info()
        for key, value in device_info.items():
            print(f"{key}: {value}")
            
    except Exception as e:
        print(f"Error: {e}")
