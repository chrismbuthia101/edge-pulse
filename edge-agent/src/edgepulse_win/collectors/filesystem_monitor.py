"""
Filesystem Monitor for EdgePulse

Monitors critical directories for file changes using watchdog.
Implements secure event queuing and Windows-specific optimizations.
"""

import os
import time
import asyncio
import threading
import hashlib
import json
from pathlib import Path
from typing import Dict, List, Optional, Set
from datetime import datetime
from dataclasses import dataclass

try:
    from watchdog.observers import Observer
    from watchdog.events import FileSystemEventHandler, FileSystemEvent
    import watchdog
except ImportError:
    raise ImportError("watchdog package required. Install with: pip install watchdog")

from edgepulse_win.utils.log_handler import get_logger

logger = get_logger(__name__)


@dataclass
class FilesystemEvent:
    """Canonical filesystem event structure"""
    event_id: str
    device_id: str
    timestamp: datetime
    event_type: str  # CREATED, MODIFIED, DELETED, MOVED
    file_path: str
    file_size: Optional[int]
    file_hash: Optional[str]
    is_directory: bool
    source_path: Optional[str]  # For move events
    dest_path: Optional[str]    # For move events
    process_id: Optional[int]  # Process that caused the event
    user: Optional[str]         # User that caused the event


class EdgePulseFileSystemHandler(FileSystemEventHandler):
    """Enhanced filesystem event handler with security filtering"""
    
    def __init__(self, event_queue: asyncio.Queue, monitored_paths: Set[str]):
        super().__init__()
        self.event_queue = event_queue
        self.monitored_paths = monitored_paths
        self.start_time = time.time()
        
        # Security: ignore temporary and system files
        self.ignore_patterns = {
            '*.tmp', '*.temp', '*.log', '*.swp', '*.lock',
            '*.bak', '*.old', '~*', 'Thumbs.db',
            'Desktop.ini', '.DS_Store'
        }
        
        # Critical file extensions to prioritize
        self.critical_extensions = {
            '.exe', '.dll', '.sys', '.bat', '.cmd', '.ps1',
            '.reg', '.ini', '.conf', '.config', '.json',
            '.xml', '.yaml', '.yml', '.env', '.key'
        }
    
    def _should_ignore_event(self, event: FileSystemEvent) -> bool:
        """Check if event should be ignored based on security rules"""
        path = Path(event.src_path or event.dest_path or "")
        
        # Ignore if path is not in monitored directories
        if not any(str(path).startswith(monitored) for monitored in self.monitored_paths):
            return True
        
        # Ignore temporary files and patterns
        for pattern in self.ignore_patterns:
            if path.match(pattern):
                return True
        
        # Ignore very rapid successive events (likely system noise)
        if hasattr(event, 'time') and (time.time() - event.time) < 0.1:
            return True
        
        return False
    
    def _get_event_type(self, event: FileSystemEvent) -> str:
        """Map watchdog event type to canonical type"""
        if event.event_type == watchdog.events.EVENT_TYPE_CREATED:
            return "CREATED"
        elif event.event_type == watchdog.events.EVENT_TYPE_MODIFIED:
            return "MODIFIED"
        elif event.event_type == watchdog.events.EVENT_TYPE_DELETED:
            return "DELETED"
        elif event.event_type == watchdog.events.EVENT_TYPE_MOVED:
            return "MOVED"
        else:
            return "UNKNOWN"
    
    def _calculate_file_hash(self, file_path: str) -> Optional[str]:
        """Calculate SHA-256 hash of file"""
        try:
            if not os.path.isfile(file_path):
                return None
            
            # Limit hash calculation to files < 10MB
            if os.path.getsize(file_path) > 10 * 1024 * 1024:
                return None
            
            with open(file_path, 'rb') as f:
                return hashlib.sha256(f.read()).hexdigest()
        except (OSError, PermissionError) as e:
            logger.debug(f"Failed to hash file {file_path}: {e}")
            return None
    
    def _get_file_size(self, file_path: str) -> Optional[int]:
        """Get file size safely"""
        try:
            if os.path.isfile(file_path):
                return os.path.getsize(file_path)
        except (OSError, PermissionError):
            pass
        return None
    
    def _get_responsible_process(self) -> Optional[int]:
        """Attempt to identify process responsible for file change"""
        try:
            import psutil
            # Get current running processes and look for file handles
            for proc in psutil.process_iter(['pid', 'name', 'open_files']):
                try:
                    if 'open_files' in proc.info:
                        for file_info in proc.info['open_files']:
                            # This is a simplified approach - in production would need
                            # more sophisticated process-file attribution
                            pass
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    continue
        except ImportError:
            pass
        return None
    
    def on_any_event(self, event: FileSystemEvent):
        """Handle all filesystem events"""
        if self._should_ignore_event(event):
            return
        
        try:
            # Add timestamp to event for rate limiting
            event.time = time.time()
            
            file_path = event.src_path or event.dest_path or ""
            path_obj = Path(file_path)
            
            # Create canonical event
            fs_event = FilesystemEvent(
                event_id=f"fs_{int(time.time() * 1000)}_{hash(file_path) & 0xFFFF}",
                device_id="",  # Will be set by monitor
                timestamp=datetime.utcnow(),
                event_type=self._get_event_type(event),
                file_path=file_path,
                file_size=self._get_file_size(file_path),
                file_hash=self._calculate_file_hash(file_path),
                is_directory=path_obj.is_dir(),
                source_path=event.src_path if hasattr(event, 'src_path') else None,
                dest_path=event.dest_path if hasattr(event, 'dest_path') else None,
                process_id=self._get_responsible_process(),
                user=None  # Would need OS-specific implementation
            )
            
            # Queue event for processing
            asyncio.create_task(self.event_queue.put(fs_event))
            
            # Log critical events immediately
            if path_obj.suffix.lower() in self.critical_extensions:
                logger.warning(
                    f"Critical file event: {fs_event.event_type} on {file_path}",
                    event_type="filesystem_critical",
                    file_path=file_path,
                    file_extension=path_obj.suffix
                )
            
        except Exception as e:
            logger.error(f"Error processing filesystem event: {e}")


class FilesystemMonitor:
    """Main filesystem monitoring class"""
    
    def __init__(self, config: Dict):
        self.config = config
        self.device_id = config.get('device_id', 'unknown')
        self.event_queue = asyncio.Queue(maxsize=10000)
        self.observer = None
        self.monitor_thread = None
        self.is_running = False
        
        # Default critical directories for Windows
        self.default_directories = [
            "C:\\Windows\\System32",
            "C:\\Windows\\SysWOW64",
            "C:\\Program Files",
            "C:\\Program Files (x86)",
            "C:\\ProgramData",
            os.path.expanduser("~\\AppData\\Roaming"),
            os.path.expanduser("~\\AppData\\Local")
        ]
        
        # Get monitored directories from config
        self.monitored_directories = config.get(
            'monitored_directories', 
            self.default_directories
        )
        
        # Convert to absolute paths and validate
        self.valid_directories = []
        for directory in self.monitored_directories:
            abs_path = os.path.abspath(directory)
            if os.path.exists(abs_path) and os.path.isdir(abs_path):
                self.valid_directories.append(abs_path)
                logger.info(f"Added directory to monitoring: {abs_path}")
            else:
                logger.warning(f"Directory not found or not accessible: {abs_path}")
    
    async def start(self) -> bool:
        """Start filesystem monitoring"""
        try:
            if self.is_running:
                logger.warning("Filesystem monitor already running")
                return False
            
            if not self.valid_directories:
                logger.error("No valid directories to monitor")
                return False
            
            # Create observer
            self.observer = Observer()
            event_handler = EdgePulseFileSystemHandler(
                self.event_queue, 
                set(self.valid_directories)
            )
            
            # Add directories to observer
            for directory in self.valid_directories:
                try:
                    self.observer.schedule(
                        event_handler, 
                        directory, 
                        recursive=True
                    )
                    logger.info(f"Started monitoring: {directory}")
                except Exception as e:
                    logger.error(f"Failed to monitor {directory}: {e}")
                    continue
            
            # Start observer in separate thread
            self.monitor_thread = threading.Thread(
                target=self.observer.start,
                daemon=True
            )
            self.monitor_thread.start()
            
            self.is_running = True
            logger.info(f"Filesystem monitor started, watching {len(self.valid_directories)} directories")
            return True
            
        except Exception as e:
            logger.error(f"Failed to start filesystem monitor: {e}")
            return False
    
    async def stop(self):
        """Stop filesystem monitoring"""
        try:
            self.is_running = False
            
            if self.observer:
                self.observer.stop()
                self.observer.join()
                self.observer = None
            
            if self.monitor_thread and self.monitor_thread.is_alive():
                self.monitor_thread.join(timeout=5)
            
            logger.info("Filesystem monitor stopped")
            
        except Exception as e:
            logger.error(f"Error stopping filesystem monitor: {e}")
    
    async def get_events(self, max_events: int = 100) -> List[FilesystemEvent]:
        """Get events from the queue"""
        events = []
        
        try:
            for _ in range(max_events):
                if self.event_queue.empty():
                    break
                
                event = await asyncio.wait_for(
                    self.event_queue.get(), 
                    timeout=0.1
                )
                events.append(event)
                
        except asyncio.TimeoutError:
            pass
        
        return events
    
    def get_status(self) -> Dict:
        """Get monitor status"""
        return {
            'is_running': self.is_running,
            'monitored_directories': self.valid_directories,
            'queue_size': self.event_queue.qsize(),
            'observer_alive': self.observer.is_alive() if self.observer else False
        }


# Factory function for creating monitor
def create_filesystem_monitor(config: Dict) -> FilesystemMonitor:
    """Create filesystem monitor with configuration"""
    return FilesystemMonitor(config)
