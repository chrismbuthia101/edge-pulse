import os
from pathlib import Path
from typing import Any, Dict, Optional

import joblib
import numpy as np
from sklearn.ensemble import IsolationForest

from edgepulse.detectors.base import BaseDetector
from edgepulse.utils.error_handler import ModelError
from edgepulse.utils.log_handler import get_logger
from edgepulse.utils.path_manager import PathManager

logger = get_logger(__name__)

_BOOTSTRAP_WARNING = "Anomaly detection is DISABLED — model file not found.\n"


class IsolationForestDetector(BaseDetector):

    def __init__(
        self,
        n_estimators: int = 100,
        contamination: str = "auto",
        max_samples: str = "auto",
        random_state: Optional[int] = None,
        model_path: Optional[Path] = None,
        device_id: Optional[str] = None,
        path_manager: Optional[PathManager] = None,
        model_version: str = "1.0",
    ):
        super().__init__(f"isolation_forest_{device_id or 'default'}", model_version)
        self.n_estimators = n_estimators
        self.contamination = contamination
        self.max_samples = max_samples
        self.random_state = random_state
        self.path_manager = path_manager or PathManager()

        self.model_path = (
            Path(model_path)
            if model_path
            else self.path_manager.get_model_path(
                "isolation_forest",
                device_id,
            )
        )

        self.model: Optional[IsolationForest] = None
        self.is_trained = False
        self.training_samples = 0
        self.status_detail: str = "not_loaded"

    def load_model(self, file_path: Optional[str] = None) -> bool:
        load_path = Path(file_path) if file_path else self.model_path

        candidate_paths = [load_path]

        extra = [
            self.path_manager.models_dir / "edgepulse_primary_isolation_forest.joblib",
        ]
        if system_path := os.environ.get("EDGE_PULSE_SYSTEM_DATA_DIR"):
            extra.append(Path(system_path) / "models/edgepulse_primary_isolation_forest.joblib")

        for p in extra:
            if p not in candidate_paths and p.exists():
                candidate_paths.insert(0, p)

        if system_dir := os.environ.get("EDGE_PULSE_SYSTEM_DATA_DIR"):
            candidate_paths.append(
                Path(system_dir) / "models/default-device_isolation_forest.pkl",
            )
        logger.debug(
            "isolation_forest_loading_model",
            candidate_paths=[str(p) for p in candidate_paths],
            models_dir=str(self.path_manager.models_dir),
        )

        for candidate in candidate_paths:
            try:
                if not candidate.exists():
                    logger.debug("model_path_not_found", path=str(candidate))
                    continue
            except (PermissionError, OSError):
                continue
            try:
                model_data = joblib.load(candidate)
                self.model = model_data.get("model")
                self.is_trained = model_data.get("is_trained", False)
                self.training_samples = model_data.get("training_samples", 0)
                self.n_estimators = model_data.get("n_estimators", self.n_estimators)
                self.contamination = model_data.get("contamination", self.contamination)
                self.status_detail = f"loaded:{candidate.name}"
                logger.info(
                    "isolation_forest_model_loaded",
                    path=str(candidate),
                    training_samples=self.training_samples,
                    is_trained=self.is_trained,
                )
                return True
            except Exception as e:
                logger.error("isolation_forest_load_error", path=str(candidate), error=str(e))
                self.status_detail = f"load_error:{e}"

        logger.warning(
            "no_model_found_in_paths",
            searched_paths=[str(p) for p in candidate_paths],
            models_dir=str(self.path_manager.models_dir),
        )
        print(_BOOTSTRAP_WARNING, flush=True)
        logger.warning(
            "no_model_file_found",
            attempted_path=str(load_path),
            detection_status="DISABLED",
            action_required="Ensure a trained model file is present at the expected path.",
        )
        self.status_detail = "missing_model_file"
        return False

    def save_model(self, file_path: Optional[str] = None) -> bool:
        if not self.is_trained or self.model is None:
            logger.warning("isolation_forest_save_skipped_not_trained")
            return False

        save_path = Path(file_path) if file_path else self.model_path

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
            self.status_detail = f"saved:{save_path.name}"
            logger.info("isolation_forest_model_saved", path=str(save_path))
            return True

        except Exception as e:
            logger.error("isolation_forest_save_error", error=str(e))
            raise ModelError(f"Failed to save model: {e}") from e

    def _detect_internal(self, features: Any) -> float:
        if not self.is_trained or self.model is None:
            return 0.0

        features_array = features if isinstance(features, np.ndarray) else np.array(features)
        if features_array.ndim == 1:
            features_array = features_array.reshape(1, -1)

        try:
            scores = self.model.score_samples(features_array)
            raw_anomaly_score = -(scores[0] - self.model.offset_)
            normalized = 1.0 / (1.0 + np.exp(-raw_anomaly_score))
            return float(normalized)
        except Exception as e:
            logger.error("isolation_forest_detect_internal_error", error=str(e))
            return 0.0

    def get_health(self) -> Dict[str, Any]:
        return {
            "detector": "IsolationForestDetector",
            "is_trained": self.is_trained,
            "status": "ok" if self.is_trained else "degraded",
            "status_detail": self.status_detail,
            "training_samples": self.training_samples,
            "model_path": str(self.model_path),
            "action_required": (
                None
                if self.is_trained
                else "Trained model file not found — reinstall the package or place a model at the expected path."
            ),
        }

    def get_model_info(self) -> Dict[str, Any]:
        return {
            "model_type": "IsolationForest",
            "model_version": self.model_version,
            "is_trained": self.is_trained,
            "training_samples": self.training_samples,
            "status_detail": self.status_detail,
            "parameters": {
                "n_estimators": self.n_estimators,
                "contamination": self.contamination,
                "max_samples": self.max_samples,
                "random_state": self.random_state,
            },
            "model_path": str(self.model_path),
        }
