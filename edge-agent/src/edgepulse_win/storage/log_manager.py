# Log Manager

import logging
from typing import Dict, List, Optional, Union
from datetime import datetime
from pathlib import Path

from edgepulse_win.utils.paths import PathManager
from edgepulse_win.storage.writer import LogWriter
from edgepulse_win.storage.chain import HashChain

logger = logging.getLogger(__name__)


class LogManager:
    def __init__(
        self,
        db_path: Optional[Union[str, Path]] = None,
        device_id: str = "default-device",
        retention_days: int = 90,
        path_manager: Optional[PathManager] = None,
    ) -> None:
        self.path_manager = path_manager or PathManager()
        self.device_id = device_id
        self.retention_days = retention_days
        
        if db_path:
            self.db_path = Path(db_path)
        else:
            self.db_path = self.path_manager.get_log_db_path(device_id)
        
        # Initialize hash chain with path manager
        self.hash_chain = HashChain(device_id, self.path_manager)
        self.writer = LogWriter(
            device_id=device_id,
            retention_days=retention_days,
            db_path=self.db_path,
            path_manager=self.path_manager,
        )

    def log_event(self, event_type: str, data: Dict) -> None:
        """Log a general event."""
        self.writer.write_event(event_type, data)

    def log_anomaly(self, anomaly: Dict) -> None:
        """Log an anomaly detection."""
        self.writer.write_anomaly(anomaly)

    def log_alert(self, alert: Dict) -> None:
        """Log an alert."""
        self.writer.write_alert(alert)

    def query_events(
        self,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        event_type: Optional[str] = None,
    ) -> List[Dict]:
        """Query events from the database."""
        return self.writer.query_events(start_time, end_time, event_type)

    def verify_all_logs(self) -> bool:
        """Verify integrity of all logs using hash chain."""
        return self.writer.verify_all()

    def export_forensic_package(self, output_path: str) -> None:
        """Export complete forensic package with hash chain."""
        self.writer.export_forensic_package(output_path)

    def enforce_retention(self) -> None:
        """Delete old logs based on retention policy."""
        self.writer.enforce_retention()
