# Shared data schemas for EdgePulse components.

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional, Union
from pydantic import BaseModel, Field, field_validator, model_validator
from enum import Enum
import uuid

class SeverityLevel(str, Enum):
    """Standard severity levels for alerts and events"""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class DeviceStatus(str, Enum):
    """Standard device status values"""
    ONLINE = "online"
    OFFLINE = "offline"
    WARNING = "warning"
    ERROR = "error"


class EventType(str, Enum):
    """Standard event types across the system"""
    ALERT = "alert"
    TELEMETRY = "telemetry"
    DETECTION = "detection"
    SYNC = "sync"
    SYSTEM = "system"


class BaseEvent(BaseModel):
    """Base event schema with standard fields"""
    device_id: str = Field(..., description="Unique device identifier")
    timestamp: str = Field(
        default_factory=lambda: datetime.utcnow().isoformat(),
        description="ISO format timestamp",
    )
    event_type: EventType = Field(..., description="Type of event")
    component: str = Field(default="agent", description="Component that generated the event")
    created_at: str = Field(
        default_factory=lambda: datetime.utcnow().isoformat(),
    )

    @field_validator("timestamp", mode="before")
    @classmethod
    def validate_timestamp(cls, v: Any) -> str:
        if v is None:
            return datetime.utcnow().isoformat()
        if isinstance(v, datetime):
            return v.isoformat()
        if isinstance(v, str):
            try:
                datetime.fromisoformat(v.replace("Z", "+00:00"))
                return v
            except ValueError:
                return datetime.utcnow().isoformat()
        return datetime.utcnow().isoformat()

    model_config = {"use_enum_values": True}


class AlertEvent(BaseEvent):
    """Standard alert event schema"""
    event_type: Literal[EventType.ALERT] = Field(
        default=EventType.ALERT, description="Type of event"
    )
    component: str = Field(default="alert_engine")
    alert_id: str = Field(
        default_factory=lambda: str(uuid.uuid4()),
        description="Unique alert identifier",
    )
    severity: SeverityLevel = Field(..., description="Alert severity level")
    anomaly_score: float = Field(..., ge=0.0, le=1.0, description="Anomaly score between 0 and 1")
    alert_type: str = Field(..., description="Type of alert")
    detector_type: str = Field(..., description="Type of detector that generated the alert")
    explanation: Optional[Dict[str, Any]] = Field(
        default=None, description="Alert explanation details"
    )
    feature_importance: Optional[Dict[str, float]] = Field(
        default=None, description="Feature importance scores"
    )
    acknowledged: bool = Field(default=False)
    acknowledged_at: Optional[str] = Field(default=None)
    acknowledged_by: Optional[str] = Field(default=None)

    model_config = {"use_enum_values": True}


class TelemetryEvent(BaseEvent):
    """Standard telemetry event schema"""
    event_type: Literal[EventType.TELEMETRY] = Field(
        default=EventType.TELEMETRY, description="Type of event"
    )
    component: str = Field(default="system_collector")
    cpu_percent: Optional[float] = Field(default=None, ge=0.0, le=100.0)
    memory_percent: Optional[float] = Field(default=None, ge=0.0, le=100.0)
    disk_usage: Optional[float] = Field(default=None, ge=0.0, le=100.0)
    process_count: Optional[int] = Field(default=None, ge=0)
    network_connections: Optional[int] = Field(default=None, ge=0)
    metrics_json: Optional[Dict[str, Any]] = Field(default=None)

    @field_validator("cpu_percent", "memory_percent", "disk_usage", mode="before")
    @classmethod
    def clamp_percent(cls, v: Any) -> Optional[float]:
        if v is None:
            return None
        try:
            f = float(v)
            return max(0.0, min(100.0, f))
        except (TypeError, ValueError):
            return None

    model_config = {"use_enum_values": True}


class DetectionEvent(BaseEvent):
    """Standard detection event schema"""
    event_type: Literal[EventType.DETECTION] = Field(
        default=EventType.DETECTION, description="Type of event"
    )
    component: str = Field(default="detector")
    detector_name: str = Field(..., description="Name of the detector")
    label: int = Field(..., description="Detection label (0=normal, 1=anomaly)")
    anomaly_score: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    confidence: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    features_used: Optional[List[str]] = Field(default=None)
    model_version: Optional[str] = Field(default=None)
    detection_metadata: Optional[Dict[str, Any]] = Field(default=None)

    model_config = {"use_enum_values": True}


class DeviceInfo(BaseModel):
    """Standard device information schema"""
    device_id: str = Field(..., description="Unique device identifier")
    status: DeviceStatus = Field(..., description="Device status")
    last_seen: str = Field(..., description="ISO format timestamp of last seen")
    cpu_usage: Optional[float] = Field(default=None, ge=0.0, le=100.0)
    memory_usage: Optional[float] = Field(default=None, ge=0.0, le=100.0)
    alerts_count: int = Field(default=0, ge=0)
    version: Optional[str] = Field(default=None)
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())

    model_config = {"use_enum_values": True}


class FeatureVector(BaseModel):
    """Standard feature vector schema"""
    device_id: str = Field(..., description="Device identifier")
    timestamp: str = Field(..., description="ISO format timestamp")
    features: Dict[str, float] = Field(..., description="Feature name-value pairs")
    feature_names: List[str] = Field(..., description="Ordered list of feature names")
    model_version: Optional[str] = Field(default=None)
    normalized: bool = Field(default=False)
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())

    @field_validator("features")
    @classmethod
    def validate_features(cls, v: Dict[str, float]) -> Dict[str, float]:
        if not v:
            raise ValueError("Features dictionary cannot be empty")
        return v

    @field_validator("feature_names")
    @classmethod
    def validate_feature_names(
        cls, v: List[str], info: Any
    ) -> List[str]:
        features = info.data.get("features")
        if features is not None and len(v) != len(features):
            raise ValueError(
                "feature_names length must match features dictionary size"
            )
        return v


# ---------------------------------------------------------------------------
# Utility functions
# ---------------------------------------------------------------------------

def normalize_timestamp(timestamp: Union[str, datetime]) -> str:
    """Normalize timestamp to ISO format string"""
    if isinstance(timestamp, datetime):
        return timestamp.isoformat()
    if isinstance(timestamp, str):
        try:
            dt = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
            return dt.isoformat()
        except ValueError:
            raise ValueError(f"Invalid timestamp format: {timestamp}")
    raise ValueError(f"Unsupported timestamp type: {type(timestamp)}")


def normalize_severity(severity: Union[str, SeverityLevel]) -> SeverityLevel:
    """Normalize severity to enum value"""
    if isinstance(severity, SeverityLevel):
        return severity
    if isinstance(severity, str):
        try:
            return SeverityLevel(severity.lower())
        except ValueError:
            valid = [level.value for level in SeverityLevel]
            raise ValueError(
                f"Invalid severity '{severity}'. Valid levels: {valid}"
            )
    raise ValueError(f"Unsupported severity type: {type(severity)}")


def validate_standard_fields(data: Dict[str, Any]) -> Dict[str, Any]:
    """Validate and standardize common fields"""
    if "timestamp" in data:
        data["timestamp"] = normalize_timestamp(data["timestamp"])
    if "severity" in data:
        data["severity"] = normalize_severity(data["severity"])
    return data


def create_standard_response(
    success: bool = True,
    data: Optional[Dict[str, Any]] = None,
    error: Optional[str] = None,
    timestamp: Optional[str] = None,
) -> Dict[str, Any]:
    """Create a standardized API response"""
    return {
        "success": success,
        "timestamp": timestamp or datetime.utcnow().isoformat(),
        "data": data,
        "error": error,
    }