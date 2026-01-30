import logging
import signal
import sys
import threading
from typing import Optional, Any, List, Union

logger = logging.getLogger(__name__)

from edgepulse_win.collectors.system import SystemMetricsCollector
from edgepulse_win.collectors.process import ProcessMonitor
from edgepulse_win.collectors.network import NetworkMonitor
from edgepulse_win.features.extractor import FeatureExtractor
from edgepulse_win.features.baseline import DeviceNormalizer
from edgepulse_win.detectors.isolation_forest import IsolationForestDetector
from edgepulse_win.detectors.autoencoder import AutoencoderDetector
from edgepulse_win.detectors.ensemble import EnsembleDetector
from edgepulse_win.analysis.explainer import SHAPExplainer
from edgepulse_win.analysis.reporter import ReportGenerator
from edgepulse_win.storage.log_manager import LogManager
from edgepulse_win.alerts.alert_engine import AlertEngine
from edgepulse_win.alerts.notifier import LocalNotifier
from edgepulse_win.sync.supabase import SupabaseSync
from edgepulse_win.config.settings import SettingsManager
from edgepulse_win.config.privacy import PrivacyController
from edgepulse_win.core.runtime import Runtime
from edgepulse_win.core.pipeline import Pipeline
from edgepulse_win.utils.paths import PathManager
from edgepulse_win.exceptions import EdgePulseError

class EdgePulseAgent:
    def __init__(self, settings: Optional[Any] = None, device_id: str = "default-device") -> None:
        # Accept either settings object or device_id for backward compatibility
        if settings is not None:
            self.settings = settings
            self.device_id = getattr(settings, 'device_id', device_id)
        else:
            self.device_id = device_id
            self.running = False

            self._model_lock = threading.RLock()
            self._training_lock = threading.RLock()

            self.path_manager = PathManager()

            self.settings = SettingsManager(path_manager=self.path_manager)
        
        self.running = False
        self._model_lock = threading.RLock()
        self._training_lock = threading.RLock()
        
        if not hasattr(self, 'path_manager'):
            self.path_manager = PathManager()
        config = self.settings.get_config()

        self.privacy = PrivacyController(
            data_retention_days=config.privacy.data_retention_days,
            anonymization_level=config.privacy.anonymization_level,
            collect_command_lines=config.privacy.collect_command_lines,
        )

        self.metrics_collector = SystemMetricsCollector(
            collection_interval=config.collection.interval
        )
        self.process_monitor = ProcessMonitor()
        self.network_monitor = NetworkMonitor()

        self.feature_extractor = FeatureExtractor(
            window_1min=config.collection.window_1min,
            window_5min=config.collection.window_5min,
            window_15min=config.collection.window_15min,
            feature_dimension=config.features.feature_dimension,
            history_retention_hours=config.features.history_retention_hours,
        )
        self.normalizer = DeviceNormalizer(
            device_id=device_id,
            path_manager=self.path_manager,
        )

        self.normalizer.load_baseline()

        self.isolation_forest = IsolationForestDetector(
            n_estimators=config.detection.isolation_forest.get("n_estimators", 100),
            contamination=config.detection.isolation_forest.get("contamination", "auto"),
            device_id=device_id,
            path_manager=self.path_manager,
        )

        self.isolation_forest.load_model()

        self.autoencoder: Optional[AutoencoderDetector] = None
        if config.detection.use_autoencoder:
            autoencoder_config = config.detection.autoencoder
            input_dim = autoencoder_config.get("input_dim", config.features.feature_dimension)
            if input_dim != config.features.feature_dimension:
                logger.warning(
                    f"Autoencoder input_dim ({input_dim}) doesn't match feature_dimension "
                    f"({config.features.feature_dimension}), using feature_dimension"
                )
                input_dim = config.features.feature_dimension

            self.autoencoder = AutoencoderDetector(
                input_dim=input_dim,
                encoding_dim=autoencoder_config.get("encoding_dim", 8),
                hidden_layers=autoencoder_config.get("hidden_layers", [64, 32, 16]),
                learning_rate=autoencoder_config.get("learning_rate", 0.001),
                device_id=device_id,
                path_manager=self.path_manager,
            )

            self.autoencoder.load_model()

            if self.autoencoder.is_trained and self.autoencoder.input_dim != config.features.feature_dimension:
                logger.warning(
                    f"Loaded autoencoder input_dim ({self.autoencoder.input_dim}) doesn't match "
                    f"current feature_dimension ({config.features.feature_dimension}), "
                    f"will retrain on next training cycle"
                )
                self.autoencoder.is_trained = False

            detectors: List[Union[IsolationForestDetector, AutoencoderDetector]] = []
            if self.isolation_forest.is_trained:
                detectors.append(self.isolation_forest)
            if self.autoencoder and self.autoencoder.is_trained:
                detectors.append(self.autoencoder)

            self.ensemble = EnsembleDetector(
                detectors=detectors,
                voting_strategy="weighted",
                threshold=config.detection.threshold,
            )

        self.shap_explainer = SHAPExplainer(
            model=self.isolation_forest.model if self.isolation_forest.is_trained else None,
        )
        self.report_generator = ReportGenerator(device_id=device_id)

        self.log_manager = LogManager(
            device_id=device_id,
            retention_days=config.privacy.data_retention_days,
            path_manager=self.path_manager,
        )

        self.alert_engine = AlertEngine(
            correlation_window=config.alerting.correlation_window,
            rate_limit=config.alerting.rate_limit,
            rate_window=config.alerting.rate_window,
            min_severity=config.alerting.min_severity,
        )
        self.notifier = LocalNotifier()

        if config.sync.enabled:
            import os

            supabase_url = os.getenv("SUPABASE_URL", "").strip()
            supabase_key = os.getenv("SUPABASE_KEY", "").strip()
            if not supabase_url or not supabase_key:
                logger.warning("Sync enabled but missing SUPABASE_URL/SUPABASE_KEY; disabling sync")
                self.sync_client = None
            else:
                self.sync_client = SupabaseSync(
                    supabase_url=supabase_url,
                    supabase_key=supabase_key,
                    enabled=config.sync.enabled,
                )
        else:
            self.sync_client: Optional[SupabaseSync] = None

        # Create simple pipeline for runtime
        collectors: List[Union[SystemMetricsCollector, ProcessMonitor, NetworkMonitor]] = [self.metrics_collector, self.process_monitor, self.network_monitor]
        detectors: List[Union[IsolationForestDetector, AutoencoderDetector]] = []
        if self.isolation_forest.is_trained:
            detectors.append(self.isolation_forest)
        if self.autoencoder and self.autoencoder.is_trained:
            detectors.append(self.autoencoder)

        self.pipeline = Pipeline(
            collectors=collectors,
            feature_extractor=self.feature_extractor,
            detectors=detectors,
            alert_engine=self.alert_engine
        )

        # Use simple Runtime
        self.runtime = Runtime(pipeline=self.pipeline, interval=1.0)

    def initialize(self) -> None:
        logger.info("Initializing EdgePulse agent...")

        

        is_valid: bool
        errors: List[str]
        is_valid, errors = self.settings.validate_config()
        if not is_valid:
            raise EdgePulseError(f"Invalid configuration: {', '.join(errors)}")

        if not self.log_manager.verify_all_logs():
            logger.warning("Log integrity verification failed")

        logger.info("EdgePulse agent initialized")

    def start(self) -> None:
        logger.info("Starting EdgePulse agent...")
        self.running = True

        signal.signal(signal.SIGINT, self.handle_shutdown)
        signal.signal(signal.SIGTERM, self.handle_shutdown)

        try:
            self.runtime.start()
        except KeyboardInterrupt:
            self.handle_shutdown(signal.SIGINT, None)
        except Exception as e:
            logger.error(f"Error in main loop: {e}")
            self.handle_shutdown(signal.SIGTERM, None)

    def stop(self) -> None:
        logger.info("Stopping EdgePulse agent...")
        self.running = False

        self.runtime.stop()

        if self.isolation_forest.is_trained:
            self.isolation_forest.save_model()
        if self.autoencoder and self.autoencoder.is_trained:
            self.autoencoder.save_model()
        if self.normalizer.is_fitted:
            self.normalizer.save_baseline()

        self.log_manager.enforce_retention()

        logger.info("EdgePulse agent stopped")

    def run(self) -> None:
        """Run the agent in foreground mode"""
        self.initialize()
        self.start()

    def run_daemon(self) -> None:
        """Run the agent in daemon mode"""
        self.initialize()
        self.start()

    def handle_shutdown(self, signum: int, frame: Any) -> None:
        logger.info(f"Received signal {signum}, shutting down...")
        self.stop()
        sys.exit(0)
