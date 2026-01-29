"""
Simulation tests for attack scenarios
"""

import pytest
import numpy as np
import time
from unittest.mock import Mock, patch
from edgepulse.core.pipeline import Pipeline
from edgepulse.detectors.isolation_forest import IsolationForestDetector
from edgepulse.features.extractor import FeatureExtractor


class TestAttackSimulation:
    """Test attack detection scenarios"""
    
    def setup_method(self):
        """Setup test environment"""
        self.detector = IsolationForestDetector()
        self.extractor = FeatureExtractor()
        
        # Train detector on normal data
        normal_data = np.random.normal(50, 10, (1000, 5))
        self.detector.train(normal_data, {"contamination": 0.1})
        
    def test_cpu_spike_attack(self):
        """Test detection of CPU spike attack"""
        # Simulate normal CPU usage
        normal_telemetry = [
            {
                'timestamp': time.time(),
                'cpu_percent': np.random.normal(50, 10),
                'memory_percent': np.random.normal(60, 5),
                'disk_percent': np.random.normal(40, 5),
                'device_id': 'test-device'
            }
            for _ in range(10)
        ]
        
        # Extract features and detect
        normal_features = self.extractor.extract(normal_telemetry)
        normal_alerts = self.detector.detect(normal_features)
        
        # Simulate CPU spike attack
        attack_telemetry = [
            {
                'timestamp': time.time(),
                'cpu_percent': 95.0,  # Abnormal CPU spike
                'memory_percent': np.random.normal(60, 5),
                'disk_percent': np.random.normal(40, 5),
                'device_id': 'test-device'
            }
            for _ in range(10)
        ]
        
        attack_features = self.extractor.extract(attack_telemetry)
        attack_alerts = self.detector.detect(attack_features)
        
        # Verify attack detection
        normal_anomaly_count = sum(1 for alert in normal_alerts if getattr(alert, 'anomaly_score', 0) > 0.5)
        attack_anomaly_count = sum(1 for alert in attack_alerts if getattr(alert, 'anomaly_score', 0) > 0.5)
        
        assert attack_anomaly_count > normal_anomaly_count
        
    def test_memory_leak_attack(self):
        """Test detection of memory leak attack"""
        # Simulate gradual memory increase
        base_memory = 50.0
        leak_telemetry = []
        
        for i in range(20):
            leak_telemetry.append({
                'timestamp': time.time() + i,
                'cpu_percent': np.random.normal(50, 10),
                'memory_percent': base_memory + (i * 2),  # Gradual memory increase
                'disk_percent': np.random.normal(40, 5),
                'device_id': 'test-device'
            })
        
        features = self.extractor.extract(leak_telemetry)
        alerts = self.detector.detect(features)
        
        # Should detect anomalies in later samples
        late_alerts = alerts[-5:]  # Last 5 samples
        anomaly_count = sum(1 for alert in late_alerts if getattr(alert, 'anomaly_score', 0) > 0.5)
        
        assert anomaly_count >= 2  # At least 2 anomalies in late samples
        
    def test_suspicious_process_attack(self):
        """Test detection of suspicious process activity"""
        # Simulate normal process activity
        normal_telemetry = [
            {
                'timestamp': time.time(),
                'cpu_percent': np.random.normal(50, 10),
                'memory_percent': np.random.normal(60, 5),
                'disk_percent': np.random.normal(40, 5),
                'process_count': np.random.normal(100, 10),
                'device_id': 'test-device'
            }
            for _ in range(10)
        ]
        
        # Simulate suspicious process spawn
        attack_telemetry = [
            {
                'timestamp': time.time(),
                'cpu_percent': np.random.normal(50, 10),
                'memory_percent': np.random.normal(60, 5),
                'disk_percent': np.random.normal(40, 5),
                'process_count': 500,  # Abnormally high process count
                'device_id': 'test-device'
            }
        ]
        
        # Train with normal data including process count
        normal_features = self.extractor.extract(normal_telemetry)
        extended_normal = np.random.normal(50, 10, (100, 5))
        self.detector.train(extended_normal, {"contamination": 0.1})
        
        # Test attack detection
        attack_features = self.extractor.extract(attack_telemetry)
        attack_alerts = self.detector.detect(attack_features)
        
        # Should detect anomaly
        assert len(attack_alerts) > 0
        assert any(getattr(alert, 'anomaly_score', 0) > 0.5 for alert in attack_alerts)
