"""
Ensemble Anomaly Detector

Manages multiple detection models and provides unified interface.
Supports switching between scikit-learn Isolation Forest and TensorFlow Lite Autoencoder.
"""

import time
import numpy as np
from typing import Dict, Any, Optional

from edgepulse_win.detectors.base import BaseDetector, DetectionResult
from edgepulse_win.detectors.sklearn_detector import SklearnAnomalyDetector
from edgepulse_win.detectors.tflite_detector import TFLiteAnomalyDetector
from edgepulse_win.utils.log_handler import get_logger

logger = get_logger(__name__)


class EnsembleDetector(BaseDetector):
    """Ensemble detector that manages multiple models"""
    
    def __init__(self, model_id: str, model_type: str = "isolation_forest"):
        super().__init__(model_id)
        self.model_type = model_type
        self.current_detector: Optional[BaseDetector] = None
        
        # Initialize specified model
        if model_type == "isolation_forest":
            self.current_detector = SklearnAnomalyDetector(model_id)
        elif model_type == "autoencoder":
            self.current_detector = TFLiteAnomalyDetector(model_id)
        else:
            logger.error(f"Unknown model type: {model_type}")
            raise ValueError(f"Unknown model type: {model_type}")
        
        logger.info(f"EnsembleDetector initialized with {model_type}: {model_id}")
    
    def load_model_with_integrity(self, model_path: str) -> bool:
        """Load model with integrity verification"""
        if not self.current_detector:
            logger.error("No detector available")
            return False
        
        return self.current_detector.load_model_with_integrity(model_path)
    
    def save_model(self, model_path: str) -> bool:
        """Save model"""
        if not self.current_detector:
            logger.error("No detector available")
            return False
        
        return self.current_detector.save_model(model_path)
    
    def train(self, training_data: np.ndarray, feature_names: Optional[list] = None) -> bool:
        """Train current model"""
        if not self.current_detector:
            logger.error("No detector available")
            return False
        
        return self.current_detector.train(training_data, feature_names)
    
    def detect(self, features: np.ndarray) -> DetectionResult:
        """Perform anomaly detection"""
        if not self.current_detector:
            logger.error("No detector available")
            return DetectionResult(
                is_alert_triggered=False,
                anomaly_score=0.0,
                detection_threshold_applied=self.detection_threshold,
                inference_latency_ms=0,
                model_id=self.model_id,
                model_type=self.model_type,
                timestamp=time.time()
            )
        
        return self.current_detector.detect(features)
    
    def detect_drift(self, new_data: np.ndarray, threshold: float = 0.1) -> bool:
        """Detect model drift"""
        if not self.current_detector:
            logger.error("No detector available")
            return False
        
        return self.current_detector.detect_drift(new_data, threshold)
    
    def switch_model(self, new_model_type: str) -> bool:
        """Switch to a different model type"""
        if new_model_type == self.model_type:
            logger.info(f"Already using {new_model_type}")
            return True
        
        logger.info(f"Switching from {self.model_type} to {new_model_type}")
        
        # Save current model state if needed
        old_detector = self.current_detector
        
        # Initialize new detector
        try:
            if new_model_type == "isolation_forest":
                new_detector = SklearnAnomalyDetector(self.model_id)
            elif new_model_type == "autoencoder":
                new_detector = TFLiteAnomalyDetector(self.model_id)
            else:
                logger.error(f"Unknown model type: {new_model_type}")
                return False
            
            # Copy detection threshold
            new_detector.set_detection_threshold(self.detection_threshold)
            
            # Switch to new detector
            self.current_detector = new_detector
            self.model_type = new_model_type
            
            logger.info(f"Successfully switched to {new_model_type}")
            return True
            
        except Exception as e:
            logger.error(f"Error switching model: {e}")
            # Revert to old detector
            self.current_detector = old_detector
            return False
    
    def get_available_models(self) -> Dict[str, Dict[str, Any]]:
        """Get information about available models"""
        models = {}
        
        # Check scikit-learn availability
        try:
            import sklearn
            models['isolation_forest'] = {
                'available': True,
                'name': 'Isolation Forest',
                'description': 'Tree-based anomaly detection using sklearn',
                'supports_shap': True,
                'model_class': SklearnAnomalyDetector
            }
        except ImportError:
            models['isolation_forest'] = {
                'available': False,
                'name': 'Isolation Forest',
                'description': 'Tree-based anomaly detection using sklearn',
                'error': 'scikit-learn not installed'
            }
        
        # Check TensorFlow Lite availability
        try:
            import tensorflow
            models['autoencoder'] = {
                'available': True,
                'name': 'Autoencoder',
                'description': 'Neural network autoencoder using TensorFlow Lite',
                'supports_shap': True,
                'model_class': TFLiteAnomalyDetector
            }
        except ImportError:
            models['autoencoder'] = {
                'available': False,
                'name': 'Autoencoder',
                'description': 'Neural network autoencoder using TensorFlow Lite',
                'error': 'TensorFlow not installed'
            }
        
        return models
    
    def get_model_info(self) -> Dict[str, Any]:
        """Get detailed model information"""
        base_info = {
            'ensemble_model_id': self.model_id,
            'current_model_type': self.model_type,
            'detection_threshold': self.detection_threshold,
            'available_models': self.get_available_models()
        }
        
        if self.current_detector:
            detector_info = self.current_detector.get_model_info()
            base_info.update(detector_info)
        
        return base_info
    
    def set_detection_threshold(self, threshold: float) -> None:
        """Set detection threshold for current model"""
        super().set_detection_threshold(threshold)
        
        if self.current_detector:
            self.current_detector.set_detection_threshold(threshold)
    
    def get_metrics(self) -> Dict[str, Any]:
        """Get detection metrics"""
        if self.current_detector:
            return self.current_detector.get_metrics()
        return {}
    
    def reset_metrics(self) -> None:
        """Reset detection metrics"""
        if self.current_detector:
            self.current_detector.reset_metrics()
    
    def get_feature_importance(self) -> Optional[Dict[str, float]]:
        """Get feature importance from current model"""
        if self.current_detector:
            return self.current_detector.get_feature_importance()
        return None
    
    def validate_model_switch(self, new_model_type: str, model_path: Optional[str] = None) -> Dict[str, Any]:
        """Validate if model switch is possible"""
        validation_result = {
            'can_switch': False,
            'reason': '',
            'recommendations': []
        }
        
        # Check if model type is valid
        available_models = self.get_available_models()
        if new_model_type not in available_models:
            validation_result['reason'] = f"Unknown model type: {new_model_type}"
            return validation_result
        
        # Check if model is available
        model_info = available_models[new_model_type]
        if not model_info['available']:
            validation_result['reason'] = model_info.get('error', 'Model not available')
            validation_result['recommendations'] = [
                f"Install required dependencies for {model_info['name']}"
            ]
            return validation_result
        
        # Check if model file exists (if provided)
        if model_path:
            from pathlib import Path
            if not Path(model_path).exists():
                validation_result['reason'] = f"Model file not found: {model_path}"
                return validation_result
        
        validation_result['can_switch'] = True
        validation_result['reason'] = f"Can switch to {model_info['name']}"
        return validation_result
    
    def get_explanation_compatibility(self) -> Dict[str, Any]:
        """Get explanation compatibility information"""
        compatibility = {
            'current_model': self.model_type,
            'shap_available': False,
            'explanation_types': []
        }
        
        if self.model_type == "isolation_forest":
            try:
                import shap
                compatibility['shap_available'] = True
                compatibility['explanation_types'] = ['tree_shap']
            except ImportError:
                pass
        
        elif self.model_type == "autoencoder":
            try:
                import shap
                compatibility['shap_available'] = True
                compatibility['explanation_types'] = ['deep_shap', 'reconstruction_error']
            except ImportError:
                pass
        
        return compatibility
    
    def benchmark_models(self, test_data: np.ndarray, test_labels: Optional[np.ndarray] = None) -> Dict[str, Any]:
        """Benchmark available models on test data"""
        benchmark_results = {}
        available_models = self.get_available_models()
        
        for model_type, model_info in available_models.items():
            if not model_info['available']:
                benchmark_results[model_type] = {
                    'error': model_info.get('error', 'Model not available'),
                    'performance': None
                }
                continue
            
            try:
                logger.info(f"Benchmarking {model_type}")
                
                # Create temporary detector
                temp_detector = model_info['model_class'](f"benchmark_{model_type}")
                
                # Train on subset of data (if not trained)
                if not temp_detector.is_trained:
                    train_size = min(1000, len(test_data) // 2)
                    train_data = test_data[:train_size]
                    temp_detector.train(train_data)
                
                # Run inference
                start_time = time.perf_counter()
                predictions = []
                scores = []
                
                for i in range(0, len(test_data), 10):  # Sample every 10th for efficiency
                    features = test_data[i:i+1]
                    result = temp_detector.detect(features[0])
                    predictions.append(result.is_alert_triggered)
                    scores.append(result.anomaly_score)
                
                inference_time = time.perf_counter() - start_time
                
                # Calculate metrics
                if test_labels is not None:
                    sampled_labels = test_labels[::10][:len(predictions)]
                    
                    # Calculate accuracy, precision, recall
                    tp = sum(1 for p, l in zip(predictions, sampled_labels) if p and l)
                    fp = sum(1 for p, l in zip(predictions, sampled_labels) if p and not l)
                    fn = sum(1 for p, l in zip(predictions, sampled_labels) if not p and l)
                    
                    precision = tp / (tp + fp) if (tp + fp) > 0 else 0
                    recall = tp / (tp + fn) if (tp + fn) > 0 else 0
                    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0
                else:
                    precision = recall = f1 = None
                
                benchmark_results[model_type] = {
                    'performance': {
                        'inference_time_ms': inference_time * 1000 / len(predictions),
                        'avg_anomaly_score': np.mean(scores),
                        'std_anomaly_score': np.std(scores),
                        'precision': precision,
                        'recall': recall,
                        'f1_score': f1
                    },
                    'error': None
                }
                
                logger.info(f"Benchmark completed for {model_type}: F1={f1:.3f}")
                
            except Exception as e:
                benchmark_results[model_type] = {
                    'error': str(e),
                    'performance': None
                }
                logger.error(f"Benchmark error for {model_type}: {e}")
        
        return benchmark_results
