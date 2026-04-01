"""
EdgePulse Database Manager
"""

import aiosqlite
import json
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union
from datetime import datetime, timedelta

from edgepulse_win.utils.log_handler import get_logger
from edgepulse_win.shared import (
    SeverityLevel,
    DeviceStatus,
    EventType,
    AlertEvent,
    TelemetryEvent,
    DetectionEvent,
    DeviceInfo,
    FeatureVector,
    normalize_timestamp,
)

logger = get_logger(__name__)


class DatabaseManager:
    """Async database manager with intrinsic standardised schema"""

    TABLE_SCHEMAS = {
        "telemetry_events": """
            CREATE TABLE IF NOT EXISTS telemetry_events (
                event_id TEXT PRIMARY KEY,
                device_id TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                event_type TEXT NOT NULL
                    CHECK (event_type IN ('PROCESS', 'NETWORK', 'FILE', 'RESOURCE')),
                event_payload TEXT NOT NULL,
                collection_agent_version TEXT NOT NULL,
                payload_hash TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """,

        "devices": """
            CREATE TABLE IF NOT EXISTS devices (
                id TEXT PRIMARY KEY,
                last_seen TEXT NOT NULL,
                status TEXT NOT NULL
                    CHECK (status IN ('online', 'offline', 'warning', 'error')),
                cpu_usage DECIMAL(5,2),
                memory_usage DECIMAL(5,2),
                alerts_count INTEGER DEFAULT 0,
                version TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """,

        "alerts": """
            CREATE TABLE IF NOT EXISTS alerts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                alert_id TEXT UNIQUE NOT NULL,
                timestamp TEXT NOT NULL,
                device_id TEXT NOT NULL,
                severity TEXT NOT NULL
                    CHECK (severity IN ('low', 'medium', 'high', 'critical')),
                anomaly_score DECIMAL(10,6) NOT NULL,
                alert_type TEXT NOT NULL,
                detector_type TEXT NOT NULL,
                explanation_summary TEXT,
                feature_importance TEXT,
                data_json TEXT,
                acknowledged BOOLEAN DEFAULT FALSE,
                acknowledged_at TEXT,
                acknowledged_by TEXT,
                synced INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
            )
        """,

        "telemetry": """
            CREATE TABLE IF NOT EXISTS telemetry (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                device_id TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                cpu_percent DECIMAL(5,2),
                memory_percent DECIMAL(5,2),
                disk_usage DECIMAL(5,2),
                process_count INTEGER,
                network_connections INTEGER,
                metrics_json TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
            )
        """,

        "detections": """
            CREATE TABLE IF NOT EXISTS detections (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                device_id TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                detector_name TEXT NOT NULL,
                label INTEGER NOT NULL CHECK (label IN (0, 1)),
                anomaly_score DECIMAL(10,6),
                confidence DECIMAL(10,6),
                features_used TEXT,
                model_version TEXT,
                detection_metadata TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
            )
        """,

        "features": """
            CREATE TABLE IF NOT EXISTS features (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                device_id TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                features_json TEXT NOT NULL,
                feature_names TEXT NOT NULL,
                model_version TEXT,
                normalized BOOLEAN DEFAULT FALSE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
            )
        """,

        "sync_queue": """
            CREATE TABLE IF NOT EXISTS sync_queue (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                item_type TEXT NOT NULL,
                item_id TEXT NOT NULL,
                data_json TEXT NOT NULL,
                attempts INTEGER DEFAULT 0,
                last_attempt TEXT,
                next_retry TEXT,
                priority INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """,

        "events": """
            CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                device_id TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                event_type TEXT NOT NULL,
                component TEXT NOT NULL,
                data_json TEXT NOT NULL,
                severity TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
            )
        """,

        "tamper_evident_log": """
            CREATE TABLE IF NOT EXISTS tamper_evident_log (
                log_id TEXT PRIMARY KEY,
                device_id TEXT NOT NULL,
                log_sequence_number BIGINT NOT NULL,
                log_entry_type TEXT NOT NULL,
                log_entry_reference_id TEXT,
                entry_timestamp_utc TIMESTAMP NOT NULL,
                entry_content_hash TEXT NOT NULL,
                previous_entry_hash TEXT NOT NULL,
                digital_signature TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT unique_device_sequence
                    UNIQUE (device_id, log_sequence_number)
            )
        """,
    }

    INDEXES = [
        "CREATE INDEX IF NOT EXISTS idx_devices_id ON devices(id)",
        "CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status)",
        "CREATE INDEX IF NOT EXISTS idx_devices_last_seen ON devices(last_seen DESC)",

        "CREATE INDEX IF NOT EXISTS idx_alerts_device_id ON alerts(device_id)",
        "CREATE INDEX IF NOT EXISTS idx_alerts_timestamp ON alerts(timestamp DESC)",
        "CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity)",
        "CREATE INDEX IF NOT EXISTS idx_alerts_synced ON alerts(synced)",
        "CREATE INDEX IF NOT EXISTS idx_alerts_alert_id ON alerts(alert_id)",
        "CREATE INDEX IF NOT EXISTS idx_alerts_device_timestamp ON alerts(device_id, timestamp DESC)",

        "CREATE INDEX IF NOT EXISTS idx_telemetry_device_id ON telemetry(device_id)",
        "CREATE INDEX IF NOT EXISTS idx_telemetry_timestamp ON telemetry(timestamp DESC)",
        "CREATE INDEX IF NOT EXISTS idx_telemetry_device_timestamp ON telemetry(device_id, timestamp DESC)",

        "CREATE INDEX IF NOT EXISTS idx_detections_device_id ON detections(device_id)",
        "CREATE INDEX IF NOT EXISTS idx_detections_timestamp ON detections(timestamp DESC)",
        "CREATE INDEX IF NOT EXISTS idx_detections_detector ON detections(detector_name)",
        "CREATE INDEX IF NOT EXISTS idx_detections_device_timestamp ON detections(device_id, timestamp DESC)",

        "CREATE INDEX IF NOT EXISTS idx_features_device_id ON features(device_id)",
        "CREATE INDEX IF NOT EXISTS idx_features_timestamp ON features(timestamp DESC)",
        "CREATE INDEX IF NOT EXISTS idx_features_device_timestamp ON features(device_id, timestamp DESC)",

        "CREATE INDEX IF NOT EXISTS idx_sync_queue_type ON sync_queue(item_type)",
        "CREATE INDEX IF NOT EXISTS idx_sync_queue_priority ON sync_queue(priority DESC)",
        "CREATE INDEX IF NOT EXISTS idx_sync_queue_created_at ON sync_queue(created_at)",

        "CREATE INDEX IF NOT EXISTS idx_events_device_id ON events(device_id)",
        "CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp DESC)",
        "CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type)",
        "CREATE INDEX IF NOT EXISTS idx_events_device_timestamp ON events(device_id, timestamp DESC)",

        "CREATE INDEX IF NOT EXISTS idx_tamper_device_seq ON tamper_evident_log(device_id, log_sequence_number)",
    ]

    def __init__(self, db_path: Path):
        self.db_path = db_path
        self._initialized = False
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        logger.info("standardized_db_manager_initialized", db_path=str(db_path))

    async def initialize(self) -> None:
        """Initialize database with standardised schema"""
        if self._initialized:
            return

        async with self.connection() as conn:
            await conn.execute("PRAGMA foreign_keys = ON")
            await conn.execute("PRAGMA journal_mode = WAL")
            await conn.execute("PRAGMA synchronous = NORMAL")
            await conn.execute("PRAGMA busy_timeout = 30000")

            for table_name, schema in self.TABLE_SCHEMAS.items():
                await conn.execute(schema)
                logger.debug("table_created", table=table_name)

            for index_sql in self.INDEXES:
                await conn.execute(index_sql)

            await self._create_triggers(conn)
            await conn.commit()
            self._initialized = True

        logger.info("standardized_database_initialized")

    @asynccontextmanager
    async def connection(self):
        """Async context manager for connections"""
        async with aiosqlite.connect(self.db_path) as conn:
            conn.row_factory = aiosqlite.Row
            yield conn

    async def _create_triggers(self, conn: aiosqlite.Connection) -> None:
        triggers = [
            """
            CREATE TRIGGER IF NOT EXISTS update_devices_updated_at
                AFTER UPDATE ON devices FOR EACH ROW
            BEGIN
                UPDATE devices SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
            END
            """,
            """
            CREATE TRIGGER IF NOT EXISTS update_alerts_updated_at
                AFTER UPDATE ON alerts FOR EACH ROW
            BEGIN
                UPDATE alerts SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
            END
            """,
            """
            CREATE TRIGGER IF NOT EXISTS update_sync_queue_updated_at
                AFTER UPDATE ON sync_queue FOR EACH ROW
            BEGIN
                UPDATE sync_queue SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
            END
            """,
        ]
        for trigger_sql in triggers:
            await conn.execute(trigger_sql)

    # ------------------------------------------------------------------
    # Generic query helpers
    # ------------------------------------------------------------------

    async def execute_query(
        self, query: str, params: Tuple = ()
    ) -> List[Dict[str, Any]]:
        """Execute any SQL statement and return results.

        - DDL (CREATE TABLE, CREATE INDEX …) → returns []
        - SELECT → returns list of row dicts
        - INSERT / UPDATE / DELETE → commits and returns []

        This method is the one called by TamperEvidentLogger and other
        internal modules that need a general-purpose execution path.
        """
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
        """Execute an UPDATE/DELETE query and return affected row count."""
        async with self.connection() as conn:
            cursor = await conn.execute(query, params)
            await conn.commit()
            return cursor.rowcount or 0

    async def execute_many(
        self, query: str, params_list: List[Tuple]
    ) -> None:
        """Execute a query multiple times with different parameters."""
        async with self.connection() as conn:
            await conn.executemany(query, params_list)
            await conn.commit()

    # ------------------------------------------------------------------
    # Device operations
    # ------------------------------------------------------------------

    async def upsert_device(self, device_info: DeviceInfo) -> int:
        device_info.updated_at = datetime.utcnow().isoformat()

        query = """
            INSERT OR REPLACE INTO devices (
                id, last_seen, status, cpu_usage, memory_usage,
                alerts_count, version, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """
        params = (
            device_info.device_id,
            device_info.last_seen,
            device_info.status.value,
            device_info.cpu_usage,
            device_info.memory_usage,
            device_info.alerts_count,
            device_info.version,
            device_info.created_at,
            device_info.updated_at,
        )
        async with self.connection() as conn:
            cursor = await conn.execute(query, params)
            await conn.commit()
            return cursor.rowcount

    async def get_device(self, device_id: str) -> Optional[Dict[str, Any]]:
        query = "SELECT * FROM devices WHERE id = ?"
        async with self.connection() as conn:
            async with conn.execute(query, (device_id,)) as cursor:
                row = await cursor.fetchone()
                return dict(row) if row else None

    # ------------------------------------------------------------------
    # Alert operations
    # ------------------------------------------------------------------

    async def insert_alert(self, alert: AlertEvent) -> int:
        query = """
            INSERT INTO alerts (
                alert_id, timestamp, device_id, severity, anomaly_score,
                alert_type, detector_type, explanation_summary, feature_importance,
                data_json, acknowledged, acknowledged_at, acknowledged_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """
        params = (
            f"{alert.device_id}_{alert.timestamp}_{alert.alert_type}",
            alert.timestamp,
            alert.device_id,
            alert.severity.value,
            alert.anomaly_score,
            alert.alert_type,
            alert.detector_type,
            json.dumps(alert.explanation) if alert.explanation else None,
            json.dumps(alert.feature_importance) if alert.feature_importance else None,
            json.dumps(alert.dict()),
            alert.acknowledged,
            alert.acknowledged_at,
            alert.acknowledged_by,
        )
        async with self.connection() as conn:
            cursor = await conn.execute(query, params)
            await conn.commit()
            return cursor.lastrowid

    async def get_alerts(
        self,
        device_id: Optional[str] = None,
        severity: Optional[str] = None,
        acknowledged: Optional[bool] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> List[Dict[str, Any]]:
        query = "SELECT * FROM alerts WHERE 1=1"
        params: list = []

        if device_id:
            query += " AND device_id = ?"
            params.append(device_id)
        if severity:
            query += " AND severity = ?"
            params.append(severity)
        if acknowledged is not None:
            query += " AND acknowledged = ?"
            params.append(1 if acknowledged else 0)

        query += " ORDER BY timestamp DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])

        async with self.connection() as conn:
            async with conn.execute(query, params) as cursor:
                rows = await cursor.fetchall()
                return [dict(row) for row in rows]

    # ------------------------------------------------------------------
    # Telemetry operations
    # ------------------------------------------------------------------

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
            return cursor.lastrowid

    async def get_latest_telemetry(
        self, device_id: str, limit: int = 10
    ) -> List[Dict[str, Any]]:
        query = """
            SELECT * FROM telemetry
            WHERE device_id = ?
            ORDER BY timestamp DESC
            LIMIT ?
        """
        async with self.connection() as conn:
            async with conn.execute(query, (device_id, limit)) as cursor:
                rows = await cursor.fetchall()
                return [dict(row) for row in rows]

    # ------------------------------------------------------------------
    # Detection operations
    # ------------------------------------------------------------------

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
            json.dumps(detection.detection_metadata)
            if detection.detection_metadata
            else None,
        )
        async with self.connection() as conn:
            cursor = await conn.execute(query, params)
            await conn.commit()
            return cursor.lastrowid

    # ------------------------------------------------------------------
    # Feature operations
    # ------------------------------------------------------------------

    async def insert_features(self, features: FeatureVector) -> int:
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
            features.normalized,
        )
        async with self.connection() as conn:
            cursor = await conn.execute(query, params)
            await conn.commit()
            return cursor.lastrowid

    # ------------------------------------------------------------------
    # Sync queue operations
    # ------------------------------------------------------------------

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
            cursor = await conn.execute(
                query, (item_type, item_id, json.dumps(data), priority)
            )
            await conn.commit()
            return cursor.lastrowid

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

    # ------------------------------------------------------------------
    # Event operations
    # ------------------------------------------------------------------

    async def insert_event(
        self,
        device_id: str,
        timestamp: str,
        event_type: str,
        component: str,
        data: Dict[str, Any],
        severity: Optional[str] = None,
    ) -> int:
        query = """
            INSERT INTO events (
                device_id, timestamp, event_type, component, data_json, severity
            ) VALUES (?, ?, ?, ?, ?, ?)
        """
        params = (
            device_id,
            normalize_timestamp(timestamp),
            event_type,
            component,
            json.dumps(data),
            severity,
        )
        async with self.connection() as conn:
            cursor = await conn.execute(query, params)
            await conn.commit()
            return cursor.lastrowid

    # ------------------------------------------------------------------
    # Maintenance
    # ------------------------------------------------------------------

    async def cleanup_old_data(self, retention_days: int) -> Dict[str, int]:
        """Delete old records from time-series tables."""
        cutoff = datetime.utcnow() - timedelta(days=retention_days)
        cutoff_iso = cutoff.isoformat()

        delete_statements = {
            "alerts": ("DELETE FROM alerts WHERE timestamp < ?", (cutoff_iso,)),
            "telemetry": ("DELETE FROM telemetry WHERE timestamp < ?", (cutoff_iso,)),
            "detections": ("DELETE FROM detections WHERE timestamp < ?", (cutoff_iso,)),
            "features": ("DELETE FROM features WHERE timestamp < ?", (cutoff_iso,)),
            "events": ("DELETE FROM events WHERE timestamp < ?", (cutoff_iso,)),
        }

        results: Dict[str, int] = {}
        async with self.connection() as conn:
            for table, (query, params) in delete_statements.items():
                cursor = await conn.execute(query, params)
                results[table] = cursor.rowcount or 0
            await conn.commit()

        logger.info("old_data_cleaned", cutoff=cutoff_iso, deleted=results)
        return results