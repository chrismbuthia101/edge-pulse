"""
Supabase Sync Client for EdgePulse
"""

import hashlib
import httpx
from datetime import datetime
from typing import Any, Dict, List, Optional
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from edgepulse.utils.log_handler import get_logger
from edgepulse.utils.device_id import get_default_device_id, get_device_name
from edgepulse.utils.error_handler import (
    AuthenticationError,
    NetworkError,
    SyncError,
)

logger = get_logger(__name__)


class SupabaseSync:
    """Async Supabase sync client with device authentication"""

    def __init__(
        self,
        supabase_url: str,
        supabase_key: Optional[str] = None,
        device_id: Optional[str] = None,
        api_key: Optional[str] = None,
        enabled: bool = True,
        timeout: float = 10.0,
        max_retries: int = 3,
    ):
        self.supabase_url = supabase_url.rstrip("/")
        self.supabase_key = supabase_key

        if device_id is None:
            device_id = get_default_device_id()
            logger.info(f"Using hostname-based device ID: {device_id}")

        self.device_id = device_id
        self.api_key = api_key
        self.enabled = enabled
        self.timeout = timeout
        self.max_retries = max_retries

        self.client: Optional[httpx.AsyncClient] = None
        self._online = False
        self._last_health_check: Optional[datetime] = None

        logger.info(
            "async_supabase_sync_initialized",
            enabled=enabled,
            has_device_auth=bool(device_id and api_key),
        )

    async def initialize(self) -> None:
        """Initialize the async HTTP client"""
        if not self.enabled:
            logger.info("supabase_sync_disabled")
            return

        headers: Dict[str, str] = {
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        }

        if self.device_id and self.api_key:
            headers["X-EdgePulse-Device-Id"] = self.device_id
            headers["X-EdgePulse-Api-Key"] = self._hash_api_key(self.api_key, self.device_id)
        elif self.supabase_key:
            headers["apikey"] = self.supabase_key
            headers["Authorization"] = f"Bearer {self.supabase_key}"

        self.client = httpx.AsyncClient(
            timeout=httpx.Timeout(self.timeout),
            headers=headers,
        )

        await self.check_connectivity()
        logger.info("async_supabase_client_initialized", online=self._online)

    def _hash_api_key(self, api_key: str, device_id: str) -> str:
        """Hash API key matching the backend's hash algorithm"""
        hash_input = f"{api_key}ep-v1-{device_id}"
        return hashlib.sha256(hash_input.encode()).hexdigest()

    async def close(self) -> None:
        """Close the async client"""
        if self.client:
            await self.client.aclose()
            self.client = None
            logger.info("async_supabase_client_closed")

    # ------------------------------------------------------------------
    # Connectivity
    # ------------------------------------------------------------------

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type(NetworkError),
    )
    async def check_connectivity(self) -> bool:
        """Check connectivity to Supabase."""
        if not self.enabled or not self.client:
            return False

        try:
            extra_headers: Dict[str, str] = {}
            if self.supabase_key:
                extra_headers["apikey"] = self.supabase_key

            response = await self.client.get(
                f"{self.supabase_url}/rest/v1/",
                headers=extra_headers,
            )

            self._online = response.status_code in (200, 401)
            self._last_health_check = datetime.utcnow()

            if self._online:
                logger.debug("supabase_connectivity_check_success")
            else:
                logger.warning("supabase_connectivity_check_failed", status=response.status_code)

            return self._online

        except Exception as e:
            self._online = False
            logger.error("supabase_connectivity_error", error=str(e))
            raise NetworkError(f"Supabase connectivity failed: {e}") from e

    async def is_online(self) -> bool:
        if not self.enabled:
            return False
        if (
            self._online
            and self._last_health_check
            and (datetime.utcnow() - self._last_health_check).total_seconds() < 30
        ):
            return True
        return await self.check_connectivity()

    # ------------------------------------------------------------------
    # Public sync façade methods (called by SyncFSM._sync_item)
    # ------------------------------------------------------------------

    async def sync_telemetry_events(self, records: List[Dict[str, Any]]) -> bool:
        return await self.batch_sync_telemetry(records)

    async def sync_alert_records(self, records: List[Dict[str, Any]]) -> bool:
        return await self.batch_sync_alerts(records)

    # ------------------------------------------------------------------
    # Alert sync
    # ------------------------------------------------------------------

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=30),
        retry=retry_if_exception_type(NetworkError),
    )
    async def batch_sync_alerts(self, alerts: List[Dict[str, Any]]) -> bool:
        if not alerts:
            return True
        if not await self.is_online():
            raise NetworkError("Supabase is offline")

        try:
            prepared_alerts = [self._prepare_alert(alert) for alert in alerts]

            response = await self.client.post(
                f"{self.supabase_url}/functions/v1/sync-device-data",
                json={"alerts": prepared_alerts},
            )

            if response.status_code == 200:
                result = response.json()
                if result.get("success"):
                    logger.info("alerts_synced_successfully", count=result.get("alerts_synced", len(alerts)))
                    return True
                else:
                    logger.error("alerts_sync_failed", error=result.get("error"))
                    return False
            elif response.status_code == 401:
                logger.critical(
                    "authentication_failure",
                    device_id=self.device_id,
                    status=response.status_code,
                )
                raise AuthenticationError(
                    "Device authentication failed – credentials may be invalid or expired"
                )
            else:
                logger.error(
                    "alerts_sync_failed",
                    status=response.status_code,
                    response_body=response.text[:500],
                    payload_sample=str(prepared_alerts[0])[:200] if prepared_alerts else "",
                )
                raise NetworkError(f"HTTP {response.status_code}: {response.text[:500]}")

        except httpx.RequestError as e:
            logger.error("alerts_sync_network_error", error=str(e))
            raise NetworkError(f"Network error during alert sync: {e}") from e
        except (AuthenticationError, NetworkError):
            raise
        except Exception as e:
            logger.error("alerts_sync_error", error=str(e))
            raise SyncError(f"Alert sync failed: {e}") from e

    async def sync_single_alert(self, alert: Dict[str, Any]) -> bool:
        return await self.batch_sync_alerts([alert])

    # ------------------------------------------------------------------
    # Telemetry sync — POSTs to /functions/v1/sync-device-data
    # ------------------------------------------------------------------

    async def batch_sync_telemetry(self, telemetry_data: List[Dict[str, Any]]) -> bool:
        if not telemetry_data:
            return True
        if not await self.is_online():
            raise NetworkError("Supabase is offline")

        try:
            prepared_telemetry = [self._prepare_telemetry(d) for d in telemetry_data]

            response = await self.client.post(
                f"{self.supabase_url}/functions/v1/sync-device-data",
                json={"telemetry": prepared_telemetry},
            )

            if response.status_code == 200:
                result = response.json()
                if result.get("success"):
                    logger.info("telemetry_synced_successfully", count=result.get("telemetry_synced", len(telemetry_data)))
                    return True
                else:
                    logger.error("telemetry_sync_failed", error=result.get("error"))
                    return False
            else:
                logger.error(
                    "telemetry_sync_failed",
                    status=response.status_code,
                    response=response.text[:200],
                )
                return False

        except Exception as e:
            logger.error("telemetry_sync_error", error=str(e))
            return False

    # ------------------------------------------------------------------
    # Device heartbeat — POSTs to /functions/v1/sync-device-data
    # ------------------------------------------------------------------

    async def update_device_heartbeat(self, heartbeat_data: Dict[str, Any]) -> bool:
        if not await self.is_online():
            return False

        try:
            target_device_id = heartbeat_data.get("device_id") or self.device_id

            # Prepare heartbeat for Edge Function
            heartbeat_payload = {
                "device_id":         target_device_id,
                "name":              heartbeat_data.get("name") or get_device_name(),
                "status":            heartbeat_data.get("status", "online"),
                "risk":              heartbeat_data.get("risk", "none"),
                "cpu_percent":       heartbeat_data.get("cpu_usage") or heartbeat_data.get("cpu_percent"),
                "ram_percent":       heartbeat_data.get("memory_usage") or heartbeat_data.get("ram_percent"),
                "sync_queue_depth":  heartbeat_data.get("sync_queue_depth", 0),
                "alerts_count":      heartbeat_data.get("alerts_count", 0),
                "agent_version":     heartbeat_data.get("version") or heartbeat_data.get("agent_version", "unknown"),
                "hash_chain_ok":     heartbeat_data.get("hash_chain_ok", True),
            }

            response = await self.client.post(
                f"{self.supabase_url}/functions/v1/sync-device-data",
                json={"heartbeat": heartbeat_payload},
            )

            if response.status_code == 200:
                result = response.json()
                return result.get("success") and result.get("heartbeat_updated")
            return False

        except Exception as e:
            logger.error("update_device_heartbeat_error", device_id=self.device_id, error=str(e))
            return False

    # ------------------------------------------------------------------
    # Utility queries
    # ------------------------------------------------------------------

    async def get_unacknowledged_alerts(
        self, device_id: Optional[str] = None, limit: int = 100
    ) -> List[Dict[str, Any]]:
        if not await self.is_online():
            return []
        try:
            # Query alert_records with status filter
            url = (
                f"{self.supabase_url}/rest/v1/alert_records"
                f"?status=eq.PENDING&order=created_at.desc&limit={limit}"
            )
            if device_id:
                url += f"&device_id=eq.{device_id}"
            response = await self.client.get(url)
            if response.status_code == 200:
                return response.json()
            logger.error("get_alerts_failed", status=response.status_code)
            return []
        except Exception as e:
            logger.error("get_alerts_error", error=str(e))
            return []

    async def acknowledge_alert(self, alert_id: str) -> bool:
        if not await self.is_online():
            return False
        try:
            response = await self.client.patch(
                f"{self.supabase_url}/rest/v1/alert_records?alert_id=eq.{alert_id}",
                json={
                    "status": "ACKNOWLEDGED",
                    "acknowledged_at": datetime.utcnow().isoformat(),
                },
            )
            return response.status_code == 204
        except Exception as e:
            logger.error("acknowledge_alert_error", alert_id=alert_id, error=str(e))
            return False

    async def get_device_status(self, device_id: str) -> Optional[Dict[str, Any]]:
        if not await self.is_online():
            return None
        try:
            response = await self.client.get(
                f"{self.supabase_url}/rest/v1/device_registry?id=eq.{device_id}"
            )
            if response.status_code == 200:
                data = response.json()
                return data[0] if data else None
            return None
        except Exception as e:
            logger.error("get_device_status_error", device_id=device_id, error=str(e))
            return None

    def get_sync_statistics(self) -> Dict[str, Any]:
        return {
            "enabled": self.enabled,
            "online": self._online,
            "last_health_check": (
                self._last_health_check.isoformat() if self._last_health_check else None
            ),
            "timeout": self.timeout,
            "max_retries": self.max_retries,
        }

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _prepare_alert(self, alert: Dict[str, Any]) -> Dict[str, Any]:
        """Map agent alert dict to alert_records column names."""
        explanation = alert.get("explanation_json") or alert.get("explanation") or {}
        agent_version = (
            alert.get("agent_version")
            or alert.get("collection_agent_version")
            or "unknown"
        )
        return {
            "anomaly_score_id":           alert.get("score_id") or alert.get("anomaly_score_id"),
            "device_id":                  alert.get("device_id") or self.device_id,
            "device_name":                alert.get("device_name") or get_device_name(),
            "telemetry_event_id":         alert.get("telemetry_event_id"),
            "feature_vector_id":          alert.get("feature_vector_id"),
            "telemetry_source":           alert.get("telemetry_source", "PROCESS"),
            "title":                      alert.get("title", "Anomaly Detected"),
            "description":                alert.get("description"),
            "severity":                   alert.get("severity", "medium"),
            "category":                   alert.get("category", "Unknown"),
            "anomaly_score":              alert.get("anomaly_score", 0.0),
            "confidence":                 alert.get("confidence", 0.0),
            "model_id":                   alert.get("model_id", "unknown"),
            "collection_agent_version":   agent_version,
            "inference_latency_ms":       alert.get("inference_latency_ms", 0),
            "detection_window_start":    alert.get("detection_window_start"),
            "detection_window_end":       alert.get("detection_window_end"),
            "detection_window_minutes":   alert.get("detection_window_minutes"),
            "explanation_json":           explanation,
            "status":                     "PENDING",
            "read":                       False,
            "net_destination_ip":         alert.get("net_destination_ip"),
            "net_destination_port":       alert.get("net_destination_port"),
            "net_protocol":               alert.get("net_protocol"),
            "net_duration_ms":            alert.get("net_duration_ms"),
            "proc_name":                  alert.get("proc_name"),
            "proc_privilege_level":       alert.get("proc_privilege_level"),
            "proc_pid":                   alert.get("proc_pid"),
        }

    def _prepare_telemetry(self, telemetry: Dict[str, Any]) -> Dict[str, Any]:
        """Map agent telemetry dict to telemetry_events column names."""
        cpu = telemetry.get("cpu") or {}
        memory = telemetry.get("memory") or {}

        return {
            "device_id":                  telemetry.get("device_id") or self.device_id,
            "collected_at":               telemetry.get("timestamp") or telemetry.get("collected_at"),
            "source":                     telemetry.get("event_type") or telemetry.get("source", "PROCESS"),
            "payload":                    telemetry.get("payload") or telemetry,
            "collection_agent_version":   telemetry.get("agent_version") or telemetry.get("collection_agent_version", "unknown"),
            "connectivity_state":         telemetry.get("connectivity_state", "online"),
            "payload_hash":               telemetry.get("payload_hash", ""),
        }