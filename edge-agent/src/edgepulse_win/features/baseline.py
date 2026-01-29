"""Device baseline learning and feature normalization."""

import logging
import pickle
from pathlib import Path
from typing import Optional, Tuple

import numpy as np
from sklearn.preprocessing import RobustScaler, StandardScaler

from edgepulse_win.exceptions import ModelError
from edgepulse_win.utils import PathManager

logger = logging.getLogger(__name__)


class DeviceNormalizer:
    """Learns per-device baseline behavior and normalizes features."""

    def __init__(
        self,
        device_id: str,
        baseline_path: Optional[Path] = None,
        use_robust_scaler: bool = True,
        learning_period_hours: int = 24,
        decay_factor: float = 0.95,
        path_manager: Optional[PathManager] = None,
    ) -> None:
        """Initialize the device normalizer."""
        if not device_id:
            raise ValueError("device_id must be a non-empty string")
        if learning_period_hours <= 0:
            raise ValueError("learning_period_hours must be positive")
        if not (0 < decay_factor < 1):
            raise ValueError("decay_factor must be between 0 and 1")

        self.device_id = device_id
        self.use_robust_scaler = use_robust_scaler
        self.learning_period_hours = learning_period_hours
        self.decay_factor = decay_factor
        self.path_manager = path_manager or PathManager()

        if baseline_path:
            self.baseline_path = Path(baseline_path)
        else:
            self.baseline_path = self.path_manager.get_baseline_path(device_id)

        self.scaler = RobustScaler() if use_robust_scaler else StandardScaler()
        self.is_fitted = False
        self.sample_count = 0
        self.baseline_mean: Optional[np.ndarray] = None
        self.baseline_std: Optional[np.ndarray] = None

    def fit(self, features: np.ndarray) -> None:
        """Learn baseline statistics from features."""
        if features.ndim == 1:
            features = features.reshape(1, -1)

        if features.shape[0] == 0:
            raise ModelError("Cannot fit with empty feature array")

        try:
            self.scaler.fit(features)
            self.is_fitted = True
            self.sample_count = len(features)

            if hasattr(self.scaler, "mean_"):
                self.baseline_mean = self.scaler.mean_.copy()
            elif hasattr(self.scaler, "center_"):
                self.baseline_mean = self.scaler.center_.copy()

            if hasattr(self.scaler, "scale_"):
                self.baseline_std = self.scaler.scale_.copy()

            logger.info("Fitted normalizer with %s samples", self.sample_count)
        except Exception as exc:
            logger.error("Error fitting normalizer: %s", exc)
            raise

    def transform(self, features: np.ndarray) -> np.ndarray:
        """Normalize features using learned baseline."""
        if not self.is_fitted:
            logger.warning("Normalizer not fitted, returning original features")
            return features

        if features.ndim == 1:
            features = features.reshape(1, -1)

        try:
            return self.scaler.transform(features)
        except Exception as exc:
            logger.error("Error transforming features: %s", exc)
            return features

    def fit_transform(self, features: np.ndarray) -> np.ndarray:
        """Fit and transform features in one step."""
        self.fit(features)
        return self.transform(features)

    def update_baseline(self, features: np.ndarray) -> None:
        """Incrementally update baseline with new features."""
        if features.ndim == 1:
            features = features.reshape(1, -1)

        if not self.is_fitted:
            self.fit(features)
            return

        try:
            new_mean = np.mean(features, axis=0)
            new_std = np.std(features, axis=0)

            if self.baseline_mean is not None:
                self.baseline_mean = (
                    self.decay_factor * self.baseline_mean + (1 - self.decay_factor) * new_mean
                )
            else:
                self.baseline_mean = new_mean

            if self.baseline_std is not None:
                self.baseline_std = (
                    self.decay_factor * self.baseline_std + (1 - self.decay_factor) * new_std
                )
            else:
                self.baseline_std = new_std

            if hasattr(self.scaler, "mean_"):
                self.scaler.mean_ = self.baseline_mean
            elif hasattr(self.scaler, "center_"):
                self.scaler.center_ = self.baseline_mean

            if hasattr(self.scaler, "scale_"):
                self.scaler.scale_ = self.baseline_std

            self.sample_count += len(features)

            logger.debug("Updated baseline with %s new samples", len(features))
        except Exception as exc:
            logger.error("Error updating baseline: %s", exc)

    def detect_concept_drift(self, features: np.ndarray, threshold: float = 3.0) -> bool:
        """Detect concept drift (distribution shift)."""
        if not self.is_fitted or self.baseline_mean is None or self.baseline_std is None:
            return False

        if features.ndim == 1:
            features = features.reshape(1, -1)

        try:
            normalized = self.transform(features)
            max_deviation = np.max(np.abs(normalized))

            if max_deviation > threshold:
                logger.warning("Concept drift detected: max deviation = %s", max_deviation)
                return True

            return False
        except Exception as exc:
            logger.error("Error detecting concept drift: %s", exc)
            return False

    def save_baseline(self, path: Optional[Path] = None) -> None:
        """Save baseline statistics to disk."""
        save_path = Path(path) if path else self.baseline_path

        try:
            save_path.parent.mkdir(parents=True, exist_ok=True)

            baseline_data = {
                "device_id": self.device_id,
                "scaler": self.scaler,
                "is_fitted": self.is_fitted,
                "sample_count": self.sample_count,
                "baseline_mean": self.baseline_mean,
                "baseline_std": self.baseline_std,
                "use_robust_scaler": self.use_robust_scaler,
            }

            with open(save_path, "wb") as f:
                pickle.dump(baseline_data, f)

            logger.info("Saved baseline to %s", save_path)
        except Exception as exc:
            logger.error("Error saving baseline: %s", exc)
            raise ModelError(f"Failed to save baseline: {exc}") from exc

    def load_baseline(self, path: Optional[Path] = None) -> bool:
        """Load baseline statistics from disk."""
        load_path = Path(path) if path else self.baseline_path

        if not load_path.exists():
            logger.warning("Baseline file not found: %s", load_path)
            return False

        try:
            with open(load_path, "rb") as f:
                baseline_data = pickle.load(f)

            self.device_id = baseline_data.get("device_id", self.device_id)
            self.scaler = baseline_data.get("scaler", self.scaler)
            self.is_fitted = baseline_data.get("is_fitted", False)
            self.sample_count = baseline_data.get("sample_count", 0)
            self.baseline_mean = baseline_data.get("baseline_mean")
            self.baseline_std = baseline_data.get("baseline_std")
            self.use_robust_scaler = baseline_data.get("use_robust_scaler", True)

            logger.info("Loaded baseline from %s (%s samples)", load_path, self.sample_count)
            return True
        except Exception as exc:
            logger.error("Error loading baseline: %s", exc)
            return False

    def reset_baseline(self) -> None:
        """Reset baseline to initial state."""
        self.scaler = RobustScaler() if self.use_robust_scaler else StandardScaler()
        self.is_fitted = False
        self.sample_count = 0
        self.baseline_mean = None
        self.baseline_std = None

        logger.info("Baseline reset")
