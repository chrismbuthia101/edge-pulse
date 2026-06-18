from typing import Dict, List, Any
import numpy as np

from edgepulse.pipeline.extract.history import get_window_data, trim_history


class CpuFeatureExtractor:
    def __init__(self, window_1min: int, window_5min: int, retention_hours: int) -> None:
        self.window_1min = window_1min
        self.window_5min = window_5min
        self.retention_hours = retention_hours
        self._history: List[Dict[str, Any]] = []

    def extract(self, metrics: List[Dict[str, Any]]) -> Dict[str, float]:
        empty = {
            "cpu_mean_1min": 0.0,
            "cpu_std_1min": 0.0,
            "cpu_max_1min": 0.0,
            "cpu_rate_change_1min": 0.0,
            "cpu_core_imbalance_1min": 0.0,
            "cpu_mean_5min": 0.0,
            "cpu_std_5min": 0.0,
            "cpu_max_5min": 0.0,
            "cpu_rate_change_5min": 0.0,
            "cpu_core_imbalance_5min": 0.0,
        }

        if not metrics:
            return empty

        self._history.extend(metrics)
        self._history = trim_history(self._history, self.retention_hours)

        features: Dict[str, float] = {}

        def _process_window(window_data: List[Dict[str, Any]], label: str) -> None:
            cpu_total = [
                float(m.get("cpu_percent_total", 0) or 0)
                for m in window_data
                if m.get("cpu_percent_total") is not None
            ]

            if not cpu_total:
                for stat in ("mean", "std", "max", "rate_change", "core_imbalance"):
                    features[f"cpu_{stat}_{label}"] = 0.0
                return

            features[f"cpu_mean_{label}"] = float(np.mean(cpu_total))
            features[f"cpu_std_{label}"] = float(np.std(cpu_total)) if len(cpu_total) > 1 else 0.0
            features[f"cpu_max_{label}"] = float(np.max(cpu_total))

            if len(cpu_total) > 1:
                features[f"cpu_rate_change_{label}"] = float(
                    (cpu_total[-1] - cpu_total[0]) / len(cpu_total)
                )
            else:
                features[f"cpu_rate_change_{label}"] = 0.0

            per_core_stds = []
            for m in window_data:
                per_core = m.get("cpu_percent_per_core") or []
                if per_core and len(per_core) > 1:
                    per_core_stds.append(float(np.std(per_core)))
            features[f"cpu_core_imbalance_{label}"] = (
                float(np.mean(per_core_stds)) if per_core_stds else 0.0
            )

        _process_window(get_window_data(self._history, self.window_1min), "1min")
        _process_window(get_window_data(self._history, self.window_5min), "5min")

        return features
