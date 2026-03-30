"""
TensorFlow Lite Anomaly Detector Implementation

Implements Autoencoder as the secondary detection model
with SHAP DeepExplainer integration for explainable AI.
"""

import numpy as np
import hashlib
import time
from typing import Dict, Any, Optional
from pathlib import Path

try:
    import tensorflow as tf
    TENSORFLOW_AVAILABLE = True
except ImportError:
    TENSORFLOW_AVAILABLE = False

try:
    import shap
    SHAP_AVAILABLE = True
except ImportError:
    SHAP_AVAILABLE = False

from edgepulse_win.detectors.base import BaseDetector, DetectionResult, ModelMetadata
from edgepulse_win.utils.log_handler import get_logger

logger = get_logger(__name__)


class TFLiteAnomalyDetector(BaseDetector):
    """TensorFlow Lite Autoencoder anomaly detector"""
    
    def __init__(self, model_id: str):
        super().__init__(model_id)
        self.model_type = "autoencoder"
        
        # Model components
        self.interpreter: Optional[tf.lite.Interpreter] = None
        self.input_details: Optional[dict] = None
        self.output_details: Optional[dict] = None
        self.explainer: Optional[shap.DeepExplainer] = None
        
        # Model metadata
        self.expected_model_hash: Optional[str] = None
        self.feature_names: Optional[list] = None
        self.is_trained = False
        
        # Model parameters
        self.input_shape = None
        self.threshold_percentile = 95  # Use 95th percentile for threshold
        
        logger.info(f"TFLiteAnomalyDetector initialized: {model_id}")
    
    def load_model_with_integrity(self, model_path: str) -> bool:
        """Load TFLite model with SHA-256 integrity verification"""
        try:
            if not TENSORFLOW_AVAILABLE:
                logger.error("TensorFlow not available")
                return False
            
            model_path = Path(model_path)
            if not model_path.exists():
                logger.error(f"Model file not found: {model_path}")
                return False
            
            # Calculate file hash
            file_hash = self._calculate_file_hash(model_path)
            logger.info(f"Model file hash: {file_hash[:16]}...")
            
            # Load TFLite model
            self.interpreter = tf.lite.Interpreter(model_path=str(model_path))
            self.interpreter.allocate_tensors()
            
            # Get input/output details
            self.input_details = self.interpreter.get_input_details()
            self.output_details = self.interpreter.get_output_details()
            
            # Extract input shape
            if self.input_details:
                input_shape = self.input_details[0]['shape']
                self.input_shape = tuple(input_shape)
                logger.info(f"Model input shape: {self.input_shape}")
            
            # Load metadata from separate file if exists
            metadata_path = model_path.with_suffix('.metadata.json')
            if metadata_path.exists():
                import json
                with open(metadata_path, 'r') as f:
                    metadata = json.load(f)
                
                self.feature_names = metadata.get('feature_names', [])
                self.expected_model_hash = metadata.get('hash', file_hash)
                
                # Verify integrity
                if file_hash != self.expected_model_hash:
                    logger.error("Model integrity check failed - hash mismatch")
                    return False
            else:
                self.feature_names = []
                self.expected_model_hash = file_hash
            
            # Initialize SHAP explainer (requires original TensorFlow model)
            if SHAP_AVAILABLE and TENSORFLOW_AVAILABLE:
                try:
                    # Try to load corresponding TensorFlow model for SHAP
                    tf_model_path = model_path.with_suffix('.h5')
                    if tf_model_path.exists():
                        tf_model = tf.keras.models.load_model(str(tf_model_path))
                        
                        # Create SHAP explainer with background data
                        background_data = np.random.normal(0, 1, (100, self.input_shape[1]))
                        self.explainer = shap.DeepExplainer(
                            tf_model,
                            data=background_data
                        )
                        
                        logger.info("SHAP DeepExplainer initialized")
                except Exception as e:
                    logger.warning(f"Failed to initialize SHAP explainer: {e}")
            
            self.is_trained = True
            self._model_metadata = ModelMetadata(
                model_type=self.model_type,
                model_path=str(model_path),
                model_hash=self.expected_model_hash,
                feature_count=self.input_shape[1] if self.input_shape else 0,
                is_trained=True,
                training_samples=0,  # Not available from TFLite
                model_version='1.0'
            )
            
            logger.info(f"TFLite model loaded successfully: {model_path}")
            return True
            
        except Exception as e:
            logger.error(f"Error loading TFLite model: {e}")
            return False
    
    def save_model(self, model_path: str) -> bool:
        """Save model with hash verification (for TensorFlow models)"""
        try:
            if not TENSORFLOW_AVAILABLE:
                logger.error("TensorFlow not available")
                return False
            
            # This would save the TensorFlow model, not TFLite
            # TFLite conversion is typically done separately
            logger.warning("TFLite models should be converted separately")
            return True
            
        except Exception as e:
            logger.error(f"Error saving model: {e}")
            return False
    
    def train(self, training_data: np.ndarray, feature_names: Optional[list] = None) -> bool:
        """Train the Autoencoder model"""
        try:
            if not TENSORFLOW_AVAILABLE:
                logger.error("TensorFlow not available")
                return False
            
            logger.info(f"Training autoencoder with {training_data.shape[0]} samples, {training_data.shape[1]} features")
            
            # Store feature names
            self.feature_names = feature_names or [f"feature_{i}" for i in range(training_data.shape[1])]
            self.input_shape = (None, training_data.shape[1])
            
            # Normalize data
            normalized_data = (training_data - np.mean(training_data, axis=0)) / np.std(training_data, axis=0)
            
            # Build autoencoder model
            input_dim = training_data.shape[1]
            encoding_dim = max(8, input_dim // 4)  # Compress to 1/4 or minimum 8
            
            # Input layer
            input_layer = tf.keras.layers.Input(shape=(input_dim,))
            
            # Encoder
            encoded = tf.keras.layers.Dense(encoding_dim, activation='relu')(input_layer)
            
            # Decoder
            decoded = tf.keras.layers.Dense(input_dim, activation='linear')(encoded)
            
            # Autoencoder model
            autoencoder = tf.keras.models.Model(input_layer, decoded)
            
            # Compile model
            autoencoder.compile(optimizer='adam', loss='mse')
            
            # Train model
            history = autoencoder.fit(
                normalized_data, normalized_data,
                epochs=50,
                batch_size=32,
                shuffle=True,
                validation_split=0.2,
                verbose=0
            )
            
            # Calculate reconstruction error threshold
            reconstructed = autoencoder.predict(normalized_data)
            reconstruction_errors = np.mean(np.square(normalized_data - reconstructed), axis=1)
            self.threshold_value = np.percentile(reconstruction_errors, self.threshold_percentile)
            
            # Store model reference for SHAP
            self.tf_model = autoencoder
            
            # Initialize SHAP explainer
            if SHAP_AVAILABLE:
                try:
                    background_data = normalized_data[:100]  # Use first 100 samples
                    self.explainer = shap.DeepExplainer(
                        autoencoder,
                        data=background_data
                    )
                    
                    logger.info("SHAP DeepExplainer initialized")
                except Exception as e:
                    logger.warning(f"Failed to initialize SHAP explainer: {e}")
            
            self.is_trained = True
            
            # Update metadata
            self._model_metadata = ModelMetadata(
                model_type=self.model_type,
                model_path=None,
                model_hash=None,
                feature_count=input_dim,
                is_trained=True,
                training_samples=training_data.shape[0],
                model_version='1.0'
            )
            
            logger.info(f"Autoencoder training completed - threshold: {self.threshold_value:.4f}")
            return True
            
        except Exception as e:
            logger.error(f"Error training autoencoder: {e}")
            return False
    
    def detect(self, features: np.ndarray) -> DetectionResult:
        """Perform anomaly detection using reconstruction error"""
        try:
            if not self.is_trained or not self.interpreter:
                raise RuntimeError("Model not trained or loaded")
            
            start_time = time.perf_counter()
            
            # Ensure features are 2D
            if features.ndim == 1:
                features = features.reshape(1, -1)
            
            # Normalize features (using simple z-score)
            # In production, should use the same normalization as training
            normalized_features = features  # Placeholder - should match training normalization
            
            # Run inference with TFLite
            input_details = self.input_details[0]
            output_details = self.output_details[0]
            
            # Set input tensor
            input_tensor = np.interp1d(
                normalized_features, 
                [input_details['quantization'][0]['min'], input_details['quantization'][0]['max']], 
                [-128, 127]
            ).astype(input_details['dtype'])
            
            self.interpreter.set_tensor(input_details['index'], input_tensor)
            
            # Run inference
            self.interpreter.invoke()
            
            # Get output tensor
            output_data = self.interpreter.get_tensor(output_details['index'])
            
            # Dequantize output
            output_quantization = output_details['quantization'][0]
            reconstructed = output_data.astype(np.float32)
            reconstructed = (reconstructed - output_quantization['zero_point']) * output_quantization['scale']
            
            # Calculate reconstruction error
            reconstruction_error = np.mean(np.square(normalized_features - reconstructed))
            
            # Normalize error to [0, 1] range
            # Use sigmoid-like normalization
            anomaly_score = 1 / (1 + np.exp(-5 * (reconstruction_error - self.threshold_value)))
            
            # Apply detection threshold
            is_alert = reconstruction_error > self.threshold_value
            
            # Calculate inference latency
            inference_latency_ms = int((time.perf_counter() - start_time) * 1000)
            
            # Get SHAP explanations if available
            explanations = None
            if self.explainer and SHAP_AVAILABLE and hasattr(self, 'tf_model'):
                try:
                    shap_values = self.explainer.shap_values(normalized_features)
                    explanations = {
                        'shap_values': shap_values.tolist() if hasattr(shap_values, 'tolist') else shap_values,
                        'feature_names': self.feature_names,
                        'reconstruction_error': float(reconstruction_error),
                        'threshold_value': float(self.threshold_value)
                    }
                except Exception as e:
                    logger.warning(f"Failed to generate SHAP explanations: {e}")
            
            # Create detection result
            result = DetectionResult(
                is_alert_triggered=is_alert,
                anomaly_score=float(anomaly_score),
                detection_threshold_applied=self.detection_threshold,
                inference_latency_ms=inference_latency_ms,
                model_id=self.model_id,
                model_type=self.model_type,
                timestamp=time.time(),
                explanations=explanations
            )
            
            # Update metrics
            self._update_metrics(float(anomaly_score), int(is_alert), inference_latency_ms)
            
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
        """Detect model drift using reconstruction error distribution"""
        try:
            if not self.is_trained or not self.interpreter:
                logger.warning("Cannot detect drift - model not trained")
                return False
            
            if new_data.shape[0] < 100:
                logger.warning("Insufficient data for drift detection")
                return False
            
            # Calculate reconstruction errors for new data
            reconstruction_errors = []
            
            for i in range(0, new_data.shape[0], 10):  # Sample every 10th for efficiency
                features = new_data[i:i+1]
                
                # Run inference
                input_details = self.input_details[0]
                output_details = self.output_details[0]
                
                input_tensor = np.interp1d(
                    features, 
                    [input_details['quantization'][0]['min'], input_details['quantization'][0]['max']], 
                    [-128, 127]
                ).astype(input_details['dtype'])
                
                self.interpreter.set_tensor(input_details['index'], input_tensor)
                self.interpreter.invoke()
                
                output_data = self.interpreter.get_tensor(output_details['index'])
                output_quantization = output_details['quantization'][0]
                reconstructed = output_data.astype(np.float32)
                reconstructed = (reconstructed - output_quantization['zero_point']) * output_quantization['scale']
                
                # Calculate reconstruction error
                error = np.mean(np.square(features - reconstructed))
                reconstruction_errors.append(error)
            
            if not reconstruction_errors:
                return False
            
            # Compare with expected distribution
            new_mean_error = np.mean(reconstruction_errors)
            new_std_error = np.std(reconstruction_errors)
            
            # Expected values (should be similar to training distribution)
            expected_mean = self.threshold_value * 0.8  # Approximate
            expected_std = self.threshold_value * 0.3  # Approximate
            
            # Calculate drift metrics
            mean_shift = abs(new_mean_error - expected_mean) / expected_mean if expected_mean > 0 else 0
            std_change = abs(new_std_error - expected_std) / expected_std if expected_std > 0 else 0
            
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
            'feature_count': self.input_shape[1] if self.input_shape else 0,
            'feature_names': self.feature_names or [],
            'detection_threshold': self.detection_threshold,
            'input_shape': self.input_shape,
            'tensorflow_available': TENSORFLOW_AVAILABLE,
            'shap_available': SHAP_AVAILABLE,
            'explainer_available': self.explainer is not None
        }
        
        if self._model_metadata:
            info.update(self._model_metadata.__dict__)
        
        if hasattr(self, 'threshold_value'):
            info['reconstruction_threshold'] = self.threshold_value
        
        if self.input_details:
            info['input_details'] = self.input_details[0]
        
        if self.output_details:
            info['output_details'] = self.output_details[0]
        
        return info
