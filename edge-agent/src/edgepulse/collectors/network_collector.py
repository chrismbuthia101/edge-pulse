# Privacy: NO packet payloads or DNS content - metadata only.

from edgepulse.utils.log_handler import get_logger
import math
from typing import Dict, List, Optional, Any
from collections import Counter, defaultdict
from datetime import datetime
import psutil
from edgepulse.collectors.base import BaseCollector
from edgepulse.utils.error_handler import PermissionError, NetworkError

logger = get_logger(__name__)


class NetworkMonitor(BaseCollector):
    def __init__(self, rare_port_threshold: int = 5) -> None:
        self.rare_port_threshold = rare_port_threshold
        self._connection_history: List[Dict[str, Any]] = []
        self._port_frequency: Counter[int] = Counter()
        self._destination_frequency: Counter[str] = Counter()
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
            for conn in psutil.net_connections(kind='all'):
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

                    if conn.laddr:
                        self._port_frequency[conn.laddr.port] += 1
                    if conn.raddr:
                        self._port_frequency[conn.raddr.port] += 1
                        self._destination_frequency[conn.raddr.ip] += 1

                    self._connection_history.append(conn_info)

                except (psutil.AccessDenied, AttributeError) as e:
                    if isinstance(e, psutil.AccessDenied):
                        logger.debug(f"Access denied processing connection: {e}")
                    else:
                        logger.debug(f"Attribute error processing connection: {e}")
                    continue
                except NetworkError as e:
                    logger.warning(f"Network error processing connection: {e}")
                    continue
                except Exception as e:
                    logger.warning(f"Unexpected error processing connection: {e}")
                    continue
        except PermissionError as e:
            logger.warning(f"Access denied when getting network connections: {e}")
        except NetworkError as e:
            logger.error(f"Network error getting active connections: {e}")
        except Exception as e:
            logger.error(f"Error getting active connections: {e}")

        if len(self._connection_history) > 1000:
            self._connection_history = self._connection_history[-1000:]

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

        unique_destinations = len(set(
            conn["remote_address"]
            for conn in connections
            if conn["remote_address"]
        ))

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

    def detect_rare_ports(self) -> List[int]:
        if not self._port_frequency:
            return []

        rare_ports = [
            port
            for port, count in self._port_frequency.items()
            if count < self.rare_port_threshold
        ]

        return sorted(rare_ports)

    def calculate_connection_entropy(self, connections: Optional[List[Dict[str, Any]]] = None) -> float:
        if connections is None:
            connections = self.get_active_connections()

        if not connections:
            return 0.0

        destination_counts: Counter[str] = Counter(
            conn["remote_address"]
            for conn in connections
            if conn["remote_address"]
        )

        if not destination_counts:
            return 0.0

        total = sum(destination_counts.values())
        if total == 0:
            return 0.0

        entropy = 0.0
        for count in destination_counts.values():
            probability = count / total
            if probability > 0:
                entropy -= probability * math.log2(probability)

        return entropy

    def get_destination_statistics(self) -> Dict[str, Any]:
        connections = self.get_active_connections()

        destination_stats: defaultdict[str, Dict[str, Any]] = defaultdict(lambda: {
            "count": 0,
            "ports": set[int](),
            "statuses": Counter[str](),
        })

        for conn in connections:
            if not conn["remote_address"]:
                continue

            dest = conn["remote_address"]
            destination_stats[dest]["count"] += 1

            if conn["remote_port"]:
                destination_stats[dest]["ports"].add(conn["remote_port"])

            if conn["status"]:
                destination_stats[dest]["statuses"][conn["status"]] += 1

        result = {}
        for dest, stats in destination_stats.items():
            result[dest] = {
                "count": stats["count"],
                "ports": list(stats["ports"]),
                "statuses": dict(stats["statuses"]),
            }

        return {
            "timestamp": datetime.utcnow().isoformat(),
            "destinations": result,
            "total_unique_destinations": len(result),
        }

    def detect_burst_patterns(self, window_seconds: int = 60) -> List[Dict[str, Any]]:
        if not self._connection_history:
            return []

        cutoff_time = datetime.utcnow().timestamp() - window_seconds
        recent_connections = []
        for conn in self._connection_history:
            try:
                timestamp_str = conn.get("timestamp")
                if timestamp_str:
                    conn_time = datetime.fromisoformat(timestamp_str).timestamp()
                    if conn_time > cutoff_time:
                        recent_connections.append(conn)
            except (ValueError, TypeError, KeyError):
                continue

        if len(recent_connections) < 10:
            return []

        destination_counts: Counter[str] = Counter(
            conn["remote_address"]
            for conn in recent_connections
            if conn["remote_address"]
        )

        mean_count = sum(destination_counts.values()) / len(destination_counts) if destination_counts else 0
        std_count = math.sqrt(
            sum((count - mean_count) ** 2 for count in destination_counts.values()) / len(destination_counts)
        ) if destination_counts and len(destination_counts) > 1 else 0

        threshold = mean_count + 2 * std_count

        bursts = []
        for dest, count in destination_counts.items():
            if count > threshold:
                bursts.append({
                    "destination": dest,
                    "connection_count": count,
                    "window_seconds": window_seconds,
                    "timestamp": datetime.utcnow().isoformat(),
                })

        return bursts

    def reset_baseline(self) -> None:
        self._connection_history = []
        self._port_frequency = Counter()
        self._destination_frequency = Counter()
