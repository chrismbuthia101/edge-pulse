

from __future__ import annotations

import hashlib
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np

from edgepulse.detectors.litert_backend import LiteRTBackend, LITERT_AVAILABLE

try:
    import shap
    SHAP_AVAILABLE = True
except ImportError:
    SHAP_AVAILABLE = False

try:
    import tensorflow as tf
    TENSORFLOW_AVAILABLE = True
except ImportError:
    TENSORFLOW_AVAILABLE = False

from edgepulse.detectors.base import BaseDetector, DetectionResult, ModelMetadata
from edgepulse.utils.log_handler import get_logger

logger = get_logger(__name__)


class TFLiteAnomalyDetector(BaseDetector):

    def __init__(self, model_id: str):
        super().__init__(model_id)
        self.model_type = "autoencoder"

        self._backend: Optional[LiteRTBackend] = None
        self._explainer: Optional[Any] = None

        self.expected_model_hash: Optional[str] = None
        self.feature_names: Optional[List[str]] = None
        self.is_trained: bool = False
        self._model_metadata: Optional[ModelMetadata] = None

        self.threshold_percentile: int = 95
        self.threshold_value: float = 0.1

        logger.info("TFLiteAnomalyDetector initialised: %s", model_id)

    def load_model_with_integrity(self, model_path: str) -> bool:
        if not LITERT_AVAILABLE:
            logger.error(
                "No LiteRT runtime available. "
                "Install: pip install 'ai-edge-litert>=2.0.0'"
            )
            return False

        model_path_obj = Path(model_path)
        if not model_path_obj.exists():
            logger.error("Model file not found: %s", model_path_obj)
            return False

        try:
            file_hash = self._calculate_file_hash(model_path_obj)

            self._backend = LiteRTBackend.from_file(model_path)
            logger.info(
                "TFLiteAnomalyDetector: loaded %s via %s",
                model_path_obj.name,
                self._backend.backend_name,
            )

            metadata_path = model_path_obj.with_suffix(".metadata.json")
            if metadata_path.exists():
                import json
                with open(metadata_path) as f:
                    meta = json.load(f)

                self.feature_names = meta.get("feature_names", [])
                self.expected_model_hash = meta.get("hash", file_hash)
                self.threshold_value = float(
                    meta.get("threshold_value", self.threshold_value)
                )

                if file_hash != self.expected_model_hash:
                    logger.error(
                        "Model integrity check FAILED — hash mismatch for %s",
                        model_path_obj.name,
                    )
                    return False
            else:
                self.feature_names = []
                self.expected_model_hash = file_hash

            if SHAP_AVAILABLE and TENSORFLOW_AVAILABLE:
                tf_model_path = model_path_obj.with_suffix(".h5")
                if tf_model_path.exists():
                    try:
                        tf_model = tf.keras.models.load_model(str(tf_model_path))
                        n_feat = self._backend.input_shape[-1]
                        bg = np.random.normal(0, 1, (50, n_feat)).astype(np.float32)
                        
                        self._explainer = shap.DeepExplainer(tf_model, data=bg)
                        logger.info("SHAP DeepExplainer initialised for autoencoder")
                    except Exception as exc:
                        logger.warning("SHAP explainer failed to init: %s", exc)

            self.is_trained = True
            self._model_metadata = ModelMetadata(
                model_id=self.model_id,
                model_version=self.model_version,
                model_hash=self.expected_model_hash,
                created_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                file_path=str(model_path_obj),
                integrity_verified=True,
            )
            return True

        except Exception as exc:
            logger.exception("Error loading TFLite model: %s", exc)
            return False

    def load_model(self, file_path: str) -> bool:
        return self.load_model_with_integrity(file_path)

    def train(self, training_data: np.ndarray, config: Dict[str, Any]) -> bool:
        if not TENSORFLOW_AVAILABLE:
            logger.error("TensorFlow is required for training. pip install tensorflow")
            return False

        training_data = np.asarray(training_data, dtype=np.float32)
        if training_data.ndim == 1:
            training_data = training_data.reshape(1, -1)

        n_features = training_data.shape[1]
        feature_names = (config or {}).get("feature_names") or [
            f"feature_{i}" for i in range(n_features)
        ]
        self.feature_names = feature_names

        encoding_dim = max(4, n_features // 8)
        hidden = [max(8, n_features // 4), max(8, n_features // 6)]

        inp = tf.keras.layers.Input(shape=(n_features,))
        x = inp
        for h in hidden:
            x = tf.keras.layers.Dense(h, activation="relu")(x)
        encoded = tf.keras.layers.Dense(encoding_dim, activation="relu")(x)
        x = encoded
        for h in reversed(hidden):
            x = tf.keras.layers.Dense(h, activation="relu")(x)
        decoded = tf.keras.layers.Dense(n_features, activation="linear")(x)

        autoencoder = tf.keras.Model(inp, decoded)
        autoencoder.compile(optimizer="adam", loss="mse")

        # Normalise training data
        mean = np.mean(training_data, axis=0)
        std  = np.maximum(np.std(training_data, axis=0), 1e-8)
        norm_data = (training_data - mean) / std

        autoencoder.fit(
            norm_data, norm_data,
            epochs=50, batch_size=32,
            shuffle=True, validation_split=0.1,
            verbose=0,
        )

        recon = autoencoder.predict(norm_data, verbose=0)
        errors = np.mean((norm_data - recon) ** 2, axis=1)
        self.threshold_value = float(np.percentile(errors, self.threshold_percentile))

        converter = tf.lite.TFLiteConverter.from_keras_model(autoencoder)
        converter.optimizations = [tf.lite.Optimize.DEFAULT]
        tflite_model = converter.convert()

        self.is_trained = True
        logger.info(
            "Autoencoder trained — n_features=%d, threshold=%.6f",
            n_features, self.threshold_value,
        )
        return True

    def _detect_internal(self, features: np.ndarray) -> float:
        result = self.detect(features)
        if isinstance(result, DetectionResult):
            return result.anomaly_score
        return 0.0

    def detect(self, features: np.ndarray) -> DetectionResult:
        if not self.is_trained or self._backend is None:
            logger.debug("TFLite model not loaded, returning default result")
            return self._null_result()

        start = time.perf_counter()

        try:
            features = np.asarray(features, dtype=np.float32)
            if features.ndim == 1:
                features = features.reshape(1, -1)

            reconstructed = self._backend.run(features)

            reconstruction_error = float(
                np.mean(np.square(features - reconstructed))
            )

            anomaly_score = float(
                1.0 / (1.0 + np.exp(-5.0 * (reconstruction_error - self.threshold_value)))
            )
            is_alert = reconstruction_error > self.threshold_value

            latency_ms = int((time.perf_counter() - start) * 1000)

            explanation: Optional[Dict[str, Any]] = None
            if self._explainer is not None and SHAP_AVAILABLE:
                try:
                    sv = self._explainer.shap_values(features)
                    explanation = {
                        "shap_values": sv.tolist() if hasattr(sv, "tolist") else sv,
                        "feature_names": self.feature_names,
                        "reconstruction_error": reconstruction_error,
                        "threshold_value": self.threshold_value,
                    }
                except Exception as exc:
                    logger.debug("SHAP explanation skipped: %s", exc)

            return DetectionResult(
                is_alert_triggered=is_alert,
                anomaly_score=anomaly_score,
                detection_threshold_applied=self.detection_threshold,
                inference_latency_ms=latency_ms,
                model_id=self.model_id,
                model_version=self.model_version,
                timestamp=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                explanation=explanation,
            )

        except ValueError as exc:
            logger.error("TFLite detect shape error: %s", exc)
            return self._null_result()
        except Exception as exc:
            logger.exception("TFLite detect error: %s", exc)
            return self._null_result()

    def save_model(self, file_path: str) -> bool:
        logger.warning(
            "TFLite models must be converted via train() + save as .tflite. "
            "Use TFLiteAnomalyDetector.train() to produce the model file."
        )
        return True

    def evaluate(self, test_data: Any) -> Dict[str, float]:
        return {"accuracy": 0.0, "precision": 0.0, "recall": 0.0}

    def detect_drift(self, new_data: np.ndarray, threshold: float = 0.1) -> bool:
        if not self.is_trained or self._backend is None:
            return False
        if new_data.shape[0] < 100:
            return False

        try:
            errors = []
            for i in range(0, new_data.shape[0], 10):
                batch = new_data[i : i + 1].astype(np.float32)
                recon = self._backend.run(batch)
                errors.append(float(np.mean(np.square(batch - recon))))

            mean_err = float(np.mean(errors))
            expected = self.threshold_value * 0.8
            mean_shift = abs(mean_err - expected) / max(expected, 1e-8)
            return mean_shift > threshold

        except Exception as exc:
            logger.error("Drift detection error: %s", exc)
            return False

    def _null_result(self) -> DetectionResult:
        return DetectionResult(
            is_alert_triggered=False,
            anomaly_score=0.0,
            detection_threshold_applied=self.detection_threshold,
            inference_latency_ms=0,
            model_id=self.model_id,
            model_version=self.model_version,
            timestamp=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        )

    def _calculate_file_hash(self, file_path: Path) -> str:
        h = hashlib.sha256()
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(4096), b""):
                h.update(chunk)
        return h.hexdigest()

    def get_model_info(self) -> Dict[str, Any]:
        info: Dict[str, Any] = {
            "model_id": self.model_id,
            "model_type": self.model_type,
            "is_trained": self.is_trained,
            "detection_threshold": self.detection_threshold,
            "reconstruction_threshold": self.threshold_value,
            "litert_available": LITERT_AVAILABLE,
            "backend": self._backend.backend_name if self._backend else "none",
            "shap_available": SHAP_AVAILABLE,
            "explainer_available": self._explainer is not None,
            "feature_count": (
                self._backend.input_shape[-1] if self._backend else 0
            ),
            "feature_names": self.feature_names or [],
        }
        if self._backend is not None:
            info["input_shape"] = self._backend.input_shape
            info["output_shape"] = self._backend.output_shape
            info["quantized"] = self._backend.is_quantized()
        return info