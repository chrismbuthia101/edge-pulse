# Autoencoder Detector
# Secondary anomaly detector using autoencoder reconstruction error.

import logging
from typing import Tuple, Optional
from pathlib import Path
import numpy as np
import tensorflow as tf

from edgepulse_win.utils.error_handler import ModelError
from edgepulse_win.utils.paths import PathManager
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
    ):
        self.input_dim = input_dim
        self.encoding_dim = encoding_dim
        self.hidden_layers = hidden_layers or [64, 32, 16]
        self.learning_rate = learning_rate
        self.path_manager = path_manager or PathManager()
        
        if model_path:
            self.model_path = Path(model_path)
        else:
            # Autoencoder uses .h5 extension
            base_path = self.path_manager.get_model_path("autoencoder", device_id)
            self.model_path = base_path.with_suffix('.h5')
        
        self.model: Optional[tf.keras.Model] = None
        self.is_trained = False
        self.training_samples = 0
        self.reconstruction_threshold = 0.1

    def _build_model(self) -> tf.keras.Model:
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

    def train(
        self,
        features: np.ndarray,
        epochs: Optional[int] = None,
        batch_size: int = 32,
        validation_split: float = 0.2,
        early_stopping: bool = True,
    ) -> None:
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

    def calculate_reconstruction_error(self, features: np.ndarray) -> float:
        if not self.is_trained or self.model is None:
            return 0.0
        
        if features.ndim == 1:
            features = features.reshape(1, -1)
        
        try:
            reconstructions = self.model.predict(features, verbose=0)
            errors = np.mean((features - reconstructions) ** 2, axis=1)
            return float(np.mean(errors))
        except Exception as e:
            logger.error(f"Error calculating reconstruction error: {e}")
            return 0.0

    def predict(self, features: np.ndarray) -> Tuple[int, float]:
        if not self.is_trained or self.model is None:
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
            self.model.save(str(save_path))
            
            metadata_path = save_path.with_suffix('').with_suffix('_metadata.npz')
            np.savez(
                str(metadata_path),
                is_trained=self.is_trained,
                training_samples=self.training_samples,
                reconstruction_threshold=self.reconstruction_threshold,
                input_dim=self.input_dim,
                encoding_dim=self.encoding_dim,
            )
            
            logger.info(f"Saved Autoencoder model to {save_path}")
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
            self.model = tf.keras.models.load_model(str(load_path))
            
            metadata_path = load_path.with_suffix('').with_suffix('_metadata.npz')
            if metadata_path.exists():
                metadata = np.load(str(metadata_path), allow_pickle=True)
                self.is_trained = bool(metadata['is_trained'])
                self.training_samples = int(metadata['training_samples'])
                self.reconstruction_threshold = float(metadata['reconstruction_threshold'])
                self.input_dim = int(metadata['input_dim'])
                self.encoding_dim = int(metadata['encoding_dim'])
            else:
                self.is_trained = True
            
            logger.info(f"Loaded Autoencoder model from {load_path}")
            return True
        except Exception as e:
            logger.error(f"Error loading model: {e}")
            return False
