"""
Isolation Forest Detector

Primary unsupervised anomaly detector using Isolation Forest algorithm.
"""

import logging
import joblib
from typing import Tuple, Optional
from pathlib import Path
import numpy as np
from sklearn.ensemble import IsolationForest

from edgepulse_win.exceptions import ModelError
from edgepulse_win.utils.paths import PathManager

logger = logging.getLogger(__name__)


class IsolationForestDetector:
    """
    Isolation Forest-based anomaly detector.
    
    Lightweight, edge-friendly unsupervised learning algorithm.
    """

    def __init__(
        self,
        n_estimators: int = 100,
        contamination: str = 'auto',
        max_samples: str = 'auto',
        random_state: Optional[int] = None,
        model_path: Optional[Path] = None,
        device_id: Optional[str] = None,
        path_manager: Optional[PathManager] = None,
    ):
        """
        Initialize the Isolation Forest detector.
        
        Args:
            n_estimators: Number of trees in the forest (default: 100)
            contamination: Expected proportion of anomalies (default: 'auto')
            max_samples: Number of samples to draw for each tree (default: 'auto')
            random_state: Random seed for reproducibility
            model_path: Path to save/load model (uses path_manager if None)
            device_id: Device ID for device-specific models
            path_manager: Path manager instance (creates new if None)
        """
        self.n_estimators = n_estimators
        self.contamination = contamination
        self.max_samples = max_samples
        self.random_state = random_state
        self.path_manager = path_manager or PathManager()
        
        if model_path:
            self.model_path = Path(model_path)
        else:
            self.model_path = self.path_manager.get_model_path("isolation_forest", device_id)
        
        self.model: Optional[IsolationForest] = None
        self.is_trained = False
        self.training_samples = 0

    def train(self, features: np.ndarray) -> None:
        """
        Train the Isolation Forest model on normal data.
        
        Args:
            features: Feature array (2D: n_samples, n_features)
            
        Raises:
            ModelError: If training fails or feature dimension mismatch
        """
        if features.ndim == 1:
            features = features.reshape(1, -1)
        
        if features.shape[0] < 1:
            raise ModelError("Cannot train with empty feature array")
        
        try:
            logger.info(f"Training Isolation Forest with {len(features)} samples")
            
            self.model = IsolationForest(
                n_estimators=self.n_estimators,
                contamination=self.contamination,
                max_samples=self.max_samples,
                random_state=self.random_state,
                n_jobs=-1,
            )
            
            self.model.fit(features)
            self.is_trained = True
            self.training_samples = len(features)
            
            logger.info("Isolation Forest training completed")
        except Exception as e:
            logger.error(f"Error training Isolation Forest: {e}")
            raise ModelError(f"Failed to train Isolation Forest: {e}") from e

    def predict(self, features: np.ndarray) -> Tuple[int, float]:
        """
        Predict anomaly label and score.
        
        Args:
            features: Feature array (can be 1D or 2D)
            
        Returns:
            Tuple of (anomaly_label, anomaly_score)
            - anomaly_label: 0 (normal) or 1 (anomaly)
            - anomaly_score: -1 to 1 (higher = more anomalous)
        """
        if not self.is_trained or self.model is None:
            logger.warning("Model not trained, returning default prediction")
            return (0, 0.0)
        
        if features.ndim == 1:
            features = features.reshape(1, -1)
        
        try:
            scores = self.model.score_samples(features)
            normalized_scores = (1 - scores) / 2
            predictions = self.model.predict(features)
            labels = (predictions == -1).astype(int)
            
            if len(labels) == 1:
                return (int(labels[0]), float(normalized_scores[0]))
            
            return (int(np.mean(labels)), float(np.mean(normalized_scores)))
            
        except Exception as e:
            logger.error(f"Error predicting with Isolation Forest: {e}")
            return (0, 0.0)

    def update_model(self, new_features: np.ndarray) -> None:
        """
        Incrementally update the model with new data.
        
        Args:
            new_features: New feature array
        """
        if not self.is_trained or self.model is None:
            self.train(new_features)
            return
        
        logger.warning("Incremental update not fully supported, retraining recommended")
        self.train(new_features)

    def save_model(self, path: Optional[Path] = None) -> None:
        """
        Save the trained model to disk.
        
        Args:
            path: Path to save (default: self.model_path)
        """
        if not self.is_trained or self.model is None:
            logger.warning("No trained model to save")
            return
        
        save_path = Path(path) if path else self.model_path
        
        try:
            save_path.parent.mkdir(parents=True, exist_ok=True)
            
            model_data = {
                "model": self.model,
                "is_trained": self.is_trained,
                "training_samples": self.training_samples,
                "n_estimators": self.n_estimators,
                "contamination": self.contamination,
            }
            
            joblib.dump(model_data, save_path)
            logger.info(f"Saved Isolation Forest model to {save_path}")
        except Exception as e:
            logger.error(f"Error saving model: {e}")
            raise ModelError(f"Failed to save model: {e}") from e

    def load_model(self, path: Optional[Path] = None) -> bool:
        """
        Load a trained model from disk.
        
        Args:
            path: Path to load (default: self.model_path)
            
        Returns:
            True if loaded successfully, False otherwise
        """
        load_path = Path(path) if path else self.model_path
        
        if not load_path.exists():
            logger.warning(f"Model file not found: {load_path}")
            return False
        
        try:
            model_data = joblib.load(load_path)
            
            self.model = model_data.get("model")
            self.is_trained = model_data.get("is_trained", False)
            self.training_samples = model_data.get("training_samples", 0)
            self.n_estimators = model_data.get("n_estimators", self.n_estimators)
            self.contamination = model_data.get("contamination", self.contamination)
            
            logger.info(f"Loaded Isolation Forest model from {load_path}")
            return True
        except Exception as e:
            logger.error(f"Error loading model: {e}")
            return False
