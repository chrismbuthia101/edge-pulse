"""
Explainable AI Module for EdgePulse

Provides SHAP and LIME-based explanations for anomaly detection
with strict JSON schema compliance, caching, batching, and robust fallback mechanisms.
"""

from __future__ import annotations

import json
import time
import hashlib
import threading
from abc import ABC, abstractmethod
from dataclasses import dataclass, asdict, field
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple, Union
from collections import OrderedDict

try:
    import numpy as np
    NUMPY_AVAILABLE = True
except ImportError:
    NUMPY_AVAILABLE = False

try:
    import shap
    SHAP_AVAILABLE = True
except ImportError:
    SHAP_AVAILABLE = False

try:
    import lime
    import lime.lime_tabular
    LIME_AVAILABLE = True
except ImportError:
    LIME_AVAILABLE = False

from edgepulse_win.utils.log_handler import get_logger

logger = get_logger(__name__)

SCHEMA_VERSION = "1.1"
DEFAULT_THRESHOLD = 0.5
MAX_CACHE_SIZE = 256
LIME_SAMPLE_SIZE = 100  # Max training rows used by KernelExplainer / LIME


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class ExplanationType(str, Enum):
    SHAP = "shap"
    LIME = "lime"
    NONE = "none"
    ERROR = "error"


class ContributionType(str, Enum):
    POSITIVE = "positive"
    NEGATIVE = "negative"
    NEUTRAL = "neutral"


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class FeatureExplanation:
    """Individual feature explanation with normalised attribution."""
    feature_name: str
    feature_value: float
    attribution_score: float
    normalised_attribution: float          # |score| / sum(|scores|), in [0, 1]
    contribution_type: ContributionType
    rank: int

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["contribution_type"] = self.contribution_type.value
        return d


@dataclass
class ExplanationSummary:
    """Natural-language summary of an explanation."""
    main_factors: List[str]
    confidence_level: float                # Calibrated confidence in [0, 1]
    explanation_type: ExplanationType
    processing_time_ms: int
    top_positive_factors: List[str] = field(default_factory=list)
    top_negative_factors: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["explanation_type"] = self.explanation_type.value
        return d


@dataclass
class StrictExplanationJSON:
    """
    Strict JSON schema for anomaly detection explanations.

    Schema version 1.1 adds normalised_attribution and contribution
    sign breakdowns to the summary.
    """
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

    # ------------------------------------------------------------------
    # Derived helpers
    # ------------------------------------------------------------------

    @property
    def is_fallback(self) -> bool:
        return bool(self.metadata.get("fallback") or self.metadata.get("minimal_fallback"))

    def to_dict(self) -> Dict[str, Any]:
        return {
            "version": self.version,
            "explanation_type": self.explanation_type.value,
            "model_id": self.model_id,
            "timestamp": self.timestamp,
            "anomaly_score": self.anomaly_score,
            "detection_threshold": self.detection_threshold,
            "is_anomaly": self.is_anomaly,
            "features": [f.to_dict() for f in self.features],
            "summary": self.summary.to_dict(),
            "metadata": self.metadata,
        }

    def to_json(self, indent: int = 2) -> str:
        return json.dumps(self.to_dict(), indent=indent)

    def validate(self) -> Tuple[bool, List[str]]:
        """Return (is_valid, list_of_error_messages)."""
        errors: List[str] = []
        required = ["version", "explanation_type", "model_id", "timestamp",
                    "anomaly_score", "detection_threshold"]
        for attr in required:
            if not getattr(self, attr, None) and getattr(self, attr, None) != 0.0:
                errors.append(f"Missing or empty required field: {attr}")
        if not (0.0 <= self.anomaly_score <= 1.0):
            errors.append(f"anomaly_score {self.anomaly_score} outside [0, 1]")
        if not (0.0 <= self.detection_threshold <= 1.0):
            errors.append(f"detection_threshold {self.detection_threshold} outside [0, 1]")
        return (len(errors) == 0, errors)


# ---------------------------------------------------------------------------
# LRU explanation cache
# ---------------------------------------------------------------------------

class _ExplanationCache:
    """Thread-safe LRU cache keyed by (model_id, feature_hash)."""

    def __init__(self, maxsize: int = MAX_CACHE_SIZE):
        self._cache: OrderedDict[str, StrictExplanationJSON] = OrderedDict()
        self._maxsize = maxsize
        self._lock = threading.Lock()
        self.hits = 0
        self.misses = 0

    @staticmethod
    def _key(model_id: str, features: "np.ndarray") -> str:
        raw = model_id + features.tobytes()
        return hashlib.sha256(raw).hexdigest()

    def get(self, model_id: str, features: "np.ndarray") -> Optional[StrictExplanationJSON]:
        key = self._key(model_id, features)
        with self._lock:
            if key in self._cache:
                self._cache.move_to_end(key)
                self.hits += 1
                return self._cache[key]
            self.misses += 1
            return None

    def put(self, model_id: str, features: "np.ndarray", value: StrictExplanationJSON) -> None:
        key = self._key(model_id, features)
        with self._lock:
            self._cache[key] = value
            self._cache.move_to_end(key)
            if len(self._cache) > self._maxsize:
                self._cache.popitem(last=False)

    def clear(self) -> None:
        with self._lock:
            self._cache.clear()

    @property
    def stats(self) -> Dict[str, int]:
        with self._lock:
            return {"size": len(self._cache), "hits": self.hits, "misses": self.misses}


# ---------------------------------------------------------------------------
# Base explainer
# ---------------------------------------------------------------------------

class BaseExplainer(ABC):
    """Abstract base class for all XAI explainers."""

    def __init__(self, model_id: str):
        self.model_id = model_id
        self.is_initialized = False
        self._feature_names: List[str] = []
        self._training_data: Optional["np.ndarray"] = None

    # ------------------------------------------------------------------
    # Abstract interface
    # ------------------------------------------------------------------

    @abstractmethod
    def initialize(
        self,
        model: Any,
        training_data: Optional["np.ndarray"] = None,
        feature_names: Optional[List[str]] = None,
    ) -> bool:
        """Initialise the explainer. Returns True on success."""

    @abstractmethod
    def _compute_attributions(
        self, features: "np.ndarray"
    ) -> "np.ndarray":
        """Return 1-D attribution array aligned with self._feature_names."""

    @abstractmethod
    def get_explanation_type(self) -> ExplanationType:
        """Return the ExplanationType for this explainer."""

    # ------------------------------------------------------------------
    # Shared logic
    # ------------------------------------------------------------------

    def explain_prediction(
        self,
        features: "np.ndarray",
        anomaly_score: float,
        detection_threshold: float = DEFAULT_THRESHOLD,
    ) -> StrictExplanationJSON:
        """
        Compute an explanation. Handles reshaping, attribution normalisation,
        ranking, summary generation, and fallback on any internal error.
        """
        start = time.perf_counter()

        if not self.is_initialized:
            logger.error("%s explainer not initialised", self.get_explanation_type())
            return self._fallback(anomaly_score, detection_threshold, start,
                                  error="Explainer not initialised")

        # Normalise to 1-D
        flat = np.asarray(features, dtype=float).flatten()

        try:
            attributions = self._compute_attributions(flat)
        except Exception as exc:
            logger.exception("Attribution computation failed: %s", exc)
            return self._fallback(anomaly_score, detection_threshold, start, error=str(exc))

        attributions = np.asarray(attributions, dtype=float).flatten()
        n = min(len(attributions), len(self._feature_names), len(flat))

        # Normalise attribution magnitudes
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

            feature_explanations.append(FeatureExplanation(
                feature_name=self._feature_names[i],
                feature_value=float(flat[i]),
                attribution_score=score,
                normalised_attribution=abs(score) / abs_sum,
                contribution_type=ctype,
                rank=0,
            ))

        # Rank by absolute attribution (descending)
        feature_explanations.sort(key=lambda x: abs(x.attribution_score), reverse=True)
        for rank, fe in enumerate(feature_explanations, start=1):
            fe.rank = rank

        top3 = feature_explanations[:3]
        positives = [f.feature_name for f in feature_explanations if f.contribution_type == ContributionType.POSITIVE][:3]
        negatives = [f.feature_name for f in feature_explanations if f.contribution_type == ContributionType.NEGATIVE][:3]

        processing_ms = int((time.perf_counter() - start) * 1000)
        summary = ExplanationSummary(
            main_factors=[f.feature_name for f in top3],
            confidence_level=_calibrated_confidence(anomaly_score, detection_threshold),
            explanation_type=self.get_explanation_type(),
            processing_time_ms=processing_ms,
            top_positive_factors=positives,
            top_negative_factors=negatives,
        )

        explanation = StrictExplanationJSON(
            version=SCHEMA_VERSION,
            explanation_type=self.get_explanation_type(),
            model_id=self.model_id,
            timestamp=_utc_timestamp(),
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

        is_valid, errors = explanation.validate()
        if not is_valid:
            logger.warning("Explanation validation issues: %s", errors)
            explanation.metadata["validation_warnings"] = errors

        logger.debug("%s explanation in %dms", self.get_explanation_type(), processing_ms)
        return explanation

    # ------------------------------------------------------------------
    # Shared helpers
    # ------------------------------------------------------------------

    def _resolve_feature_names(
        self,
        feature_names: Optional[List[str]],
        training_data: Optional["np.ndarray"],
    ) -> List[str]:
        if feature_names:
            return list(feature_names)
        n = training_data.shape[1] if training_data is not None else 10
        return [f"feature_{i}" for i in range(n)]

    def _fallback(
        self,
        anomaly_score: float,
        detection_threshold: float,
        start: float,
        error: str = "",
    ) -> StrictExplanationJSON:
        processing_ms = int((time.perf_counter() - start) * 1000)
        summary = ExplanationSummary(
            main_factors=["Feature analysis unavailable"],
            confidence_level=0.0,
            explanation_type=self.get_explanation_type(),
            processing_time_ms=processing_ms,
        )
        return StrictExplanationJSON(
            version=SCHEMA_VERSION,
            explanation_type=self.get_explanation_type(),
            model_id=self.model_id,
            timestamp=_utc_timestamp(),
            anomaly_score=float(anomaly_score),
            detection_threshold=float(detection_threshold),
            is_anomaly=anomaly_score >= detection_threshold,
            features=[],
            summary=summary,
            metadata={"error": error, "fallback": True},
        )


# ---------------------------------------------------------------------------
# SHAP explainer
# ---------------------------------------------------------------------------

class SHAPExplainer(BaseExplainer):

    def __init__(self, model_id: str):
        super().__init__(model_id)
        self._explainer: Optional[Any] = None

    def get_explanation_type(self) -> ExplanationType:
        return ExplanationType.SHAP

    def initialize(
        self,
        model: Any,
        training_data: Optional["np.ndarray"] = None,
        feature_names: Optional[List[str]] = None,
    ) -> bool:
        if not SHAP_AVAILABLE:
            logger.error("SHAP not installed. Run: pip install shap")
            return False
        try:
            self._feature_names = self._resolve_feature_names(feature_names, training_data)
            self._training_data = training_data

            # Prefer tree-based explainer; fall back to KernelExplainer
            if hasattr(model, "predict_proba") or hasattr(model, "decision_function"):
                self._explainer = shap.TreeExplainer(model, training_data)
            else:
                if training_data is None:
                    logger.error("KernelExplainer requires training_data")
                    return False
                bg = training_data[:LIME_SAMPLE_SIZE]
                self._explainer = shap.KernelExplainer(model.predict, bg)

            self.is_initialized = True
            logger.info("SHAPExplainer ready for model '%s'", self.model_id)
            return True
        except Exception as exc:
            logger.exception("SHAPExplainer.initialize failed: %s", exc)
            return False

    def _compute_attributions(self, features: "np.ndarray") -> "np.ndarray":
        input_2d = features.reshape(1, -1)
        shap_values = self._explainer.shap_values(input_2d)

        # Handle multi-output (list of arrays) – take class-1 or first class
        if isinstance(shap_values, list):
            shap_values = shap_values[1] if len(shap_values) > 1 else shap_values[0]

        return np.asarray(shap_values).flatten()


# ---------------------------------------------------------------------------
# LIME explainer
# ---------------------------------------------------------------------------

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
        if not LIME_AVAILABLE:
            logger.error("LIME not installed. Run: pip install lime")
            return False
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
        exp = self._explainer.explain_instance(
            features,
            self._model.predict,
            num_features=len(self._feature_names),
        )
        # explain_instance returns (feature_index_or_label, weight) pairs
        attributions = np.zeros(len(self._feature_names))
        for item, weight in exp.as_list():
            idx = item if isinstance(item, int) else None
            if idx is not None and 0 <= idx < len(attributions):
                attributions[idx] = weight
        return attributions


# ---------------------------------------------------------------------------
# Manager
# ---------------------------------------------------------------------------

class ExplainableAIManager:
    """
    Orchestrates SHAP/LIME explainers with:
      - automatic primary/fallback selection
      - per-model LRU explanation cache
      - batch explanation support
      - thread-safe access
    """

    def __init__(self, model_id: str, cache_size: int = MAX_CACHE_SIZE):
        self.model_id = model_id
        self._primary: Optional[BaseExplainer] = None
        self._fallback: Optional[BaseExplainer] = None
        self._cache = _ExplanationCache(maxsize=cache_size)
        self._lock = threading.Lock()
        self.is_initialized = False

    # ------------------------------------------------------------------
    # Initialisation
    # ------------------------------------------------------------------

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
        
        # Only determine fallback method if fallback is enabled
        fallback_method = None
        if enable_fallback:
            fallback_method = (
                ExplanationType.LIME if primary_method == ExplanationType.SHAP else ExplanationType.SHAP
            )

        _method_map = {
            ExplanationType.SHAP: (SHAPExplainer, SHAP_AVAILABLE),
            ExplanationType.LIME: (LIMEExplainer, LIME_AVAILABLE),
        }

        ok_primary = ok_fallback = False

        # Initialize primary explainer
        cls_p, avail_p = _method_map.get(primary_method, (None, False))
        if cls_p and avail_p:
            explainer = cls_p(self.model_id)
            ok_primary = explainer.initialize(model, training_data, feature_names)
            if ok_primary:
                self._primary = explainer
            else:
                logger.warning("Primary %s explainer failed to initialise", primary_method)

        # Initialize fallback explainer only if enabled
        if enable_fallback and fallback_method:
            cls_f, avail_f = _method_map.get(fallback_method, (None, False))
            if cls_f and avail_f:
                explainer = cls_f(self.model_id)
                ok_fallback = explainer.initialize(model, training_data, feature_names)
                if ok_fallback:
                    self._fallback = explainer
                else:
                    logger.warning("Fallback %s explainer failed to initialise", fallback_method)

        if not enable_cache:
            self._cache = None  # type: ignore[assignment]

        self.is_initialized = ok_primary or ok_fallback
        if not self.is_initialized:
            logger.error("No XAI explainer available for model '%s'", self.model_id)
        else:
            available = [e.get_explanation_type() for e in (self._primary, self._fallback) if e]
            logger.info("ExplainableAIManager ready. Methods: %s", available)
        return self.is_initialized

    # ------------------------------------------------------------------
    # Single prediction
    # ------------------------------------------------------------------

    def explain_prediction(
        self,
        features: "np.ndarray",
        anomaly_score: float,
        detection_threshold: float = DEFAULT_THRESHOLD,
        use_cache: bool = True,
    ) -> StrictExplanationJSON:
        if not self.is_initialized:
            return self._minimal_fallback(anomaly_score, detection_threshold,
                                          error="Manager not initialised")

        features = np.asarray(features, dtype=float)

        # Cache lookup
        if use_cache and self._cache is not None:
            cached = self._cache.get(self.model_id, features)
            if cached is not None:
                # Update score/threshold in case they differ
                cached.anomaly_score = anomaly_score
                cached.detection_threshold = detection_threshold
                cached.is_anomaly = anomaly_score >= detection_threshold
                cached.metadata["cache_hit"] = True
                return cached

        explanation = self._run_with_fallback(features, anomaly_score, detection_threshold)

        if use_cache and self._cache is not None and not explanation.is_fallback:
            self._cache.put(self.model_id, features, explanation)

        return explanation

    # ------------------------------------------------------------------
    # Batch predictions
    # ------------------------------------------------------------------

    def explain_batch(
        self,
        feature_matrix: "np.ndarray",
        anomaly_scores: List[float],
        detection_threshold: float = DEFAULT_THRESHOLD,
        use_cache: bool = True,
    ) -> List[StrictExplanationJSON]:
        """Explain a batch of predictions. Each row in feature_matrix is one sample."""
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

    # ------------------------------------------------------------------
    # Utilities
    # ------------------------------------------------------------------

    def is_available(self) -> bool:
        return self.is_initialized

    def get_available_methods(self) -> List[ExplanationType]:
        return [e.get_explanation_type() for e in (self._primary, self._fallback) if e]

    def cache_stats(self) -> Dict[str, int]:
        if self._cache is None:
            return {}
        return self._cache.stats

    def clear_cache(self) -> None:
        if self._cache is not None:
            self._cache.clear()

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _run_with_fallback(
        self,
        features: "np.ndarray",
        anomaly_score: float,
        detection_threshold: float,
    ) -> StrictExplanationJSON:
        for explainer, label in ((self._primary, "primary"), (self._fallback, "fallback")):
            if explainer is None:
                continue
            try:
                exp = explainer.explain_prediction(features, anomaly_score, detection_threshold)
                if label == "fallback":
                    exp.metadata["fallback_used"] = True
                return exp
            except Exception as exc:
                logger.warning("%s explainer raised: %s", label, exc)

        logger.error("All explainers failed; returning minimal explanation")
        return self._minimal_fallback(anomaly_score, detection_threshold,
                                      error="All explainers failed")

    def _minimal_fallback(
        self,
        anomaly_score: float,
        detection_threshold: float,
        error: str = "",
    ) -> StrictExplanationJSON:
        summary = ExplanationSummary(
            main_factors=["Explanation unavailable"],
            confidence_level=0.0,
            explanation_type=ExplanationType.NONE,
            processing_time_ms=0,
        )
        return StrictExplanationJSON(
            version=SCHEMA_VERSION,
            explanation_type=ExplanationType.NONE,
            model_id=self.model_id,
            timestamp=_utc_timestamp(),
            anomaly_score=float(anomaly_score),
            detection_threshold=float(detection_threshold),
            is_anomaly=anomaly_score >= detection_threshold,
            features=[],
            summary=summary,
            metadata={"error": error, "minimal_fallback": True},
        )


# ---------------------------------------------------------------------------
# Module-level helpers
# ---------------------------------------------------------------------------

def _utc_timestamp() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())


def _calibrated_confidence(anomaly_score: float, threshold: float) -> float:
    """
    Returns a confidence value in [0, 1] that reflects how decisively
    the score sits above/below the threshold rather than raw distance from 0.5.
    """
    distance = abs(anomaly_score - threshold)
    # Sigmoid-style scaling: full confidence at 0.4+ away from threshold
    return min(1.0, distance / 0.4)