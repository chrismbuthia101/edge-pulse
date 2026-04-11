"""
EdgePulse Agent Settings
"""

import json
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

from edgepulse.utils.device_id import get_default_device_id, validate_device_id


# ---------------------------------------------------------------------------
# Nested config blocks (plain BaseModel – values come from the parent
# AgentSettings which reads env vars / .env / config file)
# ---------------------------------------------------------------------------

class APIConfig(BaseModel):
    """API server configuration (env prefix: API__)"""
    enabled: bool = Field(default=True, description="Enable API server")
    mode: Literal["auto", "fastapi", "minimal", "socket"] = Field(
        default="auto", description="API server mode"
    )
    port: int = Field(default=8080, ge=1, le=65535, description="API server port")
    require_auth: bool = Field(default=False, description="Require authentication")
    socket_path: Optional[str] = Field(default=None, description="Unix socket path")
    min_memory_mb: int = Field(default=512, ge=128, description="Min memory for FastAPI")
    min_cpu_cores: int = Field(default=2, ge=1, description="Min CPU cores for FastAPI")


class SyncConfig(BaseModel):
    """Synchronization configuration (env prefix: SYNC__)"""
    enabled: bool = Field(default=False, description="Enable cloud sync")
    supabase_url: Optional[str] = Field(default=None, description="Supabase URL")
    supabase_key: Optional[SecretStr] = Field(default=None, description="Supabase API key")
    batch_size: int = Field(default=50, ge=1, le=1000, description="Sync batch size")
    retry_max_attempts: int = Field(default=5, ge=1, le=20, description="Max retry attempts")
    offline_queue_max: int = Field(default=10000, ge=100, description="Max offline queue size")
    sync_interval: int = Field(default=300, ge=60, description="Sync interval in seconds")


class CollectionConfig(BaseModel):
    """Data collection configuration (env prefix: COLLECTION__)"""
    interval: int = Field(default=60, ge=5, le=3600, description="Collection interval in seconds")
    window_1min: int = Field(default=60, ge=10, description="1-minute window size (seconds)")
    window_5min: int = Field(default=300, ge=60, description="5-minute window size (seconds)")
    window_15min: int = Field(default=900, ge=300, description="15-minute window size (seconds)")
    enable_process_monitoring: bool = Field(default=True, description="Enable process monitoring")
    enable_network_monitoring: bool = Field(default=True, description="Enable network monitoring")
    max_processes: int = Field(default=100, ge=10, description="Max processes to monitor")


class FeatureConfig(BaseModel):
    """Feature extraction configuration (env prefix: FEATURES__)"""
    feature_dimension: int = Field(default=50, ge=8, le=512, description="Feature vector dimension")
    history_retention_hours: int = Field(default=24, ge=1, le=168, description="History retention hours")
    enable_auto_scaling: bool = Field(default=True, description="Enable feature auto-scaling")
    normalize_features: bool = Field(default=True, description="Normalize features")
    feature_selection: bool = Field(default=False, description="Enable feature selection")


class DetectionConfig(BaseModel):
    """Anomaly detection configuration (env prefix: DETECTION__)"""
    threshold: float = Field(default=0.5, ge=0.0, le=1.0, description="Detection threshold")
    use_autoencoder: bool = Field(default=False, description="Use autoencoder model")
    use_ensemble: bool = Field(default=True, description="Use ensemble detection")

    # Isolation Forest
    isolation_forest_n_estimators: int = Field(default=100, ge=10, le=1000)
    isolation_forest_contamination: str = Field(
        default="auto", description="Contamination parameter"
    )

    # Autoencoder
    autoencoder_encoding_dim: int = Field(default=8, ge=2, le=64)
    autoencoder_hidden_layers: List[int] = Field(
        default=[64, 32, 16], description="Hidden layer sizes"
    )
    autoencoder_learning_rate: float = Field(default=0.001, ge=0.0001, le=0.1)
    autoencoder_input_dim: Optional[int] = Field(
        default=None, description="Autoencoder input dimension"
    )
    autoencoder_use_tflite: bool = Field(
        default=False, description="Use TensorFlow Lite for inference"
    )


class PrivacyConfig(BaseModel):
    """Privacy and data retention configuration"""
    data_retention_days: int = Field(
        default=30, ge=1, le=365, description="Data retention in days"
    )
    anonymization_level: Literal["none", "basic", "medium", "full"] = Field(
        default="basic", description="Data anonymization level"
    )
    collect_command_lines: bool = Field(
        default=False, description="Collect process command lines"
    )
    encrypt_storage: bool = Field(default=False, description="Encrypt local storage")
    hash_sensitive_data: bool = Field(default=True, description="Hash sensitive data")


class AlertingConfig(BaseModel):
    """Alerting configuration (env prefix: ALERT__)"""
    enabled: bool = Field(default=True, description="Enable alerting")
    correlation_window: int = Field(
        default=300, ge=60, description="Alert correlation window in seconds"
    )
    rate_limit: int = Field(default=5, ge=1, description="Max alerts per rate window")
    rate_window: int = Field(
        default=3600, ge=300, description="Rate window in seconds"
    )
    min_severity: Literal["low", "medium", "high", "critical"] = Field(
        default="medium", description="Minimum alert severity"
    )
    enable_local_notifications: bool = Field(
        default=True, description="Enable local notifications"
    )


class LoggingConfig(BaseModel):
    """Logging configuration (env prefix: LOG__)"""
    level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = Field(
        default="INFO", description="Log level"
    )
    format: Literal["json", "text"] = Field(
        default="json", description="Log format"
    )
    file_path: Optional[str] = Field(default=None, description="Log file path")
    max_file_size_mb: int = Field(
        default=100, ge=1, description="Max log file size in MB"
    )
    backup_count: int = Field(default=5, ge=1, description="Number of log backups")
    enable_console: bool = Field(default=True, description="Enable console logging")


class MetricsConfig(BaseModel):
    """Metrics configuration (env prefix: METRICS__)"""
    enabled: bool = Field(default=True, description="Enable metrics collection")
    prometheus_enabled: bool = Field(
        default=False, description="Enable Prometheus metrics"
    )
    prometheus_port: int = Field(
        default=9090, ge=1, le=65535, description="Prometheus port"
    )
    collection_interval: int = Field(
        default=30, ge=5, description="Metrics collection interval"
    )
    retention_hours: int = Field(
        default=168, ge=24, description="Metrics retention in hours"
    )


# ---------------------------------------------------------------------------
# Main settings class
# ---------------------------------------------------------------------------

class AgentSettings(BaseSettings):
    """Main agent settings.

    Environment variable mapping (pydantic-settings v2 with nested delimiter):
        API__PORT=9090          → settings.api.port
        SYNC__ENABLED=true      → settings.sync.enabled
        DETECTION__THRESHOLD=0.7 → settings.detection.threshold
        LOG__LEVEL=DEBUG        → settings.logging.level
        etc.

    A JSON config file can override any field when config_path is supplied.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        env_nested_delimiter="__",   # SYNC__ENABLED maps to sync.enabled
        case_sensitive=False,
        extra="ignore",
    )

    # ------------------------------------------------------------------
    # Core
    # ------------------------------------------------------------------
    device_id: str = Field(
        default_factory=get_default_device_id,
        min_length=3,
        description="Unique device identifier (auto-generated from hostname)",
    )
    environment: Literal["development", "staging", "production"] = Field(
        default="production", description="Environment"
    )

    # ------------------------------------------------------------------
    # Sub-configurations  (populated via env_nested_delimiter or config file)
    # ------------------------------------------------------------------
    api: APIConfig = Field(default_factory=APIConfig)
    sync: SyncConfig = Field(default_factory=SyncConfig)
    collection: CollectionConfig = Field(default_factory=CollectionConfig)
    features: FeatureConfig = Field(default_factory=FeatureConfig)
    detection: DetectionConfig = Field(default_factory=DetectionConfig)
    privacy: PrivacyConfig = Field(default_factory=PrivacyConfig)
    alerting: AlertingConfig = Field(default_factory=AlertingConfig)
    logging: LoggingConfig = Field(default_factory=LoggingConfig)
    metrics: MetricsConfig = Field(default_factory=MetricsConfig)

    # ------------------------------------------------------------------
    # Advanced
    # ------------------------------------------------------------------
    enable_ml_features: bool = Field(default=True, description="Enable ML features")
    max_memory_usage_mb: int = Field(
        default=1024, ge=128, description="Max memory usage in MB"
    )
    graceful_shutdown_timeout: int = Field(
        default=30, ge=5, description="Graceful shutdown timeout"
    )
    health_check_interval: int = Field(
        default=60, ge=10, description="Health check interval"
    )

    # ------------------------------------------------------------------
    # config_path: optional path to a JSON config file.
    # When provided the file is merged on top of env/default values.
    # ------------------------------------------------------------------
    config_path: Optional[Path] = Field(
        default=None, description="Path to JSON config file", exclude=True
    )

    # ------------------------------------------------------------------
    # Validators
    # ------------------------------------------------------------------

    @field_validator("device_id")
    @classmethod
    def validate_device_id(cls, v: str) -> str:
        if not v or len(v.strip()) < 3:
            raise ValueError("device_id must be at least 3 characters long")
        is_valid, error_msg = validate_device_id(v)
        if not is_valid:
            raise ValueError(f"Invalid device_id: {error_msg}")
        return v

    @field_validator("max_memory_usage_mb")
    @classmethod
    def validate_memory_limit(cls, v: int) -> int:
        if v < 128:
            raise ValueError("max_memory_usage_mb must be at least 128")
        return v

    @model_validator(mode="after")
    def _apply_config_file(self) -> "AgentSettings":
        """Merge values from a JSON config file if config_path is set."""
        if self.config_path is None:
            return self

        path = Path(self.config_path)
        if not path.exists():
            # Non-fatal: just warn so the service can still start
            import logging
            logging.getLogger(__name__).warning(
                f"Config file not found, ignoring: {path}"
            )
            return self

        try:
            with open(path, "r", encoding="utf-8") as fh:
                overrides: Dict[str, Any] = json.load(fh)
        except Exception as exc:
            raise ValueError(f"Cannot parse config file {path}: {exc}") from exc

        # Apply top-level scalar overrides
        for key, value in overrides.items():
            if hasattr(self, key):
                try:
                    object.__setattr__(self, key, value)
                except Exception:
                    pass  # Let pydantic validation handle bad values

        return self

    # ------------------------------------------------------------------
    # Convenience helpers
    # ------------------------------------------------------------------

    def get_effective_config(self) -> Dict[str, Any]:
        """Return all settings as a flat dict (including nested)."""
        return self.model_dump()

    def is_production(self) -> bool:
        return self.environment == "production"

    def is_development(self) -> bool:
        return self.environment == "development"

    def get_log_level(self) -> str:
        return self.logging.level.upper()

    def should_enable_api(self) -> bool:
        return self.api.enabled

    def should_enable_sync(self) -> bool:
        return self.sync.enabled and bool(
            self.sync.supabase_url and self.sync.supabase_key
        )

    def should_enable_ml(self) -> bool:
        return self.enable_ml_features

    def get_collection_interval_seconds(self) -> int:
        return self.collection.interval

    def get_data_retention_days(self) -> int:
        return self.privacy.data_retention_days