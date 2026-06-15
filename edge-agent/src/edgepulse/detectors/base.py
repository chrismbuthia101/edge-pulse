

import time
import hashlib
import json
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional
from dataclasses import dataclass

from edgepulse.utils.log_handler import get_logger

logger = get_logger(__name__)


@dataclass
class DetectionResult:
    anomaly_score: float
    detection_threshold_applied: float
    is_alert_triggered: bool
    inference_latency_ms: int
    model_id: str
    model_version: str
    timestamp: str
    features_hash: Optional[str] = None
    explanation: Optional[Dict[str, Any]] = None


@dataclass
class ModelMetadata:
    model_id: str
    model_version: str
    model_hash: str
    created_at: str
    file_path: str
    integrity_verified: bool = False


class BaseDetector(ABC):
    
    def __init__(self, model_id: str, model_version: str = "1.0"):
        self.model_id = model_id
        self.model_version = model_version
        self.model_metadata: Optional[ModelMetadata] = None
        self.detection_threshold = 0.5
        self._integrity_verified = False
        
    @abstractmethod
    def train(self, training_data: Any, config: Dict[str, Any]) -> None:
        pass

    @abstractmethod
    def _detect_internal(self, features: Any) -> float:
        pass

    def detect(self, features: Any) -> DetectionResult:
        start_time = time.perf_counter()
        
        try:
            if not self._integrity_verified and self.model_metadata:
                self._verify_model_integrity()
            
            anomaly_score = self._detect_internal(features)

            is_alert_triggered = anomaly_score >= self.detection_threshold

            end_time = time.perf_counter()
            inference_latency_ms = int((end_time - start_time) * 1000)

            features_hash = self._hash_features(features)


            result = DetectionResult(
                anomaly_score=anomaly_score,
                detection_threshold_applied=self.detection_threshold,
                is_alert_triggered=is_alert_triggered,
                inference_latency_ms=inference_latency_ms,
                model_id=self.model_id,
                model_version=self.model_version,
                timestamp=time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime()),
                features_hash=features_hash
            )
            
            logger.debug(f"Detection completed in {inference_latency_ms}ms, score: {anomaly_score:.4f}")
            return result
            
        except Exception as e:
            logger.error(f"Error during detection: {e}")
            end_time = time.perf_counter()
            inference_latency_ms = int((end_time - start_time) * 1000)
            
            return DetectionResult(
                anomaly_score=0.0,
                detection_threshold_applied=self.detection_threshold,
                is_alert_triggered=False,
                inference_latency_ms=inference_latency_ms,
                model_id=self.model_id,
                model_version=self.model_version,
                timestamp=time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
            )
    
    def detect_batch(self, features_list: List[Any]) -> List[DetectionResult]:
        results = []
        total_start_time = time.perf_counter()
        
        for features in features_list:
            result = self.detect(features)
            results.append(result)
        
        total_end_time = time.perf_counter()
        total_latency_ms = int((total_end_time - total_start_time) * 1000)
        
        logger.debug(f"Batch detection completed: {len(features_list)} samples in {total_latency_ms}ms")
        return results
    
    @abstractmethod
    def evaluate(self, test_data: Any) -> Dict[str, float]:
        pass

    @abstractmethod
    def save_model(self, file_path: str) -> bool:
        pass

    @abstractmethod
    def load_model(self, file_path: str) -> bool:
        pass

    def load_model_with_integrity(self, file_path: str) -> bool:
        try:
            success = self.load_model(file_path)
            if not success:
                return False

            self.model_metadata = self._calculate_model_metadata(file_path)


            integrity_ok = self._verify_model_integrity()
            
            if integrity_ok:
                logger.info(f"Model loaded and integrity verified: {self.model_id}")
                return True
            else:
                logger.error(f"Model integrity verification failed: {file_path}")
                return False
                
        except Exception as e:
            logger.error(f"Error loading model with integrity check: {e}")
            return False
    
    def _calculate_model_metadata(self, file_path: str) -> ModelMetadata:
        try:
            import os
            
            file_hash = self._calculate_file_hash(file_path)


            stat = os.stat(file_path)
            created_at = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime(stat.st_ctime))
            
            metadata = ModelMetadata(
                model_id=self.model_id,
                model_version=self.model_version,
                model_hash=file_hash,
                created_at=created_at,
                file_path=file_path,
                integrity_verified=False
            )
            
            return metadata
            
        except Exception as e:
            logger.error(f"Error calculating model metadata: {e}")
            return ModelMetadata(
                model_id=self.model_id,
                model_version=self.model_version,
                model_hash="unknown",
                created_at=time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime()),
                file_path=file_path,
                integrity_verified=False
            )
    
    def _calculate_file_hash(self, file_path: str) -> str:
        try:
            hash_sha256 = hashlib.sha256()
            with open(file_path, "rb") as f:
                for chunk in iter(lambda: f.read(4096), b""):
                    hash_sha256.update(chunk)
            return hash_sha256.hexdigest()
        except Exception as e:
            logger.error(f"Error calculating file hash: {e}")
            return "unknown"
    
    def _verify_model_integrity(self) -> bool:
        try:
            if not self.model_metadata:
                logger.warning("No model metadata available for integrity verification")
                return False
            
            current_hash = self._calculate_file_hash(self.model_metadata.file_path)


            integrity_ok = current_hash == self.model_metadata.model_hash
            
            if integrity_ok:
                self._integrity_verified = True
                self.model_metadata.integrity_verified = True
                logger.debug("Model integrity verified successfully")
            else:
                logger.error("Model integrity verification failed - hash mismatch")
                self._integrity_verified = False
            
            return integrity_ok
            
        except Exception as e:
            logger.error(f"Error verifying model integrity: {e}")
            self._integrity_verified = False
            return False
    
    def _hash_features(self, features: Any) -> str:
        try:
            if hasattr(features, 'tolist'):
                features_json = json.dumps(features.tolist(), sort_keys=True)
            elif hasattr(features, '__dict__'):
                features_json = json.dumps(features.__dict__, sort_keys=True)
            else:
                features_json = json.dumps(features, sort_keys=True)
            
            return hashlib.sha256(features_json.encode('utf-8')).hexdigest()
            
        except Exception as e:
            logger.error(f"Error hashing features: {e}")
            return hashlib.sha256(str(features).encode('utf-8')).hexdigest()
    
    def set_detection_threshold(self, threshold: float) -> None:
        if 0.0 <= threshold <= 1.0:
            self.detection_threshold = threshold
            logger.info(f"Detection threshold set to: {threshold}")
        else:
            raise ValueError("Detection threshold must be between 0.0 and 1.0")
    
    def get_model_info(self) -> Dict[str, Any]:
        return {
            "model_id": self.model_id,
            "model_version": self.model_version,
            "detection_threshold": self.detection_threshold,
            "integrity_verified": self._integrity_verified,
            "metadata": self.model_metadata.__dict__ if self.model_metadata else None
        }
    
    def is_integrity_verified(self) -> bool:
        return self._integrity_verified
    
    def update_baseline(self, new_threshold: float) -> bool:
        try:
            old_threshold = self.detection_threshold
            self.set_detection_threshold(new_threshold)
            
            logger.info(f"Baseline updated: {old_threshold} -> {new_threshold}")
            return True
            
        except Exception as e:
            logger.error(f"Error updating baseline: {e}")
            return False
    
    def detect_drift(self, recent_scores: List[float], window_size: int = 100) -> Dict[str, Any]:
        try:
            if len(recent_scores) < window_size:
                return {"drift_detected": False, "reason": "Insufficient data"}
            
            recent_mean = sum(recent_scores[-window_size:]) / window_size
            recent_variance = sum((x - recent_mean) ** 2 for x in recent_scores[-window_size:]) / window_size
            
            baseline_mean = 0.5
            mean_change = abs(recent_mean - baseline_mean)

            drift_detected = mean_change > 0.2
            
            result = {
                "drift_detected": drift_detected,
                "recent_mean": recent_mean,
                "recent_variance": recent_variance,
                "mean_change": mean_change,
                "window_size": window_size,
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
            }
            
            if drift_detected:
                logger.warning(f"Drift detected: mean change {mean_change:.3f}")
            
            return result
            
        except Exception as e:
            logger.error(f"Error detecting drift: {e}")
            return {"drift_detected": False, "reason": f"Error: {e}"}
