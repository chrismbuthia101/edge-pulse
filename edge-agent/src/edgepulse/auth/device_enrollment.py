"""
Device Enrollment Client for EdgePulse

Handles first-run device enrollment using enrollment tokens.
Implements secure token validation, API key generation, and credential storage.
"""

import json
import time
import asyncio
from pathlib import Path
from typing import Dict, Optional, Tuple
from dataclasses import dataclass

try:
    import keyring
except ImportError:
    keyring = None

try:
    import httpx
    HTTPX_AVAILABLE = True
except ImportError:
    HTTPX_AVAILABLE = False

from edgepulse.utils.log_handler import get_logger
from edgepulse.utils.device_id import get_hostname, sanitize_hostname, get_device_fingerprint
from edgepulse.shared.exceptions import EdgePulseError

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
        self.config_path = (
            Path(config_path) if config_path
            else Path(r"C:\ProgramData\EdgePulse\enroll.cfg")
        )
        self.device_id: Optional[str] = None
        self.api_key: Optional[str] = None

        self.keyring_service = "edgepulse-device"
        self.keyring_device_key = "device_id"
        self.keyring_api_key = "api_key"

        logger.info("Device enrollment client initialized")

    async def check_enrollment_status(self) -> bool:
        """Check if device is already enrolled"""
        try:
            if keyring:
                device_id = keyring.get_password(
                    self.keyring_service, self.keyring_device_key
                )
                api_key = keyring.get_password(
                    self.keyring_service, self.keyring_api_key
                )

                if device_id and api_key:
                    self.device_id = device_id
                    self.api_key = api_key
                    logger.info("Device already enrolled")
                    return True

            cred_file = Path(r"C:\ProgramData\EdgePulse\credentials.json")
            if cred_file.exists():
                try:
                    with open(cred_file, "r") as f:
                        creds = json.load(f)
                        self.device_id = creds.get("device_id")
                        self.api_key = creds.get("api_key")

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

            with open(self.config_path, "r") as f:
                config_data = json.load(f)

            if "enrollment_token" not in config_data or "supabase_url" not in config_data:
                logger.error("Missing required fields in enrollment config")
                return None

            return EnrollmentConfig(
                enrollment_token=config_data["enrollment_token"],
                supabase_url=config_data["supabase_url"],
                enrollment_endpoint=config_data.get(
                    "enrollment_endpoint", "/functions/v1/enroll-device"
                ),
                device_name=config_data.get("device_name"),
                organization=config_data.get("organization"),
            )

        except Exception as e:
            logger.error(f"Failed to load enrollment config: {e}")
            return None

    async def enroll_device(self, config: EnrollmentConfig) -> EnrollmentResult:
        """Enroll device using enrollment token"""
        if not HTTPX_AVAILABLE:
            return EnrollmentResult(
                success=False,
                device_id="",
                api_key="",
                message="httpx is required for enrollment",
                error_code="MISSING_DEPENDENCY",
            )

        try:
            logger.info("Starting device enrollment process...")

            device_info = await self._collect_device_info(config)

            enrollment_data = {
                "enrollment_token": config.enrollment_token,
                "device_info": device_info,
            }

            enrollment_url = (
                f"{config.supabase_url.rstrip('/')}{config.enrollment_endpoint}"
            )

            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.post(
                    enrollment_url,
                    json=enrollment_data,
                    headers={"Content-Type": "application/json"},
                )

            if response.status_code == 200:
                result_data = response.json()

                device_id = result_data.get("device_id")
                api_key = result_data.get("api_key")
                message = result_data.get("message", "Enrollment successful")

                if device_id and api_key:
                    await self._store_credentials(device_id, api_key)
                    self._cleanup_enrollment_config()

                    logger.info(f"Device enrolled successfully: {device_id}")

                    return EnrollmentResult(
                        success=True,
                        device_id=device_id,
                        api_key=api_key,
                        message=message,
                    )
                else:
                    logger.error(
                        "Invalid enrollment response: missing device_id or api_key"
                    )
                    return EnrollmentResult(
                        success=False,
                        device_id="",
                        api_key="",
                        message="Invalid enrollment response",
                        error_code="INVALID_RESPONSE",
                    )
            else:
                error_data = {}
                try:
                    error_data = response.json()
                except Exception:
                    pass
                error_message = error_data.get("error", "Enrollment failed")
                error_code = error_data.get("error_code", "ENROLLMENT_FAILED")

                logger.error(f"Enrollment failed: {error_message}")

                return EnrollmentResult(
                    success=False,
                    device_id="",
                    api_key="",
                    message=error_message,
                    error_code=error_code,
                )

        except Exception as e:
            logger.error(f"Enrollment process failed: {e}")
            return EnrollmentResult(
                success=False,
                device_id="",
                api_key="",
                message=f"Enrollment failed: {str(e)}",
                error_code="SYSTEM_ERROR",
            )

    async def _collect_device_info(self, config: EnrollmentConfig) -> Dict:
        """Collect device information for enrollment"""
        try:
            import platform

            hostname = get_hostname()
            sanitized_hostname = sanitize_hostname(hostname)

            system_info = {
                "hostname": hostname,
                "sanitized_hostname": sanitized_hostname,
                "platform": platform.platform(),
                "system": platform.system(),
                "release": platform.release(),
                "version": platform.version(),
                "machine": platform.machine(),
                "processor": platform.processor(),
                "python_version": platform.python_version(),
            }

            device_fingerprint = get_device_fingerprint()
            network_info = await self._get_network_info()
            disk_info = await self._get_disk_info()

            return {
                "device_name": config.device_name or sanitized_hostname,
                "device_fingerprint": device_fingerprint,
                "system_info": system_info,
                "network_info": network_info,
                "disk_info": disk_info,
                "organization": config.organization,
                "enrollment_timestamp": time.time(),
                "agent_version": "0.1.0",
            }

        except Exception as e:
            logger.error(f"Failed to collect device info: {e}")
            return {}

    async def _get_network_info(self) -> Dict:
        """Collect network interface information"""
        try:
            import psutil

            network_info = {}

            for interface, addrs in psutil.net_if_addrs().items():
                interface_info: Dict = {"addresses": [], "is_up": True}

                for addr in addrs:
                    addr_info = {
                        "family": addr.family.name,
                        "address": addr.address,
                        "netmask": addr.netmask,
                        "broadcast": addr.broadcast,
                    }
                    interface_info["addresses"].append(addr_info)

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
                        "mountpoint": partition.mountpoint,
                        "fstype": partition.fstype,
                        "total": usage.total,
                        "used": usage.used,
                        "free": usage.free,
                        "percent_used": (usage.used / usage.total) * 100,
                    }
                except Exception:
                    continue

            return disk_info

        except Exception as e:
            logger.error(f"Failed to get disk info: {e}")
            return {}

    async def _store_credentials(self, device_id: str, api_key: str) -> None:
        """Store device credentials securely"""
        try:
            self.device_id = device_id
            self.api_key = api_key

            if keyring:
                try:
                    keyring.set_password(
                        self.keyring_service, self.keyring_device_key, device_id
                    )
                    keyring.set_password(
                        self.keyring_service, self.keyring_api_key, api_key
                    )
                    logger.info("Credentials stored in keyring")
                    return
                except Exception as e:
                    logger.warning(f"Failed to store in keyring: {e}")

            cred_file = Path(r"C:\ProgramData\EdgePulse\credentials.json")
            cred_file.parent.mkdir(parents=True, exist_ok=True)

            credentials = {
                "device_id": device_id,
                "api_key": api_key,
                "stored_at": time.time(),
            }

            with open(cred_file, "w") as f:
                json.dump(credentials, f, indent=2)

            try:
                import os

                os.chmod(cred_file, 0o600)
            except Exception:
                pass

            logger.info("Credentials stored in file")

        except Exception as e:
            logger.error(f"Failed to store credentials: {e}")
            raise EdgePulseError(f"Credential storage failed: {e}")

    def _cleanup_enrollment_config(self) -> None:
        """Delete enrollment configuration file after successful enrollment"""
        try:
            if self.config_path.exists():
                self.config_path.unlink()
                logger.info("Enrollment configuration file deleted")
        except Exception as e:
            logger.warning(f"Failed to delete enrollment config: {e}")

    def is_enrolled(self) -> bool:
        """Check if device is enrolled – compatibility method"""
        return asyncio.run(self.check_enrollment_status())

    def get_credentials(self) -> Tuple[Optional[str], Optional[str]]:
        """Get stored device credentials"""
        return self.device_id, self.api_key

    async def rotate_api_key(self, supabase_url: str) -> bool:
        """Rotate API key for enrolled device"""
        if not HTTPX_AVAILABLE:
            logger.error("httpx is required for API key rotation")
            return False

        try:
            if not self.device_id or not self.api_key:
                logger.error("Device not enrolled, cannot rotate API key")
                return False

            rotate_url = f"{supabase_url.rstrip('/')}/functions/v1/rotate-api-key"

            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.post(
                    rotate_url,
                    json={},
                    headers={
                        "Content-Type": "application/json",
                        "X-EdgePulse-Device-Id": self.device_id,
                        "X-EdgePulse-Api-Key": self.api_key,
                    },
                )

            if response.status_code == 200:
                result_data = response.json()
                new_api_key = result_data.get("api_key")

                if new_api_key:
                    await self._store_credentials(self.device_id, new_api_key)
                    logger.info("API key rotated successfully")
                    return True
                else:
                    logger.error("Invalid rotation response: missing new API key")
                    return False
            else:
                error_data = {}
                try:
                    error_data = response.json()
                except Exception:
                    pass
                error_message = error_data.get("error", "API key rotation failed")
                logger.error(f"API key rotation failed: {error_message}")
                return False

        except Exception as e:
            logger.error(f"API key rotation failed: {e}")
            return False


def create_enrollment_client(
    config_path: Optional[str] = None,
) -> DeviceEnrollmentClient:
    """Create device enrollment client"""
    return DeviceEnrollmentClient(config_path)