"""
Unit tests for anomaly detectors
"""

import pytest
import numpy as np
from edgepulse.detectors.base import BaseDetector
from edgepulse.detectors.isolation_forest import IsolationForestDetector


class TestBaseDetector:
    """Test base detector interface"""
    
    def test_base_detector_is_abstract(self):
        """Test that BaseDetector cannot be instantiated directly"""
        with pytest.raises(TypeError):
            BaseDetector()


class TestIsolationForestDetector:
    """Test isolation forest detector"""
    
    def test_detector_initialization(self):
        """Test detector initialization"""
        detector = IsolationForestDetector()
        assert detector.contamination == 0.1
        assert detector.n_estimators == 100
        
    def test_train_detector(self):
        """Test training the detector"""
        detector = IsolationForestDetector()
        training_data = np.random.rand(100, 5)
        config = {"contamination": 0.1}
        
        detector.train(training_data, config)
        assert detector.model is not None
        
    def test_detect_anomalies(self):
        """Test anomaly detection"""
        detector = IsolationForestDetector()
        training_data = np.random.rand(100, 5)
        detector.train(training_data, {"contamination": 0.1})
        
        test_data = np.random.rand(10, 5)
        alerts = detector.detect(test_data)
        
        assert len(alerts) == len(test_data)
        assert all(hasattr(alert, 'anomaly_score') for alert in alerts)
