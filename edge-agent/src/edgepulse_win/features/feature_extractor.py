# Feature extraction from telemetry with validation.

from edgepulse_win.utils.log_handler import get_logger
from datetime import datetime
from typing import Dict, List, Any, Optional
import hashlib
import json

import numpy as np

from edgepulse_win.utils.error_handler import ValidationError
from edgepulse_win.shared import normalize_timestamp

logger = get_logger(__name__)


class FeatureExtractor:
    """Extracts features from system telemetry with validation and schema versioning."""

    def __init__(
        self,
        window_1min: int = 60,
        window_5min: int = 300,
        window_15min: int = 900,
        feature_dimension: int = 50,
        history_retention_hours: int = 24,
        feature_schema_version: str = "1.0",
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
        self.feature_schema_version = feature_schema_version

        self._history: List[Dict[str, Any]] = []
        self._feature_names: Optional[List[str]] = None

    def _validate_telemetry(self, telemetry: Dict[str, Any]) -> None:
        """Validate telemetry structure."""
        if not isinstance(telemetry, dict):
            raise ValidationError("Telemetry must be a dictionary")

        required_keys = ["system_metrics", "processes", "network_connections", "timestamp"]
        missing = [k for k in required_keys if k not in telemetry]
        if missing:
            raise ValidationError(f"Missing telemetry keys: {missing}")

        try:
            normalize_timestamp(telemetry["timestamp"])
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

    def get_feature_names(self) -> List[str]:
        """Get standardized feature names for the extracted features."""
        if self._feature_names is None:
            # Generate feature names based on extraction order
            self._feature_names = []
            
            # CPU features
            self._feature_names.extend([
                "cpu_percent_total", "cpu_percent_per_core_mean", "cpu_percent_per_core_max",
                "cpu_percent_per_core_std", "cpu_count", "cpu_frequency_mhz"
            ])
            
            # Memory features
            self._feature_names.extend([
                "memory_percent", "memory_used_gb", "memory_available_gb", "swap_percent",
                "swap_used_gb", "swap_total_gb"
            ])
            
            # Disk features
            self._feature_names.extend([
                "disk_percent", "disk_used_gb", "disk_free_gb", "disk_read_mb_s", "disk_write_mb_s"
            ])
            
            # Network features
            self._feature_names.extend([
                "network_connections_total", "network_connections_established",
                "network_connections_listen", "network_bytes_sent_total", "network_bytes_recv_total"
            ])
            
            # Process features
            self._feature_names.extend([
                "process_count_total", "process_count_running", "process_count_sleeping",
                "process_cpu_mean", "process_memory_mean"
            ])
            
            # Connection features
            self._feature_names.extend([
                "connection_count_tcp", "connection_count_udp", "connection_count_local",
                "connection_count_remote", "connection_ports_unique"
            ])
            
            # Temporal features
            self._feature_names.extend([
                "timestamp_hour", "timestamp_day_of_week", "timestamp_is_weekend"
            ])
            
            # Window features (1min, 5min, 15min)
            for window in ["1min", "5min", "15min"]:
                self._feature_names.extend([
                    f"cpu_mean_{window}", f"cpu_std_{window}", 
                    f"memory_mean_{window}", f"memory_std_{window}"
                ])
            
            # Pad to feature_dimension if needed
            while len(self._feature_names) < self.feature_dimension:
                self._feature_names.append(f"padding_{len(self._feature_names)}")
                
            # Truncate if too many
            self._feature_names = self._feature_names[:self.feature_dimension]
        
        return self._feature_names

    def extract_features_with_metadata(
        self, 
        telemetry: Dict, 
        device_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Extract features with full metadata for database storage."""
        features = self.extract_all_features(telemetry)
        
        # Get window bounds
        window_start = datetime.utcnow().timestamp() - self.window_15min
        window_end = datetime.utcnow().timestamp()
        
        # Get source event IDs from history window
        source_event_ids = [
            entry.get("event_id") 
            for entry in self._get_windowed_data(self.window_15min)
            if entry.get("event_id")
        ]
        
        # Create feature vector metadata
        metadata = {
            "feature_vector": features.tobytes().hex(),  # Store as hex string for BLOB
            "feature_schema_version": self.feature_schema_version,
            "source_event_ids": source_event_ids,
            "window_start_utc": datetime.fromtimestamp(window_start).isoformat(),
            "window_end_utc": datetime.fromtimestamp(window_end).isoformat(),
            "feature_names": self.get_feature_names(),
            "feature_count": len(features),
            "device_id": device_id,
            "extraction_timestamp": datetime.utcnow().isoformat()
        }
        
        return metadata

    def normalize(self, features: np.ndarray) -> np.ndarray:
        """Normalize features using z-score normalization."""
        if len(features) == 0:
            return features
            
        # Avoid division by zero
        mean = np.mean(features)
        std = np.std(features)
        
        if std == 0:
            return features - mean
            
        return (features - mean) / std

    def get_feature_schema_hash(self) -> str:
        """Get hash of current feature schema for versioning."""
        schema_info = {
            "feature_schema_version": self.feature_schema_version,
            "feature_names": self.get_feature_names(),
            "feature_dimension": self.feature_dimension,
            "window_sizes": [self.window_1min, self.window_5min, self.window_15min]
        }
        
        schema_json = json.dumps(schema_info, sort_keys=True)
        return hashlib.sha256(schema_json.encode()).hexdigest()
