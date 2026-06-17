from datetime import datetime
from typing import Any, Dict, List, Optional

from edgepulse.utils.log_handler import get_logger
from edgepulse.utils.integrity import compute_integrity_hash
from edgepulse.auth.auth_client import EdgePulseClient
from edgepulse.utils.error_handler import (
    AuthenticationError,
    NetworkError,
    SyncError,
)

logger = get_logger(__name__)


class CloudSync:

    def __init__(self, client: EdgePulseClient):
        self.client = client
        self._online = False
        self._last_health_check: Optional[datetime] = None
        self._device_id: Optional[str] = None
        self._api_key: Optional[str] = None
        logger.info("cloud_sync_initialized")

    async def initialize(self) -> None:
        try:
            await self.check_connectivity()
        except Exception as e:
            logger.error("cloud_sync_init_failed", error=str(e))
            raise

    async def close(self) -> None:
        await self.client.close()
        logger.info("cloud_sync_closed")

    async def check_connectivity(self) -> bool:
        try:
            response = await self.client.get("")
            self._online = response.status_code in (200, 401)
            self._last_health_check = datetime.utcnow()
            return self._online
        except Exception as e:
            self._online = False
            logger.error("connectivity_check_failed", error=str(e))
            raise NetworkError(f"Connectivity check failed: {e}") from e

    async def is_online(self) -> bool:
        if (
            self._online
            and self._last_health_check
            and (datetime.utcnow() - self._last_health_check).total_seconds() < 30
        ):
            return True
        return await self.check_connectivity()

    async def batch_sync_alerts(self, alerts: List[Dict[str, Any]]) -> bool:
        if not alerts:
            return True
        if not await self.is_online():
            raise NetworkError("Supabase is offline")
        try:
            prepared = [self._prepare_alert(a) for a in alerts]
            response = await self.client.request(
                "POST",
                "sync-device-data",
                use_functions=True,
                json={"alerts": prepared},
            )
            if response.status_code == 200:
                result = response.json()
                if result.get("success"):
                    logger.info("alerts_synced", count=result.get("alerts_synced", len(alerts)))
                    return True
                logger.error("alerts_sync_failed", error=result.get("error"))
                return False
            elif response.status_code == 401:
                raise AuthenticationError("Device authentication failed")
            raise NetworkError(f"HTTP {response.status_code}: {response.text[:500]}")
        except (AuthenticationError, NetworkError):
            raise
        except Exception as e:
            logger.error("alerts_sync_error", error=str(e))
            raise SyncError(f"Alert sync failed: {e}") from e

    async def batch_sync_telemetry(self, telemetry: List[Dict[str, Any]]) -> bool:
        if not telemetry:
            return True
        if not await self.is_online():
            raise NetworkError("Supabase is offline")
        try:
            prepared = [self._prepare_telemetry(t) for t in telemetry]
            response = await self.client.request(
                "POST",
                "sync-device-data",
                use_functions=True,
                json={"telemetry": prepared},
            )
            if response.status_code == 200:
                result = response.json()
                if result.get("success"):
                    logger.info(
                        "telemetry_synced", count=result.get("telemetry_synced", len(telemetry))
                    )
                    return True
                logger.error("telemetry_sync_failed", error=result.get("error"))
                return False
            logger.error("telemetry_sync_failed", status=response.status_code)
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
            prepared = [self._prepare_health_snapshot(s) for s in snapshots]
            response = await self.client.request(
                "POST",
                "sync-device-data",
                use_functions=True,
                json={"health_snapshots": prepared},
            )
            if response.status_code == 200:
                result = response.json()
                if result.get("success"):
                    logger.info(
                        "health_snapshots_synced",
                        count=result.get("health_snapshots_synced", len(snapshots)),
                    )
                    return True
                logger.error("health_snapshot_sync_failed", error=result.get("error"))
                return False
            logger.error("health_snapshot_sync_failed", status=response.status_code)
            return False
        except Exception as e:
            logger.error("health_snapshot_sync_error", error=str(e))
            return False

    async def sync_heartbeat(self, heartbeat: Dict[str, Any]) -> Optional[bool]:
        if not await self.is_online():
            return None
        try:
            response = await self.client.request(
                "POST",
                "sync-device-data",
                use_functions=True,
                json={"heartbeat": heartbeat},
            )
            if response.status_code == 200:
                result = response.json()
                return result.get("heartbeat_updated", False)
            return False
        except Exception as e:
            logger.error("heartbeat_sync_error", error=str(e))
            return None

    async def sync_anomaly_scores(self, scores: List[Dict[str, Any]]) -> bool:
        if not scores:
            return True
        if not await self.is_online():
            raise NetworkError("Supabase is offline")
        try:
            prepared = [self._prepare_anomaly_score(s) for s in scores]
            response = await self.client.request(
                "POST",
                "sync-device-data",
                use_functions=True,
                json={"anomaly_scores": prepared},
            )
            if response.status_code == 200:
                result = response.json()
                if result.get("success"):
                    logger.info(
                        "anomaly_scores_synced",
                        count=result.get("anomaly_scores_synced", len(scores)),
                    )
                    return True
                logger.error("anomaly_scores_sync_failed", error=result.get("error"))
                return False
            logger.error("anomaly_scores_sync_failed", status=response.status_code)
            return False
        except Exception as e:
            logger.error("anomaly_scores_sync_error", error=str(e))
            return False

    async def sync_feature_vectors(self, feature_vectors: List[Dict[str, Any]]) -> bool:
        if not feature_vectors:
            return True
        if not await self.is_online():
            raise NetworkError("Supabase is offline")
        try:
            prepared = [self._prepare_feature_vector(fv) for fv in feature_vectors]
            response = await self.client.request(
                "POST",
                "sync-device-data",
                use_functions=True,
                json={"feature_vectors": prepared},
            )
            if response.status_code == 200:
                result = response.json()
                if result.get("success"):
                    logger.info(
                        "feature_vectors_synced",
                        count=result.get("feature_vectors_synced", len(feature_vectors)),
                    )
                    return True
                logger.error("feature_vectors_sync_failed", error=result.get("error"))
                return False
            logger.error("feature_vectors_sync_failed", status=response.status_code)
            return False
        except Exception as e:
            logger.error("feature_vectors_sync_error", error=str(e))
            return False

    def _prepare_alert(self, alert: Dict[str, Any]) -> Dict[str, Any]:
        explanation = alert.get("explanation_json") or alert.get("explanation") or {}
        raw_source = alert.get("telemetry_source", "PROCESS")
        valid_sources = {"PROCESS", "NETWORK", "FILE", "RESOURCE"}
        prepared: Dict[str, Any] = {
            "anomaly_score_id": alert.get("score_id") or alert.get("anomaly_score_id"),
            "telemetry_event_id": alert.get("telemetry_event_id"),
            "feature_vector_id": alert.get("feature_vector_id"),
            "anomaly_score": alert.get("anomaly_score", 0.0),
            "model_id": alert.get("model_id", "unknown"),
            "inference_latency_ms": alert.get("inference_latency_ms", 0),
            "telemetry_source": raw_source if raw_source in valid_sources else "PROCESS",
            "title": alert.get("title", "Anomaly Detected"),
            "description": alert.get("description"),
            "severity": alert.get("severity", "medium"),
            "category": alert.get("category", "Unknown"),
            "alert_type": alert.get("alert_type"),
            "detector_type": alert.get("detector_type"),
            "confidence": alert.get("confidence", 0.0),
            "detection_window_start": alert.get("detection_window_start"),
            "detection_window_end": alert.get("detection_window_end"),
            "explanation_json": explanation,
            "status": "PENDING",
            "read": alert.get("read") is True,
            "net_destination_ip": alert.get("net_destination_ip"),
            "net_destination_port": alert.get("net_destination_port"),
            "net_protocol": alert.get("net_protocol"),
            "net_duration_ms": alert.get("net_duration_ms"),
            "proc_name": alert.get("proc_name"),
            "proc_privilege_level": alert.get("proc_privilege_level"),
            "proc_pid": alert.get("proc_pid"),
            "created_at": alert.get("created_at"),
        }
        api_key = self._get_api_key()
        if api_key:
            prepared["integrity_hash"] = compute_integrity_hash(
                api_key, prepared, record_type="alert"
            )
        return prepared

    def _prepare_telemetry(self, telemetry: Dict[str, Any]) -> Dict[str, Any]:
        raw_source = telemetry.get("event_type") or telemetry.get("source", "PROCESS")
        valid_sources = {"PROCESS", "NETWORK", "FILE", "RESOURCE"}
        prepared: Dict[str, Any] = {
            "collected_at": telemetry.get("timestamp") or telemetry.get("collected_at"),
            "source": raw_source if raw_source in valid_sources else "RESOURCE",
            "payload": telemetry.get("payload") or telemetry,
            "connectivity_state": telemetry.get("connectivity_state", "online"),
            "payload_hash": telemetry.get("payload_hash", ""),
        }
        api_key = self._get_api_key()
        if api_key:
            prepared["integrity_hash"] = compute_integrity_hash(
                api_key, prepared, record_type="telemetry"
            )
        return prepared

    def _prepare_health_snapshot(self, snapshot: Dict[str, Any]) -> Dict[str, Any]:
        prepared: Dict[str, Any] = {
            "status": snapshot.get("status", "ONLINE"),
            "cpu_usage": snapshot.get("cpu_usage") or snapshot.get("cpu_percent"),
            "memory_usage": snapshot.get("memory_usage") or snapshot.get("memory_percent"),
            "disk_usage": snapshot.get("disk_usage"),
            "network_status": snapshot.get("network_status", True),
            "alerts_last_24h": snapshot.get("alerts_last_24h", 0),
            "uptime_percentage": snapshot.get("uptime_percentage", 100.0),
            "response_time_ms": snapshot.get("response_time_ms", 0),
            "error_count": snapshot.get("error_count", 0),
            "warning_count": snapshot.get("warning_count", 0),
            "last_restart": snapshot.get("last_restart"),
            "created_at": snapshot.get("created_at"),
        }
        api_key = self._get_api_key()
        if api_key:
            prepared["integrity_hash"] = compute_integrity_hash(
                api_key, prepared, record_type="health_snapshot"
            )
        return prepared

    def _prepare_anomaly_score(self, score: Dict[str, Any]) -> Dict[str, Any]:
        prepared: Dict[str, Any] = {
            "feature_vector_id": score.get("feature_vector_id"),
            "model_id": score.get("model_id", "unknown"),
            "score": score.get("score", 0.0),
            "label": score.get("label"),
            "threshold_applied": score.get("threshold_applied", 0.75),
            "above_threshold": score.get("above_threshold", False),
            "inference_latency_ms": score.get("inference_latency_ms", 0),
            "connectivity_state": score.get("connectivity_state", "online"),
            "scored_at": score.get("scored_at"),
            "created_at": score.get("created_at"),
        }
        api_key = self._get_api_key()
        if api_key:
            prepared["integrity_hash"] = compute_integrity_hash(
                api_key, prepared, record_type="anomaly_score"
            )
        return prepared

    def _prepare_feature_vector(self, fv: Dict[str, Any]) -> Dict[str, Any]:
        prepared: Dict[str, Any] = {
            "event_id": fv.get("event_id"),
            "computed_at": fv.get("computed_at"),
            "model_id": fv.get("model_id", "unknown"),
            "features": fv.get("features", {}),
            "feature_version": fv.get("feature_version", "v1.0"),
            "created_at": fv.get("created_at"),
        }
        api_key = self._get_api_key()
        if api_key:
            prepared["integrity_hash"] = compute_integrity_hash(
                api_key, prepared, record_type="feature_vector"
            )
        return prepared

    def _get_api_key(self) -> Optional[str]:
        if self._api_key:
            return self._api_key
        try:
            creds = self.client.credential_manager.get_device_credentials()
            if creds:
                self._api_key = creds.api_key
                self._device_id = creds.device_id
                return creds.api_key
        except Exception:
            pass
        return None
