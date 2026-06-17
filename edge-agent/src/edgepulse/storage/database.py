import aiosqlite
import hashlib
import json
import re
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from datetime import datetime, timedelta

from edgepulse.utils.log_handler import get_logger
from edgepulse.shared.schemas import (
    AlertEvent,
    TelemetryEvent,
    DetectionEvent,
    DeviceInfo,
    FeatureVector,
)

logger = get_logger(__name__)

_SCHEMA_FILE = Path(__file__).resolve().parent.parent.parent / "data" / "schema.sql"


class Database:
    """Async database connection whose schema is driven by the canonical schema.sql file."""

    def __init__(self, db_path: Path):
        self.db_path = db_path
        self._initialized = False
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        logger.info("db_manager_initialized", db_path=str(db_path))

    @staticmethod
    def _load_schema() -> Tuple[Dict[str, str], List[str]]:
        content = _SCHEMA_FILE.read_text(encoding="utf-8")
        content = re.sub(
            r"(?:'[^']*')|--.*$",
            lambda m: m.group(0) if m.group(0).startswith("'") else "",
            content,
            flags=re.MULTILINE,
        )

        statements = [s.strip() for s in content.split(";") if s.strip()]

        table_schemas: Dict[str, str] = {}
        auxiliary: List[str] = []

        for stmt in statements:
            upper = stmt.upper()
            if upper.startswith("CREATE TABLE"):
                m = re.search(r"CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(\w+)", upper)
                if m:
                    table_schemas[m.group(1).lower()] = stmt + ";"
            elif upper.startswith(("CREATE INDEX", "CREATE TRIGGER")):
                auxiliary.append(stmt + ";")

        return table_schemas, auxiliary

    async def initialize(self, tables: Optional[List[str]] = None) -> None:
        if self._initialized:
            return

        table_schemas, auxiliary = self._load_schema()

        async with self.connection() as conn:

            if tables is not None:
                lower_tables = [t.lower() for t in tables]
                for name in lower_tables:
                    ddl = table_schemas.get(name)
                    if ddl:
                        await conn.execute(ddl)
                        logger.debug("table_created", table=name)
                    else:
                        logger.warning("table_not_found_in_schema", table=name)
            else:
                for name, ddl in table_schemas.items():
                    await conn.execute(ddl)
                    logger.debug("table_created", table=name)
                for stmt in auxiliary:
                    await conn.execute(stmt)

            await conn.commit()
            self._initialized = True

        logger.info("database_initialized")

    @asynccontextmanager
    async def connection(self):
        async with aiosqlite.connect(self.db_path) as conn:
            conn.row_factory = aiosqlite.Row
            await conn.execute("PRAGMA foreign_keys = ON")
            await conn.execute("PRAGMA journal_mode = WAL")
            await conn.execute("PRAGMA synchronous = NORMAL")
            await conn.execute("PRAGMA busy_timeout = 30000")
            yield conn

    async def execute_query(self, query: str, params: Tuple = ()) -> List[Dict[str, Any]]:
        query_upper = query.strip().upper()
        is_select = query_upper.startswith("SELECT")

        async with self.connection() as conn:
            if is_select:
                async with conn.execute(query, params) as cursor:
                    rows = await cursor.fetchall()
                    return [dict(row) for row in rows]
            else:
                await conn.execute(query, params)
                await conn.commit()
                return []

    async def execute_update(self, query: str, params: Tuple = ()) -> int:
        async with self.connection() as conn:
            cursor = await conn.execute(query, params)
            await conn.commit()
            return cursor.rowcount or 0

    async def execute_many(self, query: str, params_list: List[Tuple]) -> None:
        async with self.connection() as conn:
            await conn.executemany(query, params_list)
            await conn.commit()

    async def insert_alert(self, alert: AlertEvent) -> int:
        severity_val = (
            alert.severity.value if hasattr(alert.severity, "value") else str(alert.severity)
        )

        query = """
            INSERT OR IGNORE INTO alerts (
                alert_id, timestamp, device_id, severity, anomaly_score,
                alert_type, detector_type, explanation_summary, feature_importance,
                data_json, acknowledged, acknowledged_at, acknowledged_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """
        params = (
            alert.alert_id,
            alert.timestamp,
            alert.device_id,
            severity_val,
            alert.anomaly_score,
            alert.alert_type,
            alert.detector_type,
            json.dumps(alert.explanation) if alert.explanation else None,
            json.dumps(alert.feature_importance) if alert.feature_importance else None,
            alert.model_dump_json(),
            1 if alert.acknowledged else 0,
            alert.acknowledged_at,
            alert.acknowledged_by,
        )
        async with self.connection() as conn:
            cursor = await conn.execute(query, params)
            await conn.commit()
            return cursor.lastrowid or 0

    async def get_recent_alerts(
        self,
        device_id: Optional[str] = None,
        hours: int = 24,
        limit: int = 100,
    ) -> List[Dict[str, Any]]:
        cutoff_time = (datetime.utcnow() - timedelta(hours=hours)).isoformat()
        query = "SELECT * FROM alerts WHERE timestamp >= ?"
        params: list = [cutoff_time]

        if device_id:
            query += " AND device_id = ?"
            params.append(device_id)

        query += " ORDER BY timestamp DESC LIMIT ?"
        params.append(limit)

        async with self.connection() as conn:
            async with conn.execute(query, params) as cursor:
                rows = await cursor.fetchall()
                return [dict(row) for row in rows]

    async def get_alerts(
        self,
        limit: int = 100,
        offset: int = 0,
        severity: Optional[str] = None,
        synced: Optional[int] = None,
        since: Optional[str] = None,
        device_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        conditions: List[str] = []
        params: List[Any] = []

        if since:
            conditions.append("timestamp >= ?")
            params.append(since)
        if severity:
            conditions.append("severity = ?")
            params.append(severity)
        if synced is not None:
            conditions.append("synced = ?")
            params.append(synced)
        if device_id:
            conditions.append("device_id = ?")
            params.append(device_id)

        where = " WHERE " + " AND ".join(conditions) if conditions else ""
        query = f"SELECT * FROM alerts{where} ORDER BY timestamp DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])

        async with self.connection() as conn:
            async with conn.execute(query, params) as cursor:
                rows = await cursor.fetchall()
                return [dict(row) for row in rows]

    async def get_alert_summary(self, device_id: Optional[str] = None) -> Dict[str, Any]:
        device_filter = " WHERE device_id = ?" if device_id else ""
        params: List[Any] = [device_id] if device_id else []

        count_query = f"SELECT COUNT(*) as total FROM alerts{device_filter}"
        severity_query = f"""
            SELECT severity, COUNT(*) as count FROM alerts{device_filter}
            GROUP BY severity
        """
        synced_query = f"""
            SELECT synced, COUNT(*) as count FROM alerts{device_filter}
            GROUP BY synced
        """

        async with self.connection() as conn:
            async with conn.execute(count_query, params) as cursor:
                total = (await cursor.fetchone())["total"]

            async with conn.execute(severity_query, params) as cursor:
                rows = await cursor.fetchall()
                by_severity = {str(row["severity"]): row["count"] for row in rows}

            async with conn.execute(synced_query, params) as cursor:
                rows = await cursor.fetchall()
                by_synced = {bool(row["synced"]): row["count"] for row in rows}

        return {
            "total": total,
            "by_severity": by_severity,
            "synced": by_synced.get(True, 0),
            "unsynced": by_synced.get(False, 0),
        }

    async def acknowledge_alert(self, alert_id: str, acknowledged_by: Optional[str] = None) -> bool:
        query = """
            UPDATE alerts
            SET acknowledged = 1,
                acknowledged_at = ?,
                acknowledged_by = ?
            WHERE alert_id = ?
        """
        now = datetime.utcnow().isoformat()
        result = await self.execute_update(query, (now, acknowledged_by, alert_id))
        return result > 0

    async def insert_telemetry(self, telemetry: TelemetryEvent) -> int:
        query = """
            INSERT INTO telemetry (
                device_id, timestamp, cpu_percent, memory_percent, disk_usage,
                process_count, network_connections, metrics_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """
        params = (
            telemetry.device_id,
            telemetry.timestamp,
            telemetry.cpu_percent,
            telemetry.memory_percent,
            telemetry.disk_usage,
            telemetry.process_count,
            telemetry.network_connections,
            json.dumps(telemetry.metrics_json) if telemetry.metrics_json else None,
        )
        async with self.connection() as conn:
            cursor = await conn.execute(query, params)
            await conn.commit()
            return cursor.lastrowid or 0

    async def insert_telemetry_event(
        self,
        device_id: str,
        event_type: str,
        payload: Dict[str, Any],
        agent_version: str = "1.0.0",
        payload_hash: str = "",
    ) -> int:
        payload_json = json.dumps(payload, separators=(",", ":"), sort_keys=True)
        if not payload_hash:
            payload_hash = hashlib.sha256(payload_json.encode()).hexdigest()
        valid_types = {"PROCESS", "NETWORK", "FILE", "RESOURCE"}
        safe_event_type = event_type.upper() if event_type.upper() in valid_types else "RESOURCE"

        query = """
            INSERT OR IGNORE INTO telemetry_events (
                event_id, device_id, timestamp, event_type,
                event_payload, collection_agent_version, payload_hash
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        """
        params = (
            str(uuid.uuid4()),
            device_id,
            datetime.utcnow().isoformat(),
            safe_event_type,
            payload_json,
            agent_version,
            payload_hash,
        )
        async with self.connection() as conn:
            cursor = await conn.execute(query, params)
            await conn.commit()
            return cursor.lastrowid or 0

    async def insert_detection(self, detection: DetectionEvent) -> int:
        query = """
            INSERT INTO detections (
                device_id, timestamp, detector_name, label, anomaly_score,
                confidence, features_used, model_version, detection_metadata
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """
        params = (
            detection.device_id,
            detection.timestamp,
            detection.detector_name,
            detection.label,
            detection.anomaly_score,
            detection.confidence,
            json.dumps(detection.features_used) if detection.features_used else None,
            detection.model_version,
            json.dumps(detection.detection_metadata) if detection.detection_metadata else None,
        )
        async with self.connection() as conn:
            cursor = await conn.execute(query, params)
            await conn.commit()
            return cursor.lastrowid or 0

    async def _insert_features(self, features: FeatureVector) -> int:
        query = """
            INSERT INTO features (
                device_id, timestamp, features_json, feature_names,
                model_version, normalized
            ) VALUES (?, ?, ?, ?, ?, ?)
        """
        params = (
            features.device_id,
            features.timestamp,
            json.dumps(features.features),
            json.dumps(features.feature_names),
            features.model_version,
            1 if features.normalized else 0,
        )
        async with self.connection() as conn:
            cursor = await conn.execute(query, params)
            await conn.commit()
            return cursor.lastrowid or 0

    async def insert_feature_array(
        self,
        device_id: str,
        feature_array: Any,
        feature_names: List[str],
        model_version: str = "1.0",
        normalized: bool = False,
    ) -> int:
        """Convenience helper: insert a numpy feature array directly."""
        try:
            import numpy as np

            arr = np.asarray(feature_array, dtype=float).flatten()
            features_dict = {name: float(val) for name, val in zip(feature_names, arr)}
            fv = FeatureVector(
                device_id=device_id,
                timestamp=datetime.utcnow().isoformat(),
                features=features_dict,
                model_version=model_version,
                normalized=normalized,
            )
            return await self._insert_features(fv)
        except Exception as exc:
            logger.error("insert_feature_array_error", error=str(exc))
            return 0

    async def enqueue_sync_item(
        self,
        item_type: str,
        item_id: str,
        data: Dict[str, Any],
        priority: int = 0,
    ) -> int:
        query = """
            INSERT INTO sync_queue (item_type, item_id, data_json, priority)
            VALUES (?, ?, ?, ?)
        """
        async with self.connection() as conn:
            cursor = await conn.execute(query, (item_type, item_id, json.dumps(data), priority))
            await conn.commit()
            return cursor.lastrowid or 0

    async def get_sync_queue_items(
        self,
        item_type: Optional[str] = None,
        limit: int = 100,
        priority_threshold: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        query = "SELECT * FROM sync_queue WHERE 1=1"
        params: list = []

        if item_type:
            query += " AND item_type = ?"
            params.append(item_type)
        if priority_threshold is not None:
            query += " AND priority >= ?"
            params.append(priority_threshold)

        query += " ORDER BY priority DESC, created_at ASC LIMIT ?"
        params.append(limit)

        async with self.connection() as conn:
            async with conn.execute(query, params) as cursor:
                rows = await cursor.fetchall()
                return [dict(row) for row in rows]

    async def upsert_device(self, info: DeviceInfo) -> int:
        query = """
            INSERT INTO devices (id, last_seen, status, cpu_usage, memory_usage, alerts_count, version)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                last_seen   = COALESCE(excluded.last_seen, devices.last_seen),
                status      = excluded.status,
                cpu_usage   = COALESCE(excluded.cpu_usage, devices.cpu_usage),
                memory_usage = COALESCE(excluded.memory_usage, devices.memory_usage),
                alerts_count = COALESCE(excluded.alerts_count, devices.alerts_count),
                version     = COALESCE(excluded.version, devices.version)
        """
        last_seen_val = info.last_seen or datetime.utcnow().isoformat()
        return await self.execute_update(
            query,
            (
                info.device_id,
                last_seen_val,
                info.status,
                info.cpu_usage,
                info.memory_usage,
                info.alerts_count,
                info.version,
            ),
        )

    async def insert_dead_letter(
        self,
        item_type: str,
        item_data: Dict[str, Any],
        error_info: Optional[str] = None,
        attempts: int = 0,
    ) -> int:
        query = """
            INSERT INTO dead_letter_queue (item_type, item_id, data_json, attempts, error_info, failed_at)
            VALUES (?, ?, ?, ?, ?, ?)
        """
        item_id = str(item_data.get("alert_id") or item_data.get("id") or "unknown")
        now = datetime.utcnow().isoformat()
        return await self.execute_update(
            query,
            (item_type, item_id, json.dumps(item_data), attempts, error_info, now),
        )

    async def get_dead_letter_items(
        self, limit: int = 100, offset: int = 0
    ) -> List[Dict[str, Any]]:
        query = """
            SELECT * FROM dead_letter_queue
            ORDER BY failed_at DESC LIMIT ? OFFSET ?
        """
        async with self.connection() as conn:
            async with conn.execute(query, (limit, offset)) as cursor:
                rows = await cursor.fetchall()
                return [dict(row) for row in rows]

    async def cleanup_old_data(
        self,
        retention_days: int,
        alert_retention_days: Optional[int] = None,
    ) -> Dict[str, int]:
        alert_cutoff = datetime.utcnow() - timedelta(days=alert_retention_days or retention_days)
        general_cutoff = datetime.utcnow() - timedelta(days=retention_days)
        alert_cutoff_iso = alert_cutoff.isoformat()
        general_cutoff_iso = general_cutoff.isoformat()

        delete_statements = {
            "alerts": (
                "DELETE FROM alerts WHERE synced = 1 AND timestamp < ?",
                (alert_cutoff_iso,),
            ),
            "dead_letter_queue": (
                "DELETE FROM dead_letter_queue WHERE failed_at < ?",
                (alert_cutoff_iso,),
            ),
            "telemetry": ("DELETE FROM telemetry WHERE timestamp < ?", (general_cutoff_iso,)),
            "telemetry_events": (
                "DELETE FROM telemetry_events WHERE timestamp < ?",
                (general_cutoff_iso,),
            ),
            "detections": ("DELETE FROM detections WHERE timestamp < ?", (general_cutoff_iso,)),
            "features": ("DELETE FROM features WHERE timestamp < ?", (general_cutoff_iso,)),
            "events": ("DELETE FROM events WHERE timestamp < ?", (general_cutoff_iso,)),
        }

        results: Dict[str, int] = {}
        async with self.connection() as conn:
            for table, (query, params) in delete_statements.items():
                cursor = await conn.execute(query, params)
                results[table] = cursor.rowcount or 0
            await conn.commit()

        logger.info(
            "old_data_cleaned",
            general_cutoff=general_cutoff_iso,
            alert_cutoff=alert_cutoff_iso,
            deleted=results,
        )
        return results
