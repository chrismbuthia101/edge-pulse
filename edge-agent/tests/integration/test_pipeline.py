"""
Integration tests for processing pipeline
"""

import pytest
import numpy as np
from unittest.mock import Mock
from edgepulse.core.pipeline import Pipeline
from edgepulse.collectors.base import BaseCollector
from edgepulse.features.extractor import FeatureExtractor
from edgepulse.detectors.base import BaseDetector
from edgepulse.alerts.engine import AlertEngine


class MockCollector(BaseCollector):
    """Mock collector for testing"""
    
    def __init__(self, data=None):
        self.data = data or []
        
    def collect(self):
        return self.data
        
    def start(self):
        pass
        
    def stop(self):
        pass


class MockDetector(BaseDetector):
    """Mock detector for testing"""
    
    def train(self, training_data, config):
        pass
        
    def detect(self, features):
        return [{"anomaly_score": 0.8, "alert": True} for _ in features]
        
    def evaluate(self, test_data):
        return {"accuracy": 0.9}


class TestPipeline:
    """Test processing pipeline integration"""
    
    def test_pipeline_initialization(self):
        """Test pipeline initialization"""
        collectors = [MockCollector()]
        extractor = FeatureExtractor()
        detectors = [MockDetector()]
        alert_engine = Mock()
        
        pipeline = Pipeline(collectors, extractor, detectors, alert_engine)
        
        assert len(pipeline.collectors) == 1
        assert pipeline.feature_extractor == extractor
        assert len(pipeline.detectors) == 1
        assert pipeline.alert_engine == alert_engine
        
    def test_pipeline_processing(self):
        """Test end-to-end pipeline processing"""
        # Setup mock data
        telemetry_data = [
            {
                'timestamp': '2024-01-01T00:00:00Z',
                'cpu_percent': 50.0,
                'memory_percent': 60.0,
                'device_id': 'test-device'
            }
        ]
        
        # Setup components
        collectors = [MockCollector(telemetry_data)]
        extractor = FeatureExtractor()
        detectors = [MockDetector()]
        alert_engine = Mock()
        
        # Run pipeline
        pipeline = Pipeline(collectors, extractor, detectors, alert_engine)
        alerts = pipeline.process()
        
        # Verify results
        assert len(alerts) == 1
        alert_engine.process.assert_called_once_with(alerts)
