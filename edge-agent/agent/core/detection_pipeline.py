"""
Detection Pipeline

Orchestrates the detection workflow from feature extraction to alerting.
"""

import logging
from typing import Optional, Dict, Any
import numpy as np

from agent.exceptions import DetectionError, ValidationError
from agent.features import FeatureExtractor, DeviceNormalizer
from agent.detection import EnsembleDetector
from agent.explainability import SHAPExplainer, ReportGenerator
from agent.alerting import AlertEngine
from agent.models import TelemetryData

logger = logging.getLogger(__name__)


class DetectionPipeline:
    """
    Orchestrates the detection workflow.
    
    Handles feature extraction, normalization, detection, explanation, and alerting.
    """

    def __init__(
        self,
        device_id: str,
        feature_extractor: FeatureExtractor,
        normalizer: DeviceNormalizer,
        ensemble: EnsembleDetector,
        shap_explainer: SHAPExplainer,
        report_generator: ReportGenerator,
        alert_engine: AlertEngine,
    ):
        """
        Initialize detection pipeline.
        
        Args:
            device_id: Device identifier
            feature_extractor: Feature extractor instance
            normalizer: Device normalizer instance
            ensemble: Ensemble detector instance
            shap_explainer: SHAP explainer instance
            report_generator: Report generator instance
            alert_engine: Alert engine instance
        """
        self.device_id = device_id
        self.feature_extractor = feature_extractor
        self.normalizer = normalizer
        self.ensemble = ensemble
        self.shap_explainer = shap_explainer
        self.report_generator = report_generator
        self.alert_engine = alert_engine

    def process_telemetry(
        self,
        telemetry: Dict[str, Any],
        training_data: Optional[np.ndarray] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Process telemetry through detection pipeline.
        
        Args:
            telemetry: Telemetry data dictionary
            training_data: Optional training data for SHAP background
            
        Returns:
            Alert dictionary if anomaly detected, None otherwise
            
        Raises:
            DetectionError: If detection fails
            ValidationError: If feature dimension mismatch
        """
        try:
            # Extract features
            features = self.feature_extractor.extract_all_features(telemetry)
            
            # Validate feature dimension
            expected_dim = self.feature_extractor.feature_dimension
            if len(features) != expected_dim:
                raise ValidationError(
                    f"Feature dimension mismatch: expected {expected_dim}, got {len(features)}"
                )
            
            # Check if normalizer is fitted
            if not self.normalizer.is_fitted:
                logger.debug("Normalizer not fitted, skipping detection")
                return None
            
            # Normalize features
            normalized = self.normalizer.transform(features.reshape(1, -1))
            
            # Check if ensemble has trained detectors
            if not self.ensemble.detectors:
                logger.warning("No detectors in ensemble")
                return None
            
            # Detect anomalies
            label, score, detector_scores = self.ensemble.predict(normalized)
            
            if label == 1:
                # Generate explanation
                background_data = training_data[-100:] if training_data is not None and len(training_data) > 0 else None
                explanation_dict = self.shap_explainer.explain_prediction(
                    normalized[0],
                    background_data=background_data,
                )
                
                # Generate report
                anomaly_data = {
                    "label": label,
                    "score": score,
                    "confidence": score,
                }
                report = self.report_generator.generate_alert_report(
                    anomaly_data,
                    explanation_dict,
                    context=telemetry,
                )
                
                # Process alert
                alert = self.alert_engine.process_anomaly(report, explanation_dict)
                
                return alert
            
            return None
        except ValidationError:
            raise
        except Exception as e:
            logger.error(f"Error in detection pipeline: {e}")
            raise DetectionError(f"Detection pipeline failed: {e}") from e
