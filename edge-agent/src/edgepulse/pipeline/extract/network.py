from typing import Dict, List, Any
import numpy as np

from edgepulse.pipeline.extract.history import get_window_data, trim_history


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

        totals = {
            "packets_sent": 0.0,
            "packets_recv": 0.0,
            "errin": 0.0,
            "errout": 0.0,
            "dropin": 0.0,
            "dropout": 0.0,
            "bytes_sent": 0.0,
            "bytes_recv": 0.0,
        }
        fields = {
            "packets_sent": "network_packets_sent_delta",
            "packets_recv": "network_packets_recv_delta",
            "errin": "network_errin",
            "errout": "network_errout",
            "dropin": "network_dropin",
            "dropout": "network_dropout",
            "bytes_sent": "network_bytes_sent_delta",
            "bytes_recv": "network_bytes_recv_delta",
        }

        for item in window_1min_data:
            for key, field in fields.items():
                totals[key] += float(item.get(field, 0) or 0)

        total_packets = totals["packets_sent"] + totals["packets_recv"]
        total_errors = totals["errin"] + totals["errout"]
        total_drops = totals["dropin"] + totals["dropout"]

        error_rate = (total_errors / total_packets) if total_packets > 0 else 0.0
        drop_rate = (total_drops / total_packets) if total_packets > 0 else 0.0

        if totals["bytes_recv"] > 0:
            send_recv_ratio = totals["bytes_sent"] / totals["bytes_recv"]
        elif totals["bytes_sent"] > 0:
            send_recv_ratio = totals["bytes_sent"]
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
