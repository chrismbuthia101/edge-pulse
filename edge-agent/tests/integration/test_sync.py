"""
Integration tests for cloud sync functionality
"""

import pytest
from unittest.mock import Mock, patch
from edgepulse.sync.supabase import SupabaseSync


class TestSupabaseSync:
    """Test Supabase sync integration"""
    
    @patch('edgepulse.sync.supabase.create_client')
    def test_supabase_initialization(self, mock_create_client):
        """Test Supabase sync initialization"""
        mock_client = Mock()
        mock_create_client.return_value = mock_client
        
        sync = SupabaseSync(
            url="https://test.supabase.co",
            key="test-key"
        )
        
        assert sync.client == mock_client
        mock_create_client.assert_called_once_with("https://test.supabase.co", "test-key")
        
    @patch('edgepulse.sync.supabase.create_client')
    def test_sync_alerts(self, mock_create_client):
        """Test syncing alerts to cloud"""
        mock_client = Mock()
        mock_create_client.return_value = mock_client
        
        sync = SupabaseSync(
            url="https://test.supabase.co",
            key="test-key"
        )
        
        alerts = [
            {
                "id": "alert-1",
                "severity": "high",
                "message": "Test alert",
                "timestamp": "2024-01-01T00:00:00Z"
            }
        ]
        
        sync.sync_alerts(alerts)
        
        mock_client.table.assert_called_once_with("alerts")
        mock_client.table.return_value.insert.assert_called_once_with(alerts)
        
    @patch('edgepulse.sync.supabase.create_client')
    def test_sync_telemetry(self, mock_create_client):
        """Test syncing telemetry data to cloud"""
        mock_client = Mock()
        mock_create_client.return_value = mock_client
        
        sync = SupabaseSync(
            url="https://test.supabase.co",
            key="test-key"
        )
        
        telemetry = [
            {
                "device_id": "test-device",
                "cpu_percent": 50.0,
                "memory_percent": 60.0,
                "timestamp": "2024-01-01T00:00:00Z"
            }
        ]
        
        sync.sync_telemetry(telemetry)
        
        mock_client.table.assert_called_once_with("telemetry")
        mock_client.table.return_value.insert.assert_called_once_with(telemetry)
