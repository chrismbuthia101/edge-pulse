"""Alert and report models."""

from datetime import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, field_validator
import uuid


class ContributingFactor(BaseModel):
    """Contributing factor to anomaly."""

    feature: str = Field(description="Feature name")
    contribution: float = Field(description="Contribution value")
    absolute_contribution: float = Field(description="Absolute contribution")
    direction: str = Field(description="Direction: increase, decrease, or neutral")
    index: int = Field(description="Feature index")


class Explanation(BaseModel):
    """Explanation of anomaly detection."""

    summary: str = Field(description="Human-readable summary")
    contributing_factors: List[ContributingFactor] = Field(
        default_factory=list, description="Top contributing factors"
    )
    confidence: float = Field(ge=0.0, le=1.0, description="Confidence level")
    shap_values: Optional[List[float]] = Field(None, description="SHAP values")
    feature_names: Optional[List[str]] = Field(None, description="Feature names")


class AlertReport(BaseModel):
    """Comprehensive alert report."""

    alert_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    device_id: str = Field(description="Device identifier")
    severity: str = Field(description="Severity: low, medium, high, critical")
    anomaly_score: float = Field(ge=0.0, le=1.0, description="Anomaly score")
    anomaly_label: int = Field(ge=0, le=1, description="Anomaly label")
    anomaly_type: str = Field(description="Type of anomaly")
    explanation: Explanation = Field(description="Explanation of detection")
    context: Dict[str, Any] = Field(default_factory=dict, description="Additional context")
    recommended_actions: List[str] = Field(
        default_factory=list, description="Recommended actions"
    )
    forensic_data: Dict[str, Any] = Field(
        default_factory=dict, description="Forensic data"
    )

    @field_validator("timestamp", mode="before")
    @classmethod
    def parse_timestamp(cls, v):
        """Parse timestamp from string if needed."""
        if isinstance(v, str):
            return datetime.fromisoformat(v)
        return v


class Alert(BaseModel):
    """Alert structure for processing."""

    alert_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    severity: str = Field(description="Severity level")
    anomaly_score: float = Field(ge=0.0, le=1.0, description="Anomaly score")
    anomaly: AlertReport = Field(description="Anomaly report")
    explanation: Explanation = Field(description="Raw explanation")
    correlated_alerts: List[str] = Field(
        default_factory=list, description="IDs of correlated alerts"
    )
    correlation_count: int = Field(default=0, description="Number of correlated alerts")

    @field_validator("timestamp", mode="before")
    @classmethod
    def parse_timestamp(cls, v):
        """Parse timestamp from string if needed."""
        if isinstance(v, str):
            return datetime.fromisoformat(v)
        return v
