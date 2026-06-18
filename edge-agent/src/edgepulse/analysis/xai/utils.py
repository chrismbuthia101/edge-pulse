from __future__ import annotations

import time
from typing import Any, Dict, List, Optional

from edgepulse.analysis.xai.models import (
    ExplanationType,
    ExplanationSummary,
    SCHEMA_VERSION,
    StrictExplanationJSON,
)


def utc_timestamp() -> str:
    t = time.gmtime()
    ms = int((time.time() % 1) * 1000)
    return time.strftime("%Y-%m-%dT%H:%M:%S.", t) + f"{ms:03d}Z"


def calibrated_confidence(anomaly_score: float, threshold: float) -> float:
    distance = abs(anomaly_score - threshold)
    return min(1.0, distance / 0.4)


def resolve_predict_fn(model: Any) -> Any:
    if hasattr(model, "score_samples"):
        return model.score_samples
    if hasattr(model, "decision_function"):
        return model.decision_function
    return model.predict


def make_fallback_explanation(
    model_id: str,
    anomaly_score: float,
    detection_threshold: float,
    explanation_type: ExplanationType = ExplanationType.NONE,
    processing_time_ms: int = 0,
    error: str = "",
    main_factors: Optional[List[str]] = None,
    is_minimal: bool = False,
) -> StrictExplanationJSON:
    metadata: Dict[str, Any] = {"error": error}
    if is_minimal:
        metadata["minimal_fallback"] = True
    else:
        metadata["fallback"] = True

    summary = ExplanationSummary(
        main_factors=main_factors or ["Explanation unavailable"],
        confidence_level=0.0,
        explanation_type=explanation_type,
        processing_time_ms=processing_time_ms,
    )
    return StrictExplanationJSON(
        version=SCHEMA_VERSION,
        explanation_type=explanation_type,
        model_id=model_id,
        timestamp=utc_timestamp(),
        anomaly_score=float(anomaly_score),
        detection_threshold=float(detection_threshold),
        is_anomaly=anomaly_score >= detection_threshold,
        features=[],
        summary=summary,
        metadata=metadata,
    )
