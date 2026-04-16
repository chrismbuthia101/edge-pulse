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
# Nested config blocks
# ---------------------------------------------------------------------------

class APIConfig(BaseModel):
    enabled: bool = Field(default=True)
    mode: Literal["auto", "fastapi", "minimal", "socket"] = Field(default="auto")
    port: int = Field(default=8080, ge=1, le=65535)
    require_auth: bool = Field(default=False)
    socket_path: Optional[str] = Field(default=None)
    min_memory_mb: int = Field(default=512, ge=128)
    min_cpu_cores: int = Field(default=2, ge=1)


class SyncConfig(BaseModel):
    supabase_url: Optional[str] = Field(default="")
    supabase_key: Optional[SecretStr] = Field(default=None)
    batch_size: int = Field(default=50, ge=1, le=1000)
    retry_max_attempts: int = Field(default=5, ge=1, le=20)
    offline_queue_max: int = Field(default=10000, ge=100)
    sync_interval: int = Field(default=300, ge=60)

    @field_validator("supabase_url", mode="before")
    @classmethod
    def reject_placeholder_url(cls, v: Any) -> Any:
        """Accept empty/None but reject obvious placeholder values."""
        if v and isinstance(v, str) and "YOUR_PROJECT" in v:
            return ""
        return v

    @field_validator("supabase_key", mode="before")
    @classmethod
    def reject_placeholder_key(cls, v: Any) -> Any:
        if v and isinstance(v, str) and "YOUR_SUPABASE" in v:
            return None
        return v


class CollectionConfig(BaseModel):
    interval: int = Field(default=60, ge=5, le=3600)
    window_1min: int = Field(default=60, ge=10)
    window_5min: int = Field(default=300, ge=60)
    window_15min: int = Field(default=900, ge=300)
    enable_process_monitoring: bool = Field(default=True)
    enable_network_monitoring: bool = Field(default=True)
    max_processes: int = Field(default=100, ge=10)


class FeatureConfig(BaseModel):
    feature_dimension: int = Field(default=50, ge=8, le=512)
    history_retention_hours: int = Field(default=24, ge=1, le=168)
    enable_auto_scaling: bool = Field(default=True)
    normalize_features: bool = Field(default=True)
    feature_selection: bool = Field(default=False)


class DetectionConfig(BaseModel):
    threshold: float = Field(default=0.5, ge=0.0, le=1.0)
    use_autoencoder: bool = Field(default=False)
    use_ensemble: bool = Field(default=True)
    isolation_forest_n_estimators: int = Field(default=100, ge=10, le=1000)
    isolation_forest_contamination: str = Field(default="auto")
    autoencoder_encoding_dim: int = Field(default=8, ge=2, le=64)
    autoencoder_hidden_layers: List[int] = Field(default=[64, 32, 16])
    autoencoder_learning_rate: float = Field(default=0.001, ge=0.0001, le=0.1)
    autoencoder_input_dim: Optional[int] = Field(default=None)
    autoencoder_use_tflite: bool = Field(default=False)


class PrivacyConfig(BaseModel):
    data_retention_days: int = Field(default=30, ge=1, le=365)
    anonymization_level: Literal["none", "basic", "medium", "full"] = Field(default="basic")
    collect_command_lines: bool = Field(default=False)
    encrypt_storage: bool = Field(default=False)
    hash_sensitive_data: bool = Field(default=True)


class AlertingConfig(BaseModel):
    enabled: bool = Field(default=True)
    correlation_window: int = Field(default=300, ge=60)
    rate_limit: int = Field(default=5, ge=1)
    rate_window: int = Field(default=3600, ge=300)
    min_severity: Literal["low", "medium", "high", "critical"] = Field(default="medium")
    enable_local_notifications: bool = Field(default=True)


class LoggingConfig(BaseModel):
    level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = Field(default="INFO")
    format: Literal["json", "text"] = Field(default="json")
    file_path: Optional[str] = Field(default=None)
    max_file_size_mb: int = Field(default=100, ge=1)
    backup_count: int = Field(default=5, ge=1)
    enable_console: bool = Field(default=True)


class MetricsConfig(BaseModel):
    enabled: bool = Field(default=True)
    prometheus_enabled: bool = Field(default=False)
    prometheus_port: int = Field(default=9090, ge=1, le=65535)
    collection_interval: int = Field(default=30, ge=5)
    retention_hours: int = Field(default=168, ge=24)


# ---------------------------------------------------------------------------
# Main settings class
# ---------------------------------------------------------------------------

class AgentSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        env_nested_delimiter="__",
        case_sensitive=False,
        extra="ignore",
    )

    device_id: str = Field(
        default_factory=get_default_device_id,
        min_length=3,
    )
    environment: Literal["development", "staging", "production"] = Field(default="production")

    api: APIConfig = Field(default_factory=APIConfig)
    sync: SyncConfig = Field(default_factory=SyncConfig)
    collection: CollectionConfig = Field(default_factory=CollectionConfig)
    features: FeatureConfig = Field(default_factory=FeatureConfig)
    detection: DetectionConfig = Field(default_factory=DetectionConfig)
    privacy: PrivacyConfig = Field(default_factory=PrivacyConfig)
    alerting: AlertingConfig = Field(default_factory=AlertingConfig)
    logging: LoggingConfig = Field(default_factory=LoggingConfig)
    metrics: MetricsConfig = Field(default_factory=MetricsConfig)

    enable_ml_features: bool = Field(default=True)
    max_memory_usage_mb: int = Field(default=1024, ge=128)
    graceful_shutdown_timeout: int = Field(default=30, ge=5)
    health_check_interval: int = Field(default=60, ge=10)

    config_path: Optional[Path] = Field(default=None, exclude=True)

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
        if self.config_path is None:
            return self

        path = Path(self.config_path)
        if not path.exists():
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

        for key, value in overrides.items():
            if not hasattr(self, key):
                continue
            current_value = getattr(self, key, None)
            try:
                if isinstance(value, dict) and isinstance(current_value, BaseModel):
                    current_dict = current_value.model_dump()
                    current_dict.update(value)
                    new_value = current_value.__class__(**current_dict)
                    object.__setattr__(self, key, new_value)
                else:
                    object.__setattr__(self, key, value)
            except Exception:
                pass

        return self

    # ------------------------------------------------------------------
    # Convenience helpers
    # ------------------------------------------------------------------

    def get_effective_config(self) -> Dict[str, Any]:
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
        """Return True only when both URL and key are non-empty, non-placeholder."""
        url = self.sync.supabase_url or ""
        key = self.sync.supabase_key.get_secret_value() if self.sync.supabase_key else ""
        return bool(
            url
            and key
            and "YOUR_PROJECT" not in url
            and "YOUR_SUPABASE" not in key
        )

    def is_enrolled(self) -> bool:
        """Convenience: True when sync credentials are present."""
        return self.should_enable_sync()

    def should_enable_ml(self) -> bool:
        return self.enable_ml_features

    def get_collection_interval_seconds(self) -> int:
        return self.collection.interval

    def get_data_retention_days(self) -> int:
        return self.privacy.data_retention_days