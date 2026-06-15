import asyncio
from typing import Dict, Any, Optional
from dataclasses import dataclass

try:
    import httpx
    HTTPX_AVAILABLE = True
except ImportError:
    HTTPX_AVAILABLE = False

from edgepulse.utils.log_handler import get_logger
from edgepulse.auth.credentials import CredentialManager, DeviceCredentials

logger = get_logger(__name__)


@dataclass
class DeviceAuthConfig:
    supabase_url: str
    timeout_seconds: int = 30
    retry_attempts: int = 3
    retry_delay_seconds: float = 1.0


class DeviceAuthClient:
    def __init__(self, config: DeviceAuthConfig, credential_manager: CredentialManager):
        if not HTTPX_AVAILABLE:
            raise ImportError("httpx is required for DeviceAuthClient")
        self.config = config
        self.credential_manager = credential_manager
        self._session: Optional[httpx.AsyncClient] = None

        self.base_url = config.supabase_url.rstrip('/')
        self.rest_url = f"{self.base_url}/rest/v1"
        self.functions_url = f"{self.base_url}/functions/v1"

        logger.info("DeviceAuthClient initialized")

    async def __aenter__(self):
        await self._ensure_session()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()

    async def _ensure_session(self):
        if self._session is None or self._session.is_closed:
            timeout = httpx.Timeout(self.config.timeout_seconds)
            self._session = httpx.AsyncClient(
                timeout=timeout,
                headers=self._get_auth_headers()
            )

    async def close(self):
        if self._session and not self._session.is_closed:
            await self._session.aclose()

    def _get_auth_headers(self) -> Dict[str, str]:
        try:
            credentials = self.credential_manager.get_device_credentials()
            if not credentials:
                logger.error("No device credentials available")
                return {}

            return {
                'X-EdgePulse-Device-Id': credentials.device_id,
                'X-EdgePulse-Api-Key': credentials.api_key,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }

        except Exception as e:
            logger.error(f"Error getting auth headers: {e}")
            return {}

    async def _make_request(self, method: str, endpoint: str,
                          data: Optional[Dict[str, Any]] = None,
                          params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        await self._ensure_session()

        url = f"{self.rest_url}/{endpoint.lstrip('/')}"

        for attempt in range(self.config.retry_attempts):
            try:
                response = await self._session.request(
                    method=method,
                    url=url,
                    json=data,
                    params=params
                )

                logger.debug(f"Request: {method} {url} -> {response.status_code}")

                if response.status_code == 401:
                    logger.error("Authentication failed - invalid API key")
                    raise PermissionError("Invalid device API key")
                elif response.status_code == 403:
                    logger.error("Access forbidden - insufficient permissions")
                    raise PermissionError("Insufficient permissions")
                elif response.status_code >= 400:
                    error_text = response.text
                    logger.error(f"HTTP error {response.status_code}: {error_text}")
                    raise RuntimeError(f"HTTP {response.status_code}: {error_text}")

                return response.json()

            except httpx.HTTPError as e:
                if attempt < self.config.retry_attempts - 1:
                    wait_time = self.config.retry_delay_seconds * (2 ** attempt)
                    logger.warning(f"Request failed (attempt {attempt + 1}), retrying in {wait_time}s: {e}")
                    await asyncio.sleep(wait_time)
                else:
                    logger.error(f"Request failed after {attempt + 1} attempts: {e}")
                    raise
            except Exception as e:
                logger.error(f"Unexpected error in request: {e}")
                raise

        raise RuntimeError("All retry attempts failed")

    async def post_telemetry_events(self, events: list[Dict[str, Any]]) -> bool:
        try:
            if not events:
                return True

            logger.debug(f"Posting {len(events)} telemetry events")

            response = await self._make_request(
                method='POST',
                endpoint='telemetry_events',
                data=events
            )

            logger.debug(f"Telemetry posted successfully: {response}")
            return True

        except Exception as e:
            logger.error(f"Error posting telemetry events: {e}")
            return False

    async def post_anomaly_scores(self, scores: list[Dict[str, Any]]) -> bool:
        try:
            if not scores:
                return True

            logger.debug(f"Posting {len(scores)} anomaly scores")

            response = await self._make_request(
                method='POST',
                endpoint='anomaly_scores',
                data=scores
            )

            logger.debug(f"Anomaly scores posted successfully: {response}")
            return True

        except Exception as e:
            logger.error(f"Error posting anomaly scores: {e}")
            return False

    async def post_alert_records(self, alerts: list[Dict[str, Any]]) -> bool:
        try:
            if not alerts:
                return True

            logger.debug(f"Posting {len(alerts)} alert records")

            response = await self._make_request(
                method='POST',
                endpoint='alert_records',
                data=alerts
            )

            logger.debug(f"Alert records posted successfully: {response}")
            return True

        except Exception as e:
            logger.error(f"Error posting alert records: {e}")
            return False

    async def update_device_heartbeat(self, heartbeat_data: Dict[str, Any]) -> bool:
        try:
            credentials = self.credential_manager.get_device_credentials()
            if not credentials:
                logger.error("No device credentials for heartbeat")
                return False

            logger.debug(f"Updating device heartbeat: {credentials.device_id}")

            response = await self._make_request(
                method='PATCH',
                endpoint=f'device_registry?device_id=eq.{credentials.device_id}',
                data=heartbeat_data
            )

            logger.debug(f"Heartbeat updated successfully: {response}")
            return True

        except Exception as e:
            logger.error(f"Error updating device heartbeat: {e}")
            return False

    async def get_agent_config(self) -> Optional[Dict[str, Any]]:
        try:
            credentials = self.credential_manager.get_device_credentials()
            if not credentials:
                logger.error("No device credentials for config fetch")
                return None

            logger.debug(f"Fetching agent config for device: {credentials.device_id}")

            response = await self._make_request(
                method='GET',
                endpoint=f'agent_config?device_id=eq.{credentials.device_id}&select=key,value'
            )

            config_dict = {}
            for item in response:
                config_dict[item['key']] = item['value']

            logger.debug(f"Agent config fetched: {len(config_dict)} items")
            return config_dict

        except Exception as e:
            logger.error(f"Error fetching agent config: {e}")
            return None

    async def check_connectivity(self) -> bool:
        try:
            await self._make_request(
                method='GET',
                endpoint='device_registry?select=device_id&limit=1'
            )

            logger.debug("Connectivity check successful")
            return True

        except Exception as e:
            logger.debug(f"Connectivity check failed: {e}")
            return False

    async def rotate_api_key(self) -> Optional[str]:
        try:
            logger.info("Rotating device API key")

            response = await self._make_request(
                method='POST',
                endpoint='rotate-api-key',
                data={}
            )

            new_api_key = response.get('api_key')
            if new_api_key:
                current_credentials = self.credential_manager.get_device_credentials()
                if current_credentials:
                    updated_credentials = DeviceCredentials(
                        device_id=current_credentials.device_id,
                        api_key=new_api_key
                    )
                    self.credential_manager.store_device_credentials(updated_credentials)
                    logger.info("API key rotated successfully")
                    return new_api_key
                else:
                    logger.error("No current credentials found for rotation")
                    return None
            else:
                logger.error("No API key in rotation response")
                return None

        except Exception as e:
            logger.error(f"Error rotating API key: {e}")
            return None

    async def sync_telemetry_events(self, events: list[Dict[str, Any]]) -> Dict[str, Any]:
        try:
            if not events:
                return {"synced": 0, "failed": 0}

            batch_size = 100
            synced_count = 0
            failed_count = 0

            for i in range(0, len(events), batch_size):
                batch = events[i:i + batch_size]

                try:
                    success = await self.post_telemetry_events(batch)
                    if success:
                        synced_count += len(batch)
                    else:
                        failed_count += len(batch)

                except Exception as e:
                    logger.error(f"Batch sync failed: {e}")
                    failed_count += len(batch)

                if i + batch_size < len(events):
                    await asyncio.sleep(0.1)

            result = {
                "synced": synced_count,
                "failed": failed_count,
                "total": len(events)
            }

            logger.info(f"Telemetry sync completed: {result}")
            return result

        except Exception as e:
            logger.error(f"Error in telemetry sync: {e}")
            return {"synced": 0, "failed": len(events), "total": len(events)}

    async def sync_anomaly_scores(self, scores: list[Dict[str, Any]]) -> Dict[str, Any]:
        try:
            if not scores:
                return {"synced": 0, "failed": 0}

            batch_size = 50
            synced_count = 0
            failed_count = 0

            for i in range(0, len(scores), batch_size):
                batch = scores[i:i + batch_size]

                try:
                    success = await self.post_anomaly_scores(batch)
                    if success:
                        synced_count += len(batch)
                    else:
                        failed_count += len(batch)

                except Exception as e:
                    logger.error(f"Batch sync failed: {e}")
                    failed_count += len(batch)

                if i + batch_size < len(scores):
                    await asyncio.sleep(0.1)

            result = {
                "synced": synced_count,
                "failed": failed_count,
                "total": len(scores)
            }

            logger.info(f"Anomaly scores sync completed: {result}")
            return result

        except Exception as e:
            logger.error(f"Error in anomaly scores sync: {e}")
            return {"synced": 0, "failed": len(scores), "total": len(scores)}

    async def sync_alert_records(self, alerts: list[Dict[str, Any]]) -> Dict[str, Any]:
        try:
            if not alerts:
                return {"synced": 0, "failed": 0}

            batch_size = 25
            synced_count = 0
            failed_count = 0

            for i in range(0, len(alerts), batch_size):
                batch = alerts[i:i + batch_size]

                try:
                    success = await self.post_alert_records(batch)
                    if success:
                        synced_count += len(batch)
                    else:
                        failed_count += len(batch)

                except Exception as e:
                    logger.error(f"Batch sync failed: {e}")
                    failed_count += len(batch)

                if i + batch_size < len(alerts):
                    await asyncio.sleep(0.1)

            result = {
                "synced": synced_count,
                "failed": failed_count,
                "total": len(alerts)
            }

            logger.info(f"Alert records sync completed: {result}")
            return result

        except Exception as e:
            logger.error(f"Error in alert records sync: {e}")
            return {"synced": 0, "failed": len(alerts), "total": len(alerts)}
