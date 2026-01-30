# Log writer: SQLite persistence with hash-chain integration.

import json
import logging
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

from edgepulse_win.exceptions import LoggingError, ValidationError
from edgepulse_win.utils.paths import PathManager
from edgepulse_win.storage.chain import HashChain
from edgepulse_win.storage.database import DatabaseManager, initialize_database, enforce_retention
from edgepulse_win.storage.sanitizer import sanitize

logger = logging.getLogger(__name__)


class LogWriter:
    """Writes events, anomalies, and alerts to SQLite with hash-chain integrity."""

    def __init__(
        self,
        device_id: str,
        retention_days: int = 90,
        db_path: Optional[Path] = None,
        path_manager: Optional[PathManager] = None,
    ) -> None:
        self.device_id = device_id
        self.retention_days = retention_days
        self.path_manager = path_manager or PathManager()
        self.db_path = db_path or self.path_manager.get_log_db_path(device_id)

        self.chain = HashChain(device_id, self.path_manager)
        initialize_database(self.db_path)
        logger.info(f"Initialized database at {self.db_path}")

    def write_event(self, event_type: str, data: Dict) -> None:
        """Log a general event."""
        try:
            data = sanitize(data)
            chain_entry = self.chain.create_entry(event_type, data)
            if not self.chain.append(chain_entry):
                logger.error("Failed to append to hash chain")
                return

            with sqlite3.connect(str(self.db_path)) as conn:
                cursor = conn.cursor()
                cursor.execute(
                    """
                    INSERT INTO events (timestamp, type, data_json, hash, previous_hash)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (
                        chain_entry["timestamp"],
                        event_type,
                        json.dumps(data),
                        chain_entry["current_hash"],
                        chain_entry["previous_hash"],
                    ),
                )
                conn.commit()

            logger.debug(f"Logged event: {event_type}")
        except Exception as exc:
            logger.error(f"Error logging event: {exc}")
            raise LoggingError(f"Failed to log event: {exc}") from exc

    def write_anomaly(self, anomaly: Dict) -> None:
        """Log an anomaly detection."""
        try:
            anomaly = sanitize(anomaly)
            chain_entry = self.chain.create_entry("anomaly_detected", anomaly)
            if not self.chain.append(chain_entry):
                logger.error("Failed to append to hash chain")
                return

            with sqlite3.connect(str(self.db_path)) as conn:
                cursor = conn.cursor()
                cursor.execute(
                    """
                    INSERT INTO anomalies (timestamp, score, severity, explanation_json, hash_ref)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (
                        anomaly.get("timestamp", datetime.utcnow().isoformat()),
                        anomaly.get("anomaly_score", 0.0),
                        anomaly.get("severity", "low"),
                        json.dumps(anomaly.get("explanation", {})),
                        chain_entry["current_hash"],
                    ),
                )
                conn.commit()

            logger.info(
                "Logged anomaly: %s (severity: %s)",
                anomaly.get("alert_id"),
                anomaly.get("severity"),
            )
        except Exception as exc:
            logger.error(f"Error logging anomaly: {exc}")
            raise LoggingError(f"Failed to log anomaly: {exc}") from exc

    def write_alert(self, alert: Dict) -> None:
        """Log an alert."""
        try:
            alert = sanitize(alert)
            chain_entry = self.chain.create_entry("alert_generated", alert)
            if not self.chain.append(chain_entry):
                logger.error("Failed to append to hash chain")
                return

            with sqlite3.connect(str(self.db_path)) as conn:
                cursor = conn.cursor()
                cursor.execute(
                    """
                    INSERT INTO alerts (timestamp, alert_json, acknowledged, hash_ref)
                    VALUES (?, ?, ?, ?)
                    """,
                    (
                        alert.get("timestamp", datetime.utcnow().isoformat()),
                        json.dumps(alert),
                        0,
                        chain_entry["current_hash"],
                    ),
                )
                conn.commit()

            logger.info("Logged alert: %s", alert.get("alert_id"))
        except Exception as exc:
            logger.error(f"Error logging alert: {exc}")
            raise LoggingError(f"Failed to log alert: {exc}") from exc

    def query_events(
        self,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        event_type: Optional[str] = None,
    ) -> List[Dict]:
        """Query events from the database."""
        try:
            with sqlite3.connect(str(self.db_path)) as conn:
                cursor = conn.cursor()
                query = "SELECT timestamp, type, data_json, hash FROM events WHERE 1=1"
                params = []

                if start_time:
                    query += " AND timestamp >= ?"
                    params.append(start_time.isoformat())
                if end_time:
                    query += " AND timestamp <= ?"
                    params.append(end_time.isoformat())
                if event_type:
                    query += " AND type = ?"
                    params.append(event_type)

                query += " ORDER BY timestamp DESC"
                cursor.execute(query, params)
                rows = cursor.fetchall()

            events = []
            for row in rows:
                events.append(
                    {
                        "timestamp": row[0],
                        "type": row[1],
                        "data": json.loads(row[2]),
                        "hash": row[3],
                    }
                )
            return events
        except Exception as exc:
            logger.error(f"Error querying events: {exc}")
            raise LoggingError(f"Failed to query events: {exc}") from exc

    def verify_all(self) -> bool:
        """Verify integrity of all logs using hash chain."""
        is_valid, tampered_index = self.chain.verify()
        if not is_valid:
            logger.error(f"Log integrity verification failed at index {tampered_index}")
            return False
        logger.info("All logs verified successfully")
        return True

    def export_forensic_package(self, output_path: str) -> None:
        """Export complete forensic package with hash chain."""
        import os
        import shutil

        try:
            os.makedirs(output_path, exist_ok=True)

            chain_path = os.path.join(output_path, "hash_chain.json")
            self.chain.export(chain_path)

            db_export_path = os.path.join(output_path, "logs.db")
            shutil.copy2(self.db_path, db_export_path)

            verification_report = {
                "export_timestamp": datetime.utcnow().isoformat(),
                "device_id": self.device_id,
                "chain_length": self.chain.get_chain_length(),
                "chain_head": self.chain.get_head(),
                "integrity_verified": self.verify_all(),
            }

            report_path = os.path.join(output_path, "verification_report.json")
            with open(report_path, "w") as f:
                json.dump(verification_report, f, indent=2)

            logger.info(f"Exported forensic package to {output_path}")
        except Exception as exc:
            logger.error(f"Error exporting forensic package: {exc}")
            raise

    def enforce_retention(self) -> None:
        """Delete old logs based on retention policy."""
        try:
            events_deleted, anomalies_deleted, state_deleted, alerts_deleted = enforce_retention(
                self.db_path, self.retention_days
            )
            logger.info(
                "Retention policy enforced: deleted %s events, %s anomalies, %s state entries, %s alerts",
                events_deleted,
                anomalies_deleted,
                state_deleted,
                alerts_deleted,
            )
        except Exception as exc:
            logger.error(f"Error enforcing retention: {exc}")
            raise LoggingError(f"Failed to enforce retention: {exc}") from exc
