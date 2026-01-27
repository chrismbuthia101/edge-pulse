"""Configuration models."""

from typing import Optional, Literal
from pydantic import BaseModel, Field, field_validator


class DetectionConfig(BaseModel):
    """Detection configuration."""

    threshold: float = Field(default=0.5, ge=0.0, le=1.0, description="Detection threshold")
    isolation_forest: dict = Field(
        default_factory=lambda: {
            "n_estimators": 100,
            "contamination": "auto",
        },
        description="Isolation Forest configuration",
    )
    autoencoder: dict = Field(
        default_factory=lambda: {
            "enabled": True,
            "input_dim": 50,
            "encoding_dim": 8,
            "hidden_layers": [64, 32, 16],
            "learning_rate": 0.001,
        },
        description="Autoencoder configuration",
    )
    use_autoencoder: bool = Field(default=True, description="Use autoencoder in ensemble")


class CollectionConfig(BaseModel):
    """Collection configuration."""

    interval: int = Field(default=5, ge=1, description="Collection interval in seconds")
    window_1min: int = Field(default=60, ge=1, description="1-minute window in seconds")
    window_5min: int = Field(default=300, ge=1, description="5-minute window in seconds")
    window_15min: int = Field(default=900, ge=1, description="15-minute window in seconds")


class FeatureConfig(BaseModel):
    """Feature engineering configuration."""

    feature_dimension: int = Field(default=50, ge=10, le=1000, description="Feature vector dimension")
    history_retention_hours: int = Field(default=1, ge=1, description="History retention in hours")


class TrainingConfig(BaseModel):
    """Training configuration."""

    training_period_hours: int = Field(default=24, ge=1, description="Training period in hours")
    min_training_samples: int = Field(default=100, ge=10, description="Minimum samples for training")
    max_training_samples: int = Field(default=10000, ge=100, description="Maximum training samples to store")


class PrivacyConfig(BaseModel):
    """Privacy configuration."""

    data_retention_days: int = Field(default=30, ge=1, description="Data retention in days")
    anonymization_level: Literal["basic", "strict", "maximum"] = Field(
        default="strict", description="Anonymization level"
    )
    collect_command_lines: bool = Field(default=False, description="Allow command line collection")


class SyncConfig(BaseModel):
    """Sync configuration."""

    enabled: bool = Field(default=False, description="Enable cloud sync")
    interval: int = Field(default=3600, ge=1, description="Sync interval in seconds")
    sync_only_alerts: bool = Field(default=True, description="Sync only alerts")


class AlertingConfig(BaseModel):
    """Alerting configuration."""

    correlation_window: int = Field(default=300, ge=1, description="Correlation window in seconds")
    rate_limit: int = Field(default=10, ge=1, description="Rate limit per window")
    rate_window: int = Field(default=3600, ge=1, description="Rate limiting window in seconds")
    min_severity: Literal["low", "medium", "high", "critical"] = Field(
        default="medium", description="Minimum severity to alert"
    )


class AgentConfig(BaseModel):
    """Complete agent configuration."""

    detection: DetectionConfig = Field(default_factory=DetectionConfig)
    collection: CollectionConfig = Field(default_factory=CollectionConfig)
    features: FeatureConfig = Field(default_factory=FeatureConfig)
    training: TrainingConfig = Field(default_factory=TrainingConfig)
    privacy: PrivacyConfig = Field(default_factory=PrivacyConfig)
    sync: SyncConfig = Field(default_factory=SyncConfig)
    alerting: AlertingConfig = Field(default_factory=AlertingConfig)
