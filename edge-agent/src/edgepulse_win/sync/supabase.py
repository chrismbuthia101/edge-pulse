"""
Supabase Sync Client for EdgePulse
"""

import httpx
from datetime import datetime
from typing import Any, Dict, List, Optional
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from edgepulse_win.utils.log_handler import get_logger
from edgepulse_win.utils.device_id import get_default_device_id
from edgepulse_win.utils.error_handler import (
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
        self.supabase_key = supabase_key  # may legitimately be None

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
            headers["X-EdgePulse-Api-Key"] = self.api_key
        elif self.supabase_key:
            headers["apikey"] = self.supabase_key
            headers["Authorization"] = f"Bearer {self.supabase_key}"

        self.client = httpx.AsyncClient(
            timeout=httpx.Timeout(self.timeout),
            headers=headers,
        )

        await self.check_connectivity()
        logger.info("async_supabase_client_initialized", online=self._online)

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
        """Check connectivity to Supabase.

        Uses device-auth headers when available; falls back to apikey
        when supabase_key is set; tolerates missing key gracefully.
        """
        if not self.enabled or not self.client:
            return False

        try:
            # Build per-request headers – only add apikey if we have one
            extra_headers: Dict[str, str] = {}
            if self.supabase_key:
                extra_headers["apikey"] = self.supabase_key

            response = await self.client.get(
                f"{self.supabase_url}/rest/v1/",
                headers=extra_headers,
            )

            # 200 = open access, 401 = service reachable but auth required
            self._online = response.status_code in (200, 401)
            self._last_health_check = datetime.utcnow()

            if self._online:
                logger.debug("supabase_connectivity_check_success")
            else:
                logger.warning(
                    "supabase_connectivity_check_failed",
                    status=response.status_code,
                )

            return self._online

        except Exception as e:
            self._online = False
            logger.error("supabase_connectivity_error", error=str(e))
            raise NetworkError(f"Supabase connectivity failed: {e}") from e

    async def is_online(self) -> bool:
        """Check if currently online (cached for 30 s)."""
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
    # Sync helpers – called by SyncFSM._sync_item
    # ------------------------------------------------------------------

    async def sync_telemetry_events(
        self, records: List[Dict[str, Any]]
    ) -> bool:
        """Upload telemetry event records to Supabase."""
        return await self.batch_sync_telemetry(records)

    async def sync_alert_records(
        self, records: List[Dict[str, Any]]
    ) -> bool:
        """Upload alert records to Supabase."""
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
        """Batch upload alerts with retry logic"""
        if not alerts:
            return True

        if not await self.is_online():
            raise NetworkError("Supabase is offline")

        try:
            payload = [self._prepare_alert(alert) for alert in alerts]

            response = await self.client.post(
                f"{self.supabase_url}/rest/v1/alerts",
                json=payload,
                headers={"Prefer": "return=minimal"},
            )

            if response.status_code == 201:
                logger.info("alerts_synced_successfully", count=len(alerts))
                return True
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
                    response=response.text[:200],
                )
                raise NetworkError(f"HTTP {response.status_code}: {response.text[:200]}")

        except httpx.RequestError as e:
            logger.error("alerts_sync_network_error", error=str(e))
            raise NetworkError(f"Network error during alert sync: {e}") from e
        except (AuthenticationError, NetworkError):
            raise
        except Exception as e:
            logger.error("alerts_sync_error", error=str(e))
            raise SyncError(f"Alert sync failed: {e}") from e

    async def sync_single_alert(self, alert: Dict[str, Any]) -> bool:
        """Sync a single alert."""
        return await self.batch_sync_alerts([alert])

    # ------------------------------------------------------------------
    # Telemetry sync
    # ------------------------------------------------------------------

    async def batch_sync_telemetry(
        self, telemetry_data: List[Dict[str, Any]]
    ) -> bool:
        """Batch upload telemetry data."""
        if not telemetry_data:
            return True

        if not await self.is_online():
            raise NetworkError("Supabase is offline")

        try:
            payload = [self._prepare_telemetry(d) for d in telemetry_data]

            response = await self.client.post(
                f"{self.supabase_url}/rest/v1/telemetry",
                json=payload,
                headers={"Prefer": "return=minimal"},
            )

            if response.status_code == 201:
                logger.info("telemetry_synced_successfully", count=len(telemetry_data))
                return True
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
    # Device heartbeat – accepts a flat dict with device_id inside
    # ------------------------------------------------------------------

    async def update_device_heartbeat(
        self,
        heartbeat_data: Dict[str, Any],
    ) -> bool:
        """Update device heartbeat / status.

        Accepts a dict that may contain device_id or falls back to
        self.device_id so both old and new call-sites work.
        """
        if not await self.is_online():
            return False

        try:
            target_device_id = heartbeat_data.get("device_id") or self.device_id

            payload = {
                "id": target_device_id,
                "last_seen": datetime.utcnow().isoformat(),
                "status": heartbeat_data.get("status", "online"),
                "cpu_usage": heartbeat_data.get("cpu_usage"),
                "memory_usage": heartbeat_data.get("memory_usage"),
                "alerts_count": heartbeat_data.get("alerts_count", 0),
                "version": heartbeat_data.get("version"),
            }

            response = await self.client.post(
                f"{self.supabase_url}/rest/v1/device_registry",
                json=payload,
                headers={"Prefer": "resolution=merge-duplicates"},
            )

            return response.status_code in (201, 204)

        except Exception as e:
            logger.error(
                "update_device_heartbeat_error",
                device_id=self.device_id,
                error=str(e),
            )
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
            url = (
                f"{self.supabase_url}/rest/v1/alerts"
                f"?acknowledged=eq.false&order=timestamp.desc&limit={limit}"
            )
            if device_id:
                url += f"&device_id=eq.{device_id}"

            response = await self.client.get(url)
            if response.status_code == 200:
                return response.json()
            else:
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
                f"{self.supabase_url}/rest/v1/alerts?id=eq.{alert_id}",
                json={
                    "acknowledged": True,
                    "acknowledged_at": datetime.utcnow().isoformat(),
                },
            )
            return response.status_code == 204

        except Exception as e:
            logger.error("acknowledge_alert_error", alert_id=alert_id, error=str(e))
            return False

    async def get_device_status(
        self, device_id: str
    ) -> Optional[Dict[str, Any]]:
        if not await self.is_online():
            return None

        try:
            response = await self.client.get(
                f"{self.supabase_url}/rest/v1/devices?id=eq.{device_id}"
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
                self._last_health_check.isoformat()
                if self._last_health_check
                else None
            ),
            "timeout": self.timeout,
            "max_retries": self.max_retries,
        }

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _prepare_alert(self, alert: Dict[str, Any]) -> Dict[str, Any]:
        explanation = alert.get("explanation_json") or alert.get("explanation") or {}
        agent_version = (
            alert.get("agent_version")
            or alert.get("collection_agent_version")
            or "unknown"
        )
        return {
            "score_id":                   alert.get("score_id") or alert.get("anomaly_score_id"),
            "device_id":                  alert.get("device_id"),
            "device_name":                alert.get("device_name", ""),
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
            "explanation_json":           explanation,
            "status":                     "PENDING",
            "read":                       False,
            "net_destination_ip":         alert.get("net_destination_ip"),
            "net_destination_port":       alert.get("net_destination_port"),
            "net_protocol":               alert.get("net_protocol"),
            "proc_name":                  alert.get("proc_name"),
            "proc_privilege_level":       alert.get("proc_privilege_level"),
            "proc_pid":                   alert.get("proc_pid"),
        }

    def _prepare_telemetry(self, telemetry: Dict[str, Any]) -> Dict[str, Any]:
        """Prepare compressed telemetry payload for Supabase."""
        cpu = telemetry.get("cpu") or {}
        memory = telemetry.get("memory") or {}
        disk = telemetry.get("disk") or {}

        return {
            "device_id": telemetry.get("device_id") or self.device_id,
            "timestamp": telemetry.get("timestamp"),
            "cpu_percent": cpu.get("cpu_percent_total") or cpu.get("percent", 0),
            "memory_percent": memory.get("memory_percent") or memory.get("percent", 0),
            "disk_usage": disk.get("disk_percent") or disk.get("usage_percent", 0),
            "process_count": len(telemetry.get("processes", [])),
            "network_connections": len(
                telemetry.get("network_connections", [])
            ),
            "event_type": telemetry.get("event_type"),
            "payload_hash": telemetry.get("payload_hash"),
        }