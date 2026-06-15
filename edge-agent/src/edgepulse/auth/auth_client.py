import asyncio
import time
from typing import Optional, Dict, Any
from dataclasses import dataclass

try:
    import httpx
    HTTPX_AVAILABLE = True
except ImportError:
    HTTPX_AVAILABLE = False

from edgepulse.utils.log_handler import get_logger
from edgepulse.utils.version import get_agent_version
from edgepulse.auth.credentials import CredentialManager, DeviceCredentials

logger = get_logger(__name__)


@dataclass
class AuthConfig:
    supabase_url: str
    timeout_seconds: int = 30
    max_retries: int = 3
    retry_backoff_seconds: float = 1.0
    max_retry_backoff_seconds: float = 60.0


class AuthenticationError(Exception):
    pass


class RateLimitError(Exception):
    pass


class AuthenticatedClient:
    def __init__(self, config: AuthConfig, credential_manager: Optional[CredentialManager] = None):
        if not HTTPX_AVAILABLE:
            raise ImportError("httpx is required for authenticated client")

        self.config = config
        self.credential_manager = credential_manager or CredentialManager()
        self._credentials: Optional[DeviceCredentials] = None
        self._last_credentials_refresh = 0
        self._credentials_cache_ttl = 300  # 5 minutes

        self.client_config = {
            "timeout": httpx.Timeout(config.timeout_seconds),
            "limits": httpx.Limits(max_keepalive_connections=5, max_connections=10)
        }

    async def _get_credentials(self) -> Optional[DeviceCredentials]:
        current_time = time.time()

        if (self._credentials is None or
            current_time - self._last_credentials_refresh > self._credentials_cache_ttl):

            self._credentials = self.credential_manager.get_device_credentials()
            self._last_credentials_refresh = current_time

            if not self._credentials:
                logger.error("No device credentials available")

        return self._credentials

    def _get_auth_headers(self) -> Dict[str, str]:
        credentials = self._credentials

        if not credentials:
            raise AuthenticationError("No device credentials available")

        headers = {
            "X-EdgePulse-Device-Id": credentials.device_id,
            "X-EdgePulse-Api-Key": credentials.api_key,
            "Content-Type": "application/json",
            "User-Agent": f"EdgePulseAgent/{get_agent_version()}"
        }

        return headers

    async def _make_request(
        self,
        method: str,
        url: str,
        **kwargs
    ) -> httpx.Response:
        credentials = await self._get_credentials()
        if not credentials:
            raise AuthenticationError("No device credentials available")

        headers = kwargs.pop('headers', {})
        headers.update(self._get_auth_headers())
        kwargs['headers'] = headers

        last_exception = None
        for attempt in range(self.config.max_retries + 1):
            try:
                async with httpx.AsyncClient(**self.client_config) as client:
                    response = await client.request(method, url, **kwargs)

                    if response.status_code == 401:
                        logger.error("Authentication failed - invalid credentials")
                        raise AuthenticationError("Invalid device credentials")

                    elif response.status_code == 429:
                        if attempt < self.config.max_retries:
                            retry_after = self._calculate_retry_delay(attempt)
                            logger.warning(f"Rate limited, retrying in {retry_after:.1f}s")
                            await asyncio.sleep(retry_after)
                            continue
                        else:
                            raise RateLimitError("Rate limit exceeded after retries")

                    elif response.status_code >= 500:
                        if attempt < self.config.max_retries:
                            retry_after = self._calculate_retry_delay(attempt)
                            logger.warning(f"Server error {response.status_code}, retrying in {retry_after:.1f}s")
                            await asyncio.sleep(retry_after)
                            continue

                    return response

            except httpx.TimeoutException as e:
                last_exception = e
                if attempt < self.config.max_retries:
                    retry_after = self._calculate_retry_delay(attempt)
                    logger.warning(f"Request timeout, retrying in {retry_after:.1f}s")
                    await asyncio.sleep(retry_after)
                    continue
                else:
                    logger.error("Request timed out after retries")
                    raise

            except httpx.NetworkError as e:
                last_exception = e
                if attempt < self.config.max_retries:
                    retry_after = self._calculate_retry_delay(attempt)
                    logger.warning(f"Network error, retrying in {retry_after:.1f}s: {e}")
                    await asyncio.sleep(retry_after)
                    continue
                else:
                    logger.error("Network error after retries")
                    raise

            except AuthenticationError:
                raise

            except Exception as e:
                last_exception = e
                if attempt < self.config.max_retries:
                    retry_after = self._calculate_retry_delay(attempt)
                    logger.warning(f"Unexpected error, retrying in {retry_after:.1f}s: {e}")
                    await asyncio.sleep(retry_after)
                    continue
                else:
                    raise

        if last_exception:
            raise last_exception
        else:
            raise RuntimeError("Request failed after retries")

    def _calculate_retry_delay(self, attempt: int) -> float:
        delay = self.config.retry_backoff_seconds * (2 ** attempt)
        return min(delay, self.config.max_retry_backoff_seconds)

    async def get(self, endpoint: str, **kwargs) -> httpx.Response:
        url = f"{self.config.supabase_url.rstrip('/')}/{endpoint.lstrip('/')}"
        return await self._make_request("GET", url, **kwargs)

    async def post(self, endpoint: str, **kwargs) -> httpx.Response:
        url = f"{self.config.supabase_url.rstrip('/')}/{endpoint.lstrip('/')}"
        return await self._make_request("POST", url, **kwargs)

    async def put(self, endpoint: str, **kwargs) -> httpx.Response:
        url = f"{self.config.supabase_url.rstrip('/')}/{endpoint.lstrip('/')}"
        return await self._make_request("PUT", url, **kwargs)

    async def patch(self, endpoint: str, **kwargs) -> httpx.Response:
        url = f"{self.config.supabase_url.rstrip('/')}/{endpoint.lstrip('/')}"
        return await self._make_request("PATCH", url, **kwargs)

    async def delete(self, endpoint: str, **kwargs) -> httpx.Response:
        url = f"{self.config.supabase_url.rstrip('/')}/{endpoint.lstrip('/')}"
        return await self._make_request("DELETE", url, **kwargs)

    async def post_telemetry(self, telemetry_data: Dict[str, Any]) -> bool:
        try:
            response = await self.post(
                "/rest/v1/telemetry_events",
                json=telemetry_data,
                headers={"Prefer": "return=minimal"}
            )

            if response.status_code in [200, 201]:
                return True
            else:
                logger.error(f"Failed to post telemetry: HTTP {response.status_code}")
                return False

        except Exception as e:
            logger.error(f"Error posting telemetry: {e}")
            return False

    async def post_alert(self, alert_data: Dict[str, Any]) -> bool:
        try:
            response = await self.post(
                "/rest/v1/alert_records",
                json=alert_data,
                headers={"Prefer": "return=minimal"}
            )

            if response.status_code in [200, 201]:
                return True
            else:
                logger.error(f"Failed to post alert: HTTP {response.status_code}")
                return False

        except Exception as e:
            logger.error(f"Error posting alert: {e}")
            return False

    async def update_device_heartbeat(self) -> bool:
        try:
            credentials = await self._get_credentials()
            if not credentials:
                return False

            heartbeat_data = {
                "last_seen_utc": "now()",
                "status": "online"
            }

            response = await self.patch(
                f"/rest/v1/device_registry?device_id=eq.{credentials.device_id}",
                json=heartbeat_data,
                headers={"Prefer": "return=minimal"}
            )

            if response.status_code in [200, 204]:
                return True
            else:
                logger.error(f"Failed to update device heartbeat: HTTP {response.status_code}")
                return False

        except Exception as e:
            logger.error(f"Error updating device heartbeat: {e}")
            return False

    async def get_agent_config(self) -> Optional[Dict[str, Any]]:
        try:
            credentials = await self._get_credentials()
            if not credentials:
                return None

            response = await self.get(
                f"/rest/v1/agent_config?device_id=eq.{credentials.device_id}"
            )

            if response.status_code == 200:
                config_data = response.json()
                config_dict = {item['key']: item['value'] for item in config_data}
                return config_dict
            else:
                logger.error(f"Failed to get agent config: HTTP {response.status_code}")
                return None

        except Exception as e:
            logger.error(f"Error getting agent config: {e}")
            return None

    async def test_connectivity(self) -> bool:
        try:
            response = await self.get("/rest/v1/")
            return response.status_code in [200, 401]  # 401 means service is reachable but auth required

        except Exception as e:
            logger.error(f"Connectivity test failed: {e}")
            return False

    async def close(self):
        pass
