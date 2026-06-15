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
from edgepulse.utils.integrity import compute_integrity_hash
from edgepulse.utils.device import get_default_device_id
from edgepulse.utils.error_handler import (
    AuthenticationError,
    NetworkError,
    SyncError,
)

logger = get_logger(__name__)

class CloudSync:

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
        if not self.enabled:
            logger.info("supabase_sync_disabled")
            return

        headers: Dict[str, str] = {
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        }

        if self.supabase_key:
            headers["apikey"] = self.supabase_key
            headers["Authorization"] = f"Bearer {self.supabase_key}"

        if self.device_id and self.api_key:
            headers["X-EdgePulse-Device-Id"] = self.device_id
            headers["X-EdgePulse-Api-Key"] = self.api_key

        self.client = httpx.AsyncClient(
            timeout=httpx.Timeout(self.timeout),
            headers=headers,
        )

        await self.check_connectivity()
        logger.info("async_supabase_client_initialized", online=self._online)

    async def close(self) -> None:
        if self.client:
            await self.client.aclose()
            self.client = None
            logger.info("async_supabase_client_closed")

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type(NetworkError),
    )
    async def check_connectivity(self) -> bool:
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
        if not self.enabled:
            return False
        if (
            self._online
            and self._last_health_check
            and (datetime.utcnow() - self._last_health_check).total_seconds() < 30
        ):
            return True
        return await self.check_connectivity()

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
                    logger.info(
                        "alerts_synced_successfully",
                        count=result.get("alerts_synced", len(alerts)),
                    )
                    return True
                else:
                    logger.error("alerts_sync_failed", error=result.get("error"))
                    return False

            elif response.status_code == 401:
                logger.critical(
                    "authentication_failure",
                    device_id=self.device_id,
                    status=response.status_code,
                    has_api_key=bool(self.api_key),
                    has_supabase_key=bool(self.supabase_key),
                    has_device_id=bool(self.device_id),
                )
                raise AuthenticationError(
                    "Device authentication failed – credentials may be invalid or expired. "
                    f"Device ID: {self.device_id}, Has API Key: {bool(self.api_key)}"
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
                    logger.info(
                        "telemetry_synced_successfully",
                        count=result.get("telemetry_synced", len(telemetry_data)),
                    )
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

    async def sync_health_snapshots(self, snapshots: List[Dict[str, Any]]) -> bool:
        if not snapshots:
            return True
        if not await self.is_online():
            raise NetworkError("Supabase is offline")

        try:
            prepared_snapshots = [self._prepare_health_snapshot(s) for s in snapshots]

            response = await self.client.post(
                f"{self.supabase_url}/functions/v1/sync-device-data",
                json={"health_snapshots": prepared_snapshots},
            )

            if response.status_code == 200:
                result = response.json()
                if result.get("success"):
                    logger.info(
                        "health_snapshots_synced",
                        count=result.get("health_snapshots_synced", len(snapshots)),
                    )
                    return True
                else:
                    logger.error("health_snapshot_sync_failed", error=result.get("error"))
                    return False
            else:
                logger.error(
                    "health_snapshot_sync_failed",
                    status=response.status_code,
                    response=response.text[:200],
                )
                return False

        except Exception as e:
            logger.error("health_snapshot_sync_error", error=str(e))
            return False

    def _prepare_alert(self, alert: Dict[str, Any]) -> Dict[str, Any]:
        explanation = alert.get("explanation_json") or alert.get("explanation") or {}
        raw_source = alert.get("telemetry_source", "PROCESS")
        valid_sources = {"PROCESS", "NETWORK", "FILE", "RESOURCE"}
        prepared = {
            "anomaly_score_id":         alert.get("score_id") or alert.get("anomaly_score_id"),
            "device_id":                alert.get("device_id") or self.device_id,
            "telemetry_event_id":       alert.get("telemetry_event_id"),
            "feature_vector_id":        alert.get("feature_vector_id"),
            "telemetry_source":         raw_source if raw_source in valid_sources else "PROCESS",
            "title":                    alert.get("title", "Anomaly Detected"),
            "description":              alert.get("description"),
            "severity":                 alert.get("severity", "medium"),
            "category":                 alert.get("category", "Unknown"),
            "anomaly_score":            alert.get("anomaly_score", 0.0),
            "confidence":               alert.get("confidence", 0.0),
            "alert_type":               alert.get("alert_type"),
            "detector_type":            alert.get("detector_type"),
            "model_id":                 alert.get("model_id", "unknown"),
            "inference_latency_ms":     alert.get("inference_latency_ms", 0),
            "detection_window_start":   alert.get("detection_window_start"),
            "detection_window_end":     alert.get("detection_window_end"),
            "explanation_json":         explanation,
            "status":                   "PENDING",
            "read":                     alert.get("read") is True,
            "net_destination_ip":       alert.get("net_destination_ip"),
            "net_destination_port":     alert.get("net_destination_port"),
            "net_protocol":             alert.get("net_protocol"),
            "net_duration_ms":          alert.get("net_duration_ms"),
            "proc_name":                alert.get("proc_name"),
            "proc_privilege_level":     alert.get("proc_privilege_level"),
            "proc_pid":                 alert.get("proc_pid"),
            "created_at":               alert.get("created_at"),
        }
        if self.api_key:
            prepared["integrity_hash"] = compute_integrity_hash(self.api_key, prepared)
        return prepared

    def _prepare_telemetry(self, telemetry: Dict[str, Any]) -> Dict[str, Any]:
        raw_source = telemetry.get("event_type") or telemetry.get("source", "PROCESS")
        valid_sources = {"PROCESS", "NETWORK", "FILE", "RESOURCE"}
        prepared = {
            "device_id":                telemetry.get("device_id") or self.device_id,
            "collected_at":             telemetry.get("timestamp") or telemetry.get("collected_at"),
            "source":                   raw_source if raw_source in valid_sources else "RESOURCE",
            "payload":                  telemetry.get("payload") or telemetry,
            "connectivity_state":       telemetry.get("connectivity_state", "online"),
            "payload_hash":             telemetry.get("payload_hash", ""),
        }
        if self.api_key:
            prepared["integrity_hash"] = compute_integrity_hash(self.api_key, prepared)
        return prepared

    def _prepare_health_snapshot(self, snapshot: Dict[str, Any]) -> Dict[str, Any]:
        prepared = {
            "device_id":            snapshot.get("device_id") or self.device_id,
            "status":               snapshot.get("status", "ONLINE"),
            "cpu_usage":            snapshot.get("cpu_usage") or snapshot.get("cpu_percent"),
            "memory_usage":         snapshot.get("memory_usage") or snapshot.get("memory_percent"),
            "disk_usage":           snapshot.get("disk_usage"),
            "network_status":       snapshot.get("network_status", True),
            "alerts_last_24h":      snapshot.get("alerts_last_24h", 0),
            "uptime_percentage":    snapshot.get("uptime_percentage", 100.0),
            "response_time_ms":     snapshot.get("response_time_ms", 0),
            "error_count":          snapshot.get("error_count", 0),
            "warning_count":        snapshot.get("warning_count", 0),
            "last_restart":         snapshot.get("last_restart"),
            "created_at":           snapshot.get("created_at"),
        }
        if self.api_key:
            prepared["integrity_hash"] = compute_integrity_hash(self.api_key, prepared)
        return prepared
