from __future__ import annotations

from dataclasses import asdict, dataclass, field
from enum import Enum
from typing import Any, Dict, List

SCHEMA_VERSION = "1.1"
DEFAULT_THRESHOLD = 0.5


class ExplanationType(str, Enum):
    SHAP = "shap"
    LIME = "lime"
    NONE = "none"
    ERROR = "error"


class ContributionType(str, Enum):
    POSITIVE = "positive"
    NEGATIVE = "negative"
    NEUTRAL = "neutral"


@dataclass
class FeatureExplanation:
    feature_name: str
    feature_value: float
    attribution_score: float
    normalised_attribution: float
    contribution_type: ContributionType
    rank: int

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["contribution_type"] = self.contribution_type.value
        return d


@dataclass
class ExplanationSummary:
    main_factors: List[str]
    confidence_level: float
    explanation_type: ExplanationType
    processing_time_ms: int

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["explanation_type"] = self.explanation_type.value
        return d


@dataclass
class StrictExplanationJSON:
    version: str = SCHEMA_VERSION
    explanation_type: ExplanationType = ExplanationType.NONE
    model_id: str = ""
    timestamp: str = ""
    anomaly_score: float = 0.0
    detection_threshold: float = DEFAULT_THRESHOLD
    is_anomaly: bool = False
    features: List[FeatureExplanation] = field(default_factory=list)
    summary: ExplanationSummary = field(
        default_factory=lambda: ExplanationSummary(
            main_factors=[],
            confidence_level=0.0,
            explanation_type=ExplanationType.NONE,
            processing_time_ms=0,
        )
    )
    metadata: Dict[str, Any] = field(default_factory=dict)

    @property
    def is_fallback(self) -> bool:
        return bool(self.metadata.get("fallback") or self.metadata.get("minimal_fallback"))

    def to_dict(self) -> Dict[str, Any]:
        base = self.detection_threshold
        return {
            "version": self.version,
            "explanation_type": self.explanation_type.value,
            "model_id": self.model_id,
            "timestamp": self.timestamp,
            "anomaly_score": self.anomaly_score,
            "base_score": base,
            "final_score": self.anomaly_score,
            "detection_threshold": self.detection_threshold,
            "is_anomaly": self.is_anomaly,
            "features": [f.to_dict() for f in self.features],
            "summary": self.summary.to_dict(),
            "metadata": self.metadata,
        }

    def to_json(self, indent: int = 2) -> str:
        import json

        return json.dumps(self.to_dict(), indent=indent)
