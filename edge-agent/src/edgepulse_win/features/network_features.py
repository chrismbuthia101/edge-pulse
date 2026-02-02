# Network feature extraction.

from typing import Dict, List, Any
import numpy as np

from edgepulse_win.features.history_utils import get_window_data, trim_history


class NetworkFeatureExtractor:
    def __init__(self, window_1min: int, retention_hours: int) -> None:
        self.window_1min = window_1min
        self.retention_hours = retention_hours
        self._history: List[Dict[str, Any]] = []

    def extract(self, connections: List[Dict[str, Any]]) -> Dict[str, Any]:
        if not connections:
            return {
                "network_entropy_1min": 0.0,
                "network_unusual_ports_1min": 0,
                "network_burst_pattern_1min": 0.0,
            }

        self._history.extend(connections)
        self._history = trim_history(self._history, self.retention_hours)

        window_1min_data = get_window_data(self._history, self.window_1min)

        if not window_1min_data:
            return {
                "network_entropy_1min": 0.0,
                "network_unusual_ports_1min": 0,
                "network_burst_pattern_1min": 0.0,
            }

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
                port_counts[port] = port_counts.get(port, 0) + 1

        unusual_ports = sum(1 for count in port_counts.values() if count == 1)

        return {
            "network_entropy_1min": float(entropy),
            "network_unusual_ports_1min": unusual_ports,
            "network_burst_pattern_1min": float(len(window_1min_data) / self.window_1min),
        }
