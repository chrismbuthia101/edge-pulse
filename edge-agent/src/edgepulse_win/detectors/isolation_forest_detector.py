# Isolation Forest Detector
# Primary unsupervised anomaly detector using Isolation Forest algorithm.

import logging
import joblib
from typing import Tuple, Optional
from pathlib import Path
import numpy as np
from sklearn.ensemble import IsolationForest

from edgepulse_win.utils.error_handler import ModelError
from edgepulse_win.utils.paths import PathManager
from edgepulse_win.detectors.base import BaseDetector

logger = logging.getLogger(__name__)


class IsolationForestDetector(BaseDetector):

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
        if not self.is_trained or self.model is None:
            self.train(new_features)
            return
        
        logger.warning("Incremental update not fully supported, retraining recommended")
        self.train(new_features)

    def save_model(self, path: Optional[Path] = None) -> None:
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

    def evaluate(self, test_data: Any) -> Dict[str, float]:
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
            logger.error(f"Error evaluating isolation forest: {e}")
            return {"accuracy": 0.0, "precision": 0.0, "recall": 0.0}
    def load_model(self, path: Optional[Path] = None) -> bool:
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
