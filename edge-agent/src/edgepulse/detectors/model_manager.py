"""
Model Manager for EdgePulse Anomaly Detection

Manages model lifecycle, training, switching, and integrity verification.
Integrates with scikit-learn Isolation Forest and TensorFlow Lite Autoencoder.
"""

import asyncio
import time
from pathlib import Path
from typing import Dict, Any, Optional, List

import numpy as np

from edgepulse.detectors.ensemble_detector import EnsembleDetector
from edgepulse.detectors.model_integrity import ModelIntegrityVerifier
from edgepulse.utils.log_handler import get_logger
from edgepulse.config.manager import ConfigManager
from edgepulse.utils.path_manager import PathManager

logger = get_logger(__name__)


class ModelManager:
    """Manages ML models for anomaly detection"""

    def __init__(
        self,
        config_manager: Optional[ConfigManager],
        path_manager: Optional[PathManager] = None,
    ):
        # config_manager is legitimately None when sync / remote config is disabled.
        self.config_manager = config_manager

        self._path_manager = path_manager or PathManager()
        self.models_dir = self._path_manager.models_dir
        self.models_dir.mkdir(parents=True, exist_ok=True)

        self.integrity_verifier = ModelIntegrityVerifier(str(self.models_dir))

        self.current_detector: Optional[EnsembleDetector] = None
        self.model_id = "edgepulse_primary"

        self.current_model_type = "isolation_forest"
        self.detection_threshold = 0.7

        self.training_data_buffer: List[np.ndarray] = []
        self.max_training_samples = 10000

        self.model_metadata: Dict[str, Any] = {}

        logger.info("ModelManager initialized")

    async def initialize(self) -> bool:
        """Initialize model manager"""
        try:
            logger.info("Initializing ModelManager")

            await self._load_model_config()
            success = await self._initialize_current_detector()

            if success:
                logger.info(f"ModelManager initialized with {self.current_model_type}")
            else:
                logger.error("Failed to initialize ModelManager")

            return success

        except Exception as e:
            logger.error(f"Error initializing ModelManager: {e}")
            return False

    async def _load_model_config(self) -> None:
        """Load model configuration from config manager.
        """
        if self.config_manager is None:
            logger.debug("No config_manager available; using default model config")
            return

        try:
            model_type = self.config_manager.get("model.type")
            if model_type:
                self.current_model_type = model_type

            threshold = self.config_manager.get("model.detection_threshold")
            if threshold is not None:
                self.detection_threshold = float(threshold)

            model_id = self.config_manager.get("model.id")
            if model_id:
                self.model_id = model_id

            logger.info(
                f"Loaded model config: {self.current_model_type}, "
                f"threshold: {self.detection_threshold}"
            )

        except Exception as e:
            logger.error(f"Error loading model config: {e}")

    async def _initialize_current_detector(self) -> bool:
        """Initialize the current detector"""
        try:
            self.current_detector = EnsembleDetector(
                self.model_id, self.current_model_type
            )
            self.current_detector.set_detection_threshold(self.detection_threshold)

            model_path = (
                self.models_dir / f"{self.model_id}_{self.current_model_type}.joblib"
            )
            if model_path.exists():
                success = self.current_detector.load_model_with_integrity(
                    str(model_path)
                )
                if success:
                    logger.info(f"Loaded existing model: {model_path}")
                    return True
                else:
                    logger.warning(f"Failed to load existing model: {model_path}")

            logger.info("No existing model found – will need training")
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

            result = self.current_detector.detect(features)

            return {
                "is_alert_triggered": result.is_alert_triggered,
                "anomaly_score": result.anomaly_score,
                "detection_threshold_applied": result.detection_threshold_applied,
                "inference_latency_ms": result.inference_latency_ms,
                "model_id": result.model_id,
                "model_version": result.model_version,
                "timestamp": result.timestamp,
            }

        except Exception as e:
            logger.error(f"Error in anomaly detection: {e}")
            return None

    async def train_model(
        self,
        training_data: Optional[np.ndarray] = None,
        feature_names: Optional[List[str]] = None,
    ) -> bool:
        """Train the current model.
        """
        try:
            if not self.current_detector:
                logger.error("No detector available for training")
                return False

            if training_data is None:
                if len(self.training_data_buffer) < 100:
                    logger.error("Insufficient training data")
                    return False
                training_data = np.vstack(self.training_data_buffer)

            logger.info(f"Training model with {training_data.shape[0]} samples")

            train_config: Dict[str, Any] = {
                "feature_names": feature_names or [],
            }

            await asyncio.to_thread(
                self.current_detector.train, training_data, train_config
            )

            # Persist the trained model.
            model_path = (
                self.models_dir
                / f"{self.model_id}_{self.current_model_type}.joblib"
            )
            try:
                await asyncio.to_thread(
                    self.current_detector.save_model, str(model_path)
                )
                save_ok = True
            except Exception as save_err:
                logger.error(f"Failed to save trained model: {save_err}")
                save_ok = False

            if save_ok:
                logger.info(f"Model trained and saved: {model_path}")

                if self.config_manager is not None:
                    self.config_manager.set("model.type", self.current_model_type)
                    self.config_manager.set(
                        "model.detection_threshold", self.detection_threshold
                    )
                    self.config_manager.set("model.id", self.model_id)
                    self.config_manager.set("model.last_trained", time.time())
                    self.config_manager.set("model.path", str(model_path))

                self.training_data_buffer.clear()
                return True
            else:
                logger.error("Failed to save trained model")
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

            validation = self.current_detector.validate_model_switch(new_model_type)
            if not validation["can_switch"]:
                logger.error(
                    f"Cannot switch to {new_model_type}: {validation['reason']}"
                )
                return False

            success = self.current_detector.switch_model(new_model_type)

            if success:
                self.current_model_type = new_model_type

                model_path = (
                    self.models_dir
                    / f"{self.model_id}_{new_model_type}.joblib"
                )
                if model_path.exists():
                    load_success = self.current_detector.load_model_with_integrity(
                        str(model_path)
                    )
                    if not load_success:
                        logger.warning(f"Failed to load model for {new_model_type}")

                if self.config_manager is not None:
                    self.config_manager.set("model.type", new_model_type)
                    self.config_manager.set(
                        "model.detection_threshold", self.detection_threshold
                    )
                    self.config_manager.set("model.id", self.model_id)

                logger.info(f"Successfully switched to {new_model_type}")
                return True
            else:
                logger.error(f"Failed to switch to {new_model_type}")
                return False

        except Exception as e:
            logger.error(f"Error switching model: {e}")
            return False

    async def add_training_sample(self, features: np.ndarray) -> None:
        """Add training sample to buffer"""
        try:
            self.training_data_buffer.append(features)

            if len(self.training_data_buffer) > self.max_training_samples:
                self.training_data_buffer = self.training_data_buffer[
                    -self.max_training_samples :
                ]

            logger.debug(
                f"Added training sample, buffer size: {len(self.training_data_buffer)}"
            )

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
            info: Dict[str, Any] = {
                "current_model_type": self.current_model_type,
                "detection_threshold": self.detection_threshold,
                "model_id": self.model_id,
                "training_buffer_size": len(self.training_data_buffer),
                "models_directory": str(self.models_dir),
            }

            if self.current_detector:
                detector_info = self.current_detector.get_model_info()
                info.update(detector_info)

            return info

        except Exception as e:
            logger.error(f"Error getting model info: {e}")
            return {}

    async def set_detection_threshold(self, threshold: float) -> bool:
        """Set detection threshold"""
        try:
            if 0.0 <= threshold <= 1.0:
                self.detection_threshold = threshold

                if self.current_detector:
                    self.current_detector.set_detection_threshold(threshold)

                if self.config_manager is not None:
                    self.config_manager.set(
                        "model.detection_threshold", threshold
                    )

                logger.info(f"Detection threshold set to {threshold}")
                return True
            else:
                logger.error(f"Invalid threshold: {threshold}")
                return False

        except Exception as e:
            logger.error(f"Error setting detection threshold: {e}")
            return False

    async def validate_model_integrity(self) -> bool:
        """Validate current model integrity using integrity verifier"""
        try:
            if not self.current_detector:
                return False

            verification = await self.integrity_verifier.verify_model(self.model_id)

            if verification.is_valid:
                logger.info(f"Model integrity verified: {self.model_id}")
                return True
            else:
                logger.error(
                    f"Model integrity verification failed: {self.model_id}"
                )
                if verification.error_message:
                    logger.error(f"Error: {verification.error_message}")
                return False

        except Exception as e:
            logger.error(f"Error validating model integrity: {e}")
            return False

    async def cleanup(self) -> None:
        """Cleanup resources"""
        try:
            logger.info("Cleaning up ModelManager")
            self.current_detector = None
            logger.info("ModelManager cleanup completed")
        except Exception as e:
            logger.error(f"Error in ModelManager cleanup: {e}")

    def get_training_status(self) -> Dict[str, Any]:
        """Get training status"""
        return {
            "training_buffer_size": len(self.training_data_buffer),
            "min_training_samples": 100,
            "max_training_samples": self.max_training_samples,
            "can_train": len(self.training_data_buffer) >= 100,
            "current_model_trained": (
                self.current_detector.is_trained
                if self.current_detector
                else False
            ),
        }