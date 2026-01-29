"""
Unit tests for feature extraction
"""

import pytest
import numpy as np
from edgepulse.features.extractor import FeatureExtractor
from edgepulse.features.baseline import DeviceNormalizer


class TestFeatureExtractor:
    """Test feature extraction"""
    
    def test_feature_extractor_initialization(self):
        """Test feature extractor initialization"""
        extractor = FeatureExtractor()
        assert extractor.window_1min == 60
        assert extractor.window_5min == 300
        
    def test_extract_features(self):
        """Test feature extraction from telemetry data"""
        extractor = FeatureExtractor()
        telemetry_data = [
            {
                'timestamp': '2024-01-01T00:00:00Z',
                'cpu_percent': 50.0,
                'memory_percent': 60.0,
                'disk_percent': 70.0,
            }
        ]
        
        features = extractor.extract(telemetry_data)
        assert isinstance(features, np.ndarray)
        assert features.shape[0] == len(telemetry_data)


class TestDeviceNormalizer:
    """Test device normalization"""
    
    def test_normalizer_initialization(self):
        """Test normalizer initialization"""
        normalizer = DeviceNormalizer(device_id="test-device")
        assert normalizer.device_id == "test-device"
        
    def test_normalize_features(self):
        """Test feature normalization"""
        normalizer = DeviceNormalizer(device_id="test-device")
        features = np.random.rand(10, 5)
        
        normalized = normalizer.normalize(features)
        assert normalized.shape == features.shape
        assert isinstance(normalized, np.ndarray)
