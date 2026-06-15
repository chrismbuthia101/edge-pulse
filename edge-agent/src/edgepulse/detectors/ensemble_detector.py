

import time
import numpy as np
from typing import Dict, Any, Optional, List

from edgepulse.detectors.base import BaseDetector, DetectionResult
from edgepulse.detectors.litert_backend import LITERT_AVAILABLE
from edgepulse.detectors.sklearn_detector import SklearnAnomalyDetector
from edgepulse.detectors.tflite_detector import TFLiteAnomalyDetector
from edgepulse.utils.log_handler import get_logger

logger = get_logger(__name__)


class EnsembleDetector(BaseDetector):

    def __init__(self, model_id: str, model_type: str = "isolation_forest"):
        super().__init__(model_id)
        self.model_type = model_type
        self.current_detector: Optional[BaseDetector] = None

        if model_type == "isolation_forest":
            self.current_detector = SklearnAnomalyDetector(model_id)
        elif model_type == "autoencoder":
            self.current_detector = TFLiteAnomalyDetector(model_id)
        else:
            logger.error(f"Unknown model type: {model_type}")
            raise ValueError(f"Unknown model type: {model_type}")

        logger.info(f"EnsembleDetector initialized with {model_type}: {model_id}")

    def train(self, training_data: np.ndarray, config: Dict[str, Any]) -> None:
        if not self.current_detector:
            logger.error("No detector available")
            return

        self.current_detector.train(training_data, config)

    def _detect_internal(self, features: Any) -> float:
        if not self.current_detector:
            return 0.0
        result = self.current_detector.detect(features)
        if isinstance(result, DetectionResult):
            return result.anomaly_score
        return 0.0

    def evaluate(self, test_data: Any) -> Dict[str, float]:
        if not self.current_detector:
            return {"accuracy": 0.0, "precision": 0.0, "recall": 0.0}
        return self.current_detector.evaluate(test_data)

    def save_model(self, file_path: str) -> bool:
        if not self.current_detector:
            logger.error("No detector available")
            return False
        self.current_detector.save_model(file_path)
        return True

    def load_model(self, file_path: str) -> bool:
        if not self.current_detector:
            logger.error("No detector available")
            return False
        return self.current_detector.load_model(file_path)

    def load_model_with_integrity(self, model_path: str) -> bool:
        if not self.current_detector:
            logger.error("No detector available")
            return False
        return self.current_detector.load_model_with_integrity(model_path)

    def detect(self, features: np.ndarray) -> DetectionResult:
        if not self.current_detector:
            logger.error("No detector available")
            return DetectionResult(
                is_alert_triggered=False,
                anomaly_score=0.0,
                detection_threshold_applied=self.detection_threshold,
                inference_latency_ms=0,
                model_id=self.model_id,
                model_version=self.model_version,
                timestamp=time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime()),
            )

        return self.current_detector.detect(features)

    def detect_drift(self, new_data: np.ndarray, threshold: float = 0.1) -> bool:
        if not self.current_detector:
            logger.error("No detector available")
            return False
        return self.current_detector.detect_drift(new_data, threshold)

    def switch_model(self, new_model_type: str) -> bool:
        if new_model_type == self.model_type:
            logger.info(f"Already using {new_model_type}")
            return True

        logger.info(f"Switching from {self.model_type} to {new_model_type}")

        old_detector = self.current_detector

        try:
            if new_model_type == "isolation_forest":
                new_detector: BaseDetector = SklearnAnomalyDetector(self.model_id)
            elif new_model_type == "autoencoder":
                new_detector = TFLiteAnomalyDetector(self.model_id)
            else:
                logger.error(f"Unknown model type: {new_model_type}")
                return False

            new_detector.set_detection_threshold(self.detection_threshold)

            self.current_detector = new_detector
            self.model_type = new_model_type

            logger.info(f"Successfully switched to {new_model_type}")
            return True

        except Exception as e:
            logger.error(f"Error switching model: {e}")
            self.current_detector = old_detector
            return False

    def get_available_models(self) -> Dict[str, Dict[str, Any]]:
        models: Dict[str, Dict[str, Any]] = {}

        try:
            import sklearn  # noqa: F401

            models["isolation_forest"] = {
                "available": True,
                "name": "Isolation Forest",
                "description": "Tree-based anomaly detection using sklearn",
                "supports_shap": True,
                "model_class": SklearnAnomalyDetector,
            }
        except ImportError:
            models["isolation_forest"] = {
                "available": False,
                "name": "Isolation Forest",
                "description": "Tree-based anomaly detection using sklearn",
                "error": "scikit-learn not installed",
            }

        if LITERT_AVAILABLE:
            models["autoencoder"] = {
                "available": True,
                "name": "Autoencoder",
                "description": "Neural network autoencoder using LiteRT / ai-edge-litert",
                "supports_shap": True,
                "model_class": TFLiteAnomalyDetector,
            }
        else:
            models["autoencoder"] = {
                "available": False,
                "name": "Autoencoder",
                "description": "Neural network autoencoder using LiteRT / ai-edge-litert",
                "error": "ai-edge-litert not installed. Install: pip install ai-edge-litert",
            }

        return models

    def get_model_info(self) -> Dict[str, Any]:
        base_info: Dict[str, Any] = {
            "ensemble_model_id": self.model_id,
            "current_model_type": self.model_type,
            "detection_threshold": self.detection_threshold,
            "available_models": self.get_available_models(),
        }

        if self.current_detector:
            detector_info = self.current_detector.get_model_info()
            base_info.update(detector_info)

        return base_info

    def set_detection_threshold(self, threshold: float) -> None:
        super().set_detection_threshold(threshold)

        if self.current_detector:
            self.current_detector.set_detection_threshold(threshold)

    def get_feature_importance(self) -> Optional[Dict[str, float]]:
        if self.current_detector and hasattr(self.current_detector, "get_feature_importance"):
            return self.current_detector.get_feature_importance()  # type: ignore[union-attr]
        return None

    def validate_model_switch(
        self, new_model_type: str, model_path: Optional[str] = None
    ) -> Dict[str, Any]:
        validation_result: Dict[str, Any] = {
            "can_switch": False,
            "reason": "",
            "recommendations": [],
        }

        available_models = self.get_available_models()
        if new_model_type not in available_models:
            validation_result["reason"] = f"Unknown model type: {new_model_type}"
            return validation_result

        model_info = available_models[new_model_type]
        if not model_info["available"]:
            validation_result["reason"] = model_info.get("error", "Model not available")
            validation_result["recommendations"] = [
                f"Install required dependencies for {model_info['name']}"
            ]
            return validation_result

        if model_path:
            from pathlib import Path

            if not Path(model_path).exists():
                validation_result["reason"] = f"Model file not found: {model_path}"
                return validation_result

        validation_result["can_switch"] = True
        validation_result["reason"] = f"Can switch to {model_info['name']}"
        return validation_result

    @property
    def is_trained(self) -> bool:
        if self.current_detector and hasattr(self.current_detector, "is_trained"):
            return self.current_detector.is_trained  # type: ignore[return-value]
        return False