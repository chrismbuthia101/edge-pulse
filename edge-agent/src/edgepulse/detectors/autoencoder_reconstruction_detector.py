"""
Secondary anomaly detector using autoencoder reconstruction error.
"""

from __future__ import annotations

import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

from edgepulse.detectors.litert_backend import LiteRTBackend, LITERT_AVAILABLE

try:
    import tensorflow as tf
    TENSORFLOW_AVAILABLE = True
except ImportError:
    TENSORFLOW_AVAILABLE = False
    tf = None  # type: ignore[assignment]

from edgepulse.utils.error_handler import ModelError
from edgepulse.utils.path_manager import PathManager
from edgepulse.detectors.base import BaseDetector
from edgepulse.utils.log_handler import get_logger

logger = get_logger(__name__)


class AutoencoderDetector(BaseDetector):

    def __init__(
        self,
        input_dim: int = 50,
        encoding_dim: int = 8,
        hidden_layers: Optional[List[int]] = None,
        learning_rate: float = 0.001,
        model_path: Optional[Path] = None,
        device_id: Optional[str] = None,
        path_manager: Optional[PathManager] = None,
        use_tflite: bool = True,
        model_version: str = "1.0",
    ):
        self.input_dim = input_dim
        self.encoding_dim = encoding_dim
       
        self.hidden_layers = hidden_layers or [
            max(8, input_dim // 2),
            max(8, input_dim // 4),
        ]
        self.learning_rate = learning_rate
        self.path_manager = path_manager or PathManager()
        self.model_version = model_version

        base_path = self.path_manager.get_model_path("autoencoder", device_id)
        self.model_path = Path(model_path) if model_path else base_path.with_suffix(".tflite")

        self._keras_model: Optional[Any] = None

        self._backend: Optional[LiteRTBackend] = None

        self.is_trained = False
        self.training_samples = 0
        self.reconstruction_threshold = 0.1

    def _build_keras_model(self) -> Any:
        if not TENSORFLOW_AVAILABLE:
            raise ModelError("TensorFlow is required for training the autoencoder")

        inp = tf.keras.layers.Input(shape=(self.input_dim,))
        x = inp
        for h in self.hidden_layers:
            x = tf.keras.layers.Dense(h, activation="relu")(x)
        encoded = tf.keras.layers.Dense(self.encoding_dim, activation="relu")(x)
        x = encoded
        for h in reversed(self.hidden_layers):
            x = tf.keras.layers.Dense(h, activation="relu")(x)
        decoded = tf.keras.layers.Dense(self.input_dim, activation="linear")(x)

        model = tf.keras.Model(inp, decoded)
        model.compile(
            optimizer=tf.keras.optimizers.Adam(learning_rate=self.learning_rate),
            loss="mse",
        )
        return model

    def _convert_to_tflite(self, keras_model: Any, out_path: Path) -> Path:
        """Convert trained Keras model to .tflite via TFLiteConverter."""
        if not TENSORFLOW_AVAILABLE:
            raise ModelError("TensorFlow is required for .tflite conversion")

        tflite_path = out_path.with_suffix(".tflite")
        converter = tf.lite.TFLiteConverter.from_keras_model(keras_model)
        converter.optimizations = [tf.lite.Optimize.DEFAULT]
        tflite_bytes = converter.convert()

        tflite_path.parent.mkdir(parents=True, exist_ok=True)
        with open(tflite_path, "wb") as f:
            f.write(tflite_bytes)

        logger.info("Converted autoencoder to TFLite: %s", tflite_path)
        return tflite_path

    def train(self, training_data: Any, config: Dict[str, Any]) -> None:
        features = np.asarray(training_data, dtype=np.float32)
        if features.ndim == 1:
            features = features.reshape(1, -1)

        if features.shape[1] != self.input_dim:
            raise ModelError(
                f"Feature dimension mismatch: expected {self.input_dim}, "
                f"got {features.shape[1]}"
            )

        epochs = (config or {}).get("epochs", 50)
        batch_size = (config or {}).get("batch_size", 32)
        validation_split = (config or {}).get("validation_split", 0.1)

        try:
            logger.info("Training autoencoder — n_samples=%d", len(features))
            self._keras_model = self._build_keras_model()

            self._keras_model.fit(
                features, features,
                epochs=epochs,
                batch_size=batch_size,
                validation_split=validation_split,
                verbose=0,
            )

            recon = self._keras_model.predict(features, verbose=0)
            errors = np.mean((features - recon) ** 2, axis=1)
            self.reconstruction_threshold = float(np.percentile(errors, 95))

            self.is_trained = True
            self.training_samples = len(features)
            logger.info(
                "Autoencoder training complete — threshold=%.6f",
                self.reconstruction_threshold,
            )

        except Exception as exc:
            raise ModelError(f"Autoencoder training failed: {exc}") from exc

    def detect(self, features: Any) -> List[Any]:
        if not self.is_trained:
            n = len(features) if hasattr(features, "__len__") else 1
            return [(0, 0.0)] * n

        arr = np.asarray(features, dtype=np.float32)
        if arr.ndim == 1:
            arr = arr.reshape(1, -1)

        if self._backend is None:
            # Try to load model on demand
            if not self.load_model():
                return [(0, 0.0)] * len(arr)

        try:
            recon = self._backend.run(arr)
        except ValueError as exc:
            logger.error("AutoencoderDetector shape error: %s", exc)
            return [(0, 0.0)] * len(arr)
        except Exception as exc:
            logger.error("AutoencoderDetector inference error: %s", exc)
            return [(0, 0.0)] * len(arr)

        errors = np.mean((arr - recon) ** 2, axis=1)
        results = []
        for err in errors:
            thr = self.reconstruction_threshold
            score = float(min(1.0, err / thr)) if thr > 0 else 0.0
            label = 1 if err > thr else 0
            results.append((label, score))
        return results

    def predict(self, features: np.ndarray) -> Tuple[int, float]:
        results = self.detect(features)
        return results[0] if results else (0, 0.0)

    def save_model(self, path: Optional[Path] = None) -> None:
        if not self.is_trained or self._keras_model is None:
            logger.warning("No trained Keras model to save")
            return

        save_path = Path(path) if path else self.model_path
        save_path.parent.mkdir(parents=True, exist_ok=True)

        # Convert + save as .tflite
        tflite_path = self._convert_to_tflite(self._keras_model, save_path)

        # Save metadata sidecar
        import json
        meta = {
            "threshold_value": self.reconstruction_threshold,
            "training_samples": self.training_samples,
            "input_dim": self.input_dim,
            "encoding_dim": self.encoding_dim,
            "model_version": self.model_version,
        }
        meta_path = tflite_path.with_suffix(".metadata.json")
        with open(meta_path, "w") as f:
            json.dump(meta, f, indent=2)

        logger.info("Autoencoder saved: %s", tflite_path)

    def load_model(self, path: Optional[Path] = None) -> bool:
        load_path = Path(path) if path else self.model_path

        if not load_path.exists():
            logger.warning("Autoencoder model not found: %s", load_path)
            return False

        if not LITERT_AVAILABLE:
            logger.error(
                "No LiteRT runtime. Install: pip install 'ai-edge-litert>=2.0.0'"
            )
            return False

        try:
            self._backend = LiteRTBackend.from_file(str(load_path))

            # Load metadata sidecar
            meta_path = load_path.with_suffix(".metadata.json")
            if meta_path.exists():
                import json
                with open(meta_path) as f:
                    meta = json.load(f)
                self.reconstruction_threshold = float(
                    meta.get("threshold_value", self.reconstruction_threshold)
                )
                self.training_samples = meta.get("training_samples", 0)

            self.is_trained = True
            logger.info(
                "AutoencoderDetector: loaded %s via %s",
                load_path.name,
                self._backend.backend_name,
            )
            return True

        except Exception as exc:
            logger.error("AutoencoderDetector load error: %s", exc)
            return False

    def evaluate(self, test_data: Any) -> Dict[str, float]:
        if not self.is_trained:
            return {"accuracy": 0.0}

        arr = np.asarray(test_data, dtype=np.float32)
        if arr.ndim == 1:
            arr = arr.reshape(1, -1)

        try:
            recon = self._backend.run(arr)
            errors = np.mean((arr - recon) ** 2, axis=1)
            anomaly_rate = float(np.mean(errors > self.reconstruction_threshold))
            return {
                "anomaly_rate": anomaly_rate,
                "avg_reconstruction_error": float(np.mean(errors)),
                "reconstruction_threshold": self.reconstruction_threshold,
                "total_samples": len(arr),
            }
        except Exception as exc:
            logger.error("Evaluation error: %s", exc)
            return {"accuracy": 0.0}

    def get_health(self) -> Dict[str, Any]:
        return {
            "detector": "AutoencoderDetector",
            "is_trained": self.is_trained,
            "status": "ok" if self.is_trained else "degraded",
            "backend": self._backend.backend_name if self._backend else "none",
            "reconstruction_threshold": self.reconstruction_threshold,
            "training_samples": self.training_samples,
            "model_path": str(self.model_path),
            "litert_available": LITERT_AVAILABLE,
        }