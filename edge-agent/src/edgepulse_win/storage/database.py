"""
Database management for EdgePulse
"""

import sqlite3
from pathlib import Path
from typing import Any, Dict, List, Optional
from edgepulse_win.exceptions import LoggingError


class DatabaseManager:
    """Manages SQLite database operations"""
    
    def __init__(self, db_path: Path):
        self.db_path = db_path
        self._connection: Optional[sqlite3.Connection] = None
        
    def connect(self) -> sqlite3.Connection:
        """Establish database connection"""
        if self._connection is None:
            self._connection = sqlite3.connect(str(self.db_path))
            self._connection.row_factory = sqlite3.Row
        return self._connection
        
    def close(self) -> None:
        """Close database connection"""
        if self._connection:
            self._connection.close()
            self._connection = None
            
    def execute_query(self, query: str, params: tuple = ()) -> List[Dict[str, Any]]:
        """Execute a query and return results"""
        try:
            conn = self.connect()
            cursor = conn.cursor()
            cursor.execute(query, params)
            return [dict(row) for row in cursor.fetchall()]
        except sqlite3.Error as e:
            raise LoggingError(f"Database query failed: {e}")
            
    def execute_update(self, query: str, params: tuple = ()) -> None:
        """Execute an update query"""
        try:
            conn = self.connect()
            cursor = conn.cursor()
            cursor.execute(query, params)
            conn.commit()
        except sqlite3.Error as e:
            raise LoggingError(f"Database update failed: {e}")
