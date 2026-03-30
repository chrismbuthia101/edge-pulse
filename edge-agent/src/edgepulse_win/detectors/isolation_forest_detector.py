# Isolation Forest Detector
# Primary unsupervised anomaly detector using Isolation Forest algorithm.

from edgepulse_win.utils.log_handler import get_logger
import joblib
import time
import hashlib
from typing import Tuple, Optional, Any, Dict, List
from pathlib import Path
import numpy as np
from sklearn.ensemble import IsolationForest

from edgepulse_win.utils.error_handler import ModelError
from edgepulse_win.utils.path_manager import PathManager
from edgepulse_win.detectors.base import BaseDetector

logger = get_logger(__name__)


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
        model_version: str = "1.0",
    ):
        self.n_estimators = n_estimators
        self.contamination = contamination
        self.max_samples = max_samples
        self.random_state = random_state
        self.model_version = model_version
        self.path_manager = path_manager or PathManager()
        
        if model_path:
            self.model_path = Path(model_path)
        else:
            self.model_path = self.path_manager.get_model_path("isolation_forest", device_id)
        
        self.model: Optional[IsolationForest] = None
        self.is_trained = False
        self.training_samples = 0
        self.model_hash: Optional[str] = None
        self.training_timestamp: Optional[str] = None

    def train(self, training_data: Any, config: Dict[str, Any]) -> None:
        features = training_data if isinstance(training_data, np.ndarray) else np.array(training_data)
        
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

    def _detect_internal(self, features: Any) -> float:
        """Internal detection method returning anomaly score for a single feature vector"""
        if not self.is_trained or self.model is None:
            logger.warning("Model not trained, returning default score")
            return 0.0
        
        features_array = features if isinstance(features, np.ndarray) else np.array(features)
        
        if features_array.ndim == 1:
            features_array = features_array.reshape(1, -1)
        
        try:
            # Get anomaly score (normalized)
            scores = self.model.score_samples(features_array)
            normalized_score = (1 - scores[0]) / 2
            return float(normalized_score)
            
        except Exception as e:
            logger.error(f"Error in _detect_internal: {e}")
            return 0.0

    def detect(self, features: Any) -> List[Any]:
        """Detect anomalies in features with latency measurement"""
        if not self.is_trained or self.model is None:
            logger.warning("Model not trained, returning default predictions")
            return [(0, 0.0)] * (len(features) if hasattr(features, '__len__') else 1)
        
        features_array = features if isinstance(features, np.ndarray) else np.array(features)
        
        if features_array.ndim == 1:
            features_array = features_array.reshape(1, -1)
        
        try:
            # Measure inference latency
            start_time = time.perf_counter()
            
            scores = self.model.score_samples(features_array)
            normalized_scores = (1 - scores) / 2
            predictions = self.model.predict(features_array)
            labels = (predictions == -1).astype(int)
            
            end_time = time.perf_counter()
            inference_latency_ms = (end_time - start_time) * 1000
            
            logger.debug(f"Inference latency: {inference_latency_ms:.2f}ms for {len(features_array)} samples")
            
            results = []
            for i in range(len(labels)):
                results.append((int(labels[i]), float(normalized_scores[i])))
            
            return results
            
        except Exception as e:
            logger.error(f"Error detecting with Isolation Forest: {e}")
            return [(0, 0.0)] * len(features_array)

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
            return True
            
        except Exception as e:
            logger.error(f"Error loading model: {e}")
            return False

    def verify_model_integrity(self) -> bool:
        """Verify model integrity using hash comparison"""
        if not self.is_trained or self.model is None:
            logger.warning("Cannot verify integrity of untrained model")
            return False
        
        try:
            # Create hash of model parameters and state
            model_state = {
                "n_estimators": self.model.n_estimators,
                "contamination": self.model.contamination,
                "max_samples": self.model.max_samples,
                "random_state": self.model.random_state,
                "training_samples": self.training_samples,
                "model_version": self.model_version
            }
            
            model_json = str(sorted(model_state.items()))
            current_hash = hashlib.sha256(model_json.encode()).hexdigest()
            
            # Check if hash matches stored hash
            if self.model_hash is None:
                # First time verification - store hash
                self.model_hash = current_hash
                logger.info("Model integrity verified - hash stored")
                return True
            elif current_hash != self.model_hash:
                logger.error("Model integrity check failed - hash mismatch")
                return False
            else:
                logger.debug("Model integrity verified - hash matches")
                return True
                
        except Exception as e:
            logger.error(f"Error verifying model integrity: {e}")
            return False

    def get_model_info(self) -> Dict[str, Any]:
        """Get comprehensive model information"""
        return {
            "model_type": "IsolationForest",
            "model_version": self.model_version,
            "is_trained": self.is_trained,
            "training_samples": self.training_samples,
            "training_timestamp": self.training_timestamp,
            "model_hash": self.model_hash,
            "parameters": {
                "n_estimators": self.n_estimators,
                "contamination": self.contamination,
                "max_samples": self.max_samples,
                "random_state": self.random_state
            },
            "model_path": str(self.model_path),
            "feature_dimension": None  # Will be set during training
        }

    def detect_with_drift_check(self, features: Any, baseline_features: Optional[np.ndarray] = None) -> Tuple[List[Any], Dict[str, Any]]:
        """Detect anomalies with drift detection"""
        # Standard detection
        results = self.detect(features)
        
        drift_info = {
            "drift_detected": False,
            "drift_score": 0.0,
            "baseline_comparison": False
        }
        
        # Check for drift if baseline provided
        if baseline_features is not None and self.is_trained:
            try:
                # Compare current feature distribution with baseline
                current_features = features if isinstance(features, np.ndarray) else np.array(features)
                if current_features.ndim == 1:
                    current_features = current_features.reshape(1, -1)
                
                # Simple drift detection using score distribution
                baseline_scores = self.model.score_samples(baseline_features)
                current_scores = self.model.score_samples(current_features)
                
                # Calculate drift score (difference in score distributions)
                baseline_mean = np.mean(baseline_scores)
                current_mean = np.mean(current_scores)
                drift_score = abs(baseline_mean - current_mean)
                
                drift_info["drift_score"] = float(drift_score)
                drift_info["drift_detected"] = drift_score > 0.1  # Threshold for drift detection
                drift_info["baseline_comparison"] = True
                drift_info["baseline_mean"] = float(baseline_mean)
                drift_info["current_mean"] = float(current_mean)
                
                if drift_info["drift_detected"]:
                    logger.warning(f"Model drift detected: score = {drift_score:.3f}")
                
            except Exception as e:
                logger.error(f"Error during drift detection: {e}")
        
        return results, drift_info
