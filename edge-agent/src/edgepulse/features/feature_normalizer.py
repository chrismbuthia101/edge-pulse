import os
from edgepulse.utils.log_handler import get_logger
import pickle
from typing import Optional
from pathlib import Path
import numpy as np
from sklearn.preprocessing import StandardScaler, RobustScaler

from edgepulse.utils.error_handler import ModelError
from edgepulse.utils.path_manager import PathManager

logger = get_logger(__name__)


class DeviceNormalizer:
    """
    Learns per-device baseline behavior and normalizes features.

    Supports incremental learning with concept drift detection.
    """

    def __init__(
        self,
        device_id: str,
        baseline_path: Optional[Path] = None,
        use_robust_scaler: bool = True,
        learning_period_hours: int = 24,
        decay_factor: float = 0.95,
        path_manager: Optional[PathManager] = None,
    ) -> None:
        self.device_id = device_id
        self.use_robust_scaler = use_robust_scaler
        self.learning_period_hours = learning_period_hours
        self.decay_factor = decay_factor
        self.path_manager = path_manager or PathManager()

        if baseline_path:
            self.baseline_path = Path(baseline_path)
        else:
            self.baseline_path = self.path_manager.get_baseline_path(device_id)

        logger.info(
            "DeviceNormalizer initialized",
            baseline_path=str(self.baseline_path),
            models_dir=str(self.path_manager.models_dir),
            base_dir=str(self.path_manager.base_dir),
        )

        if use_robust_scaler:
            self.scaler = RobustScaler()
        else:
            self.scaler = StandardScaler()

        self.is_fitted = False
        self.sample_count = 0
        self.baseline_mean: Optional[np.ndarray] = None
        self.baseline_std: Optional[np.ndarray] = None

    def fit(self, features: np.ndarray) -> None:
        if features.ndim == 1:
            features = features.reshape(1, -1)

        try:
            self.scaler.fit(features)
            self.is_fitted = True
            self.sample_count = len(features)

            if hasattr(self.scaler, 'mean_'):
                self.baseline_mean = self.scaler.mean_.copy()
            elif hasattr(self.scaler, 'center_'):
                self.baseline_mean = self.scaler.center_.copy()

            if hasattr(self.scaler, 'scale_'):
                self.baseline_std = self.scaler.scale_.copy()

            logger.info(f"Fitted normalizer with {self.sample_count} samples")
        except Exception as e:
            logger.error(f"Error fitting normalizer: {e}")
            raise

    def transform(self, features: np.ndarray) -> np.ndarray:
        if not self.is_fitted:
            logger.warning("Normalizer not fitted, returning original features")
            return features

        if features.ndim == 1:
            features = features.reshape(1, -1)

        try:
            normalized = self.scaler.transform(features)
            return normalized
        except Exception as e:
            logger.error(f"Error transforming features: {e}")
            return features

    def fit_transform(self, features: np.ndarray) -> np.ndarray:
        self.fit(features)
        return self.transform(features)

    def update_baseline(self, features: np.ndarray) -> None:
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
                    self.decay_factor * self.baseline_mean +
                    (1 - self.decay_factor) * new_mean
                )
            else:
                self.baseline_mean = new_mean

            if self.baseline_std is not None:
                self.baseline_std = (
                    self.decay_factor * self.baseline_std +
                    (1 - self.decay_factor) * new_std
                )
            else:
                self.baseline_std = new_std

            if hasattr(self.scaler, 'mean_'):
                self.scaler.mean_ = self.baseline_mean
            elif hasattr(self.scaler, 'center_'):
                self.scaler.center_ = self.baseline_mean

            if hasattr(self.scaler, 'scale_'):
                self.scaler.scale_ = self.baseline_std

            self.sample_count += len(features)

            logger.debug(f"Updated baseline with {len(features)} new samples")
        except Exception as e:
            logger.error(f"Error updating baseline: {e}")

    def detect_concept_drift(self, features: np.ndarray, threshold: float = 3.0) -> bool:
        if not self.is_fitted or self.baseline_mean is None or self.baseline_std is None:
            return False

        if features.ndim == 1:
            features = features.reshape(1, -1)

        try:
            normalized = self.transform(features)

            max_deviation = np.max(np.abs(normalized))

            if max_deviation > threshold:
                logger.warning(f"Concept drift detected: max deviation = {max_deviation}")
                return True

            return False
        except Exception as e:
            logger.error(f"Error detecting concept drift: {e}")
            return False

    def save_baseline(self, path: Optional[Path] = None) -> None:
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

            with open(save_path, 'wb') as f:
                pickle.dump(baseline_data, f)

            logger.info(f"Saved baseline to {save_path}")
        except Exception as e:
            logger.error(f"Error saving baseline: {e}")
            raise ModelError(f"Failed to save baseline: {e}") from e

    def load_baseline(self, path: Optional[Path] = None) -> bool:
        candidate_paths = []

        if path:
            candidate_paths.append(Path(path))
        else:
            candidate_paths.append(self.baseline_path)

        device_id = self.device_id or "unknown"
        system_paths = []
        if system_dir := os.environ.get("EDGE_PULSE_SYSTEM_DATA_DIR"):
            system_paths.append(Path(system_dir) / "models" / f"{device_id}_baseline.pkl")
        system_paths.extend([
            Path(f"/opt/edgepulse/data/models/{device_id}_baseline.pkl"),
        ])
        for sys_path in system_paths:
            if sys_path not in candidate_paths:
                candidate_paths.append(sys_path)

        load_path = None
        for candidate in candidate_paths:
            try:
                if candidate.exists():
                    load_path = candidate
                    break
            except (PermissionError, OSError):
                continue

        if load_path is None:
            logger.warning(
                f"Baseline file not found in any location",
                searched_paths=[str(p) for p in candidate_paths],
            )
            return False

        try:
            with open(load_path, 'rb') as f:
                baseline_data = pickle.load(f)

            self.device_id = baseline_data.get("device_id", self.device_id)
            self.scaler = baseline_data.get("scaler", self.scaler)
            self.is_fitted = baseline_data.get("is_fitted", False)
            self.sample_count = baseline_data.get("sample_count", 0)
            self.baseline_mean = baseline_data.get("baseline_mean")
            self.baseline_std = baseline_data.get("baseline_std")
            self.use_robust_scaler = baseline_data.get("use_robust_scaler", True)

            logger.info(f"Loaded baseline from {load_path} ({self.sample_count} samples)")
            return True
        except Exception as e:
            logger.error(f"Error loading baseline from {load_path}: {e}")
            return False

    def reset_baseline(self) -> None:
        if self.use_robust_scaler:
            self.scaler = RobustScaler()
        else:
            self.scaler = StandardScaler()

        self.is_fitted = False
        self.sample_count = 0
        self.baseline_mean = None
        self.baseline_std = None

        logger.info("Baseline reset")
