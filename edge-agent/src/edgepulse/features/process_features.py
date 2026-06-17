from typing import Dict, List, Any

from edgepulse.features.history_utils import get_window_data, trim_history


_EMPTY = {
    "process_spawn_frequency_1min": 0.0,
    "process_unique_count_1min": 0,
    "process_rare_executions_1min": 0,
    "process_cpu_gini_1min": 0.0,
    "process_admin_ratio_1min": 0.0,
    "process_no_exe_path_ratio_1min": 0.0,
    "process_long_cmdline_ratio_1min": 0.0,
}


def calculate_gini_coefficient(values: List[float]) -> float:
    if not values or len(values) < 2:
        return 0.0

    sorted_values = sorted(values)
    n = len(values)
    cumulative_sum = 0
    total_sum = sum(sorted_values)

    if total_sum == 0:
        return 0.0

    for i, value in enumerate(sorted_values, 1):
        cumulative_sum += i * value

    gini = (2 * cumulative_sum) / (n * total_sum) - (n + 1) / n
    return max(0.0, min(1.0, gini))


class ProcessFeatureExtractor:
    def __init__(self, window_1min: int, retention_hours: int) -> None:
        self.window_1min = window_1min
        self.retention_hours = retention_hours
        self._history: List[Dict[str, Any]] = []

    def extract(self, processes: List[Dict[str, Any]]) -> Dict[str, Any]:
        if not processes:
            return dict(_EMPTY)

        self._history.extend(processes)
        self._history = trim_history(self._history, self.retention_hours)

        window_1min_data = get_window_data(self._history, self.window_1min)

        if not window_1min_data:
            return dict(_EMPTY)

        unique_pids = len({p.get("pid") for p in window_1min_data})
        unique_names = len({p.get("name", "") for p in window_1min_data})
        name_counts: Dict[str, int] = {}
        cpu_values = []
        admin_count = 0
        no_exe_path_count = 0
        long_cmdline_count = 0

        for proc in window_1min_data:
            name = proc.get("name", "")
            name_counts[name] = name_counts.get(name, 0) + 1

            cpu_percent = proc.get("cpu_percent", 0.0)
            if isinstance(cpu_percent, (int, float)):
                cpu_values.append(float(cpu_percent))

            if proc.get("is_admin", False) or proc.get("user") in [
                "root",
                "Administrator",
                "SYSTEM",
            ]:
                admin_count += 1

            exe_path = proc.get("exe_path", "")
            if not exe_path or exe_path == "":
                no_exe_path_count += 1

            cmdline = proc.get("cmdline", "")
            if len(str(cmdline)) > 100:
                long_cmdline_count += 1

        rare_count = sum(1 for count in name_counts.values() if count == 1)
        total_processes = len(window_1min_data)
        cpu_gini = calculate_gini_coefficient(cpu_values)

        return {
            "process_spawn_frequency_1min": float(unique_pids / self.window_1min),
            "process_unique_count_1min": unique_names,
            "process_rare_executions_1min": rare_count,
            "process_cpu_gini_1min": cpu_gini,
            "process_admin_ratio_1min": admin_count / total_processes if total_processes > 0 else 0.0,
            "process_no_exe_path_ratio_1min": no_exe_path_count / total_processes if total_processes > 0 else 0.0,
            "process_long_cmdline_ratio_1min": long_cmdline_count / total_processes if total_processes > 0 else 0.0,
        }
