# Autoencoder Detector
# Secondary anomaly detector using autoencoder reconstruction error.

import logging
from typing import Tuple, Optional, Any, Dict, List
from pathlib import Path
import numpy as np

try:
    import tensorflow as tf
    TENSORFLOW_AVAILABLE = True
except ImportError:
    TENSORFLOW_AVAILABLE = False
    tf = None

try:
    from tflite_runtime.interpreter import Interpreter
    TFLITE_AVAILABLE = True
except ImportError:
    try:
        import tensorflow as tf
        Interpreter = tf.lite.Interpreter
        TFLITE_AVAILABLE = True
    except ImportError:
        TFLITE_AVAILABLE = False

from edgepulse_win.utils.error_handler import ModelError
from edgepulse_win.utils.path_manager import PathManager
from edgepulse_win.detectors.base import BaseDetector

logger = logging.getLogger(__name__)


class AutoencoderDetector(BaseDetector):

    def __init__(
        self,
        input_dim: int = 50,
        encoding_dim: int = 8,
        hidden_layers: Optional[list] = None,
        learning_rate: float = 0.001,
        model_path: Optional[Path] = None,
        device_id: Optional[str] = None,
        path_manager: Optional[PathManager] = None,
        use_tflite: bool = False,
    ):
        self.input_dim = input_dim
        self.encoding_dim = encoding_dim
        self.hidden_layers = hidden_layers or [64, 32, 16]
        self.learning_rate = learning_rate
        self.path_manager = path_manager or PathManager()
        self.use_tflite = use_tflite
        
        if model_path:
            self.model_path = Path(model_path)
        else:
            # Use different extensions for TF vs TFLite
            base_path = self.path_manager.get_model_path("autoencoder", device_id)
            self.model_path = base_path.with_suffix('.tflite' if use_tflite else '.h5')
        
        self.model = None
        self.interpreter = None
        self.input_details = None
        self.output_details = None
        self.is_trained = False
        self.training_samples = 0
        self.reconstruction_threshold = 0.1

    def _build_model(self):
        if not TENSORFLOW_AVAILABLE:
            raise ModelError("TensorFlow is required for training models")
            
        input_layer = tf.keras.layers.Input(shape=(self.input_dim,))
        
        x = input_layer
        for hidden_size in self.hidden_layers:
            x = tf.keras.layers.Dense(hidden_size, activation='relu')(x)
        
        encoded = tf.keras.layers.Dense(self.encoding_dim, activation='relu')(x)
        
        x = encoded
        for hidden_size in reversed(self.hidden_layers):
            x = tf.keras.layers.Dense(hidden_size, activation='relu')(x)
        
        decoded = tf.keras.layers.Dense(self.input_dim, activation='linear')(x)
        
        autoencoder = tf.keras.Model(input_layer, decoded)
        
        autoencoder.compile(
            optimizer=tf.keras.optimizers.Adam(learning_rate=self.learning_rate),
            loss='mse',
            metrics=['mae']
        )
        
        return autoencoder

    def _convert_to_tflite(self, model_path: Path) -> Path:
        """Convert trained TensorFlow model to TensorFlow Lite format"""
        if not TFLITE_AVAILABLE:
            raise ModelError("TensorFlow Lite is not available")
            
        tflite_path = model_path.with_suffix('.tflite')
        
        try:
            # Create TFLite converter
            converter = tf.lite.TFLiteConverter.from_keras_model(self.model)
            converter.optimizations = [tf.lite.Optimize.DEFAULT]
            
            # Convert model
            tflite_model = converter.convert()
            
            # Save TFLite model
            with open(tflite_path, 'wb') as f:
                f.write(tflite_model)
                
            logger.info(f"Converted model to TensorFlow Lite format: {tflite_path}")
            return tflite_path
            
        except Exception as e:
            logger.error(f"Error converting to TFLite: {e}")
            raise ModelError(f"Failed to convert model to TFLite: {e}") from e
    
    def _load_tflite_model(self, model_path: Path) -> None:
        """Load TensorFlow Lite model"""
        if not TFLITE_AVAILABLE:
            raise ModelError("TensorFlow Lite is not available")
            
        try:
            self.interpreter = Interpreter(model_path=str(model_path))
            self.interpreter.allocate_tensors()
            
            self.input_details = self.interpreter.get_input_details()
            self.output_details = self.interpreter.get_output_details()
            
            logger.info(f"Loaded TensorFlow Lite model from {model_path}")
            
        except Exception as e:
            logger.error(f"Error loading TFLite model: {e}")
            raise ModelError(f"Failed to load TFLite model: {e}") from e
    
    def _predict_tflite(self, features: np.ndarray) -> np.ndarray:
        """Predict using TensorFlow Lite model"""
        if self.interpreter is None:
            raise ModelError("TFLite interpreter not initialized")
            
        try:
            # Set input tensor
            self.interpreter.set_tensor(self.input_details[0]['index'], features.astype(np.float32))
            
            # Run inference
            self.interpreter.invoke()
            
            # Get output tensor
            output = self.interpreter.get_tensor(self.output_details[0]['index'])
            
            return output
            
        except Exception as e:
            logger.error(f"Error in TFLite prediction: {e}")
            raise ModelError(f"TFLite prediction failed: {e}") from e

    def train(self, training_data: Any, config: Dict[str, Any]) -> None:
        features = training_data if isinstance(training_data, np.ndarray) else np.array(training_data)
        
        epochs = config.get('epochs') if config else None
        batch_size = config.get('batch_size', 32) if config else 32
        validation_split = config.get('validation_split', 0.2) if config else 0.2
        early_stopping = config.get('early_stopping', True) if config else True
        
        if features.ndim == 1:
            features = features.reshape(1, -1)
        
        # Validate feature dimension matches model input
        if features.shape[1] != self.input_dim:
            raise ModelError(
                f"Feature dimension mismatch: expected {self.input_dim}, got {features.shape[1]}"
            )
        
        if epochs is None:
            epochs = 50  # Default epochs
        
        try:
            logger.info(f"Training Autoencoder with {len(features)} samples")
            
            if self.model is None:
                self.model = self._build_model()
            
            callbacks = []
            if early_stopping:
                callbacks.append(
                    tf.keras.callbacks.EarlyStopping(
                        monitor='val_loss',
                        patience=10,
                        restore_best_weights=True,
                    )
                )
            
            self.model.fit(
                features,
                features,
                epochs=epochs,
                batch_size=batch_size,
                validation_split=validation_split,
                callbacks=callbacks,
                verbose=1,
            )
            
            train_reconstructions = self.model.predict(features, verbose=0)
            train_errors = np.mean((features - train_reconstructions) ** 2, axis=1)
            self.reconstruction_threshold = np.percentile(train_errors, 95)
            
            self.is_trained = True
            self.training_samples = len(features)
            
            logger.info(f"Autoencoder training completed")
        except Exception as e:
            logger.error(f"Error training Autoencoder: {e}")
            raise ModelError(f"Failed to train Autoencoder: {e}") from e

    def detect(self, features: Any) -> List[Any]:
        """Detect anomalies in features"""
        if not self.is_trained:
            logger.warning("Model not trained, returning default predictions")
            return [(0, 0.0)] * (len(features) if hasattr(features, '__len__') else 1)
        
        features_array = features if isinstance(features, np.ndarray) else np.array(features)
        
        if features_array.ndim == 1:
            features_array = features_array.reshape(1, -1)
        
        try:
            if self.use_tflite:
                if self.interpreter is None:
                    return [(0, 0.0)] * len(features_array)
                reconstructions = self._predict_tflite(features_array)
            else:
                if self.model is None:
                    return [(0, 0.0)] * len(features_array)
                reconstructions = self.model.predict(features_array, verbose=0)
                
            errors = np.mean((features_array - reconstructions) ** 2, axis=1)
            results = []
            
            for error in errors:
                if self.reconstruction_threshold > 0:
                    normalized_score = min(1.0, error / self.reconstruction_threshold)
                else:
                    normalized_score = 0.0
                
                label = 1 if error > self.reconstruction_threshold else 0
                results.append((label, float(normalized_score)))
            
            return results
        except Exception as e:
            logger.error(f"Error detecting with Autoencoder: {e}")
            return [(0, 0.0)] * len(features_array)

    def calculate_reconstruction_error(self, features: np.ndarray) -> float:
        if not self.is_trained:
            return 0.0
            
        if features.ndim == 1:
            features = features.reshape(1, -1)
        
        try:
            if self.use_tflite:
                if self.interpreter is None:
                    return 0.0
                reconstructions = self._predict_tflite(features)
            else:
                if self.model is None:
                    return 0.0
                reconstructions = self.model.predict(features, verbose=0)
                
            errors = np.mean((features - reconstructions) ** 2, axis=1)
            return float(np.mean(errors))
        except Exception as e:
            logger.error(f"Error calculating reconstruction error: {e}")
            return 0.0

    def predict(self, features: np.ndarray) -> Tuple[int, float]:
        if not self.is_trained:
            logger.warning("Model not trained, returning default prediction")
            return (0, 0.0)
        
        reconstruction_error = self.calculate_reconstruction_error(features)
        
        if self.reconstruction_threshold > 0:
            normalized_score = min(1.0, reconstruction_error / self.reconstruction_threshold)
        else:
            normalized_score = 0.0
        
        label = 1 if reconstruction_error > self.reconstruction_threshold else 0
        
        return (label, normalized_score)

    def save_model(self, path: Optional[Path] = None) -> None:
        if not self.is_trained or self.model is None:
            logger.warning("No trained model to save")
            return
        
        save_path = Path(path) if path else self.model_path
        
        try:
            save_path.parent.mkdir(parents=True, exist_ok=True)
            
            if self.use_tflite:
                # Convert and save as TFLite
                tflite_path = self._convert_to_tflite(save_path)
                final_path = tflite_path
            else:
                # Save as regular TensorFlow model
                self.model.save(str(save_path))
                final_path = save_path
            
            # Save metadata
            metadata_path = final_path.with_suffix('').with_suffix('_metadata.npz')
            np.savez(
                str(metadata_path),
                is_trained=self.is_trained,
                training_samples=self.training_samples,
                reconstruction_threshold=self.reconstruction_threshold,
                input_dim=self.input_dim,
                encoding_dim=self.encoding_dim,
                use_tflite=self.use_tflite,
            )
            
            logger.info(f"Saved Autoencoder model to {final_path}")
        except Exception as e:
            logger.error(f"Error saving model: {e}")
            raise ModelError(f"Failed to save model: {e}") from e

    def evaluate(self, test_data: Any) -> Dict[str, float]:
        """Evaluate detector performance"""
        if not self.is_trained or self.model is None:
            return {"accuracy": 0.0, "precision": 0.0, "recall": 0.0}
        
        try:
            if isinstance(test_data, np.ndarray):
                if test_data.ndim == 1:
                    test_data = test_data.reshape(1, -1)
                
                predictions = []
                for sample in test_data:
                    label, score = self.predict(sample)
                    predictions.append((label, score))
                
                # Basic metrics calculation
                if predictions:
                    anomaly_count = sum(1 for label, _ in predictions if label == 1)
                    avg_score = sum(score for _, score in predictions) / len(predictions)
                    
                    return {
                        "anomaly_rate": anomaly_count / len(predictions),
                        "avg_anomaly_score": avg_score,
                        "total_samples": len(predictions)
                    }
            
            return {"accuracy": 0.0, "precision": 0.0, "recall": 0.0}
        except Exception as e:
            logger.error(f"Error evaluating autoencoder: {e}")
            return {"accuracy": 0.0, "precision": 0.0, "recall": 0.0}
            
    def load_model(self, path: Optional[Path] = None) -> bool:
        load_path = Path(path) if path else self.model_path
        
        if not load_path.exists():
            logger.warning(f"Model file not found: {load_path}")
            return False
        
        try:
            # Load metadata first to determine model type
            metadata_path = load_path.with_suffix('').with_suffix('_metadata.npz')
            use_tflite_from_metadata = self.use_tflite
            
            if metadata_path.exists():
                metadata = np.load(str(metadata_path), allow_pickle=True)
                self.is_trained = bool(metadata['is_trained'])
                self.training_samples = int(metadata['training_samples'])
                self.reconstruction_threshold = float(metadata['reconstruction_threshold'])
                self.input_dim = int(metadata['input_dim'])
                self.encoding_dim = int(metadata['encoding_dim'])
                
                # Check if metadata specifies TFLite usage
                if 'use_tflite' in metadata:
                    use_tflite_from_metadata = bool(metadata['use_tflite'])
            
            # Load model based on type
            if load_path.suffix == '.tflite' or use_tflite_from_metadata:
                self._load_tflite_model(load_path)
                self.use_tflite = True
            else:
                if not TENSORFLOW_AVAILABLE:
                    raise ModelError("TensorFlow is required to load .h5 models")
                self.model = tf.keras.models.load_model(str(load_path))
                self.use_tflite = False
            
            logger.info(f"Loaded Autoencoder model from {load_path}")
            return True
        except Exception as e:
            logger.error(f"Error loading model: {e}")
            return False
