"""
Base detector interface
"""

from abc import ABC, abstractmethod
from typing import Any, Dict, List


class BaseDetector(ABC):
    """Base class for anomaly detectors"""
    
    @abstractmethod
    def train(self, training_data: Any, config: Dict[str, Any]) -> None:
        """Train the detector"""
        pass
        
    @abstractmethod
    def detect(self, features: Any) -> List[Any]:
        """Detect anomalies in features"""
        pass
        
    @abstractmethod
    def evaluate(self, test_data: Any) -> Dict[str, float]:
        """Evaluate detector performance"""
        pass
