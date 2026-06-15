from typing import Dict, List, Any
import numpy as np

from edgepulse.features.history_utils import get_window_data, trim_history


class NetworkFeatureExtractor:
    def __init__(self, window_1min: int, retention_hours: int) -> None:
        self.window_1min = window_1min
        self.retention_hours = retention_hours
        self._history: List[Dict[str, Any]] = []

    def extract(self, connections: List[Dict[str, Any]]) -> Dict[str, Any]:
        empty = {
            "network_entropy_1min": 0.0,
            "network_unusual_ports_1min": 0,
            "network_burst_pattern_1min": 0.0,
            "network_error_rate_1min": 0.0,
            "network_drop_rate_1min": 0.0,
            "network_send_recv_ratio_1min": 0.0,
        }

        if not connections:
            return empty

        self._history.extend(connections)
        self._history = trim_history(self._history, self.retention_hours)

        window_1min_data = get_window_data(self._history, self.window_1min)
        if not window_1min_data:
            return empty

        destination_counts: Dict[str, int] = {}
        for conn in window_1min_data:
            dest = conn.get("remote_address")
            if dest:
                destination_counts[dest] = destination_counts.get(dest, 0) + 1

        if destination_counts:
            total = sum(destination_counts.values())
            entropy = 0.0
            for count in destination_counts.values():
                prob = count / total
                if prob > 0:
                    entropy -= prob * np.log2(prob)
        else:
            entropy = 0.0

        port_counts: Dict[int, int] = {}
        for conn in window_1min_data:
            port = conn.get("remote_port")
            if port:
                port_counts[int(port)] = port_counts.get(int(port), 0) + 1
        unusual_ports = sum(1 for count in port_counts.values() if count == 1)

        burst_pattern = float(len(window_1min_data) / self.window_1min)

        total_packets_sent = 0.0
        total_packets_recv = 0.0
        total_errin = 0.0
        total_errout = 0.0
        total_dropin = 0.0
        total_dropout = 0.0
        total_bytes_sent = 0.0
        total_bytes_recv = 0.0

        for item in window_1min_data:
            total_packets_sent += float(item.get("network_packets_sent_delta", 0) or 0)
            total_packets_recv += float(item.get("network_packets_recv_delta", 0) or 0)
            total_errin += float(item.get("network_errin", 0) or 0)
            total_errout += float(item.get("network_errout", 0) or 0)
            total_dropin += float(item.get("network_dropin", 0) or 0)
            total_dropout += float(item.get("network_dropout", 0) or 0)
            total_bytes_sent += float(item.get("network_bytes_sent_delta", 0) or 0)
            total_bytes_recv += float(item.get("network_bytes_recv_delta", 0) or 0)

        total_packets = total_packets_sent + total_packets_recv
        total_errors = total_errin + total_errout
        total_drops = total_dropin + total_dropout

        error_rate = (total_errors / total_packets) if total_packets > 0 else 0.0
        drop_rate = (total_drops / total_packets) if total_packets > 0 else 0.0

        if total_bytes_recv > 0:
            send_recv_ratio = total_bytes_sent / total_bytes_recv
        elif total_bytes_sent > 0:
            send_recv_ratio = total_bytes_sent
        else:
            send_recv_ratio = 0.0

        return {
            "network_entropy_1min": float(entropy),
            "network_unusual_ports_1min": unusual_ports,
            "network_burst_pattern_1min": burst_pattern,
            "network_error_rate_1min": float(error_rate),
            "network_drop_rate_1min": float(drop_rate),
            "network_send_recv_ratio_1min": float(send_recv_ratio),
        }
