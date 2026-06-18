from __future__ import annotations

import time
from abc import ABC, abstractmethod
from typing import Any, List, Optional

import numpy as np

from edgepulse.analysis.xai.models import (
    DEFAULT_THRESHOLD,
    ContributionType,
    ExplanationType,
    ExplanationSummary,
    FeatureExplanation,
    SCHEMA_VERSION,
    StrictExplanationJSON,
)
from edgepulse.analysis.xai.utils import (
    calibrated_confidence,
    make_fallback_explanation,
    utc_timestamp,
)
from edgepulse.utils.log_handler import get_logger

logger = get_logger(__name__)


class BaseExplainer(ABC):

    def __init__(self, model_id: str):
        self.model_id = model_id
        self.is_initialized = False
        self._feature_names: List[str] = []
        self._training_data: Optional["np.ndarray"] = None

    @abstractmethod
    def initialize(
        self,
        model: Any,
        training_data: Optional["np.ndarray"] = None,
        feature_names: Optional[List[str]] = None,
    ) -> bool: ...

    @abstractmethod
    def _compute_attributions(self, features: "np.ndarray") -> "np.ndarray": ...

    @abstractmethod
    def get_explanation_type(self) -> ExplanationType: ...

    def _resolve_feature_names(
        self,
        feature_names: Optional[List[str]],
        training_data: Optional["np.ndarray"],
    ) -> List[str]:
        if feature_names:
            return list(feature_names)
        n = training_data.shape[1] if training_data is not None else 10
        return [f"feature_{i}" for i in range(n)]

    def explain_prediction(
        self,
        features: "np.ndarray",
        anomaly_score: float,
        detection_threshold: float = DEFAULT_THRESHOLD,
    ) -> StrictExplanationJSON:
        start = time.perf_counter()

        if not self.is_initialized:
            logger.error("%s explainer not initialised", self.get_explanation_type())
            return make_fallback_explanation(
                model_id=self.model_id,
                anomaly_score=anomaly_score,
                detection_threshold=detection_threshold,
                explanation_type=self.get_explanation_type(),
                processing_time_ms=int((time.perf_counter() - start) * 1000),
                error="Explainer not initialised",
            )

        flat = np.asarray(features, dtype=float).flatten()

        try:
            attributions = self._compute_attributions(flat)
        except Exception as exc:
            logger.exception("Attribution computation failed: %s", exc)
            return make_fallback_explanation(
                model_id=self.model_id,
                anomaly_score=anomaly_score,
                detection_threshold=detection_threshold,
                explanation_type=self.get_explanation_type(),
                processing_time_ms=int((time.perf_counter() - start) * 1000),
                error=str(exc),
            )

        attributions = np.asarray(attributions, dtype=float).flatten()
        n = min(len(attributions), len(self._feature_names), len(flat))

        abs_sum = np.abs(attributions[:n]).sum() or 1.0

        feature_explanations: List[FeatureExplanation] = []
        for i in range(n):
            score = float(attributions[i])
            if abs(score) < 1e-9:
                ctype = ContributionType.NEUTRAL
            elif score > 0:
                ctype = ContributionType.POSITIVE
            else:
                ctype = ContributionType.NEGATIVE

            feature_explanations.append(
                FeatureExplanation(
                    feature_name=self._feature_names[i],
                    feature_value=float(flat[i]),
                    attribution_score=score,
                    normalised_attribution=abs(score) / abs_sum,
                    contribution_type=ctype,
                    rank=0,
                )
            )

        feature_explanations.sort(key=lambda x: abs(x.attribution_score), reverse=True)
        for rank, fe in enumerate(feature_explanations, start=1):
            fe.rank = rank

        top3 = feature_explanations[:3]

        processing_ms = int((time.perf_counter() - start) * 1000)
        summary = ExplanationSummary(
            main_factors=[f.feature_name for f in top3],
            confidence_level=calibrated_confidence(anomaly_score, detection_threshold),
            explanation_type=self.get_explanation_type(),
            processing_time_ms=processing_ms,
        )

        explanation = StrictExplanationJSON(
            version=SCHEMA_VERSION,
            explanation_type=self.get_explanation_type(),
            model_id=self.model_id,
            timestamp=utc_timestamp(),
            anomaly_score=float(anomaly_score),
            detection_threshold=float(detection_threshold),
            is_anomaly=anomaly_score >= detection_threshold,
            features=feature_explanations,
            summary=summary,
            metadata={
                "feature_count": n,
                "training_data_shape": (
                    list(self._training_data.shape) if self._training_data is not None else None
                ),
            },
        )

        logger.debug("%s explanation in %dms", self.get_explanation_type(), processing_ms)
        return explanation
