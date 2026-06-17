import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

from edgepulse.utils.device import get_default_device_id, validate_device_id

_logger = logging.getLogger(__name__)


class APIConfig(BaseModel):
    enabled: bool = Field(default=True)
    host: str = Field(default="0.0.0.0")
    port: int = Field(default=8080, ge=1, le=65535)


class SyncConfig(BaseModel):
    supabase_url: Optional[str] = Field(default="")
    api_key: Optional[SecretStr] = Field(default=None)
    batch_size: int = Field(default=50, ge=1, le=1000)
    retry_max_attempts: int = Field(default=5, ge=1, le=20)
    offline_queue_max: int = Field(default=10000, ge=100)


class CollectionConfig(BaseModel):
    interval: int = Field(default=60, ge=5, le=3600)
    window_1min: int = Field(default=60, ge=10)
    window_5min: int = Field(default=300, ge=60)
    window_15min: int = Field(default=900, ge=300)
    enable_process_monitoring: bool = Field(default=True)
    enable_network_monitoring: bool = Field(default=True)


class FeatureConfig(BaseModel):
    feature_dimension: int = Field(default=50, ge=8, le=512)
    history_retention_hours: int = Field(default=24, ge=1, le=168)


class DetectionConfig(BaseModel):
    use_autoencoder: bool = Field(default=False)
    use_ensemble: bool = Field(default=True)
    isolation_forest_n_estimators: int = Field(default=100, ge=10, le=1000)
    isolation_forest_contamination: str = Field(default="auto")
    autoencoder_encoding_dim: int = Field(default=8, ge=2, le=64)
    autoencoder_hidden_layers: List[int] = Field(default=[64, 32, 16])
    autoencoder_learning_rate: float = Field(default=0.001, ge=0.0001, le=0.1)
    autoencoder_use_tflite: bool = Field(default=False)


class PrivacyConfig(BaseModel):
    data_retention_days: int = Field(default=30, ge=1, le=365)
    alert_retention_days: int = Field(default=90, ge=1, le=365)


class AlertingConfig(BaseModel):
    correlation_window: int = Field(default=300, ge=60)
    rate_limit: int = Field(default=5, ge=1)
    rate_window: int = Field(default=3600, ge=300)
    min_severity: Literal["low", "medium", "high", "critical"] = Field(default="medium")
    enable_local_notifications: bool = Field(default=True)


class LoggingConfig(BaseModel):
    level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = Field(default="INFO")
    file_path: Optional[str] = Field(default=None)


class MetricsConfig(BaseModel):
    collection_interval: int = Field(default=30, ge=5)


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

    @model_validator(mode="after")
    def _apply_config_file(self) -> "AgentSettings":
        if self.config_path is None:
            return self

        path = Path(self.config_path)
        if not path.exists():
            _logger.warning("Config file not found, ignoring: %s", path)
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
            if isinstance(value, dict) and isinstance(current_value, BaseModel):
                merged = current_value.model_dump()
                merged.update(value)
                object.__setattr__(self, key, current_value.__class__(**merged))
            else:
                object.__setattr__(self, key, value)

        return self

    def should_enable_sync(self) -> bool:
        url = self.sync.supabase_url or ""
        key = self.sync.api_key.get_secret_value() if self.sync.api_key else ""
        return bool(url and key and "YOUR_PROJECT" not in url and "YOUR_SUPABASE" not in key)
