# Telemetry Collector

# Unified telemetry collector that aggregates data from all collectors
# and stores it in the canonical telemetry_events format with proper hashing.

import json
import hashlib
import uuid
from typing import Dict, List, Any, Optional
from datetime import datetime

from edgepulse_win.utils.log_handler import get_logger
from edgepulse_win.collectors.base import BaseCollector
from edgepulse_win.collectors.process_collector import ProcessMonitor
from edgepulse_win.collectors.network_collector import NetworkMonitor
from edgepulse_win.collectors.filesystem_collector import FileSystemMonitor

logger = get_logger(__name__)


class TelemetryCollector(BaseCollector):
    """Unified telemetry collector for canonical event storage"""
    
    def __init__(self, agent_version: str = "0.1.0"):
        self.agent_version = agent_version
        self._running = False
        
        # Initialize sub-collectors
        self.process_monitor = ProcessMonitor()
        self.network_monitor = NetworkMonitor()
        self.filesystem_monitor = None
        
        # Try to initialize filesystem monitor
        try:
            self.filesystem_monitor = FileSystemMonitor()
            logger.info("Filesystem monitoring enabled")
        except ImportError:
            logger.warning("Filesystem monitoring not available (watchdog not installed)")
        except Exception as e:
            logger.warning(f"Failed to initialize filesystem monitor: {e}")
    
    def start(self) -> None:
        """Start all telemetry collectors"""
        try:
            self._running = True
            
            # Start process monitoring
            self.process_monitor.start()
            
            # Start network monitoring
            self.network_monitor.start()
            
            # Start filesystem monitoring if available
            if self.filesystem_monitor:
                self.filesystem_monitor.start()
            
            logger.info("Telemetry collector started")
            
        except Exception as e:
            logger.error(f"Failed to start telemetry collector: {e}")
            self._running = False
            raise
    
    def stop(self) -> None:
        """Stop all telemetry collectors"""
        try:
            self._running = False
            
            # Stop all collectors
            self.process_monitor.stop()
            self.network_monitor.stop()
            
            if self.filesystem_monitor:
                self.filesystem_monitor.stop()
            
            logger.info("Telemetry collector stopped")
            
        except Exception as e:
            logger.error(f"Error stopping telemetry collector: {e}")
    
    def collect(self) -> List[Dict[str, Any]]:
        """Collect telemetry from all sources in canonical format"""
        if not self._running:
            return []
        
        all_events = []
        
        try:
            # Collect process events
            process_events = self._collect_process_events()
            all_events.extend(process_events)
            
            # Collect network events
            network_events = self._collect_network_events()
            all_events.extend(network_events)
            
            # Collect filesystem events if available
            if self.filesystem_monitor:
                filesystem_events = self._collect_filesystem_events()
                all_events.extend(filesystem_events)
            
            # Collect system resource events
            resource_events = self._collect_resource_events()
            all_events.extend(resource_events)
            
            logger.debug(f"Collected {len(all_events)} telemetry events")
            return all_events
            
        except Exception as e:
            logger.error(f"Error collecting telemetry: {e}")
            return []
    
    def _collect_process_events(self) -> List[Dict[str, Any]]:
        """Collect process telemetry events"""
        events = []
        
        try:
            processes = self.process_monitor.get_running_processes()
            
            for process_data in processes:
                # Create canonical telemetry event
                event = self._create_canonical_event(
                    event_type="PROCESS",
                    payload=process_data
                )
                events.append(event)
                
        except Exception as e:
            logger.error(f"Error collecting process events: {e}")
        
        return events
    
    def _collect_network_events(self) -> List[Dict[str, Any]]:
        """Collect network telemetry events"""
        events = []
        
        try:
            connections = self.network_monitor.get_active_connections()
            
            for conn_data in connections:
                # Create canonical telemetry event
                event = self._create_canonical_event(
                    event_type="NETWORK",
                    payload=conn_data
                )
                events.append(event)
                
        except Exception as e:
            logger.error(f"Error collecting network events: {e}")
        
        return events
    
    def _collect_filesystem_events(self) -> List[Dict[str, Any]]:
        """Collect filesystem telemetry events"""
        events = []
        
        try:
            fs_events = self.filesystem_monitor.collect()
            
            for fs_event in fs_events:
                # Convert to canonical format
                event = self._create_canonical_event(
                    event_type="FILE",
                    payload=fs_event
                )
                events.append(event)
                
        except Exception as e:
            logger.error(f"Error collecting filesystem events: {e}")
        
        return events
    
    def _collect_resource_events(self) -> List[Dict[str, Any]]:
        """Collect system resource telemetry events"""
        events = []
        
        try:
            import psutil
            
            # Get system-wide metrics
            cpu_percent = psutil.cpu_percent(interval=1)
            memory = psutil.virtual_memory()
            disk = psutil.disk_usage('/')
            
            # System resource payload
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
            
            # Create canonical telemetry event
            event = self._create_canonical_event(
                event_type="RESOURCE",
                payload=resource_payload
            )
            events.append(event)
            
        except Exception as e:
            logger.error(f"Error collecting resource events: {e}")
        
        return events
    
    def _create_canonical_event(self, event_type: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Create a canonical telemetry event with proper hashing"""
        try:
            # Generate event ID
            event_id = str(uuid.uuid4())
            
            # Get current timestamp
            timestamp = datetime.utcnow().isoformat()
            
            # Create event payload JSON
            payload_json = json.dumps(payload, separators=(',', ':'), sort_keys=True)
            
            # Calculate SHA-256 hash of payload
            payload_hash = hashlib.sha256(payload_json.encode('utf-8')).hexdigest()
            
            # Create canonical event
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
            # Return minimal event structure
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
        """Get device ID from credentials or generate one"""
        try:
            # Try to get from credential manager
            from ..auth.credentials import CredentialManager
            cred_manager = CredentialManager()
            credentials = cred_manager.get_device_credentials()
            
            if credentials:
                return credentials.device_id
            else:
                # Generate a temporary device ID
                import platform
                import secrets
                
                machine_id = platform.node() + platform.machine() + str(secrets.token_bytes(8))
                return hashlib.sha256(machine_id.encode()).hexdigest()[:32]
                
        except Exception as e:
            logger.error(f"Error getting device ID: {e}")
            # Fallback to simple ID
            return hashlib.sha256(b"unknown_device").hexdigest()[:32]
    
    def get_collection_statistics(self) -> Dict[str, Any]:
        """Get collection statistics"""
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
        """Add a directory to filesystem monitoring"""
        if self.filesystem_monitor:
            return self.filesystem_monitor.add_watched_directory(directory)
        return False
    
    def remove_watched_directory(self, directory: str) -> bool:
        """Remove a directory from filesystem monitoring"""
        if self.filesystem_monitor:
            return self.filesystem_monitor.remove_watched_directory(directory)
        return False
    
    def get_watched_directories(self) -> List[str]:
        """Get list of watched directories"""
        if self.filesystem_monitor:
            return self.filesystem_monitor.watched_directories.copy()
        return []
    
    def validate_event_integrity(self, event: Dict[str, Any]) -> bool:
        """Validate the integrity of a telemetry event"""
        try:
            # Recalculate payload hash
            payload_json = event.get("event_payload", "{}")
            calculated_hash = hashlib.sha256(payload_json.encode('utf-8')).hexdigest()
            stored_hash = event.get("payload_hash", "")
            
            return calculated_hash == stored_hash
            
        except Exception as e:
            logger.error(f"Error validating event integrity: {e}")
            return False
    
    def get_agent_version(self) -> str:
        """Get the agent version"""
        return self.agent_version
    
    def set_agent_version(self, version: str) -> None:
        """Set the agent version"""
        self.agent_version = version
        logger.info(f"Agent version updated to: {version}")
