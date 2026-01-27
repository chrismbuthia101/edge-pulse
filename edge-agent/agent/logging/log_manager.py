"""
Log Manager

Manages all system logs in SQLite database with hash chain integration.
"""

import logging
import sqlite3
import json
import os
from typing import Dict, List, Optional
from datetime import datetime
from pathlib import Path

from .hash_chain import HashChainLogger

logger = logging.getLogger(__name__)


class LogManager:
    """
    Manages system logs in SQLite database with cryptographic integrity.
    
    Integrates with hash chain for tamper-evident logging.
    """

    def __init__(
        self,
        db_path: str,
        device_id: str,
        retention_days: int = 90,
    ):
        """
        Initialize the log manager.
        
        Args:
            db_path: Path to SQLite database
            device_id: Device identifier
            retention_days: Data retention period in days (default: 90)
        """
        self.db_path = db_path
        self.device_id = device_id
        self.retention_days = retention_days
        
        # Initialize hash chain
        self.hash_chain = HashChainLogger(device_id)
        
        # Initialize database
        self.initialize_database()

    def initialize_database(self) -> None:
        """Initialize the SQLite database with required tables."""
        try:
            os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
            
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            # Events table
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
            
            # Create indexes separately (SQLite doesn't support inline INDEX)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_events_type ON events(type)")
            
            # Anomalies table
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
            
            # System state table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS system_state (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    metrics_json TEXT NOT NULL,
                    hash_ref TEXT
                )
            """)
            
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_system_state_timestamp ON system_state(timestamp)")
            
            # Alerts table
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
            conn.close()
            
            logger.info(f"Initialized database at {self.db_path}")
        except Exception as e:
            logger.error(f"Error initializing database: {e}")
            raise

    def log_event(self, event_type: str, data: Dict) -> None:
        """
        Log a general event.
        
        Args:
            event_type: Type of event
            data: Event data dictionary
        """
        try:
            # Create hash chain entry
            chain_entry = self.hash_chain.create_log_entry(event_type, data)
            if not self.hash_chain.append_to_chain(chain_entry):
                logger.error("Failed to append to hash chain")
                return
            
            # Insert into database
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            cursor.execute("""
                INSERT INTO events (timestamp, type, data_json, hash, previous_hash)
                VALUES (?, ?, ?, ?, ?)
            """, (
                chain_entry["timestamp"],
                event_type,
                json.dumps(data),
                chain_entry["current_hash"],
                chain_entry["previous_hash"],
            ))
            
            conn.commit()
            conn.close()
            
            logger.debug(f"Logged event: {event_type}")
        except Exception as e:
            logger.error(f"Error logging event: {e}")

    def log_anomaly(self, anomaly: Dict) -> None:
        """
        Log an anomaly detection.
        
        Args:
            anomaly: Anomaly dictionary (from report generator)
        """
        try:
            # Create hash chain entry
            chain_entry = self.hash_chain.create_log_entry("anomaly_detected", anomaly)
            if not self.hash_chain.append_to_chain(chain_entry):
                logger.error("Failed to append to hash chain")
                return
            
            # Insert into database
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            cursor.execute("""
                INSERT INTO anomalies (timestamp, score, severity, explanation_json, hash_ref)
                VALUES (?, ?, ?, ?, ?)
            """, (
                anomaly.get("timestamp", datetime.utcnow().isoformat()),
                anomaly.get("anomaly_score", 0.0),
                anomaly.get("severity", "low"),
                json.dumps(anomaly.get("explanation", {})),
                chain_entry["current_hash"],
            ))
            
            conn.commit()
            conn.close()
            
            logger.info(f"Logged anomaly: {anomaly.get('alert_id')} (severity: {anomaly.get('severity')})")
        except Exception as e:
            logger.error(f"Error logging anomaly: {e}")

    def log_alert(self, alert: Dict) -> None:
        """
        Log an alert.
        
        Args:
            alert: Alert dictionary
        """
        try:
            # Create hash chain entry
            chain_entry = self.hash_chain.create_log_entry("alert_generated", alert)
            if not self.hash_chain.append_to_chain(chain_entry):
                logger.error("Failed to append to hash chain")
                return
            
            # Insert into database
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            cursor.execute("""
                INSERT INTO alerts (timestamp, alert_json, acknowledged, hash_ref)
                VALUES (?, ?, ?, ?)
            """, (
                alert.get("timestamp", datetime.utcnow().isoformat()),
                json.dumps(alert),
                0,  # Not acknowledged
                chain_entry["current_hash"],
            ))
            
            conn.commit()
            conn.close()
            
            logger.info(f"Logged alert: {alert.get('alert_id')}")
        except Exception as e:
            logger.error(f"Error logging alert: {e}")

    def query_events(
        self,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        event_type: Optional[str] = None,
    ) -> List[Dict]:
        """
        Query events from the database.
        
        Args:
            start_time: Start time filter (optional)
            end_time: End time filter (optional)
            event_type: Event type filter (optional)
            
        Returns:
            List of event dictionaries
        """
        try:
            conn = sqlite3.connect(self.db_path)
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
            conn.close()
            
            events = []
            for row in rows:
                events.append({
                    "timestamp": row[0],
                    "type": row[1],
                    "data": json.loads(row[2]),
                    "hash": row[3],
                })
            
            return events
        except Exception as e:
            logger.error(f"Error querying events: {e}")
            return []

    def verify_all_logs(self) -> bool:
        """
        Verify integrity of all logs using hash chain.
        
        Returns:
            True if all logs are valid
        """
        is_valid, tampered_index = self.hash_chain.verify_chain_integrity()
        
        if not is_valid:
            logger.error(f"Log integrity verification failed at index {tampered_index}")
            return False
        
        logger.info("All logs verified successfully")
        return True

    def export_forensic_package(self, output_path: str) -> None:
        """
        Export complete forensic package with hash chain.
        
        Args:
            output_path: Path to export directory
        """
        try:
            os.makedirs(output_path, exist_ok=True)
            
            # Export hash chain
            chain_path = os.path.join(output_path, "hash_chain.json")
            self.hash_chain.export_chain(chain_path)
            
            # Export database
            import shutil
            db_export_path = os.path.join(output_path, "logs.db")
            shutil.copy2(self.db_path, db_export_path)
            
            # Create verification report
            verification_report = {
                "export_timestamp": datetime.utcnow().isoformat(),
                "device_id": self.device_id,
                "chain_length": self.hash_chain.get_chain_length(),
                "chain_head": self.hash_chain.get_chain_head(),
                "integrity_verified": self.verify_all_logs(),
            }
            
            report_path = os.path.join(output_path, "verification_report.json")
            with open(report_path, 'w') as f:
                json.dump(verification_report, f, indent=2)
            
            logger.info(f"Exported forensic package to {output_path}")
        except Exception as e:
            logger.error(f"Error exporting forensic package: {e}")
            raise

    def enforce_retention(self) -> None:
        """Delete old logs based on retention policy."""
        try:
            cutoff_date = datetime.utcnow().timestamp() - (self.retention_days * 24 * 3600)
            cutoff_iso = datetime.fromtimestamp(cutoff_date).isoformat()
            
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            # Delete old events
            cursor.execute("DELETE FROM events WHERE timestamp < ?", (cutoff_iso,))
            events_deleted = cursor.rowcount
            
            # Delete old anomalies
            cursor.execute("DELETE FROM anomalies WHERE timestamp < ?", (cutoff_iso,))
            anomalies_deleted = cursor.rowcount
            
            # Delete old system state
            cursor.execute("DELETE FROM system_state WHERE timestamp < ?", (cutoff_iso,))
            state_deleted = cursor.rowcount
            
            # Delete old alerts
            cursor.execute("DELETE FROM alerts WHERE timestamp < ? AND acknowledged = 1", (cutoff_iso,))
            alerts_deleted = cursor.rowcount
            
            conn.commit()
            conn.close()
            
            logger.info(f"Retention policy enforced: deleted {events_deleted} events, {anomalies_deleted} anomalies, {state_deleted} state entries, {alerts_deleted} alerts")
        except Exception as e:
            logger.error(f"Error enforcing retention: {e}")
