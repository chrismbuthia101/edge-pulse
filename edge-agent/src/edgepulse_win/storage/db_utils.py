"""SQLite helpers for log storage."""

import sqlite3
from datetime import datetime
from pathlib import Path

from edgepulse_win.exceptions import LoggingError


def initialize_database(db_path: Path) -> None:
    try:
        db_path.parent.mkdir(parents=True, exist_ok=True)

        with sqlite3.connect(str(db_path)) as conn:
            cursor = conn.cursor()

            cursor.execute("""
                CREATE TABLE IF NOT EXISTS events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    type TEXT NOT NULL,
                    data_json TEXT NOT NULL,
                    hash TEXT,
                    previous_hash TEXT
                )
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_events_type ON events(type)")

            cursor.execute("""
                CREATE TABLE IF NOT EXISTS anomalies (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    score REAL NOT NULL,
                    severity TEXT NOT NULL,
                    explanation_json TEXT,
                    hash_ref TEXT
                )
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_anomalies_timestamp ON anomalies(timestamp)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_anomalies_severity ON anomalies(severity)")

            cursor.execute("""
                CREATE TABLE IF NOT EXISTS system_state (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    metrics_json TEXT NOT NULL,
                    hash_ref TEXT
                )
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_system_state_timestamp ON system_state(timestamp)")

            cursor.execute("""
                CREATE TABLE IF NOT EXISTS alerts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    alert_json TEXT NOT NULL,
                    acknowledged INTEGER DEFAULT 0,
                    hash_ref TEXT
                )
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_alerts_timestamp ON alerts(timestamp)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_alerts_acknowledged ON alerts(acknowledged)")

            conn.commit()
    except Exception as e:
        raise LoggingError(f"Failed to initialize database: {e}") from e


def enforce_retention(db_path: Path, retention_days: int) -> tuple[int, int, int, int]:
    try:
        cutoff_date = datetime.utcnow().timestamp() - (retention_days * 24 * 3600)
        cutoff_iso = datetime.fromtimestamp(cutoff_date).isoformat()

        with sqlite3.connect(str(db_path)) as conn:
            cursor = conn.cursor()

            cursor.execute("DELETE FROM events WHERE timestamp < ?", (cutoff_iso,))
            events_deleted = cursor.rowcount

            cursor.execute("DELETE FROM anomalies WHERE timestamp < ?", (cutoff_iso,))
            anomalies_deleted = cursor.rowcount

            cursor.execute("DELETE FROM system_state WHERE timestamp < ?", (cutoff_iso,))
            state_deleted = cursor.rowcount

            cursor.execute("DELETE FROM alerts WHERE timestamp < ? AND acknowledged = 1", (cutoff_iso,))
            alerts_deleted = cursor.rowcount

            conn.commit()

        return events_deleted, anomalies_deleted, state_deleted, alerts_deleted
    except Exception as e:
        raise LoggingError(f"Failed to enforce retention: {e}") from e
