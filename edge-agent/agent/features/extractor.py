"""
Feature Extractor

Transforms raw telemetry into ML-ready features using sliding time windows.
"""

import logging
from typing import Dict, List, Optional
import numpy as np
import pandas as pd
from datetime import datetime, timedelta

from agent.exceptions import ValidationError

logger = logging.getLogger(__name__)


class FeatureExtractor:
    """
    Extracts ML-ready features from raw telemetry data.
    
    Uses sliding time windows (1min, 5min, 15min) to generate temporal features.
    """

    def __init__(
        self,
        window_1min: int = 60,
        window_5min: int = 300,
        window_15min: int = 900,
        feature_dimension: int = 50,
        history_retention_hours: int = 1,
    ):
        """
        Initialize the feature extractor.
        
        Args:
            window_1min: 1-minute window in seconds (default: 60)
            window_5min: 5-minute window in seconds (default: 300)
            window_15min: 15-minute window in seconds (default: 900)
            feature_dimension: Target feature vector dimension (default: 50)
            history_retention_hours: History retention period in hours (default: 1)
        """
        self.window_1min = window_1min
        self.window_5min = window_5min
        self.window_15min = window_15min
        self.feature_dimension = feature_dimension
        self.history_retention_hours = history_retention_hours
        
        if feature_dimension < 10 or feature_dimension > 1000:
            raise ValidationError(f"Feature dimension must be between 10 and 1000, got {feature_dimension}")
        
        # Storage for time-series data
        self._cpu_history: List[Dict] = []
        self._memory_history: List[Dict] = []
        self._process_history: List[Dict] = []
        self._network_history: List[Dict] = []
        self._disk_history: List[Dict] = []

    def _safe_parse_timestamp(self, item: Dict, default: Optional[datetime] = None) -> Optional[datetime]:
        """
        Safely parse timestamp from an item.
        
        Args:
            item: Dictionary with potential timestamp
            default: Default datetime if parsing fails (default: None)
            
        Returns:
            Parsed datetime or default
        """
        try:
            timestamp_str = item.get("timestamp")
            if timestamp_str:
                return datetime.fromisoformat(timestamp_str)
        except (ValueError, TypeError):
            pass
        return default

    def _get_window_data(
        self, history: List[Dict], window_seconds: int
    ) -> List[Dict]:
        """
        Get data within a time window.
        
        Args:
            history: List of historical data points
            window_seconds: Window size in seconds
            
        Returns:
            List of data points within the window
        """
        if not history:
            return []
        
        cutoff_time = datetime.utcnow() - timedelta(seconds=window_seconds)
        
        window_data = []
        for item in history:
            item_time = self._safe_parse_timestamp(item)
            if item_time and item_time >= cutoff_time:
                window_data.append(item)
        
        return window_data

    def extract_cpu_features(self, metrics: List[Dict]) -> Dict:
        """
        Extract CPU-related features.
        
        Args:
            metrics: List of CPU metric dictionaries
            
        Returns:
            Dictionary with CPU features
        """
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
        
        # Update history
        self._cpu_history.extend(metrics)
        # Keep only recent history
        cutoff = datetime.utcnow() - timedelta(hours=self.history_retention_hours)
        self._cpu_history = [
            m for m in self._cpu_history
            if self._safe_parse_timestamp(m, datetime.min) >= cutoff
        ]
        
        features = {}
        
        # Extract CPU percent values
        cpu_values = [
            m.get("cpu_percent_total", 0) or 0
            for m in metrics
            if m.get("cpu_percent_total") is not None
        ]
        
        if not cpu_values:
            return {f"cpu_{stat}_{window}": 0.0 for stat in ["mean", "std", "max", "rate_change"] for window in ["1min", "5min"]}
        
        # 1-minute window
        window_1min_data = self._get_window_data(self._cpu_history, self.window_1min)
        cpu_1min = [
            m.get("cpu_percent_total", 0) or 0
            for m in window_1min_data
            if m.get("cpu_percent_total") is not None
        ]
        
        if cpu_1min:
            features["cpu_mean_1min"] = float(np.mean(cpu_1min))
            features["cpu_std_1min"] = float(np.std(cpu_1min)) if len(cpu_1min) > 1 else 0.0
            features["cpu_max_1min"] = float(np.max(cpu_1min))
            # Rate of change (first derivative approximation)
            if len(cpu_1min) > 1:
                features["cpu_rate_change_1min"] = float((cpu_1min[-1] - cpu_1min[0]) / len(cpu_1min))
            else:
                features["cpu_rate_change_1min"] = 0.0
        else:
            features.update({f"cpu_{stat}_1min": 0.0 for stat in ["mean", "std", "max", "rate_change"]})
        
        # 5-minute window
        window_5min_data = self._get_window_data(self._cpu_history, self.window_5min)
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

    def extract_memory_features(self, metrics: List[Dict]) -> Dict:
        """
        Extract memory-related features.
        
        Args:
            metrics: List of memory metric dictionaries
            
        Returns:
            Dictionary with memory features
        """
        if not metrics:
            return {
                "memory_growth_rate_1min": 0.0,
                "memory_variance_1min": 0.0,
                "memory_spike_1min": 0.0,
                "memory_growth_rate_5min": 0.0,
                "memory_variance_5min": 0.0,
            }
        
        # Update history
        self._memory_history.extend(metrics)
        cutoff = datetime.utcnow() - timedelta(hours=self.history_retention_hours)
        self._memory_history = [
            m for m in self._memory_history
            if self._safe_parse_timestamp(m, datetime.min) >= cutoff
        ]
        
        features = {}
        
        # Extract memory percent values
        memory_values = [
            m.get("memory_percent", 0) or 0
            for m in metrics
            if m.get("memory_percent") is not None
        ]
        
        if not memory_values:
            return {f"memory_{stat}_{window}": 0.0 for stat in ["growth_rate", "variance", "spike"] for window in ["1min", "5min"]}
        
        # 1-minute window
        window_1min_data = self._get_window_data(self._memory_history, self.window_1min)
        memory_1min = [
            m.get("memory_percent", 0) or 0
            for m in window_1min_data
            if m.get("memory_percent") is not None
        ]
        
        if memory_1min and len(memory_1min) > 1:
            features["memory_growth_rate_1min"] = float((memory_1min[-1] - memory_1min[0]) / len(memory_1min))
            features["memory_variance_1min"] = float(np.var(memory_1min))
            # Spike detection (deviation from mean)
            mean_1min = np.mean(memory_1min)
            features["memory_spike_1min"] = float(abs(memory_1min[-1] - mean_1min))
        else:
            features.update({f"memory_{stat}_1min": 0.0 for stat in ["growth_rate", "variance", "spike"]})
        
        # 5-minute window
        window_5min_data = self._get_window_data(self._memory_history, self.window_5min)
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

    def extract_process_features(self, processes: List[Dict]) -> Dict:
        """
        Extract process-related features.
        
        Args:
            processes: List of process dictionaries
            
        Returns:
            Dictionary with process features
        """
        if not processes:
            return {
                "process_spawn_frequency_1min": 0.0,
                "process_unique_count_1min": 0,
                "process_rare_executions_1min": 0,
            }
        
        # Update history
        self._process_history.extend(processes)
        cutoff = datetime.utcnow() - timedelta(hours=self.history_retention_hours)
        self._process_history = [
            p for p in self._process_history
            if self._safe_parse_timestamp(p, datetime.min) >= cutoff
        ]
        
        features = {}
        
        # 1-minute window
        window_1min_data = self._get_window_data(self._process_history, self.window_1min)
        
        if window_1min_data:
            # Spawn frequency (new processes per second)
            unique_pids = len(set(p.get("pid") for p in window_1min_data))
            features["process_spawn_frequency_1min"] = float(unique_pids / self.window_1min)
            
            # Unique process names
            unique_names = len(set(p.get("name", "") for p in window_1min_data))
            features["process_unique_count_1min"] = unique_names
            
            # Rare executions (processes that appear only once)
            name_counts = {}
            for p in window_1min_data:
                name = p.get("name", "")
                name_counts[name] = name_counts.get(name, 0) + 1
            
            rare_count = sum(1 for count in name_counts.values() if count == 1)
            features["process_rare_executions_1min"] = rare_count
        else:
            features.update({
                "process_spawn_frequency_1min": 0.0,
                "process_unique_count_1min": 0,
                "process_rare_executions_1min": 0,
            })
        
        return features

    def extract_network_features(self, connections: List[Dict]) -> Dict:
        """
        Extract network-related features.
        
        Args:
            connections: List of connection dictionaries
            
        Returns:
            Dictionary with network features
        """
        if not connections:
            return {
                "network_entropy_1min": 0.0,
                "network_unusual_ports_1min": 0,
                "network_burst_pattern_1min": 0.0,
            }
        
        # Update history
        self._network_history.extend(connections)
        cutoff = datetime.utcnow() - timedelta(hours=self.history_retention_hours)
        # Filter history with proper error handling for missing timestamps
        self._network_history = [
            c for c in self._network_history
            if self._safe_parse_timestamp(c, datetime.min) >= cutoff
        ]
        
        features = {}
        
        # 1-minute window
        window_1min_data = self._get_window_data(self._network_history, self.window_1min)
        
        if window_1min_data:
            # Calculate connection entropy
            destination_counts = {}
            for conn in window_1min_data:
                dest = conn.get("remote_address")
                if dest:
                    destination_counts[dest] = destination_counts.get(dest, 0) + 1
            
            if destination_counts:
                total = sum(destination_counts.values())
                entropy = 0.0
                for count in destination_counts.values():
                    prob = count / total
                    if prob > 0:
                        entropy -= prob * np.log2(prob)
                features["network_entropy_1min"] = float(entropy)
            else:
                features["network_entropy_1min"] = 0.0
            
            # Unusual ports (ports that appear rarely)
            port_counts = {}
            for conn in window_1min_data:
                port = conn.get("remote_port")
                if port:
                    port_counts[port] = port_counts.get(port, 0) + 1
            
            unusual_ports = sum(1 for count in port_counts.values() if count == 1)
            features["network_unusual_ports_1min"] = unusual_ports
            
            # Burst pattern (high connection rate)
            features["network_burst_pattern_1min"] = float(len(window_1min_data) / self.window_1min)
        else:
            features.update({
                "network_entropy_1min": 0.0,
                "network_unusual_ports_1min": 0,
                "network_burst_pattern_1min": 0.0,
            })
        
        return features

    def extract_disk_features(self, metrics: List[Dict]) -> Dict:
        """
        Extract disk I/O features.
        
        Args:
            metrics: List of disk metric dictionaries
            
        Returns:
            Dictionary with disk features
        """
        if not metrics:
            return {
                "disk_write_burst_1min": 0.0,
                "disk_io_spike_1min": 0.0,
            }
        
        # Update history
        self._disk_history.extend(metrics)
        cutoff = datetime.utcnow() - timedelta(hours=self.history_retention_hours)
        self._disk_history = [
            m for m in self._disk_history
            if self._safe_parse_timestamp(m, datetime.min) >= cutoff
        ]
        
        features = {}
        
        # 1-minute window
        window_1min_data = self._get_window_data(self._disk_history, self.window_1min)
        
        if window_1min_data:
            # Write burst detection
            write_deltas = [
                m.get("disk_write_bytes_delta", 0) or 0
                for m in window_1min_data
                if m.get("disk_write_bytes_delta") is not None
            ]
            
            if write_deltas:
                features["disk_write_burst_1min"] = float(np.sum(write_deltas) / self.window_1min)
                
                # I/O spike (deviation from mean)
                mean_write = np.mean(write_deltas)
                if mean_write > 0:
                    features["disk_io_spike_1min"] = float(np.max(write_deltas) / mean_write)
                else:
                    features["disk_io_spike_1min"] = 0.0
            else:
                features["disk_write_burst_1min"] = 0.0
                features["disk_io_spike_1min"] = 0.0
        else:
            features.update({
                "disk_write_burst_1min": 0.0,
                "disk_io_spike_1min": 0.0,
            })
        
        return features

    def extract_all_features(self, telemetry: Dict) -> np.ndarray:
        """
        Extract all features from telemetry data.
        
        Args:
            telemetry: Dictionary containing all telemetry data
            
        Returns:
            Numpy array of features (fixed-length vector)
        """
        features_dict = {}
        
        # Extract CPU features
        cpu_metrics = telemetry.get("system_metrics", {}).get("cpu", {})
        if isinstance(cpu_metrics, dict):
            cpu_metrics = [cpu_metrics]
        features_dict.update(self.extract_cpu_features(cpu_metrics))
        
        # Extract memory features
        memory_metrics = telemetry.get("system_metrics", {}).get("memory", {})
        if isinstance(memory_metrics, dict):
            memory_metrics = [memory_metrics]
        features_dict.update(self.extract_memory_features(memory_metrics))
        
        # Extract process features
        processes = telemetry.get("processes", [])
        features_dict.update(self.extract_process_features(processes))
        
        # Extract network features
        connections = telemetry.get("network_connections", [])
        features_dict.update(self.extract_network_features(connections))
        
        # Extract disk features
        disk_metrics = telemetry.get("system_metrics", {}).get("disk", {})
        if isinstance(disk_metrics, dict):
            disk_metrics = [disk_metrics]
        features_dict.update(self.extract_disk_features(disk_metrics))
        
        # Convert to fixed-length array (pad or truncate to configured dimension)
        feature_names = sorted(features_dict.keys())
        feature_values = [features_dict.get(name, 0.0) for name in feature_names]
        
        # Ensure fixed length (use configured dimension)
        target_length = self.feature_dimension
        if len(feature_values) < target_length:
            feature_values.extend([0.0] * (target_length - len(feature_values)))
        elif len(feature_values) > target_length:
            feature_values = feature_values[:target_length]
        
        return np.array(feature_values, dtype=np.float32)
