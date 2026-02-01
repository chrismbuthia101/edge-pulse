# Detection result models.

from typing import Dict
from pydantic import BaseModel, Field


class DetectorScore(BaseModel):
    """Individual detector score."""

    label: int = Field(ge=0, le=1, description="Anomaly label: 0=normal, 1=anomaly")
    score: float = Field(ge=0.0, le=1.0, description="Anomaly score")
    confidence: float = Field(ge=0.0, le=1.0, description="Confidence level")


class EnsembleResult(BaseModel):
    """Ensemble detection result."""

    label: int = Field(ge=0, le=1, description="Final anomaly label")
    score: float = Field(ge=0.0, le=1.0, description="Final anomaly score")
    confidence: float = Field(ge=0.0, le=1.0, description="Confidence level")
    detector_scores: Dict[str, DetectorScore] = Field(
        default_factory=dict, description="Individual detector scores"
    )


class AnomalyResult(BaseModel):
    """Anomaly detection result."""

    label: int = Field(ge=0, le=1, description="Anomaly label")
    score: float = Field(ge=0.0, le=1.0, description="Anomaly score")
    confidence: float = Field(ge=0.0, le=1.0, description="Confidence level")
    anomaly_type: str = Field(description="Type of anomaly detected")
