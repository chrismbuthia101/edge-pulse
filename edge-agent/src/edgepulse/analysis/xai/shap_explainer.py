from __future__ import annotations

from typing import Any, List, Optional

import numpy as np
import shap

from edgepulse.analysis.xai.base import BaseExplainer
from edgepulse.analysis.xai.models import ExplanationType
from edgepulse.analysis.xai.utils import resolve_predict_fn
from edgepulse.utils.log_handler import get_logger

logger = get_logger(__name__)

_BACKGROUND_SAMPLE_SIZE = 100


class SHAPExplainer(BaseExplainer):

    def __init__(self, model_id: str):
        super().__init__(model_id)
        self._explainer: Optional[Any] = None
        self._uses_kernel: bool = False

    def get_explanation_type(self) -> ExplanationType:
        return ExplanationType.SHAP

    def initialize(
        self,
        model: Any,
        training_data: Optional["np.ndarray"] = None,
        feature_names: Optional[List[str]] = None,
    ) -> bool:
        try:
            self._feature_names = self._resolve_feature_names(feature_names, training_data)
            self._training_data = training_data

            tree_capable = hasattr(model, "predict_proba") or hasattr(model, "decision_function")
            if tree_capable and self._try_tree_explainer(model):
                pass
            else:
                if training_data is None:
                    logger.error("SHAPExplainer: KernelExplainer requires training_data")
                    return False
                self._init_kernel_explainer(model, training_data)

            self.is_initialized = True
            logger.info("SHAPExplainer ready for model '%s'", self.model_id)
            return True

        except Exception as exc:
            logger.exception("SHAPExplainer.initialize failed: %s", exc)
            return False

    def _try_tree_explainer(self, model: Any) -> bool:
        try:
            self._explainer = shap.TreeExplainer(model)
            self._uses_kernel = False
            logger.info(
                "SHAPExplainer: using TreeExplainer for model '%s'",
                self.model_id,
            )
            return True
        except Exception as exc:
            logger.warning(
                "SHAPExplainer: TreeExplainer failed ('%s'), falling back to KernelExplainer",
                exc,
            )
            return False

    def _init_kernel_explainer(self, model: Any, training_data: "np.ndarray") -> None:
        bg = training_data[:_BACKGROUND_SAMPLE_SIZE]
        predict_fn = resolve_predict_fn(model)
        self._explainer = shap.KernelExplainer(predict_fn, bg)
        self._uses_kernel = True
        logger.info(
            "SHAPExplainer: using KernelExplainer for model '%s'",
            self.model_id,
        )

    def _compute_attributions(self, features: "np.ndarray") -> "np.ndarray":
        assert self._explainer is not None
        input_2d = features.reshape(1, -1)
        shap_values = self._explainer.shap_values(input_2d)

        if isinstance(shap_values, list):
            if len(shap_values) > 1:
                arr = np.asarray(shap_values[1], dtype=float)
            elif len(shap_values) == 1:
                arr = np.asarray(shap_values[0], dtype=float)
            else:
                return np.zeros(len(self._feature_names), dtype=float)
        else:
            arr = np.asarray(shap_values, dtype=float)

        if arr.ndim == 2 and arr.shape[0] == 1:
            arr = arr[0]
        elif arr.ndim > 1:
            arr = arr.flatten()

        return arr
