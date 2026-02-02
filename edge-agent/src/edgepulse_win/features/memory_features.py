# Memory feature extraction.

from typing import Dict, List, Any
import numpy as np

from edgepulse_win.features.history_utils import get_window_data, trim_history


class MemoryFeatureExtractor:
    def __init__(self, window_1min: int, window_5min: int, retention_hours: int) -> None:
        self.window_1min = window_1min
        self.window_5min = window_5min
        self.retention_hours = retention_hours
        self._history: List[Dict[str, Any]] = []

    def extract(self, metrics: List[Dict[str, Any]]) -> Dict[str, float]:
        if not metrics:
            return {
                "memory_growth_rate_1min": 0.0,
                "memory_variance_1min": 0.0,
                "memory_spike_1min": 0.0,
                "memory_growth_rate_5min": 0.0,
                "memory_variance_5min": 0.0,
            }

        self._history.extend(metrics)
        self._history = trim_history(self._history, self.retention_hours)

        features: Dict[str, float] = {}

        memory_values = [
            m.get("memory_percent", 0) or 0
            for m in metrics
            if m.get("memory_percent") is not None
        ]

        if not memory_values:
            return {f"memory_{stat}_{window}": 0.0 for stat in ["growth_rate", "variance", "spike"] for window in ["1min", "5min"]}

        window_1min_data = get_window_data(self._history, self.window_1min)
        memory_1min = [
            m.get("memory_percent", 0) or 0
            for m in window_1min_data
            if m.get("memory_percent") is not None
        ]

        if memory_1min and len(memory_1min) > 1:
            features["memory_growth_rate_1min"] = float((memory_1min[-1] - memory_1min[0]) / len(memory_1min))
            features["memory_variance_1min"] = float(np.var(memory_1min))
            mean_1min = np.mean(memory_1min)
            features["memory_spike_1min"] = float(abs(memory_1min[-1] - mean_1min))
        else:
            features.update({f"memory_{stat}_1min": 0.0 for stat in ["growth_rate", "variance", "spike"]})

        window_5min_data = get_window_data(self._history, self.window_5min)
        memory_5min = [
            m.get("memory_percent", 0) or 0
            for m in window_5min_data
            if m.get("memory_percent") is not None
        ]

        if memory_5min and len(memory_5min) > 1:
            features["memory_growth_rate_5min"] = float((memory_5min[-1] - memory_5min[0]) / len(memory_5min))
            features["memory_variance_5min"] = float(np.var(memory_5min))
        else:
            features.update({f"memory_{stat}_5min": 0.0 for stat in ["growth_rate", "variance"]})

        return features
