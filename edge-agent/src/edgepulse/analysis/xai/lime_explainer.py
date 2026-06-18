from __future__ import annotations

from typing import Any, List, Optional

import lime
import lime.lime_tabular
import numpy as np

from edgepulse.analysis.xai.base import BaseExplainer
from edgepulse.analysis.xai.models import ExplanationType
from edgepulse.analysis.xai.utils import resolve_predict_fn
from edgepulse.utils.log_handler import get_logger

logger = get_logger(__name__)


class LIMEExplainer(BaseExplainer):

    def __init__(self, model_id: str):
        super().__init__(model_id)
        self._explainer: Optional[Any] = None
        self._model: Optional[Any] = None

    def get_explanation_type(self) -> ExplanationType:
        return ExplanationType.LIME

    def initialize(
        self,
        model: Any,
        training_data: Optional["np.ndarray"] = None,
        feature_names: Optional[List[str]] = None,
    ) -> bool:
        if training_data is None:
            logger.error("LIMEExplainer requires training_data")
            return False
        try:
            self._feature_names = self._resolve_feature_names(feature_names, training_data)
            self._training_data = training_data
            self._model = model
            self._explainer = lime.lime_tabular.LimeTabularExplainer(
                training_data,
                feature_names=self._feature_names,
                mode="regression",
                discretize_continuous=True,
            )
            self.is_initialized = True
            logger.info("LIMEExplainer ready for model '%s'", self.model_id)
            return True
        except Exception as exc:
            logger.exception("LIMEExplainer.initialize failed: %s", exc)
            return False

    def _compute_attributions(self, features: "np.ndarray") -> "np.ndarray":
        assert self._explainer is not None
        predict_fn = resolve_predict_fn(self._model)
        exp = self._explainer.explain_instance(
            features,
            predict_fn,
            num_features=len(self._feature_names),
        )
        attributions = np.zeros(len(self._feature_names))
        name_to_idx = {name: i for i, name in enumerate(self._feature_names)}
        for item, weight in exp.as_list():
            idx = name_to_idx.get(item)
            if idx is not None and 0 <= idx < len(attributions):
                attributions[idx] = weight
        return attributions
