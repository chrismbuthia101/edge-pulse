
from edgepulse.detectors.base import BaseDetector

__all__ = [
    "BaseDetector",
]

def get_isolation_forest_detector():
    from edgepulse.detectors.isolation_forest_detector import IsolationForestDetector
    return IsolationForestDetector

def get_autoencoder_detector():
    from edgepulse.detectors.autoencoder_reconstruction_detector import AutoencoderDetector
    return AutoencoderDetector

def get_ensemble_detector():
    from edgepulse.detectors.ensemble_detector import EnsembleDetector
    return EnsembleDetector
