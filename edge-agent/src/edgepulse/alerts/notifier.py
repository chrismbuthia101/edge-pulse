# Local Notifier
# Delivers alerts to local user via multiple channels.

from edgepulse.utils.log_handler import get_logger
from typing import Dict, Optional
from datetime import datetime, time

from edgepulse.utils.error_handler import LoggingError

logger = get_logger(__name__)


class LocalNotifier:

    def __init__(
        self,
        enable_console: bool = True,
        enable_system_tray: bool = True,
        enable_log_file: bool = True,
        quiet_hours_start: Optional[time] = None,
        quiet_hours_end: Optional[time] = None,
    ):
        self.enable_console = enable_console
        self.enable_system_tray = enable_system_tray
        self.enable_log_file = enable_log_file
        self.quiet_hours_start = quiet_hours_start
        self.quiet_hours_end = quiet_hours_end
        
        # Try to import notify-py
        self.toast_available = False
        if enable_system_tray:
            try:
                from notify_py import Notify
                self.toast_available = True
            except ImportError:
                logger.warning("notify-py not available, system tray notifications disabled")
                self.toast_available = False

    def _is_quiet_hours(self) -> bool:
        if not self.quiet_hours_start or not self.quiet_hours_end:
            return False
        
        now = datetime.now().time()
        
        # Handle quiet hours that span midnight
        if self.quiet_hours_start <= self.quiet_hours_end:
            return self.quiet_hours_start <= now <= self.quiet_hours_end
        else:
            return now >= self.quiet_hours_start or now <= self.quiet_hours_end

    def notify_console(self, alert: Dict) -> None:
        if not self.enable_console:
            return
        
        try:
            anomaly = alert.get("anomaly", {})
            severity = alert.get("severity", "unknown").upper()
            alert_id = alert.get("alert_id", "unknown")
            timestamp = alert.get("timestamp", "")
            
            print("\n" + "=" * 60)
            print(f"EDGEPULSE ALERT - {severity}")
            print("=" * 60)
            print(f"Alert ID: {alert_id}")
            print(f"Timestamp: {timestamp}")
            print(f"Anomaly Score: {anomaly.get('anomaly_score', 0.0):.4f}")
            print(f"Type: {anomaly.get('anomaly_type', 'unknown')}")
            print(f"\n{anomaly.get('explanation', {}).get('summary', 'No explanation available')}")
            print("=" * 60 + "\n")
        except LoggingError as e:
            logger.error(f"Error sending console notification: {e}")
        except Exception as e:
            logger.error(f"Error sending console notification: {e}")

    def notify_system_tray(self, alert: Dict) -> None:
        if not self.enable_system_tray or not self.toast_available:
            return
        
        # Skip during quiet hours
        if self._is_quiet_hours():
            return
        
        try:
            anomaly = alert.get("anomaly", {})
            severity = alert.get("severity", "unknown").upper()
            alert_id = alert.get("alert_id", "unknown")
            
            title = f"EdgePulse Alert - {severity}"
            message = (
                f"Anomaly detected: {anomaly.get('anomaly_type', 'unknown')}\n"
                f"Score: {anomaly.get('anomaly_score', 0.0):.2f}\n"
                f"ID: {alert_id[:8]}..."
            )
            
            notification = Notify(
                default_notification_title=title,
                default_notification_message=message,
            )
            notification.send()
        except LoggingError as e:
            logger.error(f"Error sending system tray notification: {e}")
        except Exception as e:
            logger.error(f"Error sending system tray notification: {e}")

    def notify_log_file(self, alert: Dict) -> None:
        if not self.enable_log_file:
            return
        
        try:
            log_message = (
                f"[ALERT] {alert.get('timestamp')} - "
                f"Severity: {alert.get('severity')} - "
                f"Alert ID: {alert.get('alert_id')} - "
                f"Anomaly: {alert.get('anomaly', {}).get('anomaly_type', 'unknown')}"
            )
            logger.info(log_message)
        except LoggingError as e:
            logger.error(f"Error writing log file notification: {e}")
        except Exception as e:
            logger.error(f"Error writing log file notification: {e}")

    def notify_all(self, alert: Dict) -> None:
        self.notify_console(alert)
        self.notify_system_tray(alert)
        self.notify_log_file(alert)
