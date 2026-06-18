from typing import Any, Dict, Optional

from pydantic import BaseModel, Field


class AlertSyncPayload(BaseModel):
    anomaly_score_id: Optional[str] = None
    telemetry_event_id: Optional[str] = None
    feature_vector_id: Optional[str] = None
    anomaly_score: float = 0.0
    model_id: str = "unknown"
    inference_latency_ms: int = 0
    telemetry_source: str = "PROCESS"
    title: str = "Anomaly Detected"
    description: Optional[str] = None
    severity: str = "medium"
    category: str = "Unknown"
    alert_type: Optional[str] = None
    detector_type: Optional[str] = None
    confidence: float = 0.0
    detection_window_start: Optional[str] = None
    detection_window_end: Optional[str] = None
    explanation_json: Any = None
    status: str = "PENDING"
    read: bool = False
    net_destination_ip: Optional[str] = None
    net_destination_port: Optional[int] = None
    net_protocol: Optional[str] = None
    net_duration_ms: Optional[int] = None
    proc_name: Optional[str] = None
    proc_privilege_level: Optional[str] = None
    proc_pid: Optional[int] = None
    created_at: Optional[str] = None
    integrity_hash: Optional[str] = None


class TelemetrySyncPayload(BaseModel):
    collected_at: Optional[str] = None
    source: str = "RESOURCE"
    payload: Any = None
    connectivity_state: str = "online"
    payload_hash: str = ""
    integrity_hash: Optional[str] = None


class HealthSnapshotPayload(BaseModel):
    status: str = "ONLINE"
    cpu_usage: Optional[float] = None
    memory_usage: Optional[float] = None
    disk_usage: Optional[float] = None
    network_status: bool = True
    alerts_last_24h: int = 0
    uptime_percentage: float = 100.0
    response_time_ms: int = 0
    error_count: int = 0
    warning_count: int = 0
    last_restart: Optional[str] = None
    created_at: Optional[str] = None
    integrity_hash: Optional[str] = None


class AnomalyScorePayload(BaseModel):
    feature_vector_id: Optional[str] = None
    model_id: str = "unknown"
    score: float = 0.0
    label: Optional[int] = None
    threshold_applied: float = 0.75
    above_threshold: bool = False
    inference_latency_ms: int = 0
    connectivity_state: str = "online"
    scored_at: Optional[str] = None
    created_at: Optional[str] = None
    integrity_hash: Optional[str] = None


class FeatureVectorPayload(BaseModel):
    event_id: Optional[str] = None
    computed_at: Optional[str] = None
    model_id: str = "unknown"
    features: Dict[str, float] = Field(default_factory=dict)
    feature_version: str = "v1.0"
    created_at: Optional[str] = None
    integrity_hash: Optional[str] = None


class HeartbeatPayload(BaseModel):
    pass
