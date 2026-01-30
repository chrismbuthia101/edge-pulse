# Training module for machine learning models

from typing import Any, Dict
from edgepulse_win.detectors.base import BaseDetector


class Trainer:
    def __init__(self, detector: BaseDetector) -> None:
        self.detector = detector
        
    def train(self, training_data: Any, config: Dict[str, Any]) -> None:
        self.detector.train(training_data, config)
        
    def evaluate(self, test_data: Any) -> Dict[str, float]:
        return self.detector.evaluate(test_data)
