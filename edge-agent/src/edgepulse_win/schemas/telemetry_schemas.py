# Telemetry data models.

from datetime import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, field_validator


class SystemMetrics(BaseModel):
    """System metrics data."""

    timestamp: datetime = Field(default_factory=datetime.utcnow)
    cpu_percent_total: Optional[float] = None
    cpu_percent_per_core: Optional[List[float]] = None
    cpu_count: Optional[int] = None
    cpu_frequency_mhz: Optional[float] = None
    memory_total_bytes: Optional[int] = None
    memory_available_bytes: Optional[int] = None
    memory_used_bytes: Optional[int] = None
    memory_percent: Optional[float] = None
    swap_total_bytes: Optional[int] = None
    swap_used_bytes: Optional[int] = None
    swap_percent: Optional[float] = None
    disk_read_bytes: Optional[int] = None
    disk_write_bytes: Optional[int] = None
    disk_read_bytes_delta: Optional[int] = None
    disk_write_bytes_delta: Optional[int] = None
    network_bytes_sent: Optional[int] = None
    network_bytes_recv: Optional[int] = None
    network_bytes_sent_delta: Optional[int] = None
    network_bytes_recv_delta: Optional[int] = None

    @field_validator("timestamp", mode="before")
    @classmethod
    def parse_timestamp(cls, v: Any) -> datetime:
        """Parse timestamp from string if needed."""
        if isinstance(v, str):
            return datetime.fromisoformat(v)
        return v


class ProcessInfo(BaseModel):
    """Process information."""

    timestamp: datetime = Field(default_factory=datetime.utcnow)
    pid: int
    name: str
    parent_pid: Optional[int] = None
    cmdline_hash: Optional[str] = None
    cpu_percent: Optional[float] = None
    memory_rss_bytes: Optional[int] = None
    memory_vms_bytes: Optional[int] = None
    memory_percent: Optional[float] = None
    create_time: Optional[datetime] = None
    username: Optional[str] = None
    status: Optional[str] = None

    @field_validator("timestamp", "create_time", mode="before")
    @classmethod
    def parse_timestamp(cls, v: Any) -> Optional[datetime]:
        """Parse timestamp from string if needed."""
        if v is None:
            return None
        if isinstance(v, str):
            return datetime.fromisoformat(v)
        return v


class NetworkConnection(BaseModel):
    """Network connection information."""

    timestamp: datetime = Field(default_factory=datetime.utcnow)
    family: Optional[str] = None
    type: Optional[str] = None
    status: Optional[str] = None
    local_address: Optional[str] = None
    local_port: Optional[int] = None
    remote_address: Optional[str] = None
    remote_port: Optional[int] = None
    pid: Optional[int] = None

    @field_validator("timestamp", mode="before")
    @classmethod
    def parse_timestamp(cls, v: Any) -> datetime:
        """Parse timestamp from string if needed."""
        if isinstance(v, str):
            return datetime.fromisoformat(v)
        return v


class TelemetryData(BaseModel):
    """Complete telemetry data structure."""

    timestamp: datetime = Field(default_factory=datetime.utcnow)
    system_metrics: SystemMetrics
    processes: List[ProcessInfo] = Field(default_factory=list)
    network_connections: List[NetworkConnection] = Field(default_factory=list)

    @field_validator("timestamp", mode="before")
    @classmethod
    def parse_timestamp(cls, v: Any) -> datetime:
        """Parse timestamp from string if needed."""
        if isinstance(v, str):
            return datetime.fromisoformat(v)
        return v

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for compatibility."""
        return {
            "timestamp": self.timestamp.isoformat(),
            "system_metrics": self.system_metrics.model_dump(),
            "processes": [p.model_dump() for p in self.processes],
            "network_connections": [n.model_dump() for n in self.network_connections],
        }
