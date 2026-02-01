# Database management for EdgePulse.

import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from edgepulse_win.utils.exception_handler import LoggingError


class DatabaseManager:
    """Manages SQLite database operations"""
    
    def __init__(self, db_path: Path):
        self.db_path = db_path
        self._connection: Optional[sqlite3.Connection] = None
        
    def connect(self) -> sqlite3.Connection:
        """Establish database connection"""
        if self._connection is None:
            self._connection = sqlite3.connect(str(self.db_path))
            self._connection.row_factory = sqlite3.Row
        return self._connection
        
    def close(self) -> None:
        """Close database connection"""
        if self._connection:
            self._connection.close()
            self._connection = None
            
    def execute_query(self, query: str, params: tuple = ()) -> List[Dict[str, Any]]:
        """Execute a query and return results"""
        try:
            conn = self.connect()
            cursor = conn.cursor()
            cursor.execute(query, params)
            return [dict(row) for row in cursor.fetchall()]
        except sqlite3.Error as e:
            raise LoggingError(f"Database query failed: {e}")
            
    def execute_update(self, query: str, params: tuple = ()) -> None:
        """Execute an update query"""
        try:
            conn = self.connect()
            cursor = conn.cursor()
            cursor.execute(query, params)
            conn.commit()
        except sqlite3.Error as e:
            raise LoggingError(f"Database update failed: {e}")

    def initialize_database(self) -> None:
        """Initialize database with required tables and indexes"""
        try:
            self.db_path.parent.mkdir(parents=True, exist_ok=True)

            with sqlite3.connect(str(self.db_path)) as conn:
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

    def enforce_retention(self, retention_days: int) -> Tuple[int, int, int, int]:
        """Delete old records based on retention policy"""
        try:
            cutoff_date = datetime.utcnow().timestamp() - (retention_days * 24 * 3600)
            cutoff_iso = datetime.fromtimestamp(cutoff_date).isoformat()

            with sqlite3.connect(str(self.db_path)) as conn:
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


# Backward compatibility functions
def initialize_database(db_path: Path) -> None:
    """Initialize database with required tables and indexes"""
    db_manager = DatabaseManager(db_path)
    db_manager.initialize_database()


def enforce_retention(db_path: Path, retention_days: int) -> Tuple[int, int, int, int]:
    """Delete old records based on retention policy"""
    db_manager = DatabaseManager(db_path)
    return db_manager.enforce_retention(retention_days)
