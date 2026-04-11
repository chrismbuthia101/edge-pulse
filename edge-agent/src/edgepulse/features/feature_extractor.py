# Feature extraction from telemetry with validation.

from edgepulse.utils.log_handler import get_logger
from datetime import datetime
from typing import Dict, List, Any, Optional
import hashlib
import json

import numpy as np

from edgepulse.utils.error_handler import ValidationError
from edgepulse.shared import normalize_timestamp
from edgepulse.features.cpu_features import CpuFeatureExtractor
from edgepulse.features.memory_features import MemoryFeatureExtractor
from edgepulse.features.disk_features import DiskFeatureExtractor
from edgepulse.features.network_features import NetworkFeatureExtractor
from edgepulse.features.process_features import ProcessFeatureExtractor

logger = get_logger(__name__)

FEATURE_SCHEMA: List[str] = [
    # CPU 1-min (5)
    "cpu_mean_1min",
    "cpu_std_1min",
    "cpu_max_1min",
    "cpu_rate_change_1min",
    "cpu_core_imbalance_1min",
    # CPU 5-min (5)
    "cpu_mean_5min",
    "cpu_std_5min",
    "cpu_max_5min",
    "cpu_rate_change_5min",
    "cpu_core_imbalance_5min",
    # Memory 1-min (4)
    "memory_growth_rate_1min",
    "memory_variance_1min",
    "memory_spike_1min",
    "memory_cpu_ratio_1min",
    # Memory 5-min (3)
    "memory_growth_rate_5min",
    "memory_variance_5min",
    "memory_cpu_ratio_5min",
    # Disk 1-min (3)
    "disk_write_burst_1min",
    "disk_io_spike_1min",
    "disk_write_read_ratio_1min",
    # Network 1-min (6)
    "network_entropy_1min",
    "network_unusual_ports_1min",
    "network_burst_pattern_1min",
    "network_error_rate_1min",
    "network_drop_rate_1min",
    "network_send_recv_ratio_1min",
    # Process 1-min (7)
    "process_spawn_frequency_1min",
    "process_unique_count_1min",
    "process_rare_executions_1min",
    "process_cpu_gini_1min",
    "process_admin_ratio_1min",
    "process_no_exe_path_ratio_1min",
    "process_long_cmdline_ratio_1min",
    # Temporal (3)
    "temporal_hour_sin",
    "temporal_hour_cos",
    "temporal_is_weekend",
]

class FeatureExtractor:
    """Extracts features from system telemetry with validation and schema versioning."""

    def __init__(
        self,
        window_1min: int = 60,
        window_5min: int = 300,
        window_15min: int = 900,
        feature_dimension: int = 50,
        history_retention_hours: int = 24,
        feature_schema_version: str = "1.1",
    ) -> None:
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

        # Sub-extractors
        self._cpu = CpuFeatureExtractor(window_1min, window_5min, history_retention_hours)
        self._memory = MemoryFeatureExtractor(window_1min, window_5min, history_retention_hours)
        self._disk = DiskFeatureExtractor(window_1min, history_retention_hours)
        self._network = NetworkFeatureExtractor(window_1min, history_retention_hours)
        self._process = ProcessFeatureExtractor(window_1min, history_retention_hours)

    # ------------------------------------------------------------------
    # Validation
    # ------------------------------------------------------------------

    def _validate_telemetry(self, telemetry: Dict[str, Any]) -> None:
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

    # ------------------------------------------------------------------
    # History management
    # ------------------------------------------------------------------

    def _safe_parse_timestamp(self, timestamp_str: str) -> float:
        """Safely parse timestamp string to unix timestamp"""
        try:
            return datetime.fromisoformat(timestamp_str).timestamp()
        except (ValueError, TypeError, AttributeError):
            logger.warning(f"Invalid timestamp format: {timestamp_str}")
            # Return current time as fallback to avoid data loss
            return datetime.utcnow().timestamp()

    def _update_history(self, telemetry: Dict) -> None:
        self._history.append(telemetry)
        cutoff_time = datetime.utcnow().timestamp() - (self.history_retention_hours * 3600)
        self._history = [
            entry for entry in self._history
            if self._safe_parse_timestamp(entry["timestamp"]) > cutoff_time
        ]

    def _get_windowed_data(self, window_seconds: int) -> List[Dict]:
        cutoff_time = datetime.utcnow().timestamp() - window_seconds
        return [
            entry for entry in self._history
            if self._safe_parse_timestamp(entry["timestamp"]) > cutoff_time
        ]

    # ------------------------------------------------------------------
    # Temporal features
    # ------------------------------------------------------------------

    def _extract_temporal_features(self, telemetry: Dict) -> Dict[str, float]:
        try:
            dt = datetime.fromisoformat(telemetry["timestamp"])
            hour_rad = (dt.hour / 24.0) * 2 * 3.14159265358979
            return {
                "temporal_hour_sin": float(np.sin(hour_rad)),
                "temporal_hour_cos": float(np.cos(hour_rad)),
                "temporal_is_weekend": float(dt.weekday() >= 5),
            }
        except (ValueError, TypeError):
            return {
                "temporal_hour_sin": 0.0,
                "temporal_hour_cos": 0.0,
                "temporal_is_weekend": 0.0,
            }

    # ------------------------------------------------------------------
    # Flat CPU metrics for sub-extractors
    # ------------------------------------------------------------------

    def _flatten_cpu_metrics(self, telemetry: Dict) -> List[Dict[str, Any]]:
        """Convert the nested cpu dict into the flat format the sub-extractors expect."""
        cpu = telemetry.get("system_metrics", {}).get("cpu", {})
        if not cpu:
            return []
        ts = telemetry.get("timestamp", datetime.utcnow().isoformat())
        return [{
            "timestamp": ts,
            "cpu_percent_total": cpu.get("cpu_percent_total", cpu.get("cpu_percent", 0)),
            "cpu_percent_per_core": cpu.get("cpu_percent_per_core", []),
        }]

    def _flatten_memory_metrics(self, telemetry: Dict) -> List[Dict[str, Any]]:
        mem = telemetry.get("system_metrics", {}).get("memory", {})
        cpu = telemetry.get("system_metrics", {}).get("cpu", {})
        if not mem:
            return []
        ts = telemetry.get("timestamp", datetime.utcnow().isoformat())
        return [{
            "timestamp": ts,
            "memory_percent": mem.get("memory_percent", 0),
            "cpu_percent_total": cpu.get("cpu_percent_total", cpu.get("cpu_percent", 0)),
        }]

    def _flatten_disk_metrics(self, telemetry: Dict) -> List[Dict[str, Any]]:
        disk = telemetry.get("system_metrics", {}).get("disk", {})
        if not disk:
            return []
        ts = telemetry.get("timestamp", datetime.utcnow().isoformat())
        return [{
            "timestamp": ts,
            "disk_write_bytes_delta": disk.get("disk_write_bytes_delta", 0),
            "disk_read_bytes_delta": disk.get("disk_read_bytes_delta", 0),
        }]

    def _flatten_network_metrics(self, telemetry: Dict) -> List[Dict[str, Any]]:
        """Merge connection list + IO counters into a single list for the extractor."""
        net = telemetry.get("system_metrics", {}).get("network", {})
        connections = telemetry.get("network_connections", [])
        ts = telemetry.get("timestamp", datetime.utcnow().isoformat())

        # Start with connection-level items (for entropy / port analysis)
        items = []
        for conn in connections:
            item = dict(conn)
            item.setdefault("timestamp", ts)
            # Attach IO counters to each connection record so the extractor can sum them
            item["network_packets_sent_delta"] = net.get("network_packets_sent_delta", 0)
            item["network_packets_recv_delta"] = net.get("network_packets_recv_delta", 0)
            item["network_bytes_sent_delta"] = net.get("network_bytes_sent_delta", 0)
            item["network_bytes_recv_delta"] = net.get("network_bytes_recv_delta", 0)
            item["network_errin"] = net.get("network_errin", 0)
            item["network_errout"] = net.get("network_errout", 0)
            item["network_dropin"] = net.get("network_dropin", 0)
            item["network_dropout"] = net.get("network_dropout", 0)
            items.append(item)

        # If no connections but there are IO counters, add a synthetic record
        if not items and net:
            items.append({
                "timestamp": ts,
                "remote_address": None,
                "remote_port": None,
                "network_packets_sent_delta": net.get("network_packets_sent_delta", 0),
                "network_packets_recv_delta": net.get("network_packets_recv_delta", 0),
                "network_bytes_sent_delta": net.get("network_bytes_sent_delta", 0),
                "network_bytes_recv_delta": net.get("network_bytes_recv_delta", 0),
                "network_errin": net.get("network_errin", 0),
                "network_errout": net.get("network_errout", 0),
                "network_dropin": net.get("network_dropin", 0),
                "network_dropout": net.get("network_dropout", 0),
            })

        return items

    # ------------------------------------------------------------------
    # Main extraction
    # ------------------------------------------------------------------

    def extract_all_features(self, telemetry: Dict) -> np.ndarray:
        """Extract all features from telemetry and return a fixed-length float32 array."""
        self._validate_telemetry(telemetry)
        self._update_history(telemetry)

        # Collect feature values in schema order
        named: Dict[str, float] = {}

        named.update(self._cpu.extract(self._flatten_cpu_metrics(telemetry)))
        named.update(self._memory.extract(self._flatten_memory_metrics(telemetry)))
        named.update(self._disk.extract(self._flatten_disk_metrics(telemetry)))
        named.update(self._network.extract(self._flatten_network_metrics(telemetry)))
        named.update(self._process.extract(telemetry.get("processes", [])))
        named.update(self._extract_temporal_features(telemetry))

        # Build array in canonical schema order; unknowns default to 0
        values = [float(named.get(name, 0.0)) for name in FEATURE_SCHEMA]

        feature_array = np.array(values, dtype=np.float32)

        # Pad or truncate to feature_dimension
        if len(feature_array) < self.feature_dimension:
            padding = np.zeros(self.feature_dimension - len(feature_array), dtype=np.float32)
            feature_array = np.concatenate([feature_array, padding])
        elif len(feature_array) > self.feature_dimension:
            feature_array = feature_array[: self.feature_dimension]

        return feature_array

    # ------------------------------------------------------------------
    # Metadata helpers
    # ------------------------------------------------------------------

    def get_feature_names(self) -> List[str]:
        """Return the canonical ordered feature name list padded to feature_dimension."""
        names = list(FEATURE_SCHEMA)
        while len(names) < self.feature_dimension:
            names.append(f"padding_{len(names)}")
        return names[: self.feature_dimension]

    def extract_features_with_metadata(
        self,
        telemetry: Dict,
        device_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Extract features with full metadata for database storage."""
        features = self.extract_all_features(telemetry)

        window_start = datetime.utcnow().timestamp() - self.window_15min
        window_end = datetime.utcnow().timestamp()

        source_event_ids = [
            entry.get("event_id")
            for entry in self._get_windowed_data(self.window_15min)
            if entry.get("event_id")
        ]

        return {
            "feature_vector": features.tobytes().hex(),
            "feature_schema_version": self.feature_schema_version,
            "source_event_ids": source_event_ids,
            "window_start_utc": datetime.fromtimestamp(window_start).isoformat(),
            "window_end_utc": datetime.fromtimestamp(window_end).isoformat(),
            "feature_names": self.get_feature_names(),
            "feature_count": len(features),
            "device_id": device_id,
            "extraction_timestamp": datetime.utcnow().isoformat(),
        }

    def normalize(self, features: np.ndarray) -> np.ndarray:
        """Z-score normalisation (per-call; use DeviceNormalizer for baseline-aware scaling)."""
        if len(features) == 0:
            return features
        mean = np.mean(features)
        std = np.std(features)
        if std == 0:
            return features - mean
        return (features - mean) / std

    def get_feature_schema_hash(self) -> str:
        schema_info = {
            "feature_schema_version": self.feature_schema_version,
            "feature_names": self.get_feature_names(),
            "feature_dimension": self.feature_dimension,
            "window_sizes": [self.window_1min, self.window_5min, self.window_15min],
        }
        schema_json = json.dumps(schema_info, sort_keys=True)
        return hashlib.sha256(schema_json.encode()).hexdigest()