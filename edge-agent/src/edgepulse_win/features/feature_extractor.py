# Feature extraction from telemetry with validation.

import logging
from datetime import datetime
from typing import Dict, List, Any

import numpy as np

from edgepulse_win.exceptions import ValidationError

logger = logging.getLogger(__name__)


class FeatureExtractor:
    """Extracts features from system telemetry with validation."""

    def __init__(
        self,
        window_1min: int = 60,
        window_5min: int = 300,
        window_15min: int = 900,
        feature_dimension: int = 50,
        history_retention_hours: int = 24,
    ) -> None:
        """Initialize the feature extractor."""
        if not all(isinstance(w, int) and w > 0 for w in (window_1min, window_5min, window_15min)):
            raise ValueError("Window sizes must be positive integers")
        if not isinstance(feature_dimension, int) or feature_dimension <= 0:
            raise ValueError("feature_dimension must be a positive integer")
        if not isinstance(history_retention_hours, int) or history_retention_hours <= 0:
            raise ValueError("history_retention_hours must be a positive integer")

        self.window_1min = window_1min
        self.window_5min = window_5min
        self.window_15min = window_15min
        self.feature_dimension = feature_dimension
        self.history_retention_hours = history_retention_hours

        self._history: List[Dict[str, Any]] = []

    def _validate_telemetry(self, telemetry: Dict[str, Any]) -> None:
        """Validate telemetry structure."""
        if not isinstance(telemetry, dict):
            raise ValidationError("Telemetry must be a dictionary")

        required_keys = ["system_metrics", "processes", "network_connections", "timestamp"]
        missing = [k for k in required_keys if k not in telemetry]
        if missing:
            raise ValidationError(f"Missing telemetry keys: {missing}")

        try:
            datetime.fromisoformat(telemetry["timestamp"])
        except (ValueError, TypeError):
            raise ValidationError("Invalid timestamp format")

    def _update_history(self, telemetry: Dict) -> None:
        """Update history buffer with retention."""
        self._history.append(telemetry)

        cutoff_time = datetime.utcnow().timestamp() - (self.history_retention_hours * 3600)
        self._history = [
            entry for entry in self._history
            if datetime.fromisoformat(entry["timestamp"]).timestamp() > cutoff_time
        ]

    def _get_windowed_data(self, window_seconds: int) -> List[Dict]:
        """Get telemetry within a time window."""
        cutoff_time = datetime.utcnow().timestamp() - window_seconds
        return [
            entry for entry in self._history
            if datetime.fromisoformat(entry["timestamp"]).timestamp() > cutoff_time
        ]

    def _extract_cpu_features(self, telemetry: Dict) -> List[float]:
        """Extract CPU-related features."""
        cpu_data = telemetry.get("system_metrics", {}).get("cpu", {})
        if not cpu_data:
            return [0.0] * 6

        return [
            float(cpu_data.get("cpu_percent_total", 0.0)),
            float(np.mean(cpu_data.get("cpu_percent_per_core", [0.0]))),
            float(np.max(cpu_data.get("cpu_percent_per_core", [0.0]))),
            float(np.std(cpu_data.get("cpu_percent_per_core", [0.0]))),
            float(cpu_data.get("cpu_count", 0)),
            float(cpu_data.get("cpu_frequency_mhz", 0.0) or 0.0),
        ]

    def _extract_memory_features(self, telemetry: Dict) -> List[float]:
        """Extract memory-related features."""
        mem_data = telemetry.get("system_metrics", {}).get("memory", {})
        if not mem_data:
            return [0.0] * 6

        return [
            float(mem_data.get("memory_percent", 0.0)),
            float(mem_data.get("memory_used_bytes", 0) / (1024**3)),  # GB
            float(mem_data.get("memory_available_bytes", 0) / (1024**3)),  # GB
            float(mem_data.get("swap_percent", 0.0)),
            float(mem_data.get("swap_used_bytes", 0) / (1024**3)),  # GB
            float(mem_data.get("memory_total_bytes", 0) / (1024**3)),  # GB
        ]

    def _extract_disk_features(self, telemetry: Dict) -> List[float]:
        """Extract disk I/O features."""
        disk_data = telemetry.get("system_metrics", {}).get("disk", {})
        if not disk_data:
            return [0.0] * 8

        return [
            float(disk_data.get("disk_read_bytes_delta", 0) / (1024**2)),  # MB/s
            float(disk_data.get("disk_write_bytes_delta", 0) / (1024**2)),  # MB/s
            float(disk_data.get("disk_read_count_delta", 0)),
            float(disk_data.get("disk_write_count_delta", 0)),
            float(disk_data.get("disk_read_bytes", 0) / (1024**3)),  # GB
            float(disk_data.get("disk_write_bytes", 0) / (1024**3)),  # GB
            float(disk_data.get("disk_read_count", 0)),
            float(disk_data.get("disk_write_count", 0)),
        ]

    def _extract_network_features(self, telemetry: Dict) -> List[float]:
        """Extract network features."""
        net_data = telemetry.get("system_metrics", {}).get("network", {})
        if not net_data:
            return [0.0] * 8

        return [
            float(net_data.get("network_bytes_sent_delta", 0) / (1024**2)),  # MB/s
            float(net_data.get("network_bytes_recv_delta", 0) / (1024**2)),  # MB/s
            float(net_data.get("network_packets_sent_delta", 0)),
            float(net_data.get("network_packets_recv_delta", 0)),
            float(net_data.get("network_errin", 0)),
            float(net_data.get("network_errout", 0)),
            float(net_data.get("network_dropin", 0)),
            float(net_data.get("network_dropout", 0)),
        ]

    def _extract_process_features(self, telemetry: Dict) -> List[float]:
        """Extract process-related features."""
        processes = telemetry.get("processes", [])
        if not processes:
            return [0.0] * 6

        total_cpu = sum(p.get("cpu_percent", 0) or 0 for p in processes)
        total_memory = sum(p.get("memory_percent", 0) or 0 for p in processes)
        unique_names = len(set(p.get("name", "") for p in processes))

        return [
            float(len(processes)),
            float(unique_names),
            float(total_cpu),
            float(total_memory),
            float(np.mean([p.get("cpu_percent", 0) or 0 for p in processes])),
            float(np.mean([p.get("memory_percent", 0) or 0 for p in processes])),
        ]

    def _extract_connection_features(self, telemetry: Dict) -> List[float]:
        """Extract network connection features."""
        connections = telemetry.get("network_connections", [])
        if not connections:
            return [0.0] * 6

        active = sum(1 for c in connections if c.get("status") == "ESTABLISHED")
        unique_destinations = len(set(c.get("remote_address") for c in connections if c.get("remote_address")))
        unique_ports = set()
        for c in connections:
            if c.get("local_port"):
                unique_ports.add(c["local_port"])
            if c.get("remote_port"):
                unique_ports.add(c["remote_port"])

        return [
            float(len(connections)),
            float(active),
            float(len(connections) - active),
            float(unique_destinations),
            float(len(unique_ports)),
            float(active / len(connections) if connections else 0.0),
        ]

    def _extract_temporal_features(self, telemetry: Dict) -> List[float]:
        """Extract temporal features."""
        try:
            dt = datetime.fromisoformat(telemetry["timestamp"])
            return [
                float(dt.hour),
                float(dt.weekday()),
                float(dt.minute),
                float(dt.second),
                float(dt.hour / 24.0),  # Normalized hour
                float(dt.weekday() / 7.0),  # Normalized weekday
            ]
        except (ValueError, TypeError):
            return [0.0] * 6

    def _extract_window_features(self, window_seconds: int) -> List[float]:
        """Extract features from historical window."""
        window_data = self._get_windowed_data(window_seconds)
        if not window_data:
            return [0.0] * 4

        cpu_values = [
            entry.get("system_metrics", {}).get("cpu", {}).get("cpu_percent_total", 0.0)
            for entry in window_data
        ]
        memory_values = [
            entry.get("system_metrics", {}).get("memory", {}).get("memory_percent", 0.0)
            for entry in window_data
        ]

        return [
            float(np.mean(cpu_values)),
            float(np.std(cpu_values)),
            float(np.mean(memory_values)),
            float(np.std(memory_values)),
        ]

    def extract_all_features(self, telemetry: Dict) -> np.ndarray:
        """Extract all features from telemetry."""
        self._validate_telemetry(telemetry)
        self._update_history(telemetry)

        features = []

        features.extend(self._extract_cpu_features(telemetry))
        features.extend(self._extract_memory_features(telemetry))
        features.extend(self._extract_disk_features(telemetry))
        features.extend(self._extract_network_features(telemetry))
        features.extend(self._extract_process_features(telemetry))
        features.extend(self._extract_connection_features(telemetry))
        features.extend(self._extract_temporal_features(telemetry))

        features.extend(self._extract_window_features(self.window_1min))
        features.extend(self._extract_window_features(self.window_5min))
        features.extend(self._extract_window_features(self.window_15min))

        feature_array = np.array(features, dtype=np.float32)

        # Pad or truncate to feature_dimension
        if len(feature_array) < self.feature_dimension:
            padding = np.zeros(self.feature_dimension - len(feature_array), dtype=np.float32)
            feature_array = np.concatenate([feature_array, padding])
        elif len(feature_array) > self.feature_dimension:
            feature_array = feature_array[: self.feature_dimension]

        return feature_array
