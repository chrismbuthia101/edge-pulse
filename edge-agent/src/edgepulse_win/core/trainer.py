"""
Training module for machine learning models
"""

from typing import Any, Dict
from edgepulse_win.detectors.base import BaseDetector


class Trainer:
    """Trainer for anomaly detection models"""
    
    def __init__(self, detector: BaseDetector):
        self.detector = detector
        
    def train(self, training_data: Any, config: Dict[str, Any]) -> None:
        """Train the detector with provided data"""
        self.detector.train(training_data, config)
        
    def evaluate(self, test_data: Any) -> Dict[str, float]:
        """Evaluate detector performance"""
        return self.detector.evaluate(test_data)
