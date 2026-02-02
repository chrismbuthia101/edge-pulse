# CPU feature extraction.

from typing import Dict, List, Any
import numpy as np

from edgepulse_win.features.history_utils import get_window_data, trim_history


class CpuFeatureExtractor:
    def __init__(self, window_1min: int, window_5min: int, retention_hours: int) -> None:
        self.window_1min = window_1min
        self.window_5min = window_5min
        self.retention_hours = retention_hours
        self._history: List[Dict[str, Any]] = []

    def extract(self, metrics: List[Dict[str, Any]]) -> Dict[str, float]:
        if not metrics:
            return {
                "cpu_mean_1min": 0.0,
                "cpu_std_1min": 0.0,
                "cpu_max_1min": 0.0,
                "cpu_rate_change_1min": 0.0,
                "cpu_mean_5min": 0.0,
                "cpu_std_5min": 0.0,
                "cpu_max_5min": 0.0,
                "cpu_rate_change_5min": 0.0,
            }

        self._history.extend(metrics)
        self._history = trim_history(self._history, self.retention_hours)

        features: Dict[str, float] = {}

        cpu_values = [
            m.get("cpu_percent_total", 0) or 0
            for m in metrics
            if m.get("cpu_percent_total") is not None
        ]
        if not cpu_values:
            return {f"cpu_{stat}_{window}": 0.0 for stat in ["mean", "std", "max", "rate_change"] for window in ["1min", "5min"]}

        window_1min_data = get_window_data(self._history, self.window_1min)
        cpu_1min = [
            m.get("cpu_percent_total", 0) or 0
            for m in window_1min_data
            if m.get("cpu_percent_total") is not None
        ]

        if cpu_1min:
            features["cpu_mean_1min"] = float(np.mean(cpu_1min))
            features["cpu_std_1min"] = float(np.std(cpu_1min)) if len(cpu_1min) > 1 else 0.0
            features["cpu_max_1min"] = float(np.max(cpu_1min))
            if len(cpu_1min) > 1:
                features["cpu_rate_change_1min"] = float((cpu_1min[-1] - cpu_1min[0]) / len(cpu_1min))
            else:
                features["cpu_rate_change_1min"] = 0.0
        else:
            features.update({f"cpu_{stat}_1min": 0.0 for stat in ["mean", "std", "max", "rate_change"]})

        window_5min_data = get_window_data(self._history, self.window_5min)
        cpu_5min = [
            m.get("cpu_percent_total", 0) or 0
            for m in window_5min_data
            if m.get("cpu_percent_total") is not None
        ]

        if cpu_5min:
            features["cpu_mean_5min"] = float(np.mean(cpu_5min))
            features["cpu_std_5min"] = float(np.std(cpu_5min)) if len(cpu_5min) > 1 else 0.0
            features["cpu_max_5min"] = float(np.max(cpu_5min))
            if len(cpu_5min) > 1:
                features["cpu_rate_change_5min"] = float((cpu_5min[-1] - cpu_5min[0]) / len(cpu_5min))
            else:
                features["cpu_rate_change_5min"] = 0.0
        else:
            features.update({f"cpu_{stat}_5min": 0.0 for stat in ["mean", "std", "max", "rate_change"]})

        return features
