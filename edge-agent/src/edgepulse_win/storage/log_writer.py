"""
Log writer for EdgePulse storage system
"""

import json
import logging
from datetime import datetime
from typing import Any, Dict, Optional
from edgepulse_win.exceptions import LoggingError


class LogWriter:
    """Writes log entries to storage"""
    
    def __init__(self, storage_backend: Any):
        self.storage = storage_backend
        self.logger = logging.getLogger(__name__)
        
    def write_event(self, event_type: str, data: Dict[str, Any]) -> None:
        """Write an event log entry"""
        try:
            entry = {
                "timestamp": datetime.utcnow().isoformat(),
                "type": event_type,
                "data": data
            }
            self.storage.write(entry)
        except Exception as e:
            self.logger.error(f"Failed to write event: {e}")
            raise LoggingError(f"Event write failed: {e}")
            
    def write_alert(self, alert_data: Dict[str, Any]) -> None:
        """Write an alert log entry"""
        try:
            entry = {
                "timestamp": datetime.utcnow().isoformat(),
                "type": "alert",
                "data": alert_data
            }
            self.storage.write(entry)
        except Exception as e:
            self.logger.error(f"Failed to write alert: {e}")
            raise LoggingError(f"Alert write failed: {e}")
