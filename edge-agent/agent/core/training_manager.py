"""
Training Manager

Manages model training lifecycle and training data collection.
"""

import logging
import threading
from typing import List, Optional
from datetime import datetime, timedelta
from collections import deque
import numpy as np

from agent.exceptions import ModelError, DetectionError
from agent.features import DeviceNormalizer
from agent.detection import IsolationForestDetector
from agent.utils import PathManager

logger = logging.getLogger(__name__)


class TrainingManager:
    """
    Manages training data collection and model training.
    
    Thread-safe training data collection.
    """

    def __init__(
        self,
        device_id: str,
        training_period_hours: int = 24,
        min_training_samples: int = 100,
        max_training_samples: int = 10000,
        path_manager: Optional[PathManager] = None,
    ):
        """
        Initialize training manager.
        
        Args:
            device_id: Device identifier
            training_period_hours: Training period in hours (default: 24)
            min_training_samples: Minimum samples required for training (default: 100)
            max_training_samples: Maximum training samples to store (default: 10000)
            path_manager: Path manager instance (creates new if None)
        """
        self.device_id = device_id
        self.training_period_hours = training_period_hours
        self.min_training_samples = min_training_samples
        self.path_manager = path_manager or PathManager()
        
        # Thread-safe training data storage with configurable limit
        self._training_data: deque = deque(maxlen=max_training_samples)
        self._data_lock = threading.Lock()
        
        self.training_start_time = datetime.utcnow()
        self.is_training_complete = False

    def add_training_sample(self, features: np.ndarray) -> None:
        """
        Add a training sample (thread-safe).
        
        Args:
            features: Feature array
        """
        if features.ndim == 1:
            features = features.reshape(1, -1)
        
        with self._data_lock:
            self._training_data.append(features[0])

    def get_training_data(self) -> np.ndarray:
        """
        Get all training data (thread-safe).
        
        Returns:
            Training data array
        """
        with self._data_lock:
            if not self._training_data:
                return np.array([])
            return np.array(list(self._training_data))

    def get_training_data_count(self) -> int:
        """
        Get number of training samples (thread-safe).
        
        Returns:
            Number of samples
        """
        with self._data_lock:
            return len(self._training_data)

    def is_in_training_period(self) -> bool:
        """
        Check if currently in training period.
        
        Returns:
            True if in training period
        """
        if self.is_training_complete:
            return False
        
        hours_elapsed = (datetime.utcnow() - self.training_start_time).total_seconds() / 3600
        return hours_elapsed < self.training_period_hours

    def should_train(self) -> bool:
        """
        Check if training should be performed.
        
        Returns:
            True if training should be performed
        """
        if self.is_training_complete:
            return False
        
        hours_elapsed = (datetime.utcnow() - self.training_start_time).total_seconds() / 3600
        
        if hours_elapsed < self.training_period_hours:
            return False
        
        sample_count = self.get_training_data_count()
        return sample_count >= self.min_training_samples

    def train_models(
        self,
        normalizer: DeviceNormalizer,
        detectors: list,
    ) -> None:
        """
        Train models on collected training data.
        
        Args:
            normalizer: Device normalizer instance
            detectors: List of detector instances to train
            
        Raises:
            ModelError: If training fails
        """
        training_data = self.get_training_data()
        
        if len(training_data) < self.min_training_samples:
            raise ModelError(
                f"Insufficient training data: {len(training_data)} samples "
                f"(minimum: {self.min_training_samples})"
            )
        
        try:
            logger.info(f"Training models with {len(training_data)} samples...")
            
            # Fit normalizer
            normalizer.fit(training_data)
            normalizer.save_baseline()
            
            # Normalize training data
            normalized_training = normalizer.transform(training_data)
            
            # Train all detectors
            for detector in detectors:
                if hasattr(detector, 'train'):
                    # Check if detector is AutoencoderDetector (needs epochs parameter)
                    from agent.detection.autoencoder import AutoencoderDetector
                    if isinstance(detector, AutoencoderDetector):
                        # Autoencoder needs epochs parameter
                        detector.train(normalized_training, epochs=None)  # Use default epochs
                    else:
                        # Isolation Forest or similar (no epochs parameter)
                        detector.train(normalized_training)
                    
                    if hasattr(detector, 'save_model'):
                        detector.save_model()
                    logger.info(f"Trained {detector.__class__.__name__}")
            
            self.is_training_complete = True
            logger.info("Model training completed")
        except Exception as e:
            logger.error(f"Error training models: {e}")
            raise ModelError(f"Failed to train models: {e}") from e

    def reset_training(self) -> None:
        """Reset training state."""
        with self._data_lock:
            self._training_data.clear()
        self.training_start_time = datetime.utcnow()
        self.is_training_complete = False
        logger.info("Training state reset")
