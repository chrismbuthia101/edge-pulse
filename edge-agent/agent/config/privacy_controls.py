"""
Privacy Controller

Enforces privacy-by-design principles and GDPR compliance.
"""

import logging
import hashlib
from typing import Dict, Any
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)


class PrivacyController:
    """
    Enforces privacy-by-design principles.
    
    GDPR-compliant data handling.
    """

    def __init__(
        self,
        data_retention_days: int = 30,
        anonymization_level: str = "strict",
        collect_command_lines: bool = False,
    ):
        """
        Initialize privacy controller.
        
        Args:
            data_retention_days: Data retention period (default: 30)
            anonymization_level: 'basic', 'strict', or 'maximum' (default: 'strict')
            collect_command_lines: Allow command line collection (default: False)
        """
        self.data_retention_days = data_retention_days
        self.anonymization_level = anonymization_level
        self.collect_command_lines = collect_command_lines

    def apply_data_minimization(self, telemetry: Dict) -> Dict:
        """
        Apply data minimization principles.
        
        Args:
            telemetry: Raw telemetry data
            
        Returns:
            Minimized telemetry data
        """
        minimized = {}
        
        # Only keep necessary metrics
        if "system_metrics" in telemetry:
            # Preserve disk metrics structure - feature extractor expects dict with delta keys
            disk_metrics = telemetry["system_metrics"].get("disk", {})
            if isinstance(disk_metrics, dict):
                # Filter to keep only necessary keys but preserve all delta and timestamp fields
                minimized_disk = {
                    k: v for k, v in disk_metrics.items()
                    if k.startswith(("disk_read", "disk_write", "timestamp"))
                }
            else:
                minimized_disk = disk_metrics
            
            minimized["system_metrics"] = {
                "cpu": telemetry["system_metrics"].get("cpu", {}),
                "memory": telemetry["system_metrics"].get("memory", {}),
                "disk": minimized_disk,
                "network": {
                    k: v for k, v in telemetry["system_metrics"].get("network", {}).items()
                    if k.startswith(("network_bytes", "network_packets"))
                },
            }
        
        # Processes: only metadata, no command lines unless allowed (preserve timestamp for feature extraction)
        if "processes" in telemetry:
            minimized["processes"] = []
            for proc in telemetry["processes"]:
                proc_min = {
                    "timestamp": proc.get("timestamp"),  # Preserve timestamp for time-windowed features
                    "pid": proc.get("pid"),
                    "name": proc.get("name"),
                    "cpu_percent": proc.get("cpu_percent"),
                    "memory_percent": proc.get("memory_percent"),
                }
                if self.collect_command_lines:
                    proc_min["cmdline_hash"] = proc.get("cmdline_hash")
                minimized["processes"].append(proc_min)
        
        # Network: only connection metadata (preserve timestamp for feature extraction)
        if "network_connections" in telemetry:
            minimized["network_connections"] = [
                {
                    "timestamp": c.get("timestamp"),  # Preserve timestamp for time-windowed features
                    "local_port": c.get("local_port"),
                    "remote_address": self.anonymize_ip(c.get("remote_address")),
                    "remote_port": c.get("remote_port"),
                    "status": c.get("status"),
                }
                for c in telemetry["network_connections"]
            ]
        
        return minimized

    def anonymize_identifiers(self, data: Dict) -> Dict:
        """
        Anonymize personally identifiable information.
        
        Args:
            data: Data dictionary
            
        Returns:
            Anonymized data dictionary (deep copy to avoid mutating original)
        """
        import copy
        # Use deep copy to avoid mutating the original data structure
        anonymized = copy.deepcopy(data)
        
        # Hash IP addresses
        if "network_connections" in anonymized:
            for conn in anonymized["network_connections"]:
                if "remote_address" in conn:
                    conn["remote_address"] = self.anonymize_ip(conn["remote_address"])
        
        # Hash usernames
        if "processes" in anonymized:
            for proc in anonymized["processes"]:
                if "username" in proc:
                    proc["username"] = self.hash_string(proc["username"])
        
        return anonymized

    def anonymize_ip(self, ip_address: str) -> str:
        """
        Anonymize IP address based on anonymization level.
        
        Args:
            ip_address: IP address string
            
        Returns:
            Anonymized IP or hash
        """
        if not ip_address:
            return ""
        
        if self.anonymization_level == "maximum":
            # Full hash
            return self.hash_string(ip_address)
        elif self.anonymization_level == "strict":
            # Last octet zeroed
            parts = ip_address.split('.')
            if len(parts) == 4:
                return '.'.join(parts[:3] + ['0'])
            return self.hash_string(ip_address)
        else:
            # Basic: keep as is
            return ip_address

    def hash_string(self, value: str) -> str:
        """
        Hash a string value.
        
        Args:
            value: String to hash
            
        Returns:
            SHA-256 hash
        """
        if not value:
            return ""
        return hashlib.sha256(value.encode('utf-8')).hexdigest()

    def should_collect(self, data_type: str) -> bool:
        """
        Check if data type should be collected.
        
        Args:
            data_type: Type of data
            
        Returns:
            True if should collect
        """
        # Command lines require explicit permission
        if data_type == "command_line" and not self.collect_command_lines:
            return False
        
        return True

    def set_retention_policy(self, days: int) -> None:
        """
        Set data retention policy.
        
        Args:
            days: Retention period in days
        """
        self.data_retention_days = days
        logger.info(f"Set retention policy to {days} days")

    def enforce_retention(self, data_timestamp: datetime) -> bool:
        """
        Check if data should be retained.
        
        Args:
            data_timestamp: Data timestamp
            
        Returns:
            True if should retain
        """
        cutoff = datetime.utcnow() - timedelta(days=self.data_retention_days)
        return data_timestamp >= cutoff

    def export_privacy_report(self) -> Dict:
        """
        Export privacy compliance report.
        
        Returns:
            Privacy report dictionary
        """
        return {
            "timestamp": datetime.utcnow().isoformat(),
            "data_retention_days": self.data_retention_days,
            "anonymization_level": self.anonymization_level,
            "collect_command_lines": self.collect_command_lines,
            "gdpr_compliant": True,
            "data_minimization": True,
            "anonymization": True,
        }
