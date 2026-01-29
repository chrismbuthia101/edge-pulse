"""Process feature extraction."""

from typing import Dict, List

from edgepulse_win.history_utils import get_window_data, trim_history


class ProcessFeatureExtractor:
    def __init__(self, window_1min: int, retention_hours: int):
        self.window_1min = window_1min
        self.retention_hours = retention_hours
        self._history: List[Dict] = []

    def extract(self, processes: List[Dict]) -> Dict:
        if not processes:
            return {
                "process_spawn_frequency_1min": 0.0,
                "process_unique_count_1min": 0,
                "process_rare_executions_1min": 0,
            }

        self._history.extend(processes)
        self._history = trim_history(self._history, self.retention_hours)

        window_1min_data = get_window_data(self._history, self.window_1min)

        if window_1min_data:
            unique_pids = len({p.get("pid") for p in window_1min_data})
            unique_names = len({p.get("name", "") for p in window_1min_data})
            name_counts: Dict[str, int] = {}
            for proc in window_1min_data:
                name = proc.get("name", "")
                name_counts[name] = name_counts.get(name, 0) + 1
            rare_count = sum(1 for count in name_counts.values() if count == 1)
            return {
                "process_spawn_frequency_1min": float(unique_pids / self.window_1min),
                "process_unique_count_1min": unique_names,
                "process_rare_executions_1min": rare_count,
            }

        return {
            "process_spawn_frequency_1min": 0.0,
            "process_unique_count_1min": 0,
            "process_rare_executions_1min": 0,
        }
