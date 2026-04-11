# Isolation Forest Detector
# Primary unsupervised anomaly detector using Isolation Forest algorithm.

from edgepulse.utils.log_handler import get_logger
import joblib
import time
import hashlib
from typing import Tuple, Optional, Any, Dict, List
from pathlib import Path
import numpy as np
from sklearn.ensemble import IsolationForest

from edgepulse.utils.error_handler import ModelError
from edgepulse.utils.path_manager import PathManager
from edgepulse.detectors.base import BaseDetector

logger = get_logger(__name__)

# Printed once to stdout so it appears in any log aggregator even before
# structlog is fully configured.
_BOOTSTRAP_WARNING = """
╔══════════════════════════════════════════════════════════════════╗
║  EdgePulse — NO MODEL FILE FOUND                                ║
║                                                                  ║
║  Anomaly detection is DISABLED until a model is bootstrapped.   ║
║                                                                  ║
║  Run:  python bootstrap_model.py                                 ║
║  Then restart the agent.                                         ║
╚══════════════════════════════════════════════════════════════════╝
"""


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
        self.n_estimators = n_estimators
        self.contamination = contamination
        self.max_samples = max_samples
        self.random_state = random_state
        self.model_version = model_version
        self.path_manager = path_manager or PathManager()

        if model_path:
            self.model_path = Path(model_path)
        else:
            self.model_path = self.path_manager.get_model_path(
                "isolation_forest", device_id
            )

        self.model: Optional[IsolationForest] = None
        self.is_trained = False
        self.training_samples = 0
        self.model_hash: Optional[str] = None
        self.training_timestamp: Optional[str] = None

        # Human-readable status exposed to /health endpoint
        self.status_detail: str = "not_loaded"

    # ------------------------------------------------------------------
    # Model loading — the key change
    # ------------------------------------------------------------------

    def load_model(self, path: Optional[Path] = None) -> bool:
        """Load a trained model from disk.

        Returns True on success.  On failure emits a prominent warning
        and sets ``is_trained = False`` so the pipeline can run safely
        without detection rather than crashing.
        """
        load_path = Path(path) if path else self.model_path

        # Also check the canonical bootstrap output path so the detector
        # finds models/edgepulse_primary_isolation_forest.joblib without
        # requiring explicit configuration.
        candidate_paths = [load_path]
        bootstrap_path = (
            self.path_manager.models_dir / "edgepulse_primary_isolation_forest.joblib"
        )
        if bootstrap_path not in candidate_paths and bootstrap_path.exists():
            candidate_paths.insert(0, bootstrap_path)

        for candidate in candidate_paths:
            if not candidate.exists():
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

        # No model found — emit a highly visible warning.
        self._emit_bootstrap_warning(load_path)
        self.status_detail = "missing_model_file"
        return False

    def _emit_bootstrap_warning(self, attempted_path: Path) -> None:
        """Print a prominent warning to stdout and structured logger."""
        print(_BOOTSTRAP_WARNING, flush=True)
        logger.warning(
            "no_model_file_found",
            attempted_path=str(attempted_path),
            bootstrap_command="python bootstrap_model.py",
            detection_status="DISABLED",
            action_required=(
                "Run `python bootstrap_model.py` then restart the agent "
                "to enable anomaly detection."
            ),
        )

    def get_health(self) -> Dict[str, Any]:
        """Return a dict suitable for inclusion in the /health API response."""
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
                else "Run `python bootstrap_model.py` and restart the agent."
            ),
        }

    # ------------------------------------------------------------------
    # Training
    # ------------------------------------------------------------------

    def train(self, training_data: Any, config: Dict[str, Any]) -> None:
        features = (
            training_data
            if isinstance(training_data, np.ndarray)
            else np.array(training_data)
        )

        if features.ndim == 1:
            features = features.reshape(1, -1)

        if features.shape[0] < 1:
            raise ModelError("Cannot train with empty feature array")

        try:
            logger.info("isolation_forest_training_start", n_samples=len(features))

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
            self.status_detail = "trained_in_memory"
            logger.info("isolation_forest_training_complete", n_samples=len(features))

        except Exception as e:
            logger.error("isolation_forest_training_error", error=str(e))
            raise ModelError(f"Failed to train Isolation Forest: {e}") from e

    # ------------------------------------------------------------------
    # Detection
    # ------------------------------------------------------------------

    def _detect_internal(self, features: Any) -> float:
        if not self.is_trained or self.model is None:
            return 0.0

        features_array = (
            features if isinstance(features, np.ndarray) else np.array(features)
        )
        if features_array.ndim == 1:
            features_array = features_array.reshape(1, -1)

        try:
            scores = self.model.score_samples(features_array)
            return float((1 - scores[0]) / 2)
        except Exception as e:
            logger.error("isolation_forest_detect_internal_error", error=str(e))
            return 0.0

    def detect(self, features: Any) -> List[Any]:
        if not self.is_trained or self.model is None:
            logger.debug("isolation_forest_detect_skipped_not_trained")
            return [(0, 0.0)] * (len(features) if hasattr(features, "__len__") else 1)

        features_array = (
            features if isinstance(features, np.ndarray) else np.array(features)
        )
        if features_array.ndim == 1:
            features_array = features_array.reshape(1, -1)

        try:
            start_time = time.perf_counter()
            scores = self.model.score_samples(features_array)
            normalized_scores = (1 - scores) / 2
            predictions = self.model.predict(features_array)
            labels = (predictions == -1).astype(int)

            latency_ms = (time.perf_counter() - start_time) * 1000
            logger.debug(
                "isolation_forest_inference",
                latency_ms=round(latency_ms, 2),
                n_samples=len(features_array),
            )

            return [
                (int(labels[i]), float(normalized_scores[i]))
                for i in range(len(labels))
            ]

        except Exception as e:
            logger.error("isolation_forest_detect_error", error=str(e))
            return [(0, 0.0)] * len(features_array)

    def predict(self, features: np.ndarray) -> Tuple[int, float]:
        if not self.is_trained or self.model is None:
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
            logger.error("isolation_forest_predict_error", error=str(e))
            return (0, 0.0)

    # ------------------------------------------------------------------
    # Persistence
    # ------------------------------------------------------------------

    def save_model(self, path: Optional[Path] = None) -> bool:
        if not self.is_trained or self.model is None:
            logger.warning("isolation_forest_save_skipped_not_trained")
            return False

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
            self.status_detail = f"saved:{save_path.name}"
            logger.info("isolation_forest_model_saved", path=str(save_path))
            return True

        except Exception as e:
            logger.error("isolation_forest_save_error", error=str(e))
            raise ModelError(f"Failed to save model: {e}") from e

    def evaluate(self, test_data: Any) -> Dict[str, float]:
        if not self.is_trained or self.model is None:
            return {"accuracy": 0.0, "precision": 0.0, "recall": 0.0}

        try:
            if isinstance(test_data, np.ndarray):
                if test_data.ndim == 1:
                    test_data = test_data.reshape(1, -1)

                predictions = [self.predict(sample) for sample in test_data]

                if predictions:
                    anomaly_count = sum(1 for label, _ in predictions if label == 1)
                    avg_score = sum(score for _, score in predictions) / len(predictions)
                    return {
                        "anomaly_rate": anomaly_count / len(predictions),
                        "avg_anomaly_score": avg_score,
                        "total_samples": len(predictions),
                    }

            return {"accuracy": 0.0, "precision": 0.0, "recall": 0.0}

        except Exception as e:
            logger.error("isolation_forest_evaluate_error", error=str(e))
            return {"accuracy": 0.0, "precision": 0.0, "recall": 0.0}

    # ------------------------------------------------------------------
    # Integrity / drift
    # ------------------------------------------------------------------

    def verify_model_integrity(self) -> bool:
        if not self.is_trained or self.model is None:
            return False

        try:
            model_state = {
                "n_estimators": self.model.n_estimators,
                "contamination": self.model.contamination,
                "max_samples": self.model.max_samples,
                "random_state": self.model.random_state,
                "training_samples": self.training_samples,
                "model_version": self.model_version,
            }
            current_hash = hashlib.sha256(
                str(sorted(model_state.items())).encode()
            ).hexdigest()

            if self.model_hash is None:
                self.model_hash = current_hash
                logger.info("isolation_forest_integrity_hash_stored")
                return True
            elif current_hash != self.model_hash:
                logger.error("isolation_forest_integrity_hash_mismatch")
                return False
            else:
                logger.debug("isolation_forest_integrity_ok")
                return True

        except Exception as e:
            logger.error("isolation_forest_integrity_error", error=str(e))
            return False

    def get_model_info(self) -> Dict[str, Any]:
        return {
            "model_type": "IsolationForest",
            "model_version": self.model_version,
            "is_trained": self.is_trained,
            "training_samples": self.training_samples,
            "training_timestamp": self.training_timestamp,
            "model_hash": self.model_hash,
            "status_detail": self.status_detail,
            "parameters": {
                "n_estimators": self.n_estimators,
                "contamination": self.contamination,
                "max_samples": self.max_samples,
                "random_state": self.random_state,
            },
            "model_path": str(self.model_path),
        }

    def detect_with_drift_check(
        self,
        features: Any,
        baseline_features: Optional[np.ndarray] = None,
    ) -> Tuple[List[Any], Dict[str, Any]]:
        results = self.detect(features)
        drift_info: Dict[str, Any] = {
            "drift_detected": False,
            "drift_score": 0.0,
            "baseline_comparison": False,
        }

        if baseline_features is not None and self.is_trained:
            try:
                current_features = (
                    features if isinstance(features, np.ndarray) else np.array(features)
                )
                if current_features.ndim == 1:
                    current_features = current_features.reshape(1, -1)

                baseline_scores = self.model.score_samples(baseline_features)
                current_scores = self.model.score_samples(current_features)
                drift_score = abs(np.mean(baseline_scores) - np.mean(current_scores))

                drift_info["drift_score"] = float(drift_score)
                drift_info["drift_detected"] = drift_score > 0.1
                drift_info["baseline_comparison"] = True

                if drift_info["drift_detected"]:
                    logger.warning(
                        "isolation_forest_drift_detected",
                        drift_score=round(drift_score, 4),
                    )

            except Exception as e:
                logger.error("isolation_forest_drift_check_error", error=str(e))

        return results, drift_info