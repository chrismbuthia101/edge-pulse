# Shared data schemas for EdgePulse components.

from datetime import datetime
from typing import Dict, Any, Optional, List, Union
from pydantic import BaseModel, Field, validator
from enum import Enum


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
    timestamp: str = Field(..., description="ISO format timestamp")
    event_type: EventType = Field(..., description="Type of event")
    component: str = Field(..., description="Component that generated the event")
    created_at: Optional[str] = Field(default_factory=lambda: datetime.utcnow().isoformat())
    
    @validator('timestamp')
    def validate_timestamp(cls, v):
        try:
            datetime.fromisoformat(v.replace('Z', '+00:00'))
            return v
        except ValueError:
            raise ValueError("Timestamp must be in ISO format")
    
    class Config:
        use_enum_values = True


class AlertEvent(BaseEvent):
    """Standard alert event schema"""
    event_type: EventType = Field(default=EventType.ALERT, const=True)
    severity: SeverityLevel = Field(..., description="Alert severity level")
    anomaly_score: float = Field(..., ge=0.0, le=1.0, description="Anomaly score between 0 and 1")
    alert_type: str = Field(..., description="Type of alert")
    detector_type: str = Field(..., description="Type of detector that generated the alert")
    explanation: Optional[Dict[str, Any]] = Field(default=None, description="Alert explanation details")
    feature_importance: Optional[Dict[str, float]] = Field(default=None, description="Feature importance scores")
    acknowledged: bool = Field(default=False, description="Whether alert has been acknowledged")
    acknowledged_at: Optional[str] = Field(default=None, description="When alert was acknowledged")
    acknowledged_by: Optional[str] = Field(default=None, description="Who acknowledged the alert")
    
    class Config:
        use_enum_values = True


class TelemetryEvent(BaseEvent):
    """Standard telemetry event schema"""
    event_type: EventType = Field(default=EventType.TELEMETRY, const=True)
    cpu_percent: Optional[float] = Field(default=None, ge=0.0, le=100.0, description="CPU usage percentage")
    memory_percent: Optional[float] = Field(default=None, ge=0.0, le=100.0, description="Memory usage percentage")
    disk_usage: Optional[float] = Field(default=None, ge=0.0, le=100.0, description="Disk usage percentage")
    process_count: Optional[int] = Field(default=None, ge=0, description="Number of running processes")
    network_connections: Optional[int] = Field(default=None, ge=0, description="Number of network connections")
    metrics_json: Optional[Dict[str, Any]] = Field(default=None, description="Additional metrics as JSON")
    
    class Config:
        use_enum_values = True


class DetectionEvent(BaseEvent):
    """Standard detection event schema"""
    event_type: EventType = Field(default=EventType.DETECTION, const=True)
    detector_name: str = Field(..., description="Name of the detector")
    label: int = Field(..., description="Detection label (0=normal, 1=anomaly)")
    anomaly_score: Optional[float] = Field(default=None, ge=0.0, le=1.0, description="Anomaly score")
    confidence: Optional[float] = Field(default=None, ge=0.0, le=1.0, description="Detection confidence")
    features_used: Optional[List[str]] = Field(default=None, description="List of features used")
    model_version: Optional[str] = Field(default=None, description="Model version used")
    detection_metadata: Optional[Dict[str, Any]] = Field(default=None, description="Additional detection metadata")
    
    class Config:
        use_enum_values = True


class DeviceInfo(BaseModel):
    """Standard device information schema"""
    device_id: str = Field(..., description="Unique device identifier")
    status: DeviceStatus = Field(..., description="Device status")
    last_seen: str = Field(..., description="ISO format timestamp of last seen")
    cpu_usage: Optional[float] = Field(default=None, ge=0.0, le=100.0, description="Current CPU usage")
    memory_usage: Optional[float] = Field(default=None, ge=0.0, le=100.0, description="Current memory usage")
    alerts_count: int = Field(default=0, ge=0, description="Number of active alerts")
    version: Optional[str] = Field(default=None, description="Agent version")
    created_at: Optional[str] = Field(default_factory=lambda: datetime.utcnow().isoformat())
    updated_at: Optional[str] = Field(default_factory=lambda: datetime.utcnow().isoformat())
    
    class Config:
        use_enum_values = True


class FeatureVector(BaseModel):
    """Standard feature vector schema"""
    device_id: str = Field(..., description="Device identifier")
    timestamp: str = Field(..., description="ISO format timestamp")
    features: Dict[str, float] = Field(..., description="Feature name-value pairs")
    feature_names: List[str] = Field(..., description="Ordered list of feature names")
    model_version: Optional[str] = Field(default=None, description="Model version used for feature extraction")
    normalized: bool = Field(default=False, description="Whether features are normalized")
    created_at: Optional[str] = Field(default_factory=lambda: datetime.utcnow().isoformat())
    
    @validator('features')
    def validate_features(cls, v):
        if not v:
            raise ValueError("Features dictionary cannot be empty")
        return v
    
    @validator('feature_names')
    def validate_feature_names(cls, v, values):
        if 'features' in values and len(v) != len(values['features']):
            raise ValueError("feature_names length must match features dictionary size")
        return v


# Utility functions
def normalize_timestamp(timestamp: Union[str, datetime]) -> str:
    """Normalize timestamp to ISO format string"""
    if isinstance(timestamp, datetime):
        return timestamp.isoformat()
    
    if isinstance(timestamp, str):
        try:
            # Try to parse and reformat to ensure ISO consistency
            dt = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
            return dt.isoformat()
        except ValueError:
            raise ValueError(f"Invalid timestamp format: {timestamp}")
    
    raise ValueError(f"Unsupported timestamp type: {type(timestamp)}")


def normalize_severity(severity: Union[str, SeverityLevel]) -> SeverityLevel:
    """Normalize severity to enum value"""
    if isinstance(severity, SeverityLevel):
        return severity
    
    if isinstance(severity, str):
        severity_lower = severity.lower()
        try:
            return SeverityLevel(severity_lower)
        except ValueError:
            valid_levels = [level.value for level in SeverityLevel]
            raise ValueError(f"Invalid severity '{severity}'. Valid levels: {valid_levels}")
    
    raise ValueError(f"Unsupported severity type: {type(severity)}")


def validate_standard_fields(data: Dict[str, Any]) -> Dict[str, Any]:
    """Validate and standardize common fields"""
    if 'timestamp' in data:
        data['timestamp'] = normalize_timestamp(data['timestamp'])
    
    if 'severity' in data:
        data['severity'] = normalize_severity(data['severity'])
    
    return data


def create_standard_response(
    success: bool = True,
    data: Optional[Dict[str, Any]] = None,
    error: Optional[str] = None,
    timestamp: Optional[str] = None
) -> Dict[str, Any]:
    """Create a standardized API response"""
    return {
        'success': success,
        'timestamp': timestamp or datetime.utcnow().isoformat(),
        'data': data,
        'error': error
    }
