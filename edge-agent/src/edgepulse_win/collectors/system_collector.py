# System Metrics Collector
# Collects CPU, memory, disk, and network metrics using psutil.

from datetime import datetime
import time
from typing import Dict, Any, Optional, List, Union
from edgepulse_win.utils.log_handler import get_logger
import psutil
from edgepulse_win.collectors.base import BaseCollector
from edgepulse_win.utils.error_handler import ResourceError, PermissionError
from edgepulse_win.shared import (
    EventType, TelemetryEvent, normalize_timestamp,
    create_metrics_collector, StandardMetrics
)

logger = get_logger(__name__)


class SystemMetricsCollector(BaseCollector):
    """System metrics collector for Windows systems"""

    def __init__(self, collection_interval: int = 5, device_id: str = "unknown") -> None:
        self.collection_interval = collection_interval
        self.device_id = device_id
        self._last_disk_io: Optional[Any] = None
        self._last_network_io: Optional[Any] = None
        self._running = False
        
        # Shared metrics collector
        self.metrics = create_metrics_collector(f"system_collector_{device_id}", device_id)

    def start(self) -> None:
        self._running = True
        logger.info("System metrics collector started", device_id=self.device_id)

    def stop(self) -> None:
        self._running = False
        logger.info("System metrics collector stopped", device_id=self.device_id)

    def collect(self) -> List[Dict[str, Any]]:
        if not self._running:
            return []
        return [self.collect_all()]

    def collect_cpu_metrics(self) -> Dict[str, Any]:
        try:
            per_cpu = psutil.cpu_percent(interval=0.1, percpu=True)
            total_cpu = psutil.cpu_percent(interval=0.1)
            cpu_count = psutil.cpu_count()

            try:
                cpu_freq = psutil.cpu_freq()
                current_freq = cpu_freq.current if cpu_freq else None
            except (AttributeError, RuntimeError):
                current_freq = None
            
            # Record metrics
            self.metrics.set_gauge(StandardMetrics.CPU_USAGE, total_cpu, {"device_id": self.device_id})
            
            cpu_data = {
                "timestamp": datetime.utcnow().isoformat(),
                "cpu_percent": total_cpu,  # Standardized field name
                "cpu_percent_total": total_cpu,  # Keep for compatibility
                "cpu_percent_per_core": per_cpu,
                "cpu_count": cpu_count,
                "cpu_frequency_mhz": current_freq,
            }
            
            logger.debug("cpu_metrics_collected", cpu_percent=total_cpu, device_id=self.device_id)
            return cpu_data
            
        except ResourceError as e:
            logger.error(f"Error collecting CPU metrics: {e}", device_id=self.device_id)
            return {
                "timestamp": datetime.utcnow().isoformat(),
                "device_id": self.device_id,
                "error": str(e)
            }
        except PermissionError as e:
            logger.error(f"Error collecting CPU metrics: {e}", device_id=self.device_id)
            return {
                "timestamp": datetime.utcnow().isoformat(),
                "device_id": self.device_id,
                "error": str(e)
            }
        except Exception as e:
            logger.error(f"Error collecting CPU metrics: {e}", device_id=self.device_id)
            return {
                "timestamp": datetime.utcnow().isoformat(),
                "device_id": self.device_id,
                "error": str(e)
            }

    def collect_memory_metrics(self) -> Dict[str, Any]:
        try:
            memory = psutil.virtual_memory()
            swap = psutil.swap_memory()
            
            # Record metrics
            self.metrics.set_gauge(StandardMetrics.MEMORY_USAGE, memory.percent, {"device_id": self.device_id})
            
            memory_data = {
                "timestamp": datetime.utcnow().isoformat(),
                "memory_total_bytes": memory.total,
                "memory_available_bytes": memory.available,
                "memory_used_bytes": memory.used,
                "memory_percent": memory.percent,
                "swap_total_bytes": swap.total,
                "swap_used_bytes": swap.used,
                "swap_percent": swap.percent,
            }
            
            logger.debug("memory_metrics_collected", memory_percent=memory.percent, device_id=self.device_id)
            return memory_data
            
        except ResourceError as e:
            logger.error(f"Error collecting memory metrics: {e}", device_id=self.device_id)
            return {
                "timestamp": datetime.utcnow().isoformat(),
                "device_id": self.device_id,
                "error": str(e)
            }
        except PermissionError as e:
            logger.error(f"Error collecting memory metrics: {e}", device_id=self.device_id)
            return {
                "timestamp": datetime.utcnow().isoformat(),
                "device_id": self.device_id,
                "error": str(e)
            }
        except Exception as e:
            logger.error(f"Error collecting memory metrics: {e}", device_id=self.device_id)
            return {
                "timestamp": datetime.utcnow().isoformat(),
                "device_id": self.device_id,
                "error": str(e)
            }

    def collect_disk_metrics(self) -> Dict[str, Any]:
        try:
            disk_io = psutil.disk_io_counters()
            
            if disk_io is None:
                return {
                    "timestamp": datetime.utcnow().isoformat(),
                    "disk_read_bytes": 0,
                    "disk_write_bytes": 0,
                    "disk_read_count": 0,
                    "disk_write_count": 0,
                }
            
            read_bytes_delta = 0
            write_bytes_delta = 0
            read_count_delta = 0
            write_count_delta = 0
            
            if self._last_disk_io:
                read_bytes_delta = disk_io.read_bytes - self._last_disk_io.read_bytes
                write_bytes_delta = disk_io.write_bytes - self._last_disk_io.write_bytes
                read_count_delta = disk_io.read_count - self._last_disk_io.read_count
                write_count_delta = disk_io.write_count - self._last_disk_io.write_count
            
            self._last_disk_io = disk_io
            
            # Disk usage for all partitions
            disk_usage: Dict[str, Dict[str, Any]] = {}
            partitions = psutil.disk_partitions()
            for partition in partitions:
                try:
                    usage = psutil.disk_usage(partition.mountpoint)
                    disk_usage[partition.mountpoint] = {
                        "total_bytes": usage.total,
                        "used_bytes": usage.used,
                        "free_bytes": usage.free,
                        "percent": usage.percent,
                    }
                except PermissionError:
                    logger.debug(f"Permission denied for disk {partition.device}")
                    continue
                except ResourceError as e:
                    logger.warning(f"Error collecting disk usage: {e}")
                    continue
                except Exception as e:
                    logger.warning(f"Error collecting disk usage: {e}")
                    continue
            
            return {
                "timestamp": datetime.utcnow().isoformat(),
                "disk_read_bytes": disk_io.read_bytes,
                "disk_write_bytes": disk_io.write_bytes,
                "disk_read_count": disk_io.read_count,
                "disk_write_count": disk_io.write_count,
                "disk_read_bytes_delta": read_bytes_delta,
                "disk_write_bytes_delta": write_bytes_delta,
                "disk_read_count_delta": read_count_delta,
                "disk_write_count_delta": write_count_delta,
                "disk_usage": disk_usage,
            }
        except ResourceError as e:
            logger.error(f"Error collecting disk metrics: {e}")
            return {
                "timestamp": datetime.utcnow().isoformat(),
                "device_id": self.device_id,
                "error": str(e)
            }
        except PermissionError as e:
            logger.error(f"Error collecting disk metrics: {e}")
            return {
                "timestamp": datetime.utcnow().isoformat(),
                "device_id": self.device_id,
                "error": str(e)
            }
        except Exception as e:
            logger.error(f"Error collecting disk metrics: {e}")
            return {
                "timestamp": datetime.utcnow().isoformat(),
                "device_id": self.device_id,
                "error": str(e)
            }

    def collect_network_metrics(self) -> Dict[str, Any]:
        try:
            network_io = psutil.net_io_counters()
            
            if network_io is None:
                return {
                    "timestamp": datetime.utcnow().isoformat(),
                    "network_bytes_sent": 0,
                    "network_bytes_recv": 0,
                    "network_packets_sent": 0,
                    "network_packets_recv": 0,
                }
            
            # Calculate deltas if we have previous data
            bytes_sent_delta = 0
            bytes_recv_delta = 0
            packets_sent_delta = 0
            packets_recv_delta = 0
            
            if self._last_network_io:
                bytes_sent_delta = network_io.bytes_sent - self._last_network_io.bytes_sent
                bytes_recv_delta = network_io.bytes_recv - self._last_network_io.bytes_recv
                packets_sent_delta = network_io.packets_sent - self._last_network_io.packets_sent
                packets_recv_delta = network_io.packets_recv - self._last_network_io.packets_recv
            
            self._last_network_io = network_io
            
            return {
                "timestamp": datetime.utcnow().isoformat(),
                "network_bytes_sent": network_io.bytes_sent,
                "network_bytes_recv": network_io.bytes_recv,
                "network_packets_sent": network_io.packets_sent,
                "network_packets_recv": network_io.packets_recv,
                "network_bytes_sent_delta": bytes_sent_delta,
                "network_bytes_recv_delta": bytes_recv_delta,
                "network_packets_sent_delta": packets_sent_delta,
                "network_packets_recv_delta": packets_recv_delta,
                "network_errin": network_io.errin,
                "network_errout": network_io.errout,
                "network_dropin": network_io.dropin,
                "network_dropout": network_io.dropout,
            }
        except ResourceError as e:
            logger.error(f"Error collecting network metrics: {e}")
            return {
                "timestamp": datetime.utcnow().isoformat(),
                "device_id": self.device_id,
                "error": str(e)
            }
        except PermissionError as e:
            logger.error(f"Error collecting network metrics: {e}")
            return {
                "timestamp": datetime.utcnow().isoformat(),
                "device_id": self.device_id,
                "error": str(e)
            }
        except Exception as e:
            logger.error(f"Error collecting network metrics: {e}")
            return {
                "timestamp": datetime.utcnow().isoformat(),
                "device_id": self.device_id,
                "error": str(e)
            }

    def collect_uptime(self) -> Dict[str, Any]:
        try:
            boot_time = psutil.boot_time()
            uptime_seconds = time.time() - boot_time
            
            return {
                "timestamp": datetime.utcnow().isoformat(),
                "boot_time": datetime.fromtimestamp(boot_time).isoformat(),
                "uptime_seconds": uptime_seconds,
            }
        except ResourceError as e:
            logger.error(f"Error collecting uptime: {e}")
            return {
                "timestamp": datetime.utcnow().isoformat(),
                "device_id": self.device_id,
                "error": str(e)
            }
        except PermissionError as e:
            logger.error(f"Error collecting uptime: {e}")
            return {
                "timestamp": datetime.utcnow().isoformat(),
                "device_id": self.device_id,
                "error": str(e)
            }
        except Exception as e:
            logger.error(f"Error collecting uptime: {e}")
            return {
                "timestamp": datetime.utcnow().isoformat(),
                "device_id": self.device_id,
                "error": str(e)
            }

    def get_metrics(self) -> Dict[str, Any]:
        """Get metrics from shared collector"""
        return self.metrics.get_all_metrics()
    
    def create_telemetry_event(self, data: Dict[str, Any]) -> TelemetryEvent:
        """Create standardized telemetry event"""
        return TelemetryEvent(
            device_id=self.device_id,
            timestamp=normalize_timestamp(data.get('timestamp', datetime.utcnow())),
            component="system_collector",
            cpu_percent=data.get('cpu_percent'),
            memory_percent=data.get('memory_percent'),
            disk_usage=data.get('disk_usage'),
            process_count=data.get('process_count'),
            network_connections=data.get('network_connections'),
            metrics_json=data
        )

    def collect_all(self) -> Dict[str, Any]:
        """Collect all system metrics"""
        
        return {
            "timestamp": datetime.utcnow().isoformat(),
            "cpu": self.collect_cpu_metrics(),
            "memory": self.collect_memory_metrics(),
            "disk": self.collect_disk_metrics(),
            "network": self.collect_network_metrics(),
            "uptime": self.collect_uptime(),
        }
