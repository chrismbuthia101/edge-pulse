"""
Device Enrollment Client for EdgePulse

Handles the device enrollment process including token validation,
API key generation, and secure credential storage.
"""

import os
import sys
import json
from pathlib import Path
from typing import Optional
from dataclasses import dataclass

try:
    import httpx

    HTTPX_AVAILABLE = True
except ImportError:
    HTTPX_AVAILABLE = False

from edgepulse_win.utils.log_handler import get_logger
from edgepulse_win.auth.credentials import CredentialManager, DeviceCredentials
from edgepulse_win.utils.version import get_agent_version

logger = get_logger(__name__)

@dataclass
class EnrollmentResponse:
    """Response from device enrollment"""

    device_id: str
    api_key: str
    enrollment_token: Optional[str] = None
    expires_at: Optional[str] = None


@dataclass
class EnrollmentConfig:
    """Enrollment configuration"""

    supabase_url: str
    enrollment_token: str
    device_hostname: Optional[str] = None
    device_os: Optional[str] = None
    agent_version: Optional[str] = None
    timeout_seconds: int = 30


class DeviceEnrollmentClient:
    """Client for device enrollment with EdgePulse backend"""

    def __init__(self, credential_manager: Optional[CredentialManager] = None):
        self.credential_manager = credential_manager or CredentialManager()
        self.platform = sys.platform

        if not HTTPX_AVAILABLE:
            raise ImportError("httpx is required for device enrollment")

    def read_enrollment_config(self) -> Optional[EnrollmentConfig]:
        """Read enrollment configuration from file"""
        try:
            config_paths = []

            if self.platform == "win32":
                config_dir = (
                    Path(os.environ.get("ProgramData", "C:\\ProgramData")) / "EdgePulse"
                )
                config_paths.append(config_dir / "enroll.cfg")
                config_paths.append(config_dir / "enrollment.json")
            else:
                config_dir = Path.home() / ".edgepulse"
                config_paths.append(config_dir / "enroll.cfg")
                config_paths.append(config_dir / "enrollment.json")

            config_paths.append(Path("enroll.cfg"))
            config_paths.append(Path("enrollment.json"))

            for config_path in config_paths:
                if config_path.exists():
                    return self._parse_config_file(config_path)

            logger.warning("No enrollment configuration file found")
            return None

        except Exception as e:
            logger.error(f"Error reading enrollment config: {e}")
            return None

    def _parse_config_file(self, config_path: Path) -> Optional[EnrollmentConfig]:
        """Parse enrollment configuration file"""
        try:
            content = config_path.read_text().strip()

            if config_path.suffix == ".json":
                data = json.loads(content)
                return EnrollmentConfig(
                    supabase_url=data["supabase_url"],
                    enrollment_token=data["enrollment_token"],
                    device_hostname=data.get("device_hostname"),
                    device_os=data.get("device_os"),
                    agent_version=data.get("agent_version"),
                    timeout_seconds=data.get("timeout_seconds", 30),
                )
            else:
                config_dict = {}
                for line in content.split("\n"):
                    line = line.strip()
                    if line and "=" in line and not line.startswith("#"):
                        key, value = line.split("=", 1)
                        config_dict[key.strip()] = value.strip()

                return EnrollmentConfig(
                    supabase_url=config_dict["supabase_url"],
                    enrollment_token=config_dict["enrollment_token"],
                    device_hostname=config_dict.get("device_hostname"),
                    device_os=config_dict.get("device_os"),
                    agent_version=config_dict.get("agent_version"),
                    timeout_seconds=int(config_dict.get("timeout_seconds", 30)),
                )

        except Exception as e:
            logger.error(f"Error parsing config file {config_path}: {e}")
            return None

    def delete_enrollment_config(self) -> bool:
        """Delete enrollment configuration file after successful enrollment"""
        try:
            config_paths = []

            if self.platform == "win32":
                config_dir = (
                    Path(os.environ.get("ProgramData", "C:\\ProgramData")) / "EdgePulse"
                )
                config_paths.extend(
                    [config_dir / "enroll.cfg", config_dir / "enrollment.json"]
                )
            else:
                config_dir = Path.home() / ".edgepulse"
                config_paths.extend(
                    [config_dir / "enroll.cfg", config_dir / "enrollment.json"]
                )

            config_paths.extend([Path("enroll.cfg"), Path("enrollment.json")])

            deleted = False
            for config_path in config_paths:
                if config_path.exists():
                    config_path.unlink()
                    deleted = True
                    logger.info(f"Deleted enrollment config: {config_path}")

            return deleted

        except Exception as e:
            logger.error(f"Error deleting enrollment config: {e}")
            return False

    async def enroll_device(self, config: EnrollmentConfig) -> Optional[EnrollmentResponse]:
        """Enroll the device with the EdgePulse backend"""
        try:
            logger.info("Starting device enrollment process")

            device_id = self.credential_manager.generate_device_id()

            import platform

            hostname = config.device_hostname or platform.node()
            operating_system = config.device_os or f"{platform.system()} {platform.release()}"

            # Use the canonical helper instead of duplicating inline logic
            agent_version = config.agent_version or get_agent_version()

            enrollment_data = {
                "token": config.enrollment_token,
                "device_info": {
                    "hostname": hostname,
                    "operating_system": operating_system,
                    "agent_version": agent_version,
                    "platform": platform.platform(),
                },
            }

            enrollment_url = f"{config.supabase_url}/functions/v1/enroll-device"

            async with httpx.AsyncClient(timeout=config.timeout_seconds) as client:
                response = await client.post(
                    enrollment_url,
                    json=enrollment_data,
                    headers={
                        "Content-Type": "application/json",
                        "User-Agent": f"EdgePulseAgent/{agent_version}",
                    },
                )

                if response.status_code == 200:
                    result = response.json()

                    enrollment_response = EnrollmentResponse(
                        device_id=result["device_id"],
                        api_key=result["api_key"],
                        enrollment_token=result.get("enrollment_token"),
                        expires_at=result.get("expires_at"),
                    )

                    logger.info(
                        f"Device enrolled successfully: {enrollment_response.device_id}"
                    )
                    return enrollment_response

                else:
                    error_msg = f"Enrollment failed: HTTP {response.status_code}"
                    try:
                        error_detail = response.json()
                        error_msg += f" - {error_detail.get('error', 'Unknown error')}"
                    except Exception:
                        if response.text:
                            error_msg += f" - {response.text}"

                    logger.error(error_msg)
                    return None

        except httpx.TimeoutException:
            logger.error("Enrollment request timed out")
            return None
        except Exception as e:
            logger.error(f"Error during device enrollment: {e}")
            return None

    def complete_enrollment(self, response: EnrollmentResponse) -> bool:
        """Complete enrollment by storing credentials"""
        try:
            logger.info("Completing enrollment - storing credentials")

            credentials = DeviceCredentials(
                device_id=response.device_id,
                api_key=response.api_key,
                enrollment_token=response.enrollment_token,
            )

            success = self.credential_manager.store_device_credentials(credentials)

            if success:
                self.credential_manager.clear_enrollment_token()
                self.delete_enrollment_config()
                logger.info("Enrollment completed successfully")
                return True
            else:
                logger.error("Failed to store device credentials")
                return False

        except Exception as e:
            logger.error(f"Error completing enrollment: {e}")
            return False

    async def rotate_api_key(self, supabase_url: str) -> Optional[str]:
        """Rotate the device API key"""
        try:
            logger.info("Starting API key rotation")

            credentials = self.credential_manager.get_device_credentials()
            if not credentials:
                logger.error("No device credentials found for API key rotation")
                return None

            rotate_url = f"{supabase_url}/functions/v1/rotate-api-key"

            # Use the canonical helper
            agent_version = get_agent_version()

            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.post(
                    rotate_url,
                    headers={
                        "Content-Type": "application/json",
                        "X-EdgePulse-Device-Id": credentials.device_id,
                        "X-EdgePulse-Api-Key": credentials.api_key,
                        "User-Agent": f"EdgePulseAgent/{agent_version}",
                    },
                )

                if response.status_code == 200:
                    result = response.json()
                    new_api_key = result["api_key"]

                    success = self.credential_manager.store_credential(
                        "api_key", new_api_key
                    )

                    if success:
                        logger.info("API key rotated successfully")
                        return new_api_key
                    else:
                        logger.error("Failed to store new API key")
                        return None
                else:
                    error_msg = f"API key rotation failed: HTTP {response.status_code}"
                    try:
                        error_detail = response.json()
                        error_msg += f" - {error_detail.get('error', 'Unknown error')}"
                    except Exception:
                        if response.text:
                            error_msg += f" - {response.text}"

                    logger.error(error_msg)
                    return None

        except Exception as e:
            logger.error(f"Error during API key rotation: {e}")
            return None

    def is_enrolled(self) -> bool:
        """Check if the device is already enrolled"""
        return self.credential_manager.is_enrolled()

    def get_device_credentials(self) -> Optional[DeviceCredentials]:
        """Get current device credentials"""
        return self.credential_manager.get_device_credentials()

    async def verify_enrollment(self, supabase_url: str) -> bool:
        """Verify that current enrollment is valid"""
        try:
            credentials = self.credential_manager.get_device_credentials()
            if not credentials:
                return False

            health_url = f"{supabase_url}/rest/v1/"

            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.get(
                    health_url,
                    headers={
                        "X-EdgePulse-Device-Id": credentials.device_id,
                        "X-EdgePulse-Api-Key": credentials.api_key,
                        "apikey": "dummy",
                        "Authorization": "Bearer dummy",
                    },
                )

                return response.status_code in [200, 401]

        except Exception as e:
            logger.error(f"Error verifying enrollment: {e}")
            return False