"""ML Anomaly Detection Modules

Machine learning models for detecting anomalous behavior.
"""

from edgepulse_win.detectors.base import BaseDetector

__all__ = [
    "BaseDetector",
]

# Lazy imports for heavy dependencies
def get_isolation_forest_detector():
    from edgepulse_win.detectors.isolation_forest import IsolationForestDetector
    return IsolationForestDetector

def get_autoencoder_detector():
    from edgepulse_win.detectors.autoencoder import AutoencoderDetector
    return AutoencoderDetector

def get_ensemble_detector():
    from edgepulse_win.detectors.ensemble import EnsembleDetector
    return EnsembleDetector
