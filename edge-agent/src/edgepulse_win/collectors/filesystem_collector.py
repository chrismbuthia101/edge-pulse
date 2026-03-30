# Filesystem Monitor

# Monitors filesystem events for security monitoring using watchdog.
# Tracks file creation, modification, deletion, and access in critical directories.

import os
import sys
import threading
import time
from pathlib import Path
from typing import Dict, List, Optional, Any, Set
from datetime import datetime
from dataclasses import dataclass

try:
    from watchdog.observers import Observer
    from watchdog.events import FileSystemEventHandler, FileSystemEvent
    WATCHDOG_AVAILABLE = True
except ImportError:
    WATCHDOG_AVAILABLE = False

from edgepulse_win.utils.log_handler import get_logger
from edgepulse_win.collectors.base import BaseCollector
from edgepulse_win.utils.error_handler import PermissionError

logger = get_logger(__name__)


@dataclass
class FileSystemEvent:
    """Filesystem event data structure"""
    timestamp: str
    event_type: str  # CREATED, MODIFIED, DELETED, MOVED, ACCESSED
    file_path: str
    file_size: Optional[int]
    file_extension: Optional[str]
    is_directory: bool
    source_path: Optional[str] = None  # For moved events
    dest_path: Optional[str] = None   # For moved events


class FileSystemEventHandler(FileSystemEventHandler):
    """Custom watchdog event handler for filesystem monitoring"""
    
    def __init__(self, collector: 'FileSystemMonitor'):
        self.collector = collector
        
    def on_created(self, event: FileSystemEvent):
        self._handle_event(event, "CREATED")
        
    def on_modified(self, event: FileSystemEvent):
        self._handle_event(event, "MODIFIED")
        
    def on_deleted(self, event: FileSystemEvent):
        self._handle_event(event, "DELETED")
        
    def on_moved(self, event: FileSystemEvent):
        self._handle_moved_event(event, "MOVED")
        
    def _handle_event(self, event: FileSystemEvent, event_type: str):
        """Handle filesystem event"""
        try:
            if not self.collector._running:
                return
                
            # Get file information
            file_path = Path(event.src_path)
            file_size = None
            file_extension = None
            
            if not event.is_directory and file_path.exists():
                try:
                    file_size = file_path.stat().st_size
                    file_extension = file_path.suffix.lower()
                except (OSError, PermissionError):
                    pass
            
            fs_event = FileSystemEvent(
                timestamp=datetime.utcnow().isoformat(),
                event_type=event_type,
                file_path=str(file_path),
                file_size=file_size,
                file_extension=file_extension,
                is_directory=event.is_directory
            )
            
            self.collector._add_event(fs_event)
            
        except Exception as e:
            logger.error(f"Error handling filesystem event: {e}")
    
    def _handle_moved_event(self, event: FileSystemEvent, event_type: str):
        """Handle moved/renamed events"""
        try:
            if not self.collector._running:
                return
                
            source_path = Path(event.src_path)
            dest_path = Path(event.dest_path)
            
            file_size = None
            file_extension = None
            
            if not event.is_directory and dest_path.exists():
                try:
                    file_size = dest_path.stat().st_size
                    file_extension = dest_path.suffix.lower()
                except (OSError, PermissionError):
                    pass
            
            fs_event = FileSystemEvent(
                timestamp=datetime.utcnow().isoformat(),
                event_type=event_type,
                file_path=str(dest_path),
                file_size=file_size,
                file_extension=file_extension,
                is_directory=event.is_directory,
                source_path=str(source_path),
                dest_path=str(dest_path)
            )
            
            self.collector._add_event(fs_event)
            
        except Exception as e:
            logger.error(f"Error handling filesystem move event: {e}")


class FileSystemMonitor(BaseCollector):
    """Filesystem monitoring collector using watchdog"""
    
    def __init__(self, watched_directories: Optional[List[str]] = None):
        if not WATCHDOG_AVAILABLE:
            raise ImportError("watchdog is required for filesystem monitoring")
            
        self.watched_directories = watched_directories or self._get_default_directories()
        self._observer: Optional[Observer] = None
        self._event_handler: Optional[FileSystemEventHandler] = None
        self._events: List[FileSystemEvent] = []
        self._events_lock = threading.Lock()
        self._running = False
        self._max_events = 10000  # Limit memory usage
        self._event_counter = 0
        
        logger.info(f"Filesystem monitor initialized with directories: {self.watched_directories}")
    
    def _get_default_directories(self) -> List[str]:
        """Get default directories to watch based on platform"""
        directories = []
        
        if sys.platform == "win32":
            # Windows critical directories
            windows_dirs = [
                "C:\\Windows\\System32",
                "C:\\Program Files", 
                "C:\\Program Files (x86)",
                "C:\\Users",
                "C:\\ProgramData"
            ]
            
            for directory in windows_dirs:
                if Path(directory).exists():
                    directories.append(directory)
                    
        else:
            # Unix/Linux critical directories
            unix_dirs = [
                "/bin",
                "/sbin", 
                "/usr/bin",
                "/usr/sbin",
                "/etc",
                "/var/log",
                "/tmp",
                os.path.expanduser("~")
            ]
            
            for directory in unix_dirs:
                if Path(directory).exists():
                    directories.append(directory)
        
        return directories
    
    def start(self) -> None:
        """Start filesystem monitoring"""
        try:
            if self._running:
                logger.warning("Filesystem monitor already running")
                return
            
            self._running = True
            self._observer = Observer()
            self._event_handler = FileSystemEventHandler(self)
            
            # Set up observers for each directory
            for directory in self.watched_directories:
                try:
                    path = Path(directory)
                    if path.exists() and path.is_dir():
                        self._observer.schedule(
                            self._event_handler, 
                            str(path), 
                            recursive=True
                        )
                        logger.info(f"Watching directory: {directory}")
                    else:
                        logger.warning(f"Directory does not exist: {directory}")
                except Exception as e:
                    logger.error(f"Failed to watch directory {directory}: {e}")
            
            # Start the observer
            self._observer.start()
            logger.info("Filesystem monitor started")
            
        except Exception as e:
            logger.error(f"Failed to start filesystem monitor: {e}")
            self._running = False
            raise
    
    def stop(self) -> None:
        """Stop filesystem monitoring"""
        try:
            self._running = False
            
            if self._observer:
                self._observer.stop()
                self._observer.join(timeout=5)
                self._observer = None
            
            logger.info("Filesystem monitor stopped")
            
        except Exception as e:
            logger.error(f"Error stopping filesystem monitor: {e}")
    
    def collect(self) -> List[Any]:
        """Collect recent filesystem events"""
        if not self._running:
            return []
        
        with self._events_lock:
            # Get recent events (last 100)
            recent_events = self._events[-100:] if self._events else []
            
            # Convert to telemetry format
            telemetry_events = []
            for event in recent_events:
                telemetry_event = {
                    "timestamp": event.timestamp,
                    "event_type": "FILE",
                    "event_subtype": event.event_type,
                    "file_path": event.file_path,
                    "file_size": event.file_size,
                    "file_extension": event.file_extension,
                    "is_directory": event.is_directory,
                    "source_path": event.source_path,
                    "dest_path": event.dest_path,
                    "collector": "filesystem"
                }
                telemetry_events.append(telemetry_event)
            
            return telemetry_events
    
    def _add_event(self, event: FileSystemEvent) -> None:
        """Add event to the event queue"""
        with self._events_lock:
            self._events.append(event)
            self._event_counter += 1
            
            # Limit memory usage
            if len(self._events) > self._max_events:
                # Remove oldest events
                self._events = self._events[-self._max_events//2:]
    
    def get_event_statistics(self) -> Dict[str, Any]:
        """Get filesystem event statistics"""
        with self._events_lock:
            if not self._events:
                return {
                    "total_events": 0,
                    "event_types": {},
                    "file_extensions": {},
                    "directories_watched": len(self.watched_directories),
                    "timestamp": datetime.utcnow().isoformat()
                }
            
            # Count event types
            event_types = {}
            file_extensions = {}
            
            for event in self._events:
                event_types[event.event_type] = event_types.get(event.event_type, 0) + 1
                
                if event.file_extension:
                    file_extensions[event.file_extension] = file_extensions.get(event.file_extension, 0) + 1
            
            return {
                "total_events": len(self._events),
                "event_types": event_types,
                "file_extensions": file_extensions,
                "directories_watched": len(self.watched_directories),
                "timestamp": datetime.utcnow().isoformat()
            }
    
    def add_watched_directory(self, directory: str) -> bool:
        """Add a directory to watch"""
        try:
            path = Path(directory)
            if not path.exists() or not path.is_dir():
                logger.error(f"Directory does not exist: {directory}")
                return False
            
            if directory not in self.watched_directories:
                self.watched_directories.append(directory)
                
                # Add to observer if running
                if self._running and self._observer:
                    self._observer.schedule(
                        self._event_handler,
                        str(path),
                        recursive=True
                    )
                    logger.info(f"Added directory to watch: {directory}")
                
                return True
            else:
                logger.warning(f"Directory already being watched: {directory}")
                return False
                
        except Exception as e:
            logger.error(f"Failed to add watched directory {directory}: {e}")
            return False
    
    def remove_watched_directory(self, directory: str) -> bool:
        """Remove a directory from watching"""
        try:
            if directory in self.watched_directories:
                self.watched_directories.remove(directory)
                
                # Remove from observer if running
                if self._running and self._observer:
                    # Note: watchdog doesn't provide easy way to unschedule specific paths
                    # We would need to restart the observer
                    logger.info(f"Removed directory from watch list: {directory}")
                
                return True
            else:
                logger.warning(f"Directory not being watched: {directory}")
                return False
                
        except Exception as e:
            logger.error(f"Failed to remove watched directory {directory}: {e}")
            return False
    
    def clear_events(self) -> None:
        """Clear all stored events"""
        with self._events_lock:
            self._events.clear()
            self._event_counter = 0
            logger.info("Cleared filesystem events")
    
    def get_recent_events(self, limit: int = 100) -> List[FileSystemEvent]:
        """Get recent filesystem events"""
        with self._events_lock:
            return self._events[-limit:] if self._events else []
    
    def is_available(self) -> bool:
        """Check if filesystem monitoring is available"""
        return WATCHDOG_AVAILABLE
