"""
Autoencoder Detector

Secondary anomaly detector using autoencoder reconstruction error.
"""

import logging
import os
from typing import Tuple, Optional
import numpy as np
import tensorflow as tf
from pathlib import Path

logger = logging.getLogger(__name__)


class AutoencoderDetector:
    """
    Autoencoder-based anomaly detector.
    
    Learns to reconstruct normal behavior; high reconstruction error = anomaly.
    """

    def __init__(
        self,
        input_dim: int = 50,
        encoding_dim: int = 8,
        hidden_layers: list = None,
        learning_rate: float = 0.001,
        model_path: Optional[str] = None,
    ):
        """
        Initialize the autoencoder detector.
        
        Args:
            input_dim: Input feature dimension (default: 50)
            encoding_dim: Latent space dimension (default: 8)
            hidden_layers: List of hidden layer sizes (default: [64, 32, 16])
            learning_rate: Learning rate for optimizer (default: 0.001)
            model_path: Path to save/load model (default: models/autoencoder.h5)
        """
        self.input_dim = input_dim
        self.encoding_dim = encoding_dim
        self.hidden_layers = hidden_layers or [64, 32, 16]
        self.learning_rate = learning_rate
        
        if model_path:
            self.model_path = model_path
        else:
            base_dir = Path("models")
            base_dir.mkdir(parents=True, exist_ok=True)
            self.model_path = str(base_dir / "autoencoder.h5")
        
        self.model: Optional[tf.keras.Model] = None
        self.is_trained = False
        self.training_samples = 0
        self.reconstruction_threshold = 0.1

    def _build_model(self) -> tf.keras.Model:
        """
        Build the autoencoder architecture.
        
        Returns:
            Compiled Keras model
        """
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
        epochs: int = 50,
        batch_size: int = 32,
        validation_split: float = 0.2,
        early_stopping: bool = True,
    ) -> None:
        """
        Train the autoencoder on normal data.
        
        Args:
            features: Feature array (2D: n_samples, n_features)
            epochs: Number of training epochs (default: 50)
            batch_size: Batch size (default: 32)
            validation_split: Validation split ratio (default: 0.2)
            early_stopping: Use early stopping (default: True)
        """
        if features.ndim == 1:
            features = features.reshape(1, -1)
        
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
            raise

    def calculate_reconstruction_error(self, features: np.ndarray) -> float:
        """
        Calculate reconstruction error for features.
        
        Args:
            features: Feature array (can be 1D or 2D)
            
        Returns:
            Mean squared reconstruction error
        """
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
        """
        Predict anomaly label and score based on reconstruction error.
        
        Args:
            features: Feature array (can be 1D or 2D)
            
        Returns:
            Tuple of (anomaly_label, anomaly_score)
        """
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

    def save_model(self, path: Optional[str] = None) -> None:
        """
        Save the trained model to disk.
        
        Args:
            path: Path to save (default: self.model_path)
        """
        if not self.is_trained or self.model is None:
            logger.warning("No trained model to save")
            return
        
        save_path = path or self.model_path
        
        try:
            os.makedirs(os.path.dirname(save_path), exist_ok=True)
            self.model.save(save_path)
            
            metadata_path = save_path.replace('.h5', '_metadata.npz')
            np.savez(
                metadata_path,
                is_trained=self.is_trained,
                training_samples=self.training_samples,
                reconstruction_threshold=self.reconstruction_threshold,
                input_dim=self.input_dim,
                encoding_dim=self.encoding_dim,
            )
            
            logger.info(f"Saved Autoencoder model to {save_path}")
        except Exception as e:
            logger.error(f"Error saving model: {e}")
            raise

    def load_model(self, path: Optional[str] = None) -> bool:
        """
        Load a trained model from disk.
        
        Args:
            path: Path to load (default: self.model_path)
            
        Returns:
            True if loaded successfully, False otherwise
        """
        load_path = path or self.model_path
        
        if not os.path.exists(load_path):
            logger.warning(f"Model file not found: {load_path}")
            return False
        
        try:
            self.model = tf.keras.models.load_model(load_path)
            
            metadata_path = load_path.replace('.h5', '_metadata.npz')
            if os.path.exists(metadata_path):
                metadata = np.load(metadata_path, allow_pickle=True)
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
