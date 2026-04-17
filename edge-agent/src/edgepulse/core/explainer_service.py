"""
ExplainerService
================
Owns the lifecycle of the SHAP explainer.  Lazy-initialised on first use
so it does not block agent startup.
"""

from __future__ import annotations

from typing import Any, List, Optional, TYPE_CHECKING

from edgepulse.utils.log_handler import get_logger

if TYPE_CHECKING:
    from edgepulse.analysis.explainable_ai import SHAPExplainer

logger = get_logger(__name__)


class ExplainerService:
    """
    Lazily initialises a SHAPExplainer against the primary detector's model
    and provides a thread-safe explain() helper.
    """

    def __init__(self, device_id: str) -> None:
        self.device_id = device_id
        self._explainer: Optional[SHAPExplainer] = None
        self._init_attempted = False

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    @property
    def explainer(self) -> Optional[SHAPExplainer]:
        return self._explainer

    def try_initialize(
        self,
        detectors: List[Any],
        feature_extractor: Any,
    ) -> bool:
    
        if self._init_attempted:
            return self._explainer is not None
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
            import numpy as np
            from edgepulse.analysis.explainable_ai import SHAPExplainer

            feature_names = feature_extractor.get_feature_names()
            # Synthetic background for the tree explainer
            background = np.random.normal(0, 1, size=(50, len(feature_names))).astype(
                np.float32
            )

            explainer = SHAPExplainer(model_id=f"{self.device_id}_primary")
            ok = explainer.initialize(
                model=model,
                training_data=background,
                feature_names=feature_names,
            )
            if ok:
                self._explainer = explainer
                logger.info("shap_explainer_initialized")
                return True
            else:
                logger.warning("shap_explainer_init_failed")
                return False

        except Exception as exc:
            logger.error("shap_explainer_error", error=str(exc))
            return False