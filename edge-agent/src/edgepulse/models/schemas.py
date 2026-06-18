from datetime import datetime
from typing import Any, Dict, List, Literal, Optional, Union
from pydantic import BaseModel, Field, computed_field, field_validator
from enum import Enum
import uuid


class SeverityLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class DeviceStatus(str, Enum):
    ONLINE = "online"
    OFFLINE = "offline"
    WARNING = "warning"
    ERROR = "error"


class EventType(str, Enum):
    ALERT = "alert"
    TELEMETRY = "telemetry"
    DETECTION = "detection"
    SYNC = "sync"
    SYSTEM = "system"


class BaseEvent(BaseModel):
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
    event_type: Literal[EventType.ALERT] = Field(  # type: ignore[override]
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
    event_type: Literal[EventType.TELEMETRY] = Field(  # type: ignore[override]
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
    event_type: Literal[EventType.DETECTION] = Field(  # type: ignore[override]
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
    device_id: str = Field(..., description="Device identifier")
    timestamp: str = Field(..., description="ISO format timestamp")
    features: Dict[str, float] = Field(..., description="Feature name-value pairs")
    model_version: Optional[str] = Field(default=None)
    normalized: bool = Field(default=False)
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())

    @computed_field  # type: ignore[prop-decorator]
    @property
    def feature_names(self) -> List[str]:
        return list(self.features.keys())

    @field_validator("features")
    @classmethod
    def validate_features(cls, v: Dict[str, float]) -> Dict[str, float]:
        if not v:
            raise ValueError("Features dictionary cannot be empty")
        return v


def normalize_timestamp(timestamp: Union[str, datetime]) -> str:
    if isinstance(timestamp, datetime):
        return timestamp.isoformat()
    if isinstance(timestamp, str):
        try:
            dt = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
            return dt.isoformat()
        except ValueError:
            raise ValueError(f"Invalid timestamp format: {timestamp}")
    raise ValueError(f"Unsupported timestamp type: {type(timestamp)}")
