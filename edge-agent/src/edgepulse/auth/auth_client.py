import asyncio
from typing import Optional, Dict
from dataclasses import dataclass

import httpx

from edgepulse.utils.log_handler import get_logger
from edgepulse.utils.version import get_agent_version
from edgepulse.auth.credentials import CredentialManager, DeviceCredentials
from edgepulse.utils.error_handler import AuthenticationError, NetworkError

logger = get_logger(__name__)


@dataclass
class ClientConfig:
    supabase_url: str
    timeout_seconds: int = 30
    max_retries: int = 3
    retry_backoff_seconds: float = 1.0
    max_retry_backoff_seconds: float = 60.0


class EdgePulseClient:
    def __init__(
        self, config: ClientConfig, credential_manager: Optional[CredentialManager] = None
    ):
        self.config = config
        self.credential_manager = credential_manager or CredentialManager()
        self._credentials: Optional[DeviceCredentials] = None
        self._session: Optional[httpx.AsyncClient] = None

    async def _ensure_session(self):
        if self._session is None or self._session.is_closed:
            timeout = httpx.Timeout(self.config.timeout_seconds)
            self._session = httpx.AsyncClient(
                timeout=timeout,
                limits=httpx.Limits(max_keepalive_connections=5, max_connections=10),
            )

    async def _get_credentials(self) -> Optional[DeviceCredentials]:
        if self._credentials is None:
            self._credentials = self.credential_manager.get_device_credentials()
            if not self._credentials:
                logger.error("No device credentials available")
        return self._credentials

    def _build_auth_headers(self) -> Dict[str, str]:
        credentials = self._credentials
        if not credentials:
            raise AuthenticationError("No device credentials available")
        return {
            "X-EdgePulse-Device-Id": credentials.device_id,
            "X-EdgePulse-Api-Key": credentials.api_key,
            "Content-Type": "application/json",
            "User-Agent": f"EdgePulseAgent/{get_agent_version()}",
        }

    async def request(
        self, method: str, endpoint: str, use_functions: bool = False, **kwargs
    ) -> httpx.Response:
        await self._ensure_session()
        assert self._session is not None
        credentials = await self._get_credentials()
        if not credentials:
            raise AuthenticationError("No device credentials available")

        base = self.config.supabase_url.rstrip("/")
        if use_functions:
            url = f"{base}/functions/v1/{endpoint.lstrip('/')}"
        else:
            url = f"{base}/rest/v1/{endpoint.lstrip('/')}"

        headers = kwargs.pop("headers", {})
        headers.update(self._build_auth_headers())
        kwargs["headers"] = headers

        for attempt in range(self.config.max_retries + 1):
            try:
                response = await self._session.request(method, url, **kwargs)
                if response.status_code == 401:
                    raise AuthenticationError("Invalid device credentials")
                elif response.status_code == 429:
                    if attempt < self.config.max_retries:
                        delay = self._calculate_retry_delay(attempt)
                        logger.warning(f"Rate limited, retrying in {delay:.1f}s")
                        await asyncio.sleep(delay)
                        continue
                    raise NetworkError("Rate limit exceeded after retries")
                elif response.status_code >= 500:
                    if attempt < self.config.max_retries:
                        delay = self._calculate_retry_delay(attempt)
                        logger.warning(
                            f"Server error {response.status_code}, retrying in {delay:.1f}s"
                        )
                        await asyncio.sleep(delay)
                        continue
                return response
            except AuthenticationError:
                raise
            except httpx.HTTPError as e:
                if attempt < self.config.max_retries:
                    delay = self._calculate_retry_delay(attempt)
                    logger.warning(f"HTTP error, retrying in {delay:.1f}s: {e}")
                    await asyncio.sleep(delay)
                    continue
                raise NetworkError("HTTP request failed") from e
            except Exception as e:
                if attempt < self.config.max_retries:
                    delay = self._calculate_retry_delay(attempt)
                    logger.warning(f"Unexpected error, retrying in {delay:.1f}s: {e}")
                    await asyncio.sleep(delay)
                    continue
                raise

        raise NetworkError("Request failed after all retries")

    def _calculate_retry_delay(self, attempt: int) -> float:
        delay = self.config.retry_backoff_seconds * (2**attempt)
        return min(delay, self.config.max_retry_backoff_seconds)

    async def get(self, endpoint: str, **kwargs) -> httpx.Response:
        return await self.request("GET", endpoint, **kwargs)

    async def post(self, endpoint: str, **kwargs) -> httpx.Response:
        return await self.request("POST", endpoint, **kwargs)

    async def patch(self, endpoint: str, **kwargs) -> httpx.Response:
        return await self.request("PATCH", endpoint, **kwargs)

    async def close(self):
        if self._session and not self._session.is_closed:
            await self._session.aclose()
            self._session = None
