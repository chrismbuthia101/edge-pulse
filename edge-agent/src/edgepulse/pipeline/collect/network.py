from edgepulse.utils.log_handler import get_logger
from typing import Dict, List, Any
from collections import Counter
from datetime import datetime
import psutil
from edgepulse.utils.error_handler import PermissionError, NetworkError

logger = get_logger(__name__)


class NetworkMonitor:
    def __init__(self) -> None:
        self._running = False

    def start(self) -> None:
        self._running = True
        logger.info("Network monitor started")

    def stop(self) -> None:
        self._running = False
        logger.info("Network monitor stopped")

    def collect(self) -> List[Any]:
        if not self._running:
            return []
        return [self.get_connection_statistics()]

    def get_active_connections(self) -> List[Dict]:
        connections = []

        try:
            for conn in psutil.net_connections(kind="all"):
                try:
                    conn_info: Dict[str, Any] = {
                        "timestamp": datetime.utcnow().isoformat(),
                        "family": str(conn.family),
                        "type": str(conn.type),
                        "status": conn.status,
                        "local_address": conn.laddr.ip if conn.laddr else None,
                        "local_port": conn.laddr.port if conn.laddr else None,
                        "remote_address": conn.raddr.ip if conn.raddr else None,
                        "remote_port": conn.raddr.port if conn.raddr else None,
                        "pid": conn.pid,
                    }
                    connections.append(conn_info)

                except (psutil.AccessDenied, AttributeError) as e:
                    logger.debug(f"Error processing connection: {e}")
                    continue
                except Exception as e:
                    logger.warning(f"Unexpected error processing connection: {e}")
                    continue
        except (psutil.AccessDenied, PermissionError) as e:
            logger.warning(f"Access denied when getting network connections: {e}")
        except NetworkError as e:
            logger.error(f"Network error getting active connections: {e}")
        except Exception as e:
            logger.error(f"Error getting active connections: {e}")

        return connections

    def get_connection_statistics(self) -> Dict[str, Any]:
        connections = self.get_active_connections()

        if not connections:
            return {
                "timestamp": datetime.utcnow().isoformat(),
                "total_connections": 0,
                "connections_by_status": {},
                "connections_by_protocol": {},
                "unique_destinations": 0,
                "unique_ports": 0,
            }

        status_counter: Counter[str] = Counter(conn["status"] for conn in connections)
        type_counter: Counter[str] = Counter(conn["type"] for conn in connections)

        unique_destinations = len(
            set(conn["remote_address"] for conn in connections if conn["remote_address"])
        )

        all_ports: set[int] = set()
        for conn in connections:
            if conn["local_port"]:
                all_ports.add(conn["local_port"])
            if conn["remote_port"]:
                all_ports.add(conn["remote_port"])

        return {
            "timestamp": datetime.utcnow().isoformat(),
            "total_connections": len(connections),
            "connections_by_status": dict(status_counter),
            "connections_by_protocol": dict(type_counter),
            "unique_destinations": unique_destinations,
            "unique_ports": len(all_ports),
        }
