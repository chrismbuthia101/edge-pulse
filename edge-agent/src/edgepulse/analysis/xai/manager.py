from __future__ import annotations

import threading
from enum import Enum, auto
from typing import Any, Dict, List, Optional, Union

import numpy as np

from edgepulse.analysis.xai.base import BaseExplainer
from edgepulse.analysis.xai.cache import MAX_CACHE_SIZE, _ExplanationCache
from edgepulse.analysis.xai.lime_explainer import LIMEExplainer
from edgepulse.analysis.xai.models import (
    DEFAULT_THRESHOLD,
    ExplanationType,
    StrictExplanationJSON,
)
from edgepulse.analysis.xai.shap_explainer import SHAPExplainer
from edgepulse.analysis.xai.utils import make_fallback_explanation
from edgepulse.utils.log_handler import get_logger

logger = get_logger(__name__)

_METHOD_MAP = {
    ExplanationType.SHAP: SHAPExplainer,
    ExplanationType.LIME: LIMEExplainer,
}


class _ExplainerRole(Enum):
    PRIMARY = auto()
    FALLBACK = auto()


class ExplainableAIManager:

    def __init__(self, model_id: str, cache_size: int = MAX_CACHE_SIZE):
        self.model_id = model_id
        self._primary: Optional[BaseExplainer] = None
        self._fallback_explainer: Optional[BaseExplainer] = None
        self._cache_size = cache_size
        self._cache: Optional[_ExplanationCache] = None
        self._lock = threading.Lock()
        self.is_initialized = False

    def initialize(
        self,
        model: Any,
        training_data: Optional["np.ndarray"] = None,
        feature_names: Optional[List[str]] = None,
        primary_method: Union[str, ExplanationType] = ExplanationType.SHAP,
        enable_fallback: bool = True,
        enable_cache: bool = True,
    ) -> bool:
        primary_method = ExplanationType(primary_method)

        if not enable_cache:
            self._cache = None

        fallback_method: Optional[ExplanationType] = None
        if enable_fallback:
            fallback_method = (
                ExplanationType.LIME
                if primary_method == ExplanationType.SHAP
                else ExplanationType.SHAP
            )

        ok_primary = self._try_init(
            primary_method, model, training_data, feature_names, is_primary=True
        )
        if enable_fallback and fallback_method:
            self._try_init(fallback_method, model, training_data, feature_names, is_primary=False)

        self.is_initialized = ok_primary or self._fallback_explainer is not None
        if not self.is_initialized:
            logger.error("No XAI explainer available for model '%s'", self.model_id)
        else:
            available = [
                e.get_explanation_type() for e in (self._primary, self._fallback_explainer) if e
            ]
            logger.info("ExplainableAIManager ready. Methods: %s", available)
        return self.is_initialized

    def _try_init(
        self,
        method: ExplanationType,
        model: Any,
        training_data: Optional["np.ndarray"],
        feature_names: Optional[List[str]],
        is_primary: bool,
    ) -> bool:
        cls = _METHOD_MAP.get(method)
        if cls is None:
            return False

        explainer = cls(self.model_id)
        ok = explainer.initialize(model, training_data, feature_names)
        if ok:
            if is_primary:
                self._primary = explainer
                logger.info("Primary %s explainer initialised", method)
            else:
                self._fallback_explainer = explainer
                logger.info("Fallback %s explainer initialised", method)
        else:
            label = "primary" if is_primary else "fallback"
            logger.warning("%s %s explainer failed to initialise", label, method)
        return ok

    def explain_prediction(
        self,
        features: "np.ndarray",
        anomaly_score: float,
        detection_threshold: float = DEFAULT_THRESHOLD,
        use_cache: bool = True,
    ) -> StrictExplanationJSON:
        if not self.is_initialized:
            return make_fallback_explanation(
                model_id=self.model_id,
                anomaly_score=anomaly_score,
                detection_threshold=detection_threshold,
                error="Manager not initialised",
                is_minimal=True,
            )

        features = np.asarray(features, dtype=float)

        if use_cache and self._cache is not None:
            cached = self._cache.get(self.model_id, features)
            if cached is not None:
                cached.anomaly_score = anomaly_score
                cached.detection_threshold = detection_threshold
                cached.is_anomaly = anomaly_score >= detection_threshold
                cached.metadata["cache_hit"] = True
                return cached

        explanation = self._run_with_fallback(features, anomaly_score, detection_threshold)

        if use_cache and self._cache is not None and not explanation.is_fallback:
            self._cache.put(self.model_id, features, explanation)

        return explanation

    def explain_batch(
        self,
        feature_matrix: "np.ndarray",
        anomaly_scores: List[float],
        detection_threshold: float = DEFAULT_THRESHOLD,
        use_cache: bool = True,
    ) -> List[StrictExplanationJSON]:
        feature_matrix = np.asarray(feature_matrix, dtype=float)
        if feature_matrix.ndim == 1:
            feature_matrix = feature_matrix.reshape(1, -1)

        if len(anomaly_scores) != feature_matrix.shape[0]:
            raise ValueError(
                f"anomaly_scores length ({len(anomaly_scores)}) must match "
                f"feature_matrix rows ({feature_matrix.shape[0]})"
            )

        return [
            self.explain_prediction(row, score, detection_threshold, use_cache=use_cache)
            for row, score in zip(feature_matrix, anomaly_scores)
        ]

    def is_available(self) -> bool:
        return self.is_initialized

    def get_available_methods(self) -> List[ExplanationType]:
        return [e.get_explanation_type() for e in (self._primary, self._fallback_explainer) if e]

    def cache_stats(self) -> Dict[str, int]:
        if self._cache is None:
            return {}
        return self._cache.stats

    def clear_cache(self) -> None:
        if self._cache is not None:
            self._cache.clear()

    def _run_with_fallback(
        self,
        features: "np.ndarray",
        anomaly_score: float,
        detection_threshold: float,
    ) -> StrictExplanationJSON:
        for explainer, role in (
            (self._primary, _ExplainerRole.PRIMARY),
            (self._fallback_explainer, _ExplainerRole.FALLBACK),
        ):
            if explainer is None:
                continue
            try:
                exp = explainer.explain_prediction(features, anomaly_score, detection_threshold)
                if role == _ExplainerRole.FALLBACK:
                    exp.metadata["fallback_used"] = True
                return exp
            except Exception as exc:
                logger.warning("%s explainer raised: %s", role.name.lower(), exc)

        logger.error("All explainers failed; returning minimal explanation")
        return make_fallback_explanation(
            model_id=self.model_id,
            anomaly_score=anomaly_score,
            detection_threshold=detection_threshold,
            error="All explainers failed",
            is_minimal=True,
        )
