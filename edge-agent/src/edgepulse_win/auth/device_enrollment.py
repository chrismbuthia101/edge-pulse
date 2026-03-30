"""
Device Enrollment Client for EdgePulse

Handles first-run device enrollment using enrollment tokens.
Implements secure token validation, API key generation, and credential storage.
"""

import os
import sys
import json
import time
import asyncio
import secrets
from pathlib import Path
from typing import Dict, Optional, Tuple
from dataclasses import dataclass

try:
    import keyring
except ImportError:
    keyring = None

from ..sync.supabase_client import SupabaseClient
from ..utils.log_handler import get_logger
from ..utils.device_id import get_hostname, sanitize_hostname, get_device_fingerprint
from ..shared.exceptions import EdgePulseError

logger = get_logger(__name__)


@dataclass
class EnrollmentConfig:
    """Enrollment configuration"""
    enrollment_token: str
    supabase_url: str
    enrollment_endpoint: str = "/functions/v1/enroll-device"
    device_name: Optional[str] = None
    organization: Optional[str] = None


@dataclass
class EnrollmentResult:
    """Result of device enrollment"""
    success: bool
    device_id: str
    api_key: str
    message: str
    error_code: Optional[str] = None


class DeviceEnrollmentClient:
    """Handles device enrollment and credential management"""
    
    def __init__(self, config_path: Optional[str] = None):
        self.config_path = Path(config_path) if config_path else Path(r"C:\ProgramData\EdgePulse\enroll.cfg")
        self.device_id = None
        self.api_key = None
        
        # Keyring configuration
        self.keyring_service = "edgepulse-device"
        self.keyring_device_key = "device_id"
        self.keyring_api_key = "api_key"
        
        logger.info("Device enrollment client initialized")
    
    async def check_enrollment_status(self) -> bool:
        """Check if device is already enrolled"""
        try:
            # Try to load credentials from keyring
            if keyring:
                device_id = keyring.get_password(self.keyring_service, self.keyring_device_key)
                api_key = keyring.get_password(self.keyring_service, self.keyring_api_key)
                
                if device_id and api_key:
                    self.device_id = device_id
                    self.api_key = api_key
                    logger.info("Device already enrolled")
                    return True
            
            # Fallback to file-based storage
            cred_file = Path(r"C:\ProgramData\EdgePulse\credentials.json")
            if cred_file.exists():
                try:
                    with open(cred_file, 'r') as f:
                        creds = json.load(f)
                        self.device_id = creds.get('device_id')
                        self.api_key = creds.get('api_key')
                        
                        if self.device_id and self.api_key:
                            logger.info("Device already enrolled (file-based)")
                            return True
                except Exception as e:
                    logger.warning(f"Failed to read credentials file: {e}")
            
            return False
            
        except Exception as e:
            logger.error(f"Error checking enrollment status: {e}")
            return False
    
    def load_enrollment_config(self) -> Optional[EnrollmentConfig]:
        """Load enrollment configuration from file"""
        try:
            if not self.config_path.exists():
                logger.error(f"Enrollment config file not found: {self.config_path}")
                return None
            
            with open(self.config_path, 'r') as f:
                config_data = json.load(f)
            
            # Validate required fields
            if 'enrollment_token' not in config_data or 'supabase_url' not in config_data:
                logger.error("Missing required fields in enrollment config")
                return None
            
            config = EnrollmentConfig(
                enrollment_token=config_data['enrollment_token'],
                supabase_url=config_data['supabase_url'],
                enrollment_endpoint=config_data.get('enrollment_endpoint', '/functions/v1/enroll-device'),
                device_name=config_data.get('device_name'),
                organization=config_data.get('organization')
            )
            
            logger.info("Enrollment configuration loaded successfully")
            return config
            
        except Exception as e:
            logger.error(f"Failed to load enrollment config: {e}")
            return None
    
    async def enroll_device(self, config: EnrollmentConfig) -> EnrollmentResult:
        """Enroll device using enrollment token"""
        try:
            logger.info("Starting device enrollment process...")
            
            # Generate device information
            device_info = await self._collect_device_info(config)
            
            # Prepare enrollment request
            enrollment_data = {
                'enrollment_token': config.enrollment_token,
                'device_info': device_info
            }
            
            # Call enrollment endpoint
            supabase_client = SupabaseClient(config.supabase_url, None)  # No auth needed for enrollment
            
            response = await supabase_client.post(
                config.enrollment_endpoint,
                enrollment_data
            )
            
            if response.status_code == 200:
                result_data = response.json()
                
                # Extract enrollment results
                device_id = result_data.get('device_id')
                api_key = result_data.get('api_key')
                message = result_data.get('message', 'Enrollment successful')
                
                if device_id and api_key:
                    # Store credentials securely
                    await self._store_credentials(device_id, api_key)
                    
                    # Delete enrollment config file
                    self._cleanup_enrollment_config()
                    
                    logger.info(f"Device enrolled successfully: {device_id}")
                    
                    return EnrollmentResult(
                        success=True,
                        device_id=device_id,
                        api_key=api_key,
                        message=message
                    )
                else:
                    logger.error("Invalid enrollment response: missing device_id or api_key")
                    return EnrollmentResult(
                        success=False,
                        device_id="",
                        api_key="",
                        message="Invalid enrollment response",
                        error_code="INVALID_RESPONSE"
                    )
            else:
                # Handle enrollment errors
                error_data = response.json() if response.content else {}
                error_message = error_data.get('error', 'Enrollment failed')
                error_code = error_data.get('error_code', 'ENROLLMENT_FAILED')
                
                logger.error(f"Enrollment failed: {error_message}")
                
                return EnrollmentResult(
                    success=False,
                    device_id="",
                    api_key="",
                    message=error_message,
                    error_code=error_code
                )
                
        except Exception as e:
            logger.error(f"Enrollment process failed: {e}")
            return EnrollmentResult(
                success=False,
                device_id="",
                api_key="",
                message=f"Enrollment failed: {str(e)}",
                error_code="SYSTEM_ERROR"
            )
    
    async def _collect_device_info(self, config: EnrollmentConfig) -> Dict:
        """Collect device information for enrollment"""
        try:
            import platform
            import uuid
            
            # Get system information using cross-platform utilities
            hostname = get_hostname()
            sanitized_hostname = sanitize_hostname(hostname)
            
            system_info = {
                'hostname': hostname,
                'sanitized_hostname': sanitized_hostname,
                'platform': platform.platform(),
                'system': platform.system(),
                'release': platform.release(),
                'version': platform.version(),
                'machine': platform.machine(),
                'processor': platform.processor(),
                'python_version': platform.python_version()
            }
            
            # Generate unique device fingerprint using cross-platform utility
            device_fingerprint = get_device_fingerprint()
            
            # Get network interfaces
            network_info = await self._get_network_info()
            
            # Get disk information
            disk_info = await self._get_disk_info()
            
            device_info = {
                'device_name': config.device_name or sanitized_hostname,
                'device_fingerprint': device_fingerprint,
                'system_info': system_info,
                'network_info': network_info,
                'disk_info': disk_info,
                'organization': config.organization,
                'enrollment_timestamp': time.time(),
                'agent_version': '2.4.1'  # Should match actual version
            }
            
            return device_info
            
        except Exception as e:
            logger.error(f"Failed to collect device info: {e}")
            return {}
    
    def _generate_device_fingerprint(self) -> str:
        """Generate unique device fingerprint"""
        try:
            import uuid
            import hashlib
            
            # Collect hardware identifiers
            components = []
            
            # MAC address
            try:
                import psutil
                for interface, addrs in psutil.net_if_addrs().items():
                    for addr in addrs:
                        if addr.family.name in ['AF_LINK', 'AF_PACKET']:
                            components.append(addr.address)
                            break
            except:
                pass
            
            # System UUID (Windows)
            try:
                import subprocess
                result = subprocess.run(['wmic', 'csproduct', 'get', 'uuid'], 
                                      capture_output=True, text=True, timeout=10)
                if result.returncode == 0:
                    uuid_line = result.stdout.strip().split('\n')[-1]
                    if uuid_line:
                        components.append(uuid_line)
            except:
                pass
            
            # CPU info
            try:
                import psutil
                components.append(psutil.cpu_freq().current if psutil.cpu_freq() else '')
                components.append(psutil.cpu_count())
            except:
                pass
            
            # Create fingerprint hash
            fingerprint_data = '|'.join(str(comp) for comp in components if comp)
            return hashlib.sha256(fingerprint_data.encode()).hexdigest()[:16]
            
        except Exception as e:
            logger.error(f"Failed to generate device fingerprint: {e}")
            return str(uuid.uuid4())[:16]
    
    async def _get_network_info(self) -> Dict:
        """Collect network interface information"""
        try:
            import psutil
            
            network_info = {}
            
            for interface, addrs in psutil.net_if_addrs().items():
                interface_info = {
                    'addresses': [],
                    'is_up': True
                }
                
                for addr in addrs:
                    addr_info = {
                        'family': addr.family.name,
                        'address': addr.address,
                        'netmask': addr.netmask,
                        'broadcast': addr.broadcast
                    }
                    interface_info['addresses'].append(addr_info)
                
                network_info[interface] = interface_info
            
            return network_info
            
        except Exception as e:
            logger.error(f"Failed to get network info: {e}")
            return {}
    
    async def _get_disk_info(self) -> Dict:
        """Collect disk information"""
        try:
            import psutil
            
            disk_info = {}
            
            for partition in psutil.disk_partitions():
                try:
                    usage = psutil.disk_usage(partition.mountpoint)
                    disk_info[partition.device] = {
                        'mountpoint': partition.mountpoint,
                        'fstype': partition.fstype,
                        'total': usage.total,
                        'used': usage.used,
                        'free': usage.free,
                        'percent_used': (usage.used / usage.total) * 100
                    }
                except:
                    # Skip inaccessible drives
                    continue
            
            return disk_info
            
        except Exception as e:
            logger.error(f"Failed to get disk info: {e}")
            return {}
    
    async def _store_credentials(self, device_id: str, api_key: str):
        """Store device credentials securely"""
        try:
            self.device_id = device_id
            self.api_key = api_key
            
            # Try keyring first
            if keyring:
                try:
                    keyring.set_password(self.keyring_service, self.keyring_device_key, device_id)
                    keyring.set_password(self.keyring_service, self.keyring_api_key, api_key)
                    logger.info("Credentials stored in keyring")
                    return
                except Exception as e:
                    logger.warning(f"Failed to store in keyring: {e}")
            
            # Fallback to encrypted file storage
            cred_file = Path(r"C:\ProgramData\EdgePulse\credentials.json")
            cred_file.parent.mkdir(parents=True, exist_ok=True)
            
            credentials = {
                'device_id': device_id,
                'api_key': api_key,
                'stored_at': time.time()
            }
            
            with open(cred_file, 'w') as f:
                json.dump(credentials, f, indent=2)
            
            # Set file permissions (Windows-specific)
            try:
                import os
                os.chmod(cred_file, 0o600)  # Read/write for owner only
            except:
                pass
            
            logger.info("Credentials stored in encrypted file")
            
        except Exception as e:
            logger.error(f"Failed to store credentials: {e}")
            raise EdgePulseError(f"Credential storage failed: {e}")
    
    def _cleanup_enrollment_config(self):
        """Delete enrollment configuration file after successful enrollment"""
        try:
            if self.config_path.exists():
                self.config_path.unlink()
                logger.info("Enrollment configuration file deleted")
        except Exception as e:
            logger.warning(f"Failed to delete enrollment config: {e}")
    
    def get_credentials(self) -> Tuple[Optional[str], Optional[str]]:
        """Get stored device credentials"""
        return self.device_id, self.api_key
    
    async def rotate_api_key(self, supabase_url: str) -> bool:
        """Rotate API key for enrolled device"""
        try:
            if not self.device_id or not self.api_key:
                logger.error("Device not enrolled, cannot rotate API key")
                return False
            
            # Call rotation endpoint
            supabase_client = SupabaseClient(supabase_url, self.api_key)
            
            headers = {
                'X-EdgePulse-Device-Id': self.device_id,
                'X-EdgePulse-Api-Key': self.api_key
            }
            
            response = await supabase_client.post(
                "/functions/v1/rotate-api-key",
                {},
                headers=headers
            )
            
            if response.status_code == 200:
                result_data = response.json()
                new_api_key = result_data.get('api_key')
                
                if new_api_key:
                    # Store new API key
                    await self._store_credentials(self.device_id, new_api_key)
                    logger.info("API key rotated successfully")
                    return True
                else:
                    logger.error("Invalid rotation response: missing new API key")
                    return False
            else:
                error_data = response.json() if response.content else {}
                error_message = error_data.get('error', 'API key rotation failed')
                logger.error(f"API key rotation failed: {error_message}")
                return False
                
        except Exception as e:
            logger.error(f"API key rotation failed: {e}")
            return False


# Factory function
def create_enrollment_client(config_path: Optional[str] = None) -> DeviceEnrollmentClient:
    """Create device enrollment client"""
    return DeviceEnrollmentClient(config_path)
