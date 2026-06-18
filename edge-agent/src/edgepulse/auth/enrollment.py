import sys
import json
from pathlib import Path
from typing import Optional
from dataclasses import dataclass

import httpx

from edgepulse.utils.log_handler import get_logger
from edgepulse.auth.credentials import CredentialManager, DeviceCredentials
from edgepulse.utils.version import get_agent_version

logger = get_logger(__name__)


@dataclass
class _EnrollmentResponse:
    device_id: str
    api_key: str
    expires_at: Optional[str] = None


@dataclass
class EnrollmentConfig:
    supabase_url: str
    enrollment_token: str
    publishable_key: Optional[str] = None
    device_hostname: Optional[str] = None
    device_os: Optional[str] = None
    agent_version: Optional[str] = None
    timeout_seconds: int = 30


class DeviceEnrollmentClient:
    def __init__(self, credential_manager: Optional[CredentialManager] = None):
        self.credential_manager = credential_manager or CredentialManager()
        self.platform = sys.platform

    @staticmethod
    def _config_path() -> Path:
        if sys.platform == "win32":
            return Path("C:\\ProgramData\\EdgePulse") / "enrollment.json"
        return Path("/etc/edgepulse/enrollment.json")

    def read_enrollment_config(self) -> Optional[EnrollmentConfig]:
        path = self._config_path()
        if not path.exists():
            logger.warning("enrollment_config_not_found", path=str(path))
            return None

        try:
            data = json.loads(path.read_text())
            cfg = EnrollmentConfig(
                supabase_url=data["supabase_url"],
                enrollment_token=data["enrollment_token"],
                publishable_key=data.get("publishable_key"),
                device_hostname=data.get("device_hostname"),
                device_os=data.get("device_os"),
                agent_version=data.get("agent_version"),
                timeout_seconds=data.get("timeout_seconds", 30),
            )
            logger.info("enrollment_config_found", path=str(path))
            return cfg
        except Exception as e:
            logger.error("enrollment_config_parse_error", path=str(path), error=str(e))
            return None

    def delete_enrollment_config(self) -> bool:
        path = self._config_path()
        if not path.exists():
            return False
        try:
            path.unlink()
            logger.info("enrollment_config_deleted", path=str(path))
            return True
        except Exception as e:
            logger.warning("enrollment_config_delete_failed", path=str(path), error=str(e))
            return False

    async def enroll_device(self, config: EnrollmentConfig) -> Optional[_EnrollmentResponse]:
        try:
            logger.info("enrollment_starting")

            import platform

            agent_version = config.agent_version or get_agent_version()
            hostname = config.device_hostname or platform.node()
            operating_system = config.device_os or f"{platform.system()} {platform.release()}"

            enrollment_data = {
                "enrollment_token": config.enrollment_token,
                "hostname": hostname,
                "operating_system": operating_system,
                "agent_version": agent_version,
            }

            enrollment_url = f"{config.supabase_url}/functions/v1/enroll-device"

            headers = {
                "Content-Type": "application/json",
                "User-Agent": f"EdgePulseAgent/{agent_version}",
            }

            if config.publishable_key:
                headers["Authorization"] = f"Bearer {config.publishable_key}"

            async with httpx.AsyncClient(timeout=config.timeout_seconds) as client:
                response = await client.post(
                    enrollment_url,
                    json=enrollment_data,
                    headers=headers,
                )

            if response.status_code == 200:
                result = response.json()
                resp = _EnrollmentResponse(
                    device_id=result["device_id"],
                    api_key=result["api_key"],
                    expires_at=result.get("expires_at"),
                )
                logger.info("enrollment_success", device_id=resp.device_id)
                return resp
            else:
                try:
                    response_data = response.json()
                    detail = response_data.get("error", "")
                    if not detail:
                        detail = response_data.get("message", response.text)
                except Exception:
                    detail = response.text or f"HTTP {response.status_code}"
                logger.error(
                    "enrollment_http_error",
                    status=response.status_code,
                    detail=detail,
                    url=enrollment_url,
                )
                return None

        except httpx.TimeoutException:
            logger.error("enrollment_timeout")
            return None
        except Exception as e:
            logger.error("enrollment_unexpected_error", error=str(e))
            return None

    def complete_enrollment(
        self, response: _EnrollmentResponse, supabase_url: Optional[str] = None
    ) -> bool:
        try:
            credentials = DeviceCredentials(
                device_id=response.device_id,
                api_key=response.api_key,
                supabase_url=supabase_url,
            )

            if not self.credential_manager.store_device_credentials(credentials):
                logger.error("enrollment_credential_store_failed")
                return False

            self.delete_enrollment_config()

            self._update_agent_config_device_id(response.device_id, supabase_url)

            logger.info("enrollment_complete", device_id=response.device_id)
            return True

        except Exception as e:
            logger.error("enrollment_complete_error", error=str(e))
            return False

    def _update_agent_config_device_id(
        self, device_id: str, supabase_url: Optional[str] = None
    ) -> bool:
        try:
            from edgepulse.utils.path_manager import PathManager

            config_path = PathManager().get_config_path()
            if not config_path.exists():
                logger.warning("agent_config_not_found", path=str(config_path))
                return False

            with open(config_path, "r") as f:
                config = json.load(f)

            config["device_id"] = device_id

            if supabase_url:
                if "sync" not in config:
                    config["sync"] = {}
                config["sync"]["supabase_url"] = supabase_url

            with open(config_path, "w") as f:
                json.dump(config, f, indent=2)

            logger.info("agent_config_updated", device_id=device_id, path=str(config_path))
            return True

        except Exception as e:
            logger.warning("agent_config_update_failed", error=str(e))
            return False

    def is_enrolled(self) -> bool:
        return self.credential_manager.is_enrolled()

    def get_device_credentials(self) -> Optional[DeviceCredentials]:
        return self.credential_manager.get_device_credentials()
