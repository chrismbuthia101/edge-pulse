"""
ExplainerService
================
Owns the lifecycle of the XAI explainer (SHAP primary, LIME fallback).
Lazy-initialised on first use so it does not block agent startup.
Uses ExplainableAIManager for automatic primary/fallback handling,
caching, and thread safety.
"""

from __future__ import annotations

from typing import Any, List, Optional, TYPE_CHECKING

import numpy as np

from edgepulse.utils.log_handler import get_logger
from edgepulse.analysis.explainable_ai import (
    ExplainableAIManager,
    ExplanationType,
    StrictExplanationJSON,
)

if TYPE_CHECKING:
    pass

logger = get_logger(__name__)


class ExplainerService:

    def __init__(self, device_id: str) -> None:
        self.device_id = device_id
        self._manager: Optional[ExplainableAIManager] = None
        self._init_attempted = False

    @property
    def manager(self) -> Optional[ExplainableAIManager]:
        return self._manager

    @property
    def is_available(self) -> bool:
        return self._manager is not None and self._manager.is_initialized

    @property
    def available_methods(self) -> List[ExplanationType]:
        if self._manager is None:
            return []
        return self._manager.get_available_methods()

    def try_initialize(
        self,
        detectors: List[Any],
        feature_extractor: Any,
    ) -> bool:

        if self._init_attempted:
            return self.is_available
        self._init_attempted = True

        if not detectors:
            logger.warning("explainer_no_detectors")
            return False

        primary = detectors[0]
        model = getattr(primary, "model", None)
        if model is None:
            logger.warning("explainer_no_model_on_detector")
            return False

        try:
            feature_names = feature_extractor.get_feature_names()
            n_features = len(feature_names)

            synthetic_bg = np.random.normal(0, 0.5, size=(100, n_features)).astype(np.float32)

            manager = ExplainableAIManager(
                model_id=f"{self.device_id}_primary",
                cache_size=256,
            )
            ok = manager.initialize(
                model=model,
                training_data=synthetic_bg,
                feature_names=feature_names,
                primary_method=ExplanationType.SHAP,
                enable_fallback=True,
                enable_cache=True,
            )

            if ok:
                self._manager = manager
                logger.info(
                    "explainer_service_initialized",
                    device_id=self.device_id,
                    methods=[m.value for m in manager.get_available_methods()],
                    feature_count=n_features,
                )
                return True
            else:
                logger.warning(
                    "explainer_service_init_failed",
                    device_id=self.device_id,
                )
                return False

        except Exception as exc:
            logger.error("explainer_service_error", error=str(exc))
            return False

    def explain(
        self,
        features: np.ndarray,
        anomaly_score: float,
        detection_threshold: float = 0.5,
    ) -> Optional[StrictExplanationJSON]:

        if self._manager is None or not self._manager.is_initialized:
            return None
        try:
            feat = np.asarray(features, dtype=float).flatten()
            return self._manager.explain_prediction(feat, anomaly_score, detection_threshold)
        except Exception as exc:
            logger.error("explainer_service_explain_error", error=str(exc))
            return None
