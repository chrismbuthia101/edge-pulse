"""
System Metrics Collector

Collects CPU, memory, disk, and network metrics using psutil.
"""

import time
import logging
from typing import Dict, List, Optional
from datetime import datetime
import psutil

logger = logging.getLogger(__name__)


class SystemMetricsCollector:
    """
    Collects system-level metrics including CPU, memory, disk, and network I/O.
    
    Privacy: No file contents or network payloads are collected - metrics only.
    """

    def __init__(self, collection_interval: int = 5):
        """
        Initialize the system metrics collector.
        
        Args:
            collection_interval: Time in seconds between collections (default: 5)
        """
        self.collection_interval = collection_interval
        self._last_disk_io = None
        self._last_network_io = None

    def collect_cpu_metrics(self) -> Dict:
        """
        Collect CPU usage metrics.
        
        Returns:
            Dictionary containing CPU metrics with timestamp
        """
        try:
            # Per-core CPU usage
            per_cpu = psutil.cpu_percent(interval=0.1, percpu=True)
            
            # Total CPU usage
            total_cpu = psutil.cpu_percent(interval=0.1)
            
            # CPU count
            cpu_count = psutil.cpu_count()
            
            # CPU frequency (if available)
            try:
                cpu_freq = psutil.cpu_freq()
                current_freq = cpu_freq.current if cpu_freq else None
            except (AttributeError, RuntimeError):
                current_freq = None
            
            return {
                "timestamp": datetime.utcnow().isoformat(),
                "cpu_percent_total": total_cpu,
                "cpu_percent_per_core": per_cpu,
                "cpu_count": cpu_count,
                "cpu_frequency_mhz": current_freq,
            }
        except Exception as e:
            logger.error(f"Error collecting CPU metrics: {e}")
            return {
                "timestamp": datetime.utcnow().isoformat(),
                "cpu_percent_total": None,
                "cpu_percent_per_core": None,
                "cpu_count": None,
                "cpu_frequency_mhz": None,
                "error": str(e),
            }

    def collect_memory_metrics(self) -> Dict:
        """
        Collect memory usage metrics.
        
        Returns:
            Dictionary containing memory metrics with timestamp
        """
        try:
            memory = psutil.virtual_memory()
            swap = psutil.swap_memory()
            
            return {
                "timestamp": datetime.utcnow().isoformat(),
                "memory_total_bytes": memory.total,
                "memory_available_bytes": memory.available,
                "memory_used_bytes": memory.used,
                "memory_percent": memory.percent,
                "swap_total_bytes": swap.total,
                "swap_used_bytes": swap.used,
                "swap_percent": swap.percent,
            }
        except Exception as e:
            logger.error(f"Error collecting memory metrics: {e}")
            return {
                "timestamp": datetime.utcnow().isoformat(),
                "memory_total_bytes": None,
                "memory_available_bytes": None,
                "memory_used_bytes": None,
                "memory_percent": None,
                "error": str(e),
            }

    def collect_disk_metrics(self) -> Dict:
        """
        Collect disk I/O metrics.
        
        Returns:
            Dictionary containing disk metrics with timestamp
        """
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
            
            # Calculate deltas if we have previous data
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
            disk_usage = {}
            try:
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
                        continue
            except Exception as e:
                logger.warning(f"Error collecting disk usage: {e}")
            
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
        except Exception as e:
            logger.error(f"Error collecting disk metrics: {e}")
            return {
                "timestamp": datetime.utcnow().isoformat(),
                "disk_read_bytes": None,
                "disk_write_bytes": None,
                "error": str(e),
            }

    def collect_network_metrics(self) -> Dict:
        """
        Collect network I/O metrics.
        
        Returns:
            Dictionary containing network metrics with timestamp
        """
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
        except Exception as e:
            logger.error(f"Error collecting network metrics: {e}")
            return {
                "timestamp": datetime.utcnow().isoformat(),
                "network_bytes_sent": None,
                "network_bytes_recv": None,
                "error": str(e),
            }

    def collect_uptime(self) -> Dict:
        """
        Collect system uptime.
        
        Returns:
            Dictionary containing uptime information
        """
        try:
            boot_time = psutil.boot_time()
            uptime_seconds = time.time() - boot_time
            
            return {
                "timestamp": datetime.utcnow().isoformat(),
                "boot_time": datetime.fromtimestamp(boot_time).isoformat(),
                "uptime_seconds": uptime_seconds,
            }
        except Exception as e:
            logger.error(f"Error collecting uptime: {e}")
            return {
                "timestamp": datetime.utcnow().isoformat(),
                "uptime_seconds": None,
                "error": str(e),
            }

    def collect_all(self) -> Dict:
        """
        Collect all system metrics.
        
        Returns:
            Dictionary containing all collected metrics
        """
        return {
            "timestamp": datetime.utcnow().isoformat(),
            "cpu": self.collect_cpu_metrics(),
            "memory": self.collect_memory_metrics(),
            "disk": self.collect_disk_metrics(),
            "network": self.collect_network_metrics(),
            "uptime": self.collect_uptime(),
        }
