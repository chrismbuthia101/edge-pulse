import json
import hashlib
import uuid
from typing import Dict, List, Any, Optional
from datetime import datetime

from edgepulse.utils.log_handler import get_logger
from edgepulse.collectors.base import BaseCollector
from edgepulse.collectors.process_collector import ProcessMonitor
from edgepulse.collectors.network_collector import NetworkMonitor
from edgepulse.collectors.filesystem_collector import FileSystemMonitor

logger = get_logger(__name__)


class TelemetryCollector(BaseCollector):
    def __init__(self, agent_version: str = "0.1.0"):
        self.agent_version = agent_version
        self._running = False

        self.process_monitor = ProcessMonitor()
        self.network_monitor = NetworkMonitor()
        self.filesystem_monitor = None

        try:
            self.filesystem_monitor = FileSystemMonitor()
            logger.info("Filesystem monitoring enabled")
        except ImportError:
            logger.warning("Filesystem monitoring not available (watchdog not installed)")
        except Exception as e:
            logger.warning(f"Failed to initialize filesystem monitor: {e}")

    def start(self) -> None:
        try:
            self._running = True

            self.process_monitor.start()
            self.network_monitor.start()

            if self.filesystem_monitor:
                self.filesystem_monitor.start()

            logger.info("Telemetry collector started")

        except Exception as e:
            logger.error(f"Failed to start telemetry collector: {e}")
            self._running = False
            raise

    def stop(self) -> None:
        try:
            self._running = False

            self.process_monitor.stop()
            self.network_monitor.stop()

            if self.filesystem_monitor:
                self.filesystem_monitor.stop()

            logger.info("Telemetry collector stopped")

        except Exception as e:
            logger.error(f"Error stopping telemetry collector: {e}")

    def collect(self) -> List[Dict[str, Any]]:
        if not self._running:
            return []

        all_events = []

        try:
            process_events = self._collect_process_events()
            all_events.extend(process_events)

            network_events = self._collect_network_events()
            all_events.extend(network_events)

            if self.filesystem_monitor:
                filesystem_events = self._collect_filesystem_events()
                all_events.extend(filesystem_events)

            resource_events = self._collect_resource_events()
            all_events.extend(resource_events)

            logger.debug(f"Collected {len(all_events)} telemetry events")
            return all_events

        except Exception as e:
            logger.error(f"Error collecting telemetry: {e}")
            return []

    def _collect_process_events(self) -> List[Dict[str, Any]]:
        events = []

        try:
            processes = self.process_monitor.get_running_processes()

            for process_data in processes:
                event = self._create_canonical_event(
                    event_type="PROCESS",
                    payload=process_data
                )
                events.append(event)

        except Exception as e:
            logger.error(f"Error collecting process events: {e}")

        return events

    def _collect_network_events(self) -> List[Dict[str, Any]]:
        events = []

        try:
            connections = self.network_monitor.get_active_connections()

            for conn_data in connections:
                event = self._create_canonical_event(
                    event_type="NETWORK",
                    payload=conn_data
                )
                events.append(event)

        except Exception as e:
            logger.error(f"Error collecting network events: {e}")

        return events

    def _collect_filesystem_events(self) -> List[Dict[str, Any]]:
        events = []

        try:
            fs_events = self.filesystem_monitor.collect()

            for fs_event in fs_events:
                event = self._create_canonical_event(
                    event_type="FILE",
                    payload=fs_event
                )
                events.append(event)

        except Exception as e:
            logger.error(f"Error collecting filesystem events: {e}")

        return events

    def _collect_resource_events(self) -> List[Dict[str, Any]]:
        events = []

        try:
            import psutil

            cpu_percent = psutil.cpu_percent(interval=1)
            memory = psutil.virtual_memory()
            disk = psutil.disk_usage('/')

            resource_payload = {
                "cpu_percent": cpu_percent,
                "memory_total_bytes": memory.total,
                "memory_available_bytes": memory.available,
                "memory_percent": memory.percent,
                "disk_total_bytes": disk.total,
                "disk_free_bytes": disk.free,
                "disk_percent": (disk.total - disk.free) / disk.total * 100,
                "boot_time": datetime.fromtimestamp(psutil.boot_time()).isoformat(),
                "collector": "system_resources"
            }

            event = self._create_canonical_event(
                event_type="RESOURCE",
                payload=resource_payload
            )
            events.append(event)

        except Exception as e:
            logger.error(f"Error collecting resource events: {e}")

        return events

    def _create_canonical_event(self, event_type: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        try:
            event_id = str(uuid.uuid4())
            timestamp = datetime.utcnow().isoformat()

            payload_json = json.dumps(payload, separators=(',', ':'), sort_keys=True)

            payload_hash = hashlib.sha256(payload_json.encode('utf-8')).hexdigest()

            event = {
                "event_id": event_id,
                "device_id": self._get_device_id(),
                "timestamp": timestamp,
                "event_type": event_type,
                "event_payload": payload_json,
                "collection_agent_version": self.agent_version,
                "payload_hash": payload_hash
            }

            return event

        except Exception as e:
            logger.error(f"Error creating canonical event: {e}")
            return {
                "event_id": str(uuid.uuid4()),
                "device_id": self._get_device_id(),
                "timestamp": datetime.utcnow().isoformat(),
                "event_type": event_type,
                "event_payload": "{}",
                "collection_agent_version": self.agent_version,
                "payload_hash": hashlib.sha256(b"{}").hexdigest()
            }

    def _get_device_id(self) -> str:
        try:
            from edgepulse.auth.credentials import CredentialManager
            cred_manager = CredentialManager()
            credentials = cred_manager.get_device_credentials()

            if credentials:
                return credentials.device_id
            else:
                import platform
                import secrets

                machine_id = platform.node() + platform.machine() + str(secrets.token_bytes(8))
                return hashlib.sha256(machine_id.encode()).hexdigest()[:32]

        except Exception as e:
            logger.error(f"Error getting device ID: {e}")
            return hashlib.sha256(b"unknown_device").hexdigest()[:32]

    def get_collection_statistics(self) -> Dict[str, Any]:
        stats = {
            "running": self._running,
            "agent_version": self.agent_version,
            "collectors": {
                "process": self.process_monitor._running,
                "network": self.network_monitor._running,
                "filesystem": self.filesystem_monitor._running if self.filesystem_monitor else False
            },
            "timestamp": datetime.utcnow().isoformat()
        }

        return stats

    def add_watched_directory(self, directory: str) -> bool:
        if self.filesystem_monitor:
            return self.filesystem_monitor.add_watched_directory(directory)
        return False

    def remove_watched_directory(self, directory: str) -> bool:
        if self.filesystem_monitor:
            return self.filesystem_monitor.remove_watched_directory(directory)
        return False

    def get_watched_directories(self) -> List[str]:
        if self.filesystem_monitor:
            return self.filesystem_monitor.watched_directories.copy()
        return []
