"""
Unit tests for data collectors
"""

import pytest
from unittest.mock import Mock, patch
from edgepulse.collectors.base import BaseCollector
from edgepulse.collectors.system import SystemMetricsCollector


class TestBaseCollector:
    """Test base collector interface"""
    
    def test_base_collector_is_abstract(self):
        """Test that BaseCollector cannot be instantiated directly"""
        with pytest.raises(TypeError):
            BaseCollector()


class TestSystemMetricsCollector:
    """Test system metrics collector"""
    
    @patch('psutil.cpu_percent')
    @patch('psutil.virtual_memory')
    @patch('psutil.disk_usage')
    def test_collect_metrics(self, mock_disk, mock_memory, mock_cpu):
        """Test collecting system metrics"""
        mock_cpu.return_value = 50.0
        mock_memory.return_value = Mock(percent=60.0)
        mock_disk.return_value = Mock(percent=70.0)
        
        collector = SystemMetricsCollector(collection_interval=1)
        data = collector.collect()
        
        assert len(data) > 0
        assert all('timestamp' in item for item in data)
        assert all('device_id' in item for item in data)
