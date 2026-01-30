# Disk feature extraction.

from typing import Dict, List, Any
import numpy as np

from edgepulse_win.history_utils import get_window_data, trim_history


class DiskFeatureExtractor:
    def __init__(self, window_1min: int, retention_hours: int) -> None:
        self.window_1min = window_1min
        self.retention_hours = retention_hours
        self._history: List[Dict[str, Any]] = []

    def extract(self, metrics: List[Dict[str, Any]]) -> Dict[str, float]:
        if not metrics:
            return {
                "disk_write_burst_1min": 0.0,
                "disk_io_spike_1min": 0.0,
            }

        self._history.extend(metrics)
        self._history = trim_history(self._history, self.retention_hours)

        window_1min_data = get_window_data(self._history, self.window_1min)

        if not window_1min_data:
            return {
                "disk_write_burst_1min": 0.0,
                "disk_io_spike_1min": 0.0,
            }

        write_deltas = [
            m.get("disk_write_bytes_delta", 0) or 0
            for m in window_1min_data
            if m.get("disk_write_bytes_delta") is not None
        ]

        if not write_deltas:
            return {
                "disk_write_burst_1min": 0.0,
                "disk_io_spike_1min": 0.0,
            }

        write_burst = float(np.sum(write_deltas) / self.window_1min)
        mean_write = np.mean(write_deltas)
        if mean_write > 0:
            io_spike = float(np.max(write_deltas) / mean_write)
        else:
            io_spike = 0.0

        return {
            "disk_write_burst_1min": write_burst,
            "disk_io_spike_1min": io_spike,
        }
