from typing import Dict, List, Any
import numpy as np

from edgepulse.pipeline.extract.history import get_window_data, trim_history


_EMPTY = {
    "disk_write_burst_1min": 0.0,
    "disk_io_spike_1min": 0.0,
    "disk_write_read_ratio_1min": 0.0,
}


class DiskFeatureExtractor:
    def __init__(self, window_1min: int, retention_hours: int) -> None:
        self.window_1min = window_1min
        self.retention_hours = retention_hours
        self._history: List[Dict[str, Any]] = []

    def extract(self, metrics: List[Dict[str, Any]]) -> Dict[str, float]:
        if not metrics:
            return dict(_EMPTY)

        self._history.extend(metrics)
        self._history = trim_history(self._history, self.retention_hours)

        window_1min_data = get_window_data(self._history, self.window_1min)
        if not window_1min_data:
            return dict(_EMPTY)

        write_deltas = [
            float(m.get("disk_write_bytes_delta", 0) or 0)
            for m in window_1min_data
            if m.get("disk_write_bytes_delta") is not None
        ]

        if not write_deltas:
            return dict(_EMPTY)

        read_deltas = [
            float(m.get("disk_read_bytes_delta", 0) or 0)
            for m in window_1min_data
            if m.get("disk_read_bytes_delta") is not None
        ]

        write_burst = float(np.sum(write_deltas) / self.window_1min)

        mean_write = float(np.mean(write_deltas))
        io_spike = float(np.max(write_deltas) / mean_write) if mean_write > 0 else 0.0

        total_write = float(np.sum(write_deltas))
        total_read = float(np.sum(read_deltas)) if read_deltas else 0.0
        if total_read > 0:
            write_read_ratio = total_write / total_read
        elif total_write > 0:
            write_read_ratio = total_write
        else:
            write_read_ratio = 0.0

        return {
            "disk_write_burst_1min": write_burst,
            "disk_io_spike_1min": io_spike,
            "disk_write_read_ratio_1min": write_read_ratio,
        }
