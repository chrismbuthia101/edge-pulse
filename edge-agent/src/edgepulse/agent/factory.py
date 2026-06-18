from typing import Any, List, Optional

from edgepulse.analysis.alert_report import AlertReportBuilder
from edgepulse.analysis.service import ExplainerService
from edgepulse.config.settings import AgentSettings
from edgepulse.models.metrics import create_metrics_collector
from edgepulse.pipeline.alert.engine import AlertEngine as AlertEngineImpl
from edgepulse.pipeline.alert.handler import AlertHandler
from edgepulse.pipeline.alert.notifier import LocalNotifier
from edgepulse.pipeline.collect.system import SystemMetricsCollector
from edgepulse.pipeline.collect.process import ProcessMonitor
from edgepulse.pipeline.collect.network import NetworkMonitor
from edgepulse.pipeline.detect.autoencoder import AutoencoderDetector
from edgepulse.pipeline.detect.isolation_forest import IsolationForestDetector
from edgepulse.pipeline.extract.normalizer import DeviceNormalizer
from edgepulse.pipeline.protocols import AlertEngine, Collector, Detector, FeatureExtractor
from edgepulse.storage.database import Database
from edgepulse.sync.service import SyncService
from edgepulse.sync.sync_queue import SyncQueue
from edgepulse.utils.log_handler import get_logger
from edgepulse.utils.path_manager import PathManager

logger = get_logger(__name__)


class ComponentFactory:

    def __init__(self, settings: AgentSettings, device_id: str):
        self.settings = settings
        self.device_id = device_id
        self._path_manager = PathManager()

    def create_collectors(self) -> List[Collector]:
        collectors: List[Collector] = [
            SystemMetricsCollector(collection_interval=self.settings.collection.interval)
        ]
        if self.settings.collection.enable_process_monitoring:
            collectors.append(ProcessMonitor())
        if self.settings.collection.enable_network_monitoring:
            collectors.append(NetworkMonitor())
        return collectors

    def create_detectors(self) -> List[Detector]:
        detectors: List[Detector] = []
        models_loaded: List[str] = []

        isolation_forest = IsolationForestDetector(
            n_estimators=self.settings.detection.isolation_forest_n_estimators,
            contamination=self.settings.detection.isolation_forest_contamination,
            device_id=self.device_id,
            path_manager=self._path_manager,
        )
        isolation_forest.load_model()
        if isolation_forest.is_trained:
            detectors.append(isolation_forest)
            models_loaded.append("Isolation Forest")

        if self.settings.detection.use_autoencoder:
            autoencoder = AutoencoderDetector(
                device_id=self.device_id,
                path_manager=self._path_manager,
            )
            autoencoder.load_model()
            if autoencoder.is_trained:
                detectors.append(autoencoder)
                models_loaded.append("Autoencoder")

        if models_loaded:
            logger.info(f"Models loaded: {', '.join(models_loaded)}")
        else:
            logger.info("No model files loaded - system will run without anomaly detection")

        if self.settings.detection.use_ensemble and len(detectors) > 1:
            logger.info(
                f"Multiple detectors available, using primary: {type(detectors[0]).__name__}"
            )

        return detectors

    def create_feature_extractor(self) -> FeatureExtractor:
        from edgepulse.pipeline.extract.extractor import FeatureExtractor as _FE

        return _FE(
            window_1min=self.settings.collection.window_1min,
            window_5min=self.settings.collection.window_5min,
            feature_dimension=self.settings.features.feature_dimension,
            history_retention_hours=self.settings.features.history_retention_hours,
        )

    def create_alert_engine(self) -> AlertEngine:
        return AlertEngineImpl(
            correlation_window=self.settings.alerting.correlation_window,
            rate_limit=self.settings.alerting.rate_limit,
            rate_window=self.settings.alerting.rate_window,
            min_severity=self.settings.alerting.min_severity,
        )

    def create_normalizer(self) -> DeviceNormalizer:
        normalizer = DeviceNormalizer(
            device_id=self.device_id,
            path_manager=self._path_manager,
        )
        return normalizer

    def create_alert_report_builder(self) -> AlertReportBuilder:
        return AlertReportBuilder(device_id=self.device_id)

    def create_notifier(self) -> Optional[LocalNotifier]:
        if self.settings.alerting.enable_local_notifications:
            return LocalNotifier()
        return None

    def create_alert_handler(
        self,
        database: Database,
        sync_queue: Optional[SyncQueue],
        alert_engine: AlertEngine,
        metrics: Any,
    ) -> AlertHandler:
        report_builder = self.create_alert_report_builder()
        notifier = self.create_notifier()
        return AlertHandler(
            device_id=self.device_id,
            report_generator=report_builder,
            alert_engine=alert_engine,
            database=database,
            sync_queue=sync_queue,
            metrics=metrics,
            notifier=notifier,
        )

    def create_sync_service(self, sync_queue: SyncQueue) -> Optional[SyncService]:
        raw_key = self.settings.sync.api_key
        if raw_key is None:
            logger.warning("sync_client_skipped: api_key is None")
            return None

        supabase_url = self.settings.sync.supabase_url
        if not supabase_url:
            logger.warning("sync_client_skipped: supabase_url is empty")
            return None

        api_key: str = raw_key.get_secret_value()

        return SyncService(
            sync_queue=sync_queue,
            supabase_url=supabase_url,
            api_key=api_key,
            device_id=self.device_id,
        )

    def create_explainer_service(self) -> ExplainerService:
        return ExplainerService(self.device_id)

    def create_metrics(self) -> Any:
        return create_metrics_collector(device_id=self.device_id)
