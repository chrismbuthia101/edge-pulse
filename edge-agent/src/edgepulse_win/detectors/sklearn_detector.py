"""
Scikit-learn Anomaly Detector Implementation

Implements Isolation Forest as the primary detection model
with SHAP TreeExplainer integration for explainable AI.
"""

import joblib
import numpy as np
import hashlib
from typing import Dict, Any, Optional
from pathlib import Path

try:
    import sklearn
    from sklearn.ensemble import IsolationForest
    from sklearn.preprocessing import StandardScaler
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False

try:
    import shap
    SHAP_AVAILABLE = True
except ImportError:
    SHAP_AVAILABLE = False

from edgepulse_win.detectors.base import BaseDetector, DetectionResult, ModelMetadata
from edgepulse_win.utils.log_handler import get_logger

logger = get_logger(__name__)


class SklearnAnomalyDetector(BaseDetector):
    """Scikit-learn Isolation Forest anomaly detector"""
    
    def __init__(self, model_id: str):
        super().__init__(model_id)
        self.model_type = "isolation_forest"
        
        # Model components
        self.model: Optional[IsolationForest] = None
        self.scaler: Optional[StandardScaler] = None
        self.explainer: Optional[shap.TreeExplainer] = None
        
        # Model metadata
        self.expected_model_hash: Optional[str] = None
        self.feature_names: Optional[list] = None
        self.is_trained = False
        
        # Model parameters
        self.n_estimators = 100
        self.contamination = 0.1
        self.random_state = 42
        
        logger.info(f"SklearnAnomalyDetector initialized: {model_id}")
    
    def load_model_with_integrity(self, model_path: str) -> bool:
        """Load model with SHA-256 integrity verification"""
        try:
            if not SKLEARN_AVAILABLE:
                logger.error("scikit-learn not available")
                return False
            
            model_path = Path(model_path)
            if not model_path.exists():
                logger.error(f"Model file not found: {model_path}")
                return False
            
            # Calculate file hash
            file_hash = self._calculate_file_hash(model_path)
            logger.info(f"Model file hash: {file_hash[:16]}...")
            
            # Load model
            model_data = joblib.load(model_path)
            
            # Verify model structure
            if not isinstance(model_data, dict) or 'model' not in model_data:
                logger.error("Invalid model file structure")
                return False
            
            self.model = model_data['model']
            self.scaler = model_data.get('scaler')
            self.feature_names = model_data.get('feature_names', [])
            self.expected_model_hash = model_data.get('hash', file_hash)
            
            # Verify integrity
            if file_hash != self.expected_model_hash:
                logger.error("Model integrity check failed - hash mismatch")
                return False
            
            # Initialize SHAP explainer
            if SHAP_AVAILABLE and self.model:
                try:
                    # Use background data for explainer
                    background_data = model_data.get('background_data')
                    if background_data is not None:
                        self.explainer = shap.TreeExplainer(
                            self.model, 
                            data=background_data,
                            feature_names=self.feature_names
                        )
                    else:
                        self.explainer = shap.TreeExplainer(self.model)
                    
                    logger.info("SHAP explainer initialized")
                except Exception as e:
                    logger.warning(f"Failed to initialize SHAP explainer: {e}")
            
            self.is_trained = True
            self._model_metadata = ModelMetadata(
                model_type=self.model_type,
                model_path=str(model_path),
                model_hash=self.expected_model_hash,
                feature_count=len(self.feature_names) if self.feature_names else 0,
                is_trained=True,
                training_samples=model_data.get('training_samples', 0),
                model_version=model_data.get('version', '1.0')
            )
            
            logger.info(f"Model loaded successfully: {model_path}")
            return True
            
        except Exception as e:
            logger.error(f"Error loading model: {e}")
            return False
    
    def save_model(self, model_path: str) -> bool:
        """Save model with hash verification"""
        try:
            if not self.model or not SKLEARN_AVAILABLE:
                logger.error("No model to save or scikit-learn not available")
                return False
            
            model_path = Path(model_path)
            model_path.parent.mkdir(parents=True, exist_ok=True)
            
            # Prepare model data
            model_data = {
                'model': self.model,
                'scaler': self.scaler,
                'feature_names': self.feature_names,
                'hash': None,  # Will be set after saving
                'version': '1.0',
                'training_samples': getattr(self.model, 'n_samples_', 0),
                'background_data': None  # Could be set during training
            }
            
            # Save model
            joblib.dump(model_data, model_path)
            
            # Calculate and store hash
            file_hash = self._calculate_file_hash(model_path)
            model_data['hash'] = file_hash
            
            # Save again with hash
            joblib.dump(model_data, model_path)
            
            self.expected_model_hash = file_hash
            logger.info(f"Model saved with hash: {file_hash[:16]}...")
            return True
            
        except Exception as e:
            logger.error(f"Error saving model: {e}")
            return False
    
    def train(self, training_data: np.ndarray, feature_names: Optional[list] = None) -> bool:
        """Train the Isolation Forest model"""
        try:
            if not SKLEARN_AVAILABLE:
                logger.error("scikit-learn not available")
                return False
            
            logger.info(f"Training model with {training_data.shape[0]} samples, {training_data.shape[1]} features")
            
            # Store feature names
            self.feature_names = feature_names or [f"feature_{i}" for i in range(training_data.shape[1])]
            
            # Scale features
            self.scaler = StandardScaler()
            scaled_data = self.scaler.fit_transform(training_data)
            
            # Train model
            self.model = IsolationForest(
                n_estimators=self.n_estimators,
                contamination=self.contamination,
                random_state=self.random_state,
                n_jobs=-1  # Use all cores
            )
            
            self.model.fit(scaled_data)
            self.is_trained = True
            
            # Initialize SHAP explainer with training data
            if SHAP_AVAILABLE:
                try:
                    # Use subset of training data as background
                    background_size = min(100, len(scaled_data))
                    background_data = scaled_data[:background_size]
                    
                    self.explainer = shap.TreeExplainer(
                        self.model,
                        data=background_data,
                        feature_names=self.feature_names
                    )
                    
                    logger.info("SHAP explainer initialized with training data")
                except Exception as e:
                    logger.warning(f"Failed to initialize SHAP explainer: {e}")
            
            # Update metadata
            self._model_metadata = ModelMetadata(
                model_type=self.model_type,
                model_path=None,
                model_hash=None,
                feature_count=training_data.shape[1],
                is_trained=True,
                training_samples=training_data.shape[0],
                model_version='1.0'
            )
            
            logger.info("Model training completed successfully")
            return True
            
        except Exception as e:
            logger.error(f"Error training model: {e}")
            return False
    
    def detect(self, features: np.ndarray) -> DetectionResult:
        """Perform anomaly detection"""
        try:
            if not self.is_trained or not self.model:
                raise RuntimeError("Model not trained or loaded")
            
            start_time = time.perf_counter()
            
            # Ensure features are 2D
            if features.ndim == 1:
                features = features.reshape(1, -1)
            
            # Scale features
            if self.scaler:
                scaled_features = self.scaler.transform(features)
            else:
                scaled_features = features
            
            # Get anomaly scores (lower = more anomalous)
            raw_scores = self.model.decision_function(scaled_features)
            
            # Convert to [0, 1] range where higher = more anomalous
            anomaly_scores = -raw_scores
            anomaly_scores = (anomaly_scores - anomaly_scores.min()) / (anomaly_scores.max() - anomaly_scores.min())
            
            # Apply detection threshold
            predictions = (anomaly_scores > self.detection_threshold).astype(int)
            
            # Calculate inference latency
            inference_latency_ms = int((time.perf_counter() - start_time) * 1000)
            
            # Get SHAP explanations if available
            explanations = None
            if self.explainer and SHAP_AVAILABLE:
                try:
                    shap_values = self.explainer.shap_values(scaled_features)
                    explanations = {
                        'shap_values': shap_values.tolist() if hasattr(shap_values, 'tolist') else shap_values,
                        'feature_names': self.feature_names,
                        'base_values': self.explainer.expected_value.tolist() if hasattr(self.explainer.expected_value, 'tolist') else self.explainer.expected_value
                    }
                except Exception as e:
                    logger.warning(f"Failed to generate SHAP explanations: {e}")
            
            # Create detection result
            result = DetectionResult(
                is_alert_triggered=bool(predictions[0]),
                anomaly_score=float(anomaly_scores[0]),
                detection_threshold_applied=self.detection_threshold,
                inference_latency_ms=inference_latency_ms,
                model_id=self.model_id,
                model_type=self.model_type,
                timestamp=time.time(),
                explanations=explanations
            )
            
            # Update metrics
            self._update_metrics(anomaly_scores[0], predictions[0], inference_latency_ms)
            
            return result
            
        except Exception as e:
            logger.error(f"Error in anomaly detection: {e}")
            # Return safe default
            return DetectionResult(
                is_alert_triggered=False,
                anomaly_score=0.0,
                detection_threshold_applied=self.detection_threshold,
                inference_latency_ms=0,
                model_id=self.model_id,
                model_type=self.model_type,
                timestamp=time.time()
            )
    
    def detect_drift(self, new_data: np.ndarray, threshold: float = 0.1) -> bool:
        """Detect model drift using statistical methods"""
        try:
            if not self.is_trained or not self.model:
                logger.warning("Cannot detect drift - model not trained")
                return False
            
            if new_data.shape[0] < 100:
                logger.warning("Insufficient data for drift detection")
                return False
            
            # Scale new data
            if self.scaler:
                scaled_new_data = self.scaler.transform(new_data)
            else:
                scaled_new_data = new_data
            
            # Get anomaly scores for new data
            new_scores = -self.model.decision_function(scaled_new_data)
            
            # Compare with expected distribution
            expected_mean = 0  # Isolation Forest should have mean around 0
            expected_std = 0.5  # Approximate expected standard deviation
            
            new_mean = np.mean(new_scores)
            new_std = np.std(new_scores)
            
            # Calculate drift metrics
            mean_shift = abs(new_mean - expected_mean)
            std_change = abs(new_std - expected_std) / expected_std if expected_std > 0 else 0
            
            # Detect drift if either metric exceeds threshold
            drift_detected = mean_shift > threshold or std_change > threshold
            
            if drift_detected:
                logger.warning(f"Model drift detected - mean shift: {mean_shift:.3f}, std change: {std_change:.3f}")
            else:
                logger.debug(f"No drift detected - mean shift: {mean_shift:.3f}, std change: {std_change:.3f}")
            
            return drift_detected
            
        except Exception as e:
            logger.error(f"Error detecting drift: {e}")
            return False
    
    def get_feature_importance(self) -> Optional[Dict[str, float]]:
        """Get feature importance from trained model"""
        try:
            if not self.model or not hasattr(self.model, 'feature_importances_'):
                logger.warning("Model does not support feature importance")
                return None
            
            if not self.feature_names:
                logger.warning("No feature names available")
                return None
            
            importance_dict = {}
            for i, importance in enumerate(self.model.feature_importances_):
                if i < len(self.feature_names):
                    importance_dict[self.feature_names[i]] = float(importance)
            
            return importance_dict
            
        except Exception as e:
            logger.error(f"Error getting feature importance: {e}")
            return None
    
    def _calculate_file_hash(self, file_path: Path) -> str:
        """Calculate SHA-256 hash of model file"""
        try:
            hash_sha256 = hashlib.sha256()
            with open(file_path, 'rb') as f:
                for chunk in iter(lambda: f.read(4096), b""):
                    hash_sha256.update(chunk)
            return hash_sha256.hexdigest()
        except Exception as e:
            logger.error(f"Error calculating file hash: {e}")
            return ""
    
    def get_model_info(self) -> Dict[str, Any]:
        """Get detailed model information"""
        info = {
            'model_id': self.model_id,
            'model_type': self.model_type,
            'is_trained': self.is_trained,
            'feature_count': len(self.feature_names) if self.feature_names else 0,
            'feature_names': self.feature_names or [],
            'detection_threshold': self.detection_threshold,
            'sklearn_available': SKLEARN_AVAILABLE,
            'shap_available': SHAP_AVAILABLE,
            'explainer_available': self.explainer is not None
        }
        
        if self._model_metadata:
            info.update(self._model_metadata.__dict__)
        
        if self.model:
            info.update({
                'n_estimators': getattr(self.model, 'n_estimators', None),
                'contamination': getattr(self.model, 'contamination', None),
                'max_samples': getattr(self.model, 'max_samples', None)
            })
        
        return info
