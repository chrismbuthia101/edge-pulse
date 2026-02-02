#Ensemble Detector
# Combines multiple anomaly detectors with voting/weighting strategies.

import logging
from typing import Tuple, Dict, List, Optional
import numpy as np

logger = logging.getLogger(__name__)


class BaseDetector:
    
    def predict(self, features: np.ndarray) -> Tuple[int, float]:
        raise NotImplementedError


class EnsembleDetector:

    def __init__(
        self,
        detectors: List[BaseDetector],
        weights: Optional[Dict[str, float]] = None,
        voting_strategy: str = 'weighted',
        threshold: float = 0.5,
    ):
        self.detectors = detectors
        self.voting_strategy = voting_strategy
        self.threshold = threshold
        
        # Default weights (equal if not specified)
        if weights:
            self.weights = weights
        else:
            self.weights = {
                f"detector_{i}": 1.0 / len(detectors)
                for i in range(len(detectors))
            }
        
        # Ensure weights sum to 1
        total_weight = sum(self.weights.values())
        if total_weight > 0:
            self.weights = {k: v / total_weight for k, v in self.weights.items()}

    def set_weights(self, weights: Dict[str, float]) -> None:
        self.weights = weights
        # Normalize
        total_weight = sum(self.weights.values())
        if total_weight > 0:
            self.weights = {k: v / total_weight for k, v in self.weights.items()}

    def predict(self, features: np.ndarray) -> Tuple[int, float, Dict]:
        if not self.detectors:
            logger.warning("No detectors in ensemble")
            return (0, 0.0, {})
        
        detector_scores = {}
        labels = []
        scores = []
        confidences = []
        
        # Get predictions from all detectors
        for i, detector in enumerate(self.detectors):
            try:
                label, score = detector.predict(features)
                labels.append(label)
                scores.append(score)
                confidences.append(abs(score - 0.5) * 2)  # Confidence: distance from 0.5
                
                detector_name = f"detector_{i}"
                detector_scores[detector_name] = {
                    "label": label,
                    "score": score,
                    "confidence": confidences[-1],
                }
            except Exception as e:
                logger.error(f"Error getting prediction from detector {i}: {e}")
                continue
        
        if not labels:
            return (0, 0.0, {})
        
        # Apply voting strategy
        if self.voting_strategy == 'majority':
            # Simple majority vote
            final_label = 1 if sum(labels) > len(labels) / 2 else 0
            final_score = np.mean(scores)
            confidence = np.mean(confidences)
            
        elif self.voting_strategy == 'weighted':
            # Weighted average of scores
            weighted_scores = []
            for i, score in enumerate(scores):
                detector_name = f"detector_{i}"
                weight = self.weights.get(detector_name, 1.0 / len(self.detectors))
                weighted_scores.append(score * weight)
            
            final_score = sum(weighted_scores)
            final_label = 1 if final_score > self.threshold else 0
            confidence = abs(final_score - 0.5) * 2
            
        elif self.voting_strategy == 'confidence':
            # Weight by confidence
            weighted_scores = []
            total_confidence = sum(confidences)
            
            if total_confidence > 0:
                for i, (score, conf) in enumerate(zip(scores, confidences)):
                    weight = conf / total_confidence
                    weighted_scores.append(score * weight)
            else:
                weighted_scores = scores
            
            final_score = sum(weighted_scores)
            final_label = 1 if final_score > self.threshold else 0
            confidence = abs(final_score - 0.5) * 2
            
        else:
            logger.warning(f"Unknown voting strategy: {self.voting_strategy}, using majority")
            final_label = 1 if sum(labels) > len(labels) / 2 else 0
            final_score = np.mean(scores)
            confidence = np.mean(confidences)
        
        return (final_label, float(final_score), detector_scores)

    def calibrate_threshold(self, validation_data: np.ndarray, target_fpr: float = 0.05) -> None:
        if validation_data.ndim == 1:
            validation_data = validation_data.reshape(1, -1)
        
        # Get scores for all validation samples
        scores = []
        for sample in validation_data:
            _, score, _ = self.predict(sample.reshape(1, -1))
            scores.append(score)
        
        # Find threshold that gives target FPR
        # Assuming validation data is mostly normal
        scores_sorted = sorted(scores)
        threshold_index = int(len(scores_sorted) * (1 - target_fpr))
        
        if threshold_index < len(scores_sorted):
            self.threshold = scores_sorted[threshold_index]
            logger.info(f"Calibrated threshold to {self.threshold:.4f} (target FPR: {target_fpr})")
        else:
            logger.warning("Could not calibrate threshold")
