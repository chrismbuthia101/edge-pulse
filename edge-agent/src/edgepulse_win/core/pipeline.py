# Pipeline for processing telemetry data

from typing import List, Any
from edgepulse_win.collectors.base import BaseCollector
from edgepulse_win.features.extractor import FeatureExtractor
from edgepulse_win.detectors.base import BaseDetector
from edgepulse_win.alerts.alert_engine import AlertEngine
from edgepulse_win.alerts.models import Alert


class Pipeline:
    def __init__(
        self,
        collectors: List[BaseCollector],
        feature_extractor: FeatureExtractor,
        detectors: List[BaseDetector],
        alert_engine: AlertEngine
    ) -> None:
        self.collectors = collectors
        self.feature_extractor = feature_extractor
        self.detectors = detectors
        self.alert_engine = alert_engine
        
    def process(self) -> List[Alert]:
        telemetry_data: List[Any] = []
        for collector in self.collectors:
            data = collector.collect()
            telemetry_data.extend(data)
            
        features = self.feature_extractor.extract(telemetry_data)
        
        alerts: List[Alert] = []
        for detector in self.detectors:
            detector_alerts = detector.detect(features)
            alerts.extend(detector_alerts)
            
        self.alert_engine.process(alerts)
        
        return alerts
