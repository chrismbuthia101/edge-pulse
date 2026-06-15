import os
import sys
import threading
from pathlib import Path
from typing import Dict, List, Optional, Any
from datetime import datetime
from dataclasses import dataclass

try:
    from watchdog.observers import Observer
    from watchdog.events import (
        FileSystemEventHandler as WatchdogEventHandler,
        FileSystemEvent as WatchdogEvent,
    )
    WATCHDOG_AVAILABLE = True
except ImportError:
    WATCHDOG_AVAILABLE = False

from edgepulse.utils.log_handler import get_logger
from edgepulse.collectors.base import BaseCollector

logger = get_logger(__name__)


@dataclass
class FilesystemEvent:
    timestamp: str
    event_type: str
    file_path: str
    file_size: Optional[int]
    file_extension: Optional[str]
    is_directory: bool
    source_path: Optional[str] = None
    dest_path: Optional[str] = None


class EdgePulseFileEventHandler(WatchdogEventHandler):
    def __init__(self, collector: 'FileSystemMonitor'):
        super().__init__()
        self.collector = collector

    def on_created(self, event: WatchdogEvent) -> None:
        self._handle_event(event, "CREATED")

    def on_modified(self, event: WatchdogEvent) -> None:
        self._handle_event(event, "MODIFIED")

    def on_deleted(self, event: WatchdogEvent) -> None:
        self._handle_event(event, "DELETED")

    def on_moved(self, event: WatchdogEvent) -> None:
        self._handle_moved_event(event, "MOVED")

    def _handle_event(self, event: WatchdogEvent, event_type: str) -> None:
        try:
            if not self.collector._running:
                return

            file_path = Path(event.src_path)
            file_size = None
            file_extension = None

            if not event.is_directory and file_path.exists():
                try:
                    file_size = file_path.stat().st_size
                    file_extension = file_path.suffix.lower()
                except OSError:
                    pass

            fs_event = FilesystemEvent(
                timestamp=datetime.utcnow().isoformat(),
                event_type=event_type,
                file_path=str(file_path),
                file_size=file_size,
                file_extension=file_extension,
                is_directory=event.is_directory,
            )
            self.collector._add_event(fs_event)

        except Exception as e:
            logger.error(f"Error handling filesystem event: {e}")

    def _handle_moved_event(self, event: WatchdogEvent, event_type: str) -> None:
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
                except OSError:
                    pass

            fs_event = FilesystemEvent(
                timestamp=datetime.utcnow().isoformat(),
                event_type=event_type,
                file_path=str(dest_path),
                file_size=file_size,
                file_extension=file_extension,
                is_directory=event.is_directory,
                source_path=str(source_path),
                dest_path=str(dest_path),
            )
            self.collector._add_event(fs_event)

        except Exception as e:
            logger.error(f"Error handling filesystem move event: {e}")


class FileSystemMonitor(BaseCollector):
    def __init__(self, watched_directories: Optional[List[str]] = None):
        if not WATCHDOG_AVAILABLE:
            raise ImportError("watchdog is required for filesystem monitoring")

        self.watched_directories = watched_directories or self._get_default_directories()
        self._observer: Optional[Observer] = None
        self._event_handler: Optional[EdgePulseFileEventHandler] = None
        self._events: List[FilesystemEvent] = []
        self._events_lock = threading.Lock()
        self._running = False
        self._max_events = 10000
        self._event_counter = 0

        logger.info(f"Filesystem monitor initialized with directories: {self.watched_directories}")

    def _get_default_directories(self) -> List[str]:
        directories = []

        if sys.platform == "win32":
            candidates = [
                "C:\\Windows\\System32",
                "C:\\Program Files",
                "C:\\Program Files (x86)",
                "C:\\Users",
                "C:\\ProgramData",
            ]
        else:
            candidates = [
                "/bin", "/sbin", "/usr/bin", "/usr/sbin",
                "/etc", "/var/log", "/tmp",
                os.path.expanduser("~"),
            ]

        for directory in candidates:
            if Path(directory).exists():
                directories.append(directory)

        return directories

    def start(self) -> None:
        try:
            if self._running:
                logger.warning("Filesystem monitor already running")
                return

            self._running = True
            self._observer = Observer()
            self._event_handler = EdgePulseFileEventHandler(self)

            for directory in self.watched_directories:
                try:
                    path = Path(directory)
                    if path.exists() and path.is_dir():
                        self._observer.schedule(self._event_handler, str(path), recursive=True)
                        logger.info(f"Watching directory: {directory}")
                    else:
                        logger.warning(f"Directory does not exist: {directory}")
                except Exception as e:
                    logger.error(f"Failed to watch directory {directory}: {e}")

            self._observer.start()
            logger.info("Filesystem monitor started")

        except Exception as e:
            logger.error(f"Failed to start filesystem monitor: {e}")
            self._running = False
            raise

    def stop(self) -> None:
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
        if not self._running:
            return []

        with self._events_lock:
            recent_events = self._events[-100:] if self._events else []
            return [
                {
                    "timestamp": event.timestamp,
                    "event_type": "FILE",
                    "event_subtype": event.event_type,
                    "file_path": event.file_path,
                    "file_size": event.file_size,
                    "file_extension": event.file_extension,
                    "is_directory": event.is_directory,
                    "source_path": event.source_path,
                    "dest_path": event.dest_path,
                    "collector": "filesystem",
                }
                for event in recent_events
            ]

    def _add_event(self, event: FilesystemEvent) -> None:
        with self._events_lock:
            self._events.append(event)
            self._event_counter += 1
            if len(self._events) > self._max_events:
                self._events = self._events[-self._max_events // 2:]

    def get_event_statistics(self) -> Dict[str, Any]:
        with self._events_lock:
            if not self._events:
                return {
                    "total_events": 0,
                    "event_types": {},
                    "file_extensions": {},
                    "directories_watched": len(self.watched_directories),
                    "timestamp": datetime.utcnow().isoformat(),
                }

            event_types: Dict[str, int] = {}
            file_extensions: Dict[str, int] = {}

            for event in self._events:
                event_types[event.event_type] = event_types.get(event.event_type, 0) + 1
                if event.file_extension:
                    file_extensions[event.file_extension] = file_extensions.get(event.file_extension, 0) + 1

            return {
                "total_events": len(self._events),
                "event_types": event_types,
                "file_extensions": file_extensions,
                "directories_watched": len(self.watched_directories),
                "timestamp": datetime.utcnow().isoformat(),
            }

    def add_watched_directory(self, directory: str) -> bool:
        try:
            path = Path(directory)
            if not path.exists() or not path.is_dir():
                logger.error(f"Directory does not exist: {directory}")
                return False

            if directory not in self.watched_directories:
                self.watched_directories.append(directory)
                if self._running and self._observer and self._event_handler:
                    self._observer.schedule(self._event_handler, str(path), recursive=True)
                    logger.info(f"Added directory to watch: {directory}")
                return True
            else:
                logger.warning(f"Directory already being watched: {directory}")
                return False

        except Exception as e:
            logger.error(f"Failed to add watched directory {directory}: {e}")
            return False

    def remove_watched_directory(self, directory: str) -> bool:
        try:
            if directory in self.watched_directories:
                self.watched_directories.remove(directory)
                logger.info(f"Removed directory from watch list: {directory}")
                return True
            else:
                logger.warning(f"Directory not being watched: {directory}")
                return False
        except Exception as e:
            logger.error(f"Failed to remove watched directory {directory}: {e}")
            return False

    def clear_events(self) -> None:
        with self._events_lock:
            self._events.clear()
            self._event_counter = 0
            logger.info("Cleared filesystem events")

    def get_recent_events(self, limit: int = 100) -> List[FilesystemEvent]:
        with self._events_lock:
            return self._events[-limit:] if self._events else []

    def is_available(self) -> bool:
        return WATCHDOG_AVAILABLE
