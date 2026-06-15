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

from edgepulse.utils.log_handler import get_logger
from edgepulse.auth.credentials import CredentialManager, DeviceCredentials
from edgepulse.utils.version import get_agent_version

logger = get_logger(__name__)


@dataclass
class EnrollmentResponse:
    device_id: str
    api_key: str
    enrollment_token: Optional[str] = None
    expires_at: Optional[str] = None


@dataclass
class EnrollmentConfig:
    supabase_url: str
    enrollment_token: str
    supabase_anon_key: Optional[str] = None
    device_hostname: Optional[str] = None
    device_os: Optional[str] = None
    agent_version: Optional[str] = None
    timeout_seconds: int = 30


class DeviceEnrollmentClient:
    def __init__(self, credential_manager: Optional[CredentialManager] = None):
        self.credential_manager = credential_manager or CredentialManager()
        self.platform = sys.platform

        if not HTTPX_AVAILABLE:
            raise ImportError("httpx is required for device enrollment")

    def _config_search_paths(self) -> list[Path]:
        paths: list[Path] = []
        if self.platform == "win32":
            config_dir = Path("C:\\ProgramData\\EdgePulse")
        else:
            config_dir = Path.home() / ".edgepulse"

        paths += [
            config_dir / "enroll.cfg",
            config_dir / "enrollment.json",
            Path("enroll.cfg"),
            Path("enrollment.json"),
        ]

        if self.platform != "win32":
            paths.append(Path("/etc/edgepulse/enrollment.json"))
            paths.append(Path("/etc/edgepulse/enroll.cfg"))

        return paths

    def read_enrollment_config(self) -> Optional[EnrollmentConfig]:
        for path in self._config_search_paths():
            if path.exists():
                cfg = self._parse_config_file(path)
                if cfg:
                    logger.info("enrollment_config_found", path=str(path))
                    return cfg

        logger.warning("enrollment_config_not_found")
        return None

    def _parse_config_file(self, config_path: Path) -> Optional["EnrollmentConfig"]:
        try:
            content = config_path.read_text().strip()

            if config_path.suffix == ".json":
                data = json.loads(content)
                return EnrollmentConfig(
                    supabase_url=data["supabase_url"],
                    enrollment_token=data["enrollment_token"],
                    supabase_anon_key=data.get("supabase_anon_key"),
                    device_hostname=data.get("device_hostname"),
                    device_os=data.get("device_os"),
                    agent_version=data.get("agent_version"),
                    timeout_seconds=data.get("timeout_seconds", 30),
                )
            else:
                cfg: dict = {}
                for line in content.splitlines():
                    line = line.strip()
                    if line and "=" in line and not line.startswith("#"):
                        key, _, value = line.partition("=")
                        cfg[key.strip()] = value.strip()

                return EnrollmentConfig(
                    supabase_url=cfg["supabase_url"],
                    enrollment_token=cfg["enrollment_token"],
                    supabase_anon_key=cfg.get("supabase_anon_key"),
                    device_hostname=cfg.get("device_hostname"),
                    device_os=cfg.get("device_os"),
                    agent_version=cfg.get("agent_version"),
                    timeout_seconds=int(cfg.get("timeout_seconds", 30)),
                )

        except Exception as e:
            logger.error("enrollment_config_parse_error", path=str(config_path), error=str(e))
            return None

    def delete_enrollment_config(self) -> bool:
        deleted = False
        for path in self._config_search_paths():
            if path.exists():
                try:
                    path.unlink()
                    logger.info("enrollment_config_deleted", path=str(path))
                    deleted = True
                except Exception as e:
                    logger.warning("enrollment_config_delete_failed", path=str(path), error=str(e))
        return deleted

    async def enroll_device(self, config: EnrollmentConfig) -> Optional[EnrollmentResponse]:
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

            # Add Supabase anon key for edge function authentication
            if config.supabase_anon_key:
                headers["Authorization"] = f"Bearer {config.supabase_anon_key}"

            async with httpx.AsyncClient(timeout=config.timeout_seconds) as client:
                response = await client.post(
                    enrollment_url,
                    json=enrollment_data,
                    headers=headers,
                )

            if response.status_code == 200:
                result = response.json()
                resp = EnrollmentResponse(
                    device_id=result["device_id"],
                    api_key=result["api_key"],
                    enrollment_token=result.get("enrollment_token"),
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

    def complete_enrollment(self, response: EnrollmentResponse, supabase_url: Optional[str] = None, supabase_anon_key: Optional[str] = None) -> bool:
        try:
            credentials = DeviceCredentials(
                device_id=response.device_id,
                api_key=response.api_key,
                enrollment_token=response.enrollment_token,
                supabase_url=supabase_url,
            )

            if not self.credential_manager.store_device_credentials(credentials):
                logger.error("enrollment_credential_store_failed")
                return False

            self.credential_manager.clear_enrollment_token()

            self.delete_enrollment_config()

            # Update agent_config.json with the enrolled device_id and supabase_anon_key
            self._update_agent_config_device_id(response.device_id, supabase_url, supabase_anon_key)

            logger.info("enrollment_complete", device_id=response.device_id)
            return True

        except Exception as e:
            logger.error("enrollment_complete_error", error=str(e))
            return False

    def _update_agent_config_device_id(self, device_id: str, supabase_url: Optional[str] = None, supabase_anon_key: Optional[str] = None) -> bool:
        try:
            from edgepulse.utils.path_manager import PathManager

            config_path = PathManager().get_config_path()
            if not config_path.exists():
                logger.warning("agent_config_not_found", path=str(config_path))
                return False

            with open(config_path, 'r') as f:
                config = json.load(f)

            config["device_id"] = device_id

            if supabase_url or supabase_anon_key:
                if "sync" not in config:
                    config["sync"] = {}
                if supabase_url:
                    config["sync"]["supabase_url"] = supabase_url
                if supabase_anon_key:
                    config["sync"]["supabase_key"] = supabase_anon_key

            with open(config_path, 'w') as f:
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

    async def rotate_api_key(self, supabase_url: str) -> Optional[str]:
        try:
            credentials = self.credential_manager.get_device_credentials()
            if not credentials:
                logger.error("rotate_api_key_no_credentials")
                return None

            agent_version = get_agent_version()
            rotate_url = f"{supabase_url}/functions/v1/rotate-api-key"

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
                new_key = response.json()["api_key"]
                if self.credential_manager.store_credential("api_key", new_key):
                    logger.info("api_key_rotated", device_id=credentials.device_id)
                    return new_key
                else:
                    logger.error("api_key_rotate_store_failed")
                    return None
            else:
                try:
                    detail = response.json().get("error", "")
                except Exception:
                    detail = response.text
                logger.error(
                    "api_key_rotate_http_error",
                    status=response.status_code,
                    detail=detail,
                )
                return None

        except Exception as e:
            logger.error("api_key_rotate_unexpected_error", error=str(e))
            return None

    async def verify_enrollment(self, supabase_url: str) -> bool:
        try:
            credentials = self.credential_manager.get_device_credentials()
            if not credentials:
                return False

            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.get(
                    f"{supabase_url}/rest/v1/",
                    headers={
                        "X-EdgePulse-Device-Id": credentials.device_id,
                        "X-EdgePulse-Api-Key": credentials.api_key,
                        "apikey": "dummy",
                        "Authorization": "Bearer dummy",
                    },
                )
            return response.status_code in (200, 401)

        except Exception as e:
            logger.error("enrollment_verify_error", error=str(e))
            return False
