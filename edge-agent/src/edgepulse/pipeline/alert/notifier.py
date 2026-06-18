from edgepulse.utils.log_handler import get_logger
from typing import Dict

from edgepulse.utils.log_handler import LoggingError

logger = get_logger(__name__)


class LocalNotifier:

    def __init__(
        self,
        enable_console: bool = True,
        enable_log_file: bool = True,
    ):
        self.enable_console = enable_console
        self.enable_log_file = enable_log_file

    def notify_console(self, alert: Dict) -> None:
        if not self.enable_console:
            return

        try:
            anomaly = alert.get("anomaly", {})
            severity = str(alert.get("severity", "unknown")).upper()
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
        self.notify_log_file(alert)
