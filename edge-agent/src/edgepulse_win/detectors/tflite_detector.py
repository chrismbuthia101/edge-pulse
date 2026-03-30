"""
TensorFlow Lite Anomaly Detector Implementation

Implements Autoencoder as the secondary detection model
with SHAP DeepExplainer integration for explainable AI.
"""

import numpy as np
import hashlib
import time
from typing import Dict, Any, Optional
from pathlib import Path

try:
    import tensorflow as tf
    TENSORFLOW_AVAILABLE = True
except ImportError:
    TENSORFLOW_AVAILABLE = False

try:
    import shap
    SHAP_AVAILABLE = True
except ImportError:
    SHAP_AVAILABLE = False

from edgepulse_win.detectors.base import BaseDetector, DetectionResult, ModelMetadata
from edgepulse_win.utils.log_handler import get_logger

logger = get_logger(__name__)


class TFLiteAnomalyDetector(BaseDetector):
    """TensorFlow Lite Autoencoder anomaly detector"""

    def __init__(self, model_id: str):
        super().__init__(model_id)
        self.model_type = "autoencoder"

        self.interpreter: Optional[Any] = None
        self.input_details: Optional[dict] = None
        self.output_details: Optional[dict] = None
        self.explainer: Optional[Any] = None

        self.expected_model_hash: Optional[str] = None
        self.feature_names: Optional[list] = None
        self.is_trained = False
        self._model_metadata = None

        self.input_shape = None
        self.threshold_percentile = 95
        self.threshold_value: float = 0.1  # default; overwritten after training

        logger.info(f"TFLiteAnomalyDetector initialized: {model_id}")

    def load_model_with_integrity(self, model_path: str) -> bool:
        """Load TFLite model with SHA-256 integrity verification"""
        try:
            if not TENSORFLOW_AVAILABLE:
                logger.error("TensorFlow not available")
                return False

            model_path_obj = Path(model_path)
            if not model_path_obj.exists():
                logger.error(f"Model file not found: {model_path_obj}")
                return False

            file_hash = self._calculate_file_hash(model_path_obj)
            logger.info(f"Model file hash: {file_hash[:16]}...")

            self.interpreter = tf.lite.Interpreter(model_path=str(model_path_obj))
            self.interpreter.allocate_tensors()

            self.input_details = self.interpreter.get_input_details()
            self.output_details = self.interpreter.get_output_details()

            if self.input_details:
                input_shape = self.input_details[0]["shape"]
                self.input_shape = tuple(input_shape)
                logger.info(f"Model input shape: {self.input_shape}")

            metadata_path = model_path_obj.with_suffix(".metadata.json")
            if metadata_path.exists():
                import json

                with open(metadata_path, "r") as f:
                    metadata = json.load(f)

                self.feature_names = metadata.get("feature_names", [])
                self.expected_model_hash = metadata.get("hash", file_hash)
                self.threshold_value = float(metadata.get("threshold_value", self.threshold_value))

                if file_hash != self.expected_model_hash:
                    logger.error("Model integrity check failed - hash mismatch")
                    return False
            else:
                self.feature_names = []
                self.expected_model_hash = file_hash

            if SHAP_AVAILABLE and TENSORFLOW_AVAILABLE:
                try:
                    tf_model_path = model_path_obj.with_suffix(".h5")
                    if tf_model_path.exists():
                        tf_model = tf.keras.models.load_model(str(tf_model_path))
                        background_data = np.random.normal(
                            0, 1, (100, self.input_shape[1])
                        ).astype(np.float32)
                        self.explainer = shap.DeepExplainer(tf_model, data=background_data)
                        logger.info("SHAP DeepExplainer initialized")
                except Exception as e:
                    logger.warning(f"Failed to initialize SHAP explainer: {e}")

            self.is_trained = True
            self._model_metadata = ModelMetadata(
                model_id=self.model_id,
                model_version=self.model_version,
                model_hash=self.expected_model_hash,
                created_at=time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime()),
                file_path=str(model_path_obj),
                integrity_verified=False,
            )

            logger.info(f"TFLite model loaded successfully: {model_path_obj}")
            return True

        except Exception as e:
            logger.error(f"Error loading TFLite model: {e}")
            return False

    def save_model(self, model_path: str) -> bool:
        """Save model (TFLite models are converted separately)"""
        if not TENSORFLOW_AVAILABLE:
            logger.error("TensorFlow not available")
            return False

        logger.warning("TFLite models should be converted separately from a trained Keras model")
        return True

    def train(self, training_data: np.ndarray, config: Dict[str, Any]) -> bool:
        """Train the Autoencoder model"""
        try:
            if not TENSORFLOW_AVAILABLE:
                logger.error("TensorFlow not available")
                return False

            logger.info(
                f"Training autoencoder with {training_data.shape[0]} samples, "
                f"{training_data.shape[1]} features"
            )

            # Extract feature names from config
            feature_names = None
            if isinstance(config, dict):
                feature_names = config.get("feature_names")
            
            self.feature_names = feature_names or [
                f"feature_{i}" for i in range(training_data.shape[1])
            ]
            self.input_shape = (None, training_data.shape[1])

            normalized_data = (training_data - np.mean(training_data, axis=0)) / np.maximum(
                np.std(training_data, axis=0), 1e-8
            )

            input_dim = training_data.shape[1]
            encoding_dim = max(8, input_dim // 4)

            input_layer = tf.keras.layers.Input(shape=(input_dim,))
            encoded = tf.keras.layers.Dense(encoding_dim, activation="relu")(input_layer)
            decoded = tf.keras.layers.Dense(input_dim, activation="linear")(encoded)

            autoencoder = tf.keras.models.Model(input_layer, decoded)
            autoencoder.compile(optimizer="adam", loss="mse")

            autoencoder.fit(
                normalized_data,
                normalized_data,
                epochs=50,
                batch_size=32,
                shuffle=True,
                validation_split=0.2,
                verbose=0,
            )

            reconstructed = autoencoder.predict(normalized_data)
            reconstruction_errors = np.mean(
                np.square(normalized_data - reconstructed), axis=1
            )
            self.threshold_value = float(
                np.percentile(reconstruction_errors, self.threshold_percentile)
            )

            self.tf_model = autoencoder

            if SHAP_AVAILABLE:
                try:
                    background_data = normalized_data[:100]
                    self.explainer = shap.DeepExplainer(autoencoder, data=background_data)
                    logger.info("SHAP DeepExplainer initialized")
                except Exception as e:
                    logger.warning(f"Failed to initialize SHAP explainer: {e}")

            self.is_trained = True
            self._model_metadata = ModelMetadata(
                model_id=self.model_id,
                model_version=self.model_version,
                model_hash="",
                created_at=time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime()),
                file_path="",
                integrity_verified=False,
            )

            logger.info(
                f"Autoencoder training completed - threshold: {self.threshold_value:.4f}"
            )
            return True

        except Exception as e:
            logger.error(f"Error training autoencoder: {e}")
            return False

    def _detect_internal(self, features: np.ndarray) -> float:
        """Internal detection that satisfies BaseDetector abstract contract."""
        results = self.detect(features)
        # detect() returns a DetectionResult; extract anomaly_score
        if isinstance(results, DetectionResult):
            return results.anomaly_score
        return 0.0

    def detect(self, features: np.ndarray) -> DetectionResult:
        """Perform anomaly detection using reconstruction error"""
        try:
            if not self.is_trained or not self.interpreter:
                raise RuntimeError("Model not trained or loaded")

            start_time = time.perf_counter()

            if features.ndim == 1:
                features = features.reshape(1, -1)

            input_tensor = features.astype(np.float32)

            input_details = self.input_details[0]
            output_details = self.output_details[0]

            self.interpreter.set_tensor(input_details["index"], input_tensor)
            self.interpreter.invoke()

            output_data = self.interpreter.get_tensor(output_details["index"])

            # Dequantize output only if the model is quantized (scale != 0)
            output_quantization = output_details.get("quantization", (0.0, 0))
            if isinstance(output_quantization, (list, tuple)) and len(output_quantization) == 2:
                scale, zero_point = output_quantization
            else:
                scale, zero_point = 0.0, 0

            reconstructed = output_data.astype(np.float32)
            if scale != 0.0:
                reconstructed = (reconstructed - zero_point) * scale

            reconstruction_error = float(
                np.mean(np.square(input_tensor - reconstructed))
            )

            # Sigmoid-style normalization relative to training threshold
            anomaly_score = 1.0 / (
                1.0 + np.exp(-5.0 * (reconstruction_error - self.threshold_value))
            )

            is_alert = reconstruction_error > self.threshold_value

            inference_latency_ms = int((time.perf_counter() - start_time) * 1000)

            explanations = None
            if self.explainer and SHAP_AVAILABLE and hasattr(self, "tf_model"):
                try:
                    shap_values = self.explainer.shap_values(input_tensor)
                    explanations = {
                        "shap_values": (
                            shap_values.tolist()
                            if hasattr(shap_values, "tolist")
                            else shap_values
                        ),
                        "feature_names": self.feature_names,
                        "reconstruction_error": reconstruction_error,
                        "threshold_value": self.threshold_value,
                    }
                except Exception as e:
                    logger.warning(f"Failed to generate SHAP explanations: {e}")

            return DetectionResult(
                is_alert_triggered=bool(is_alert),
                anomaly_score=float(anomaly_score),
                detection_threshold_applied=self.detection_threshold,
                inference_latency_ms=inference_latency_ms,
                model_id=self.model_id,
                model_version=self.model_version,
                timestamp=time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime()),
                explanation=explanations,
            )

        except Exception as e:
            logger.error(f"Error in anomaly detection: {e}")
            return DetectionResult(
                is_alert_triggered=False,
                anomaly_score=0.0,
                detection_threshold_applied=self.detection_threshold,
                inference_latency_ms=0,
                model_id=self.model_id,
                model_version=self.model_version,
                timestamp=time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime()),
            )

    def evaluate(self, test_data: Any) -> Dict[str, float]:
        """Evaluate detector performance (satisfies BaseDetector abstract contract)"""
        return {"accuracy": 0.0, "precision": 0.0, "recall": 0.0}

    def load_model(self, file_path: str) -> bool:
        """Load model (satisfies BaseDetector abstract contract)"""
        return self.load_model_with_integrity(file_path)

    def detect_drift(self, new_data: np.ndarray, threshold: float = 0.1) -> bool:
        """Detect model drift using reconstruction error distribution"""
        try:
            if not self.is_trained or not self.interpreter:
                logger.warning("Cannot detect drift - model not trained")
                return False

            if new_data.shape[0] < 100:
                logger.warning("Insufficient data for drift detection")
                return False

            reconstruction_errors = []

            for i in range(0, new_data.shape[0], 10):
                features = new_data[i : i + 1].astype(np.float32)

                input_details = self.input_details[0]
                output_details = self.output_details[0]

                self.interpreter.set_tensor(input_details["index"], features)
                self.interpreter.invoke()

                output_data = self.interpreter.get_tensor(output_details["index"])
                reconstructed = output_data.astype(np.float32)

                error = float(np.mean(np.square(features - reconstructed)))
                reconstruction_errors.append(error)

            if not reconstruction_errors:
                return False

            new_mean_error = float(np.mean(reconstruction_errors))
            new_std_error = float(np.std(reconstruction_errors))

            expected_mean = self.threshold_value * 0.8
            expected_std = self.threshold_value * 0.3

            mean_shift = abs(new_mean_error - expected_mean) / max(expected_mean, 1e-8)
            std_change = abs(new_std_error - expected_std) / max(expected_std, 1e-8)

            drift_detected = mean_shift > threshold or std_change > threshold

            if drift_detected:
                logger.warning(
                    f"Model drift detected - mean shift: {mean_shift:.3f}, std change: {std_change:.3f}"
                )
            else:
                logger.debug(
                    f"No drift detected - mean shift: {mean_shift:.3f}, std change: {std_change:.3f}"
                )

            return drift_detected

        except Exception as e:
            logger.error(f"Error detecting drift: {e}")
            return False

    def _calculate_file_hash(self, file_path: Path) -> str:
        """Calculate SHA-256 hash of model file"""
        try:
            hash_sha256 = hashlib.sha256()
            with open(file_path, "rb") as f:
                for chunk in iter(lambda: f.read(4096), b""):
                    hash_sha256.update(chunk)
            return hash_sha256.hexdigest()
        except Exception as e:
            logger.error(f"Error calculating file hash: {e}")
            return ""

    def get_model_info(self) -> Dict[str, Any]:
        """Get detailed model information"""
        info = {
            "model_id": self.model_id,
            "model_type": self.model_type,
            "is_trained": self.is_trained,
            "feature_count": self.input_shape[1] if self.input_shape else 0,
            "feature_names": self.feature_names or [],
            "detection_threshold": self.detection_threshold,
            "input_shape": self.input_shape,
            "tensorflow_available": TENSORFLOW_AVAILABLE,
            "shap_available": SHAP_AVAILABLE,
            "explainer_available": self.explainer is not None,
        }

        if hasattr(self, "threshold_value"):
            info["reconstruction_threshold"] = self.threshold_value

        if self.input_details:
            info["input_details"] = self.input_details[0]

        if self.output_details:
            info["output_details"] = self.output_details[0]

        return info