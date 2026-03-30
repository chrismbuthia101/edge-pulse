"""
Model Manager for EdgePulse Anomaly Detection

Manages model lifecycle, training, switching, and integrity verification.
Integrates with scikit-learn Isolation Forest and TensorFlow Lite Autoencoder.
"""

import time
from pathlib import Path
from typing import Dict, Any, Optional, List

import numpy as np

from edgepulse_win.detectors.ensemble_detector import EnsembleDetector
from edgepulse_win.detectorsmodel_integrity import ModelIntegrityVerifier
from edgepulse_win.utils.log_handler import get_logger
from edgepulse_win.config.manager import ConfigManager

logger = get_logger(__name__)


class ModelManager:
    """Manages ML models for anomaly detection"""
    
    def __init__(self, config_manager: ConfigManager):
        self.config_manager = config_manager
        
        # Model storage paths
        self.models_dir = Path("C:\\ProgramData\\EdgePulse\\models")
        self.models_dir.mkdir(parents=True, exist_ok=True)
        
        # Integrity verifier
        self.integrity_verifier = ModelIntegrityVerifier(str(self.models_dir))
        
        # Current detector
        self.current_detector: Optional[EnsembleDetector] = None
        self.model_id = "edgepulse_primary"
        
        # Model configuration
        self.current_model_type = "isolation_forest"  # Default
        self.detection_threshold = 0.7
        
        # Training data storage
        self.training_data_buffer: List[np.ndarray] = []
        self.max_training_samples = 10000
        
        # Model metadata
        self.model_metadata: Dict[str, Any] = {}
        
        logger.info("ModelManager initialized")
    
    async def initialize(self) -> bool:
        """Initialize model manager"""
        try:
            logger.info("Initializing ModelManager")
            
            # Load configuration
            await self._load_model_config()
            
            # Initialize current detector
            success = await self._initialize_current_detector()
            
            if success:
                logger.info(f"ModelManager initialized with {self.current_model_type}")
            else:
                logger.error("Failed to initialize ModelManager")
            
            return success
            
        except Exception as e:
            logger.error(f"Error initializing ModelManager: {e}")
            return False
    
    async def _load_model_config(self):
        """Load model configuration from config manager"""
        try:
            # Get model configuration
            model_config = await self.config_manager.get_config("model")
            if model_config:
                self.current_model_type = model_config.get("model_type", "isolation_forest")
                self.detection_threshold = model_config.get("detection_threshold", 0.7)
                self.model_id = model_config.get("model_id", "edgepulse_primary")
                
                logger.info(f"Loaded model config: {self.current_model_type}, threshold: {self.detection_threshold}")
            
        except Exception as e:
            logger.error(f"Error loading model config: {e}")
    
    async def _initialize_current_detector(self) -> bool:
        """Initialize the current detector"""
        try:
            # Create ensemble detector
            self.current_detector = EnsembleDetector(self.model_id, self.current_model_type)
            
            # Set detection threshold
            self.current_detector.set_detection_threshold(self.detection_threshold)
            
            # Try to load existing model
            model_path = self.models_dir / f"{self.model_id}_{self.current_model_type}.joblib"
            if model_path.exists():
                success = self.current_detector.load_model_with_integrity(str(model_path))
                if success:
                    logger.info(f"Loaded existing model: {model_path}")
                    return True
                else:
                    logger.warning(f"Failed to load existing model: {model_path}")
            
            # If no model exists, mark as untrained
            logger.info("No existing model found - will need training")
            return True
            
        except Exception as e:
            logger.error(f"Error initializing detector: {e}")
            return False
    
    async def detect_anomaly(self, features: np.ndarray) -> Optional[Dict[str, Any]]:
        """Perform anomaly detection"""
        try:
            if not self.current_detector:
                logger.error("No detector available")
                return None
            
            # Perform detection
            result = self.current_detector.detect(features)
            
            # Convert to dictionary
            detection_result = {
                'is_alert_triggered': result.is_alert_triggered,
                'anomaly_score': result.anomaly_score,
                'detection_threshold_applied': result.detection_threshold_applied,
                'inference_latency_ms': result.inference_latency_ms,
                'model_id': result.model_id,
                'model_type': result.model_type,
                'timestamp': result.timestamp,
                'explanations': result.explanations
            }
            
            return detection_result
            
        except Exception as e:
            logger.error(f"Error in anomaly detection: {e}")
            return None
    
    async def train_model(self, training_data: Optional[np.ndarray] = None, 
                       feature_names: Optional[List[str]] = None) -> bool:
        """Train the current model"""
        try:
            if not self.current_detector:
                logger.error("No detector available for training")
                return False
            
            # Use provided data or buffered data
            if training_data is None:
                if len(self.training_data_buffer) < 100:
                    logger.error("Insufficient training data")
                    return False
                
                training_data = np.vstack(self.training_data_buffer)
            
            logger.info(f"Training model with {training_data.shape[0]} samples")
            
            # Train model
            success = self.current_detector.train(training_data, feature_names)
            
            if success:
                # Save trained model
                model_path = self.models_dir / f"{self.model_id}_{self.current_model_type}.joblib"
                save_success = self.current_detector.save_model(str(model_path))
                
                if save_success:
                    logger.info(f"Model trained and saved: {model_path}")
                    
                    # Update configuration
                    await self.config_manager.set_config("model", {
                        "model_type": self.current_model_type,
                        "detection_threshold": self.detection_threshold,
                        "model_id": self.model_id,
                        "last_trained": time.time(),
                        "model_path": str(model_path)
                    })
                    
                    # Clear training buffer
                    self.training_data_buffer.clear()
                    
                    return True
                else:
                    logger.error("Failed to save trained model")
            else:
                logger.error("Model training failed")
            
            return False
            
        except Exception as e:
            logger.error(f"Error training model: {e}")
            return False
    
    async def switch_model(self, new_model_type: str) -> bool:
        """Switch to a different model type"""
        try:
            if not self.current_detector:
                logger.error("No current detector")
                return False
            
            # Validate switch
            validation = self.current_detector.validate_model_switch(new_model_type)
            if not validation['can_switch']:
                logger.error(f"Cannot switch to {new_model_type}: {validation['reason']}")
                return False
            
            # Perform switch
            success = self.current_detector.switch_model(new_model_type)
            
            if success:
                self.current_model_type = new_model_type
                
                # Try to load existing model for new type
                model_path = self.models_dir / f"{self.model_id}_{new_model_type}.joblib"
                if model_path.exists():
                    load_success = self.current_detector.load_model_with_integrity(str(model_path))
                    if not load_success:
                        logger.warning(f"Failed to load model for {new_model_type}")
                
                # Update configuration
                await self.config_manager.set_config("model", {
                    "model_type": new_model_type,
                    "detection_threshold": self.detection_threshold,
                    "model_id": self.model_id
                })
                
                logger.info(f"Successfully switched to {new_model_type}")
                return True
            else:
                logger.error(f"Failed to switch to {new_model_type}")
                return False
                
        except Exception as e:
            logger.error(f"Error switching model: {e}")
            return False
    
    async def add_training_sample(self, features: np.ndarray):
        """Add training sample to buffer"""
        try:
            self.training_data_buffer.append(features)
            
            # Limit buffer size
            if len(self.training_data_buffer) > self.max_training_samples:
                self.training_data_buffer = self.training_data_buffer[-self.max_training_samples:]
            
            logger.debug(f"Added training sample, buffer size: {len(self.training_data_buffer)}")
            
        except Exception as e:
            logger.error(f"Error adding training sample: {e}")
    
    async def detect_model_drift(self, new_data: np.ndarray) -> bool:
        """Detect model drift"""
        try:
            if not self.current_detector:
                return False
            
            return self.current_detector.detect_drift(new_data)
            
        except Exception as e:
            logger.error(f"Error detecting model drift: {e}")
            return False
    
    async def get_model_info(self) -> Dict[str, Any]:
        """Get model information"""
        try:
            info = {
                'current_model_type': self.current_model_type,
                'detection_threshold': self.detection_threshold,
                'model_id': self.model_id,
                'training_buffer_size': len(self.training_data_buffer),
                'models_directory': str(self.models_dir)
            }
            
            if self.current_detector:
                detector_info = self.current_detector.get_model_info()
                info.update(detector_info)
            
            return info
            
        except Exception as e:
            logger.error(f"Error getting model info: {e}")
            return {}
    
    async def get_available_models(self) -> Dict[str, Any]:
        """Get information about available models"""
        try:
            if self.current_detector:
                return self.current_detector.get_available_models()
            else:
                return {}
                
        except Exception as e:
            logger.error(f"Error getting available models: {e}")
            return {}
    
    async def benchmark_models(self, test_data: np.ndarray, 
                           test_labels: Optional[np.ndarray] = None) -> Dict[str, Any]:
        """Benchmark available models"""
        try:
            if self.current_detector:
                return self.current_detector.benchmark_models(test_data, test_labels)
            else:
                return {}
                
        except Exception as e:
            logger.error(f"Error benchmarking models: {e}")
            return {}
    
    async def set_detection_threshold(self, threshold: float) -> bool:
        """Set detection threshold"""
        try:
            if 0.0 <= threshold <= 1.0:
                self.detection_threshold = threshold
                
                if self.current_detector:
                    self.current_detector.set_detection_threshold(threshold)
                
                # Update configuration
                await self.config_manager.set_config("model", {
                    "model_type": self.current_model_type,
                    "detection_threshold": threshold,
                    "model_id": self.model_id
                })
                
                logger.info(f"Detection threshold set to {threshold}")
                return True
            else:
                logger.error(f"Invalid threshold: {threshold}")
                return False
                
        except Exception as e:
            logger.error(f"Error setting detection threshold: {e}")
            return False
    
    async def get_model_metrics(self) -> Dict[str, Any]:
        """Get model performance metrics"""
        try:
            if self.current_detector:
                return self.current_detector.get_metrics()
            else:
                return {}
                
        except Exception as e:
            logger.error(f"Error getting model metrics: {e}")
            return {}
    
    async def reset_model_metrics(self):
        """Reset model metrics"""
        try:
            if self.current_detector:
                self.current_detector.reset_metrics()
                logger.info("Model metrics reset")
                
        except Exception as e:
            logger.error(f"Error resetting model metrics: {e}")
    
    async def get_feature_importance(self) -> Optional[Dict[str, float]]:
        """Get feature importance from current model"""
        try:
            if self.current_detector:
                return self.current_detector.get_feature_importance()
            else:
                return None
                
        except Exception as e:
            logger.error(f"Error getting feature importance: {e}")
            return None
    
    async def validate_model_integrity(self) -> bool:
        """Validate current model integrity using integrity verifier"""
        try:
            if not self.current_detector:
                return False
            
            # Use integrity verifier to check current model
            verification = await self.integrity_verifier.verify_model(self.model_id)
            
            if verification.is_valid:
                logger.info(f"Model integrity verified: {self.model_id}")
                return True
            else:
                logger.error(f"Model integrity verification failed: {self.model_id}")
                logger.error(f"Verification details: {verification.details}")
                if verification.error_message:
                    logger.error(f"Error: {verification.error_message}")
                return False
            
        except Exception as e:
            logger.error(f"Error validating model integrity: {e}")
            return False
    
    async def cleanup(self):
        """Cleanup resources"""
        try:
            logger.info("Cleaning up ModelManager")
            
            # Save any pending training data
            if len(self.training_data_buffer) > 0:
                logger.info(f"Saving {len(self.training_data_buffer)} training samples")
                # Could implement persistent storage here
            
            # Clear detector
            self.current_detector = None
            
            logger.info("ModelManager cleanup completed")
            
        except Exception as e:
            logger.error(f"Error in ModelManager cleanup: {e}")
    
    def get_training_status(self) -> Dict[str, Any]:
        """Get training status"""
        return {
            'training_buffer_size': len(self.training_data_buffer),
            'min_training_samples': 100,
            'max_training_samples': self.max_training_samples,
            'can_train': len(self.training_data_buffer) >= 100,
            'current_model_trained': self.current_detector.is_trained if self.current_detector else False
        }
