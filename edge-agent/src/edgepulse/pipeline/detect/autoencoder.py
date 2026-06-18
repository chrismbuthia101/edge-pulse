from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, Optional

import numpy as np

from edgepulse.pipeline.detect.base import BaseDetector
from edgepulse.pipeline.detect.litert import LiteRTBackend, LITERT_AVAILABLE
from edgepulse.utils.log_handler import get_logger
from edgepulse.utils.path_manager import PathManager

logger = get_logger(__name__)


class AutoencoderDetector(BaseDetector):

    def __init__(
        self,
        model_path: Optional[Path] = None,
        device_id: Optional[str] = None,
        path_manager: Optional[PathManager] = None,
        model_version: str = "1.0",
    ):
        super().__init__(f"autoencoder_{device_id or 'default'}", model_version)
        self.path_manager = path_manager or PathManager()

        base_path = self.path_manager.get_model_path("autoencoder", device_id)
        self.model_path = Path(model_path) if model_path else base_path.with_suffix(".tflite")

        self._backend: Optional[LiteRTBackend] = None
        self.is_trained = False
        self.training_samples = 0
        self.reconstruction_threshold = 0.1

    def save_model(self, file_path: Optional[str] = None) -> bool:
        return True

    def load_model(self, file_path: Optional[str] = None) -> bool:
        load_path = Path(file_path) if file_path else self.model_path

        if not load_path.exists():
            logger.warning("Autoencoder model not found: %s", load_path)
            return False

        if not LITERT_AVAILABLE:
            logger.error("No LiteRT runtime. Install: pip install 'ai-edge-litert>=2.0.0'")
            return False

        try:
            self._backend = LiteRTBackend.from_file(str(load_path))

            meta_path = load_path.with_suffix(".metadata.json")
            if meta_path.exists():
                with open(meta_path) as f:
                    meta = json.load(f)
                self.reconstruction_threshold = float(
                    meta.get("threshold_value", self.reconstruction_threshold)
                )
                self.training_samples = meta.get("training_samples", 0)

            self.is_trained = True
            logger.info(
                "AutoencoderDetector: loaded %s via %s",
                load_path.name,
                self._backend.backend_name,
            )
            return True

        except Exception as exc:
            logger.error("AutoencoderDetector load error: %s", exc)
            return False

    def _detect_internal(self, features: Any) -> float:
        if not self.is_trained:
            return 0.0

        arr = np.asarray(features, dtype=np.float32).flatten().reshape(1, -1)

        if self._backend is None:
            if not self.load_model():
                return 0.0

        if self._backend is None:
            return 0.0
        try:
            recon = self._backend.run(arr)
            err = float(np.mean((arr - recon) ** 2))
            thr = self.reconstruction_threshold
            return float(min(1.0, err / thr)) if thr > 0 else 0.0
        except Exception as exc:
            logger.error("AutoencoderDetector inference error: %s", exc)
            return 0.0

    def get_health(self) -> Dict[str, Any]:
        return {
            "detector": "AutoencoderDetector",
            "is_trained": self.is_trained,
            "status": "ok" if self.is_trained else "degraded",
            "backend": self._backend.backend_name if self._backend else "none",
            "reconstruction_threshold": self.reconstruction_threshold,
            "training_samples": self.training_samples,
            "model_path": str(self.model_path),
            "litert_available": LITERT_AVAILABLE,
        }
