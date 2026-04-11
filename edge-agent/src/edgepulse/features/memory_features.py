# Memory feature extraction.

from typing import Dict, List, Any
import numpy as np

from edgepulse.features.history_utils import get_window_data, trim_history


class MemoryFeatureExtractor:
    def __init__(self, window_1min: int, window_5min: int, retention_hours: int) -> None:
        self.window_1min = window_1min
        self.window_5min = window_5min
        self.retention_hours = retention_hours
        self._history: List[Dict[str, Any]] = []

    def extract(self, metrics: List[Dict[str, Any]]) -> Dict[str, float]:
        empty = {
            "memory_growth_rate_1min": 0.0,
            "memory_variance_1min": 0.0,
            "memory_spike_1min": 0.0,
            "memory_cpu_ratio_1min": 0.0,
            "memory_growth_rate_5min": 0.0,
            "memory_variance_5min": 0.0,
            "memory_cpu_ratio_5min": 0.0,
        }

        if not metrics:
            return empty

        self._history.extend(metrics)
        self._history = trim_history(self._history, self.retention_hours)

        features: Dict[str, float] = {}

        def _process_window(window_data: List[Dict[str, Any]], label: str) -> None:
            mem_vals = [
                float(m.get("memory_percent", 0) or 0)
                for m in window_data
                if m.get("memory_percent") is not None
            ]
            cpu_vals = [
                float(m.get("cpu_percent_total", 0) or 0)
                for m in window_data
                if m.get("cpu_percent_total") is not None
            ]

            if not mem_vals or len(mem_vals) < 2:
                features[f"memory_growth_rate_{label}"] = 0.0
                features[f"memory_variance_{label}"] = 0.0
                if label == "1min":
                    features[f"memory_spike_{label}"] = 0.0
                features[f"memory_cpu_ratio_{label}"] = 0.0
                return

            features[f"memory_growth_rate_{label}"] = float(
                (mem_vals[-1] - mem_vals[0]) / len(mem_vals)
            )
            features[f"memory_variance_{label}"] = float(np.var(mem_vals))

            if label == "1min":
                mean_mem = float(np.mean(mem_vals))
                features[f"memory_spike_{label}"] = float(abs(mem_vals[-1] - mean_mem))

            avg_mem = float(np.mean(mem_vals))
            avg_cpu = float(np.mean(cpu_vals)) if cpu_vals else 0.0
            if avg_cpu > 0:
                features[f"memory_cpu_ratio_{label}"] = avg_mem / avg_cpu
            else:
                features[f"memory_cpu_ratio_{label}"] = avg_mem  # CPU is idle; use raw mem

        _process_window(get_window_data(self._history, self.window_1min), "1min")
        _process_window(get_window_data(self._history, self.window_5min), "5min")

        return features