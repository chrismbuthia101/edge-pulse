"""
Unit tests for storage modules
"""

import pytest
import tempfile
from pathlib import Path
from edgepulse.storage.database import DatabaseManager
from edgepulse.storage.log_writer import LogWriter


class TestDatabaseManager:
    """Test database management"""
    
    def test_database_initialization(self):
        """Test database manager initialization"""
        with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as tmp:
            db_path = Path(tmp.name)
            
        manager = DatabaseManager(db_path)
        assert manager.db_path == db_path
        assert manager._connection is None
        
        # Cleanup
        db_path.unlink(missing_ok=True)
        
    def test_database_connection(self):
        """Test database connection"""
        with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as tmp:
            db_path = Path(tmp.name)
            
        try:
            manager = DatabaseManager(db_path)
            conn = manager.connect()
            assert conn is not None
            manager.close()
        finally:
            db_path.unlink(missing_ok=True)


class TestLogWriter:
    """Test log writing"""
    
    def test_log_writer_initialization(self):
        """Test log writer initialization"""
        mock_storage = Mock()
        writer = LogWriter(mock_storage)
        assert writer.storage == mock_storage
        
    def test_write_event(self):
        """Test writing events"""
        mock_storage = Mock()
        writer = LogWriter(mock_storage)
        
        event_data = {"type": "test", "value": 42}
        writer.write_event("test_event", event_data)
        
        mock_storage.write.assert_called_once()
        
    def test_write_alert(self):
        """Test writing alerts"""
        mock_storage = Mock()
        writer = LogWriter(mock_storage)
        
        alert_data = {"severity": "high", "message": "Test alert"}
        writer.write_alert(alert_data)
        
        mock_storage.write.assert_called_once()
