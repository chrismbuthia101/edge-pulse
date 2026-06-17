import time
from datetime import datetime
from abc import ABC, abstractmethod
from typing import Any, Dict, Optional
from dataclasses import dataclass

from edgepulse.utils.log_handler import get_logger

logger = get_logger(__name__)


@dataclass
class DetectionResult:
    anomaly_score: float
    detection_threshold_applied: float
    is_alert_triggered: bool
    inference_latency_ms: int
    model_id: str
    model_version: str
    timestamp: str
    features_hash: Optional[str] = None
    explanation: Optional[Dict[str, Any]] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "anomaly_score": self.anomaly_score,
            "detection_threshold_applied": self.detection_threshold_applied,
            "is_alert_triggered": self.is_alert_triggered,
            "inference_latency_ms": self.inference_latency_ms,
            "model_id": self.model_id,
            "model_version": self.model_version,
            "timestamp": self.timestamp,
            "features_hash": self.features_hash,
            "explanation": self.explanation,
        }


class BaseDetector(ABC):

    def __init__(self, model_id: str, model_version: str = "1.0"):
        self.model_id = model_id
        self.model_version = model_version
        self.detection_threshold = 0.5

    @abstractmethod
    def _detect_internal(self, features: Any) -> float:
        pass

    def detect(self, features: Any) -> DetectionResult:
        start_time = time.perf_counter()

        try:
            anomaly_score = self._detect_internal(features)

            is_alert_triggered = anomaly_score >= self.detection_threshold

            inference_latency_ms = int((time.perf_counter() - start_time) * 1000)

            result = DetectionResult(
                anomaly_score=anomaly_score,
                detection_threshold_applied=self.detection_threshold,
                is_alert_triggered=is_alert_triggered,
                inference_latency_ms=inference_latency_ms,
                model_id=self.model_id,
                model_version=self.model_version,
                timestamp=datetime.utcnow().isoformat() + "Z",
            )

            logger.debug(
                f"Detection completed in {inference_latency_ms}ms, score: {anomaly_score:.4f}"
            )
            return result

        except Exception as e:
            logger.error(f"Error during detection: {e}")
            end_time = time.perf_counter()
            inference_latency_ms = int((end_time - start_time) * 1000)

            return DetectionResult(
                anomaly_score=0.0,
                detection_threshold_applied=self.detection_threshold,
                is_alert_triggered=False,
                inference_latency_ms=inference_latency_ms,
                model_id=self.model_id,
                model_version=self.model_version,
                timestamp=datetime.utcnow().isoformat() + "Z",
            )

    def save_model(self, file_path: Optional[str] = None) -> bool:
        logger.warning(
            "save_model not implemented for %s",
            self.__class__.__name__,
        )
        return False

    def load_model(self, file_path: Optional[str] = None) -> bool:
        logger.warning(
            "load_model not implemented for %s",
            self.__class__.__name__,
        )
        return False

    def set_detection_threshold(self, threshold: float) -> None:
        if 0.0 <= threshold <= 1.0:
            self.detection_threshold = threshold
            logger.info(f"Detection threshold set to: {threshold}")
        else:
            raise ValueError("Detection threshold must be between 0.0 and 1.0")

    def get_model_info(self) -> Dict[str, Any]:
        return {
            "model_id": self.model_id,
            "model_version": self.model_version,
            "detection_threshold": self.detection_threshold,
        }
