import asyncio
import signal
import platform
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Optional, List, Dict, Any
from pathlib import Path

from edgepulse.core.events_bus import EventBus, Event, EventType, get_event_bus
from edgepulse.core.async_pipeline import AsyncPipeline
from edgepulse.config.settings import AgentSettings
from edgepulse.utils.log_handler import configure_logging, get_logger
from edgepulse.storage.database import DatabaseManager
from edgepulse.storage.chain import HashChain
from edgepulse.sync.async_queue import AsyncSyncQueue
from edgepulse.api.api_server import AdaptiveAPIServer

from edgepulse.collectors.system_collector import SystemMetricsCollector
from edgepulse.collectors.process_collector import ProcessMonitor
from edgepulse.collectors.network_collector import NetworkMonitor
from edgepulse.features.feature_extractor import FeatureExtractor
from edgepulse.features.feature_normalizer import DeviceNormalizer
from edgepulse.detectors.isolation_forest_detector import IsolationForestDetector
from edgepulse.detectors.autoencoder_reconstruction_detector import AutoencoderDetector
from edgepulse.detectors.ensemble_detector import EnsembleDetector
from edgepulse.analysis.explainable_ai import SHAPExplainer
from edgepulse.analysis.report_generator import ReportGenerator
from edgepulse.alerts.alert_engine import AlertEngine
from edgepulse.alerts.notifier import LocalNotifier
from edgepulse.sync.supabase import SupabaseSync
from edgepulse.config.privacy import PrivacyController
from edgepulse.utils.path_manager import PathManager
from edgepulse.utils.error_handler import (
    EdgePulseError, ConfigurationError, ModelError,
    DetectionError, SyncError, NetworkError,
)
from edgepulse.shared.metrics import create_metrics_collector, StandardMetrics

logger = get_logger(__name__)

class EdgePulseAgent:
    """Async EdgePulse agent with dependency injection and modern architecture"""

    def __init__(
        self,
        settings: Optional[AgentSettings] = None,
        device_id: Optional[str] = None,
        # Dependency injection
        event_bus: Optional[EventBus] = None,
        database: Optional[DatabaseManager] = None,
        sync_queue: Optional[AsyncSyncQueue] = None,
        api_server: Optional[AdaptiveAPIServer] = None,
        # Component injection
        collectors: Optional[List[Any]] = None,
        detectors: Optional[List[Any]] = None,
        feature_extractor: Optional[Any] = None,
        alert_engine: Optional[Any] = None,
    ):
        self.settings = settings or AgentSettings()
        if device_id:
            self.settings.device_id = device_id

        self.device_id = self.settings.device_id

        self.event_bus = event_bus or get_event_bus()
        self.database = database or DatabaseManager(
            PathManager().data_dir / "edgepulse.db"
        )
        self.sync_queue = sync_queue or AsyncSyncQueue(
            PathManager().data_dir / "sync",
            max_size=self.settings.sync.offline_queue_max,
            max_retry_attempts=self.settings.sync.retry_max_attempts,
            batch_size=self.settings.sync.batch_size,
        )
        self.api_server = api_server or AdaptiveAPIServer(
            mode=self.settings.api.mode,
            port=self.settings.api.port,
            min_memory_mb=self.settings.api.min_memory_mb,
            min_cpu_cores=self.settings.api.min_cpu_cores,
        )
        self.hash_chain = HashChain(self.device_id, PathManager())
        self.metrics = create_metrics_collector("agent", self.device_id)

        # State
        self._running = False
        self._shutdown_event: Optional[asyncio.Event] = None
        self._tasks: List[asyncio.Task] = []
        self._pipeline: Optional[AsyncPipeline] = None
        self._sync_client: Optional[Any] = None

        self._collectors = collectors or self._create_collectors()
        self._detectors = detectors or self._create_detectors()
        self._feature_extractor = feature_extractor or self._create_feature_extractor()
        self._alert_engine = alert_engine or self._create_alert_engine()

        logger.info("async_agent_initialized", device_id=self.device_id)

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def initialize(self) -> None:
        """Initialize the agent and all components"""
        logger.info("initializing_async_agent", device_id=self.device_id)

        try:
            if self._shutdown_event is None:
                self._shutdown_event = asyncio.Event()

            configure_logging(
                log_level=self.settings.logging.level,
                log_file=(
                    Path(self.settings.logging.file_path)
                    if self.settings.logging.file_path
                    else None
                ),
                device_id=self.device_id,
            )

            await self.database.initialize()
            await self.sync_queue.initialize()
            await self._initialize_components()

            self._pipeline = AsyncPipeline(
                collectors=self._collectors,
                feature_extractor=self._feature_extractor,
                detectors=self._detectors,
                alert_engine=self._alert_engine,
                device_id=self.device_id,
                event_bus=self.event_bus,
                metrics_collector=self.metrics,
            )

            await self._setup_event_handlers()

            if self.settings.should_enable_sync():
                await self._initialize_sync_client()

            logger.info("async_agent_initialized_successfully", device_id=self.device_id)

        except Exception as e:
            logger.error("agent_initialization_failed", error=str(e))
            raise EdgePulseError(f"Failed to initialize agent: {e}") from e

    async def start(self) -> None:
        """Start the agent"""
        if self._running:
            logger.warning("agent_already_running")
            return

        logger.info("starting_async_agent", device_id=self.device_id)

        try:
            self._running = True

            await self.event_bus.start()

            if self._pipeline:
                await self._pipeline.start(self.settings.get_collection_interval_seconds())

            if self._sync_client:
                await self.sync_queue.start_worker(self._sync_client)

            if self.settings.should_enable_api():
                await self.api_server.start()

            await self._start_background_tasks()

            await self.event_bus.publish(Event(
                type=EventType.SYSTEM,
                data={"device_id": self.device_id, "event": "agent_started"},
                timestamp=datetime.utcnow(),
                source="async_agent",
            ))

            try:
                start_entry = self.hash_chain.create_entry(
                    "agent_started", {"device_id": self.device_id}
                )
                if not self.hash_chain.append(start_entry):
                    logger.error("hash_chain_append_failed", event_type="agent_started")
            except Exception as e:
                logger.error("hash_chain_error", error=str(e))

            logger.info("async_agent_started", device_id=self.device_id)

        except SyncError as e:
            logger.error("agent_start_failed", error=str(e))
            await self.stop()
            raise
        except Exception as e:
            logger.error("agent_start_failed", error=str(e))
            await self.stop()
            raise EdgePulseError(f"Failed to start agent: {e}") from e

    async def stop(self) -> None:
        """Stop the agent gracefully"""
        if not self._running:
            return

        logger.info("stopping_async_agent", device_id=self.device_id)

        self._running = False
        if self._shutdown_event is not None and not self._shutdown_event.is_set():
            self._shutdown_event.set()

        try:
            # Cancel background tasks first
            for task in self._tasks:
                task.cancel()
            await asyncio.gather(*self._tasks, return_exceptions=True)
            self._tasks.clear()

            # Stop collectors
            for collector in self._collectors:
                if hasattr(collector, 'stop'):
                    collector.stop()
                    logger.info("collector_stopped", collector=collector.__class__.__name__)

            # Stop pipeline
            if self._pipeline:
                await self._pipeline.stop()

            # Stop API server
            if self.api_server:
                await self.api_server.stop()

            # Stop sync queue
            if self.sync_queue:
                await self.sync_queue.stop()

            # Close sync client
            if self._sync_client:
                await self._sync_client.close()

            # Save state before shutting down the bus
            await self._save_state()

            # FIX: Publish stop event BEFORE stopping the event bus.
            # Previously this was published after event_bus.stop(), making it a
            # silent no-op because bus._running was already False at that point.
            await self.event_bus.publish(Event(
                type=EventType.SYSTEM,
                data={"device_id": self.device_id, "event": "agent_stopped"},
                timestamp=datetime.utcnow(),
                source="async_agent",
            ))

            # Now safe to close the bus — all events are queued
            await self.event_bus.stop()

            logger.info("async_agent_stopped", device_id=self.device_id)

        except Exception as e:
            logger.error("agent_stop_error", error=str(e))
            raise EdgePulseError(f"Failed to stop agent: {e}") from e

    async def run_forever(self) -> None:
        """Run the agent until shutdown signal"""
        await self.initialize()
        await self.start()

        self._setup_signal_handlers()

        try:
            if self._shutdown_event is None:
                raise RuntimeError("Agent shutdown event was not initialized")
            await self._shutdown_event.wait()
            logger.info("shutdown_event_received")
        except Exception as e:
            logger.error("run_forever_error", error=str(e))
        finally:
            await self.stop()

    @asynccontextmanager
    async def lifespan(self):
        """Context manager for agent lifecycle"""
        await self.initialize()
        try:
            await self.start()
            yield self
        finally:
            await self.stop()

    # ------------------------------------------------------------------
    # Signal handling
    # ------------------------------------------------------------------

    def _setup_signal_handlers(self) -> None:
        """
        Register asyncio-safe signal handlers for SIGINT / SIGTERM.
        """
        loop = asyncio.get_running_loop()

        def request_shutdown() -> None:
            logger.info("shutdown_signal_received")
            if self._shutdown_event and not self._shutdown_event.is_set():
                self._shutdown_event.set()

        if platform.system() == "Windows":
            # Windows does not support loop.add_signal_handler().
            # call_soon_threadsafe schedules request_shutdown() as a callback
            # on the next event loop iteration, making it safe.
            def _windows_sigint_handler(signum, frame) -> None:
                loop.call_soon_threadsafe(request_shutdown)

            def _windows_sigterm_handler(signum, frame) -> None:
                loop.call_soon_threadsafe(request_shutdown)

            signal.signal(signal.SIGINT, _windows_sigint_handler)
            signal.signal(signal.SIGTERM, _windows_sigterm_handler)
            logger.debug("signal_handlers_registered", platform="windows")
        else:
            # Unix/macOS: native asyncio signal integration.
            loop.add_signal_handler(signal.SIGINT, request_shutdown)
            loop.add_signal_handler(signal.SIGTERM, request_shutdown)
            logger.debug("signal_handlers_registered", platform="unix")

    # ------------------------------------------------------------------
    # Component factories
    # ------------------------------------------------------------------

    def _create_collectors(self) -> List[Any]:
        collectors = [
            SystemMetricsCollector(collection_interval=self.settings.collection.interval)
        ]
        if self.settings.collection.enable_process_monitoring:
            collectors.append(ProcessMonitor())
        if self.settings.collection.enable_network_monitoring:
            collectors.append(NetworkMonitor())
        return collectors

    def _create_detectors(self) -> List[Any]:
        path_manager = PathManager()
        detectors = []
        models_loaded = []

        isolation_forest = IsolationForestDetector(
            n_estimators=self.settings.detection.isolation_forest_n_estimators,
            contamination=self.settings.detection.isolation_forest_contamination,
            device_id=self.device_id,
            path_manager=path_manager,
        )
        isolation_forest.load_model()
        if isolation_forest.is_trained:
            detectors.append(isolation_forest)
            models_loaded.append("Isolation Forest")

        if self.settings.detection.use_autoencoder:
            autoencoder = AutoencoderDetector(
                input_dim=(
                    self.settings.detection.autoencoder_input_dim
                    or self.settings.features.feature_dimension
                ),
                encoding_dim=self.settings.detection.autoencoder_encoding_dim,
                hidden_layers=self.settings.detection.autoencoder_hidden_layers,
                learning_rate=self.settings.detection.autoencoder_learning_rate,
                use_tflite=self.settings.detection.autoencoder_use_tflite,
                device_id=self.device_id,
                path_manager=path_manager,
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

    def _create_feature_extractor(self) -> Any:
        return FeatureExtractor(
            window_1min=self.settings.collection.window_1min,
            window_5min=self.settings.collection.window_5min,
            window_15min=self.settings.collection.window_15min,
            feature_dimension=self.settings.features.feature_dimension,
            history_retention_hours=self.settings.features.history_retention_hours,
        )

    def _create_alert_engine(self) -> Any:
        return AlertEngine(
            correlation_window=self.settings.alerting.correlation_window,
            rate_limit=self.settings.alerting.rate_limit,
            rate_window=self.settings.alerting.rate_window,
            min_severity=self.settings.alerting.min_severity,
        )

    # ------------------------------------------------------------------
    # Initialization helpers
    # ------------------------------------------------------------------

    async def _initialize_components(self) -> None:
        for collector in self._collectors:
            if hasattr(collector, 'start'):
                collector.start()
                logger.info("collector_started", collector=collector.__class__.__name__)

        self.normalizer = DeviceNormalizer(
            device_id=self.device_id,
            path_manager=PathManager(),
        )
        baseline_loaded = self.normalizer.load_baseline()
        if baseline_loaded:
            logger.info("Feature normalizer baseline loaded successfully")
        else:
            logger.info("No baseline file found - normalizer will learn from data")

        if self._detectors:
            primary_detector = self._detectors[0]
            if hasattr(primary_detector, 'model') and primary_detector.model:
                self.shap_explainer = SHAPExplainer(
                    model_id=f"{self.device_id}_primary"
                )

        self.report_generator = ReportGenerator(device_id=self.device_id)

        if self.settings.alerting.enable_local_notifications:
            self.notifier = LocalNotifier()

    async def _initialize_sync_client(self) -> None:
        """Initialize Supabase sync client."""
        try:
            raw_key = self.settings.sync.supabase_key
            if raw_key is None:
                logger.warning("sync_client_skipped: supabase_key is None")
                return

            supabase_key = (
                raw_key.get_secret_value()
                if hasattr(raw_key, 'get_secret_value')
                else raw_key
            )

            self._sync_client = SupabaseSync(
                supabase_url=self.settings.sync.supabase_url,
                supabase_key=supabase_key,
                enabled=self.settings.sync.enabled,
                timeout=10.0,
                max_retries=3,
            )
            await self._sync_client.initialize()
            logger.info("async_sync_client_initialized")
        except SyncError as e:
            logger.error("sync_client_initialization_failed", error=str(e))
            self._sync_client = None
        except NetworkError as e:
            logger.error("sync_client_network_error", error=str(e))
            self._sync_client = None
        except Exception as e:
            logger.error("sync_client_initialization_failed", error=str(e))
            self._sync_client = None

    async def _setup_event_handlers(self) -> None:
        async def handle_anomaly(event: Event):
            data = event.data or {}
            detection = data.get("detection", {}) or {}
            features = data.get("features")
            severity_label = data.get("severity", detection.get("severity", "medium"))

            logger.info(
                "anomaly_detected",
                severity=severity_label,
                detector=detection.get("detector"),
            )

            self.metrics.increment_counter(
                StandardMetrics.ANOMALIES_DETECTED_TOTAL,
                labels={'severity': severity_label},
            )
            self.metrics.observe_histogram(
                StandardMetrics.ALERT_ANOMALY_SCORE,
                detection.get('anomaly_score', 0.5),
                labels={'severity': severity_label},
            )

            explanation: Dict[str, Any] = {}
            try:
                if (
                    hasattr(self, "shap_explainer")
                    and getattr(self, "shap_explainer", None)
                    and features is not None
                ):
                    explanation = self.shap_explainer.explain_prediction(features)
            except Exception as e:
                logger.error("shap_explanation_error", error=str(e))
                explanation = {}

            anomaly_data = {
                "anomaly_score": detection.get("anomaly_score", 0.0),
                "label": detection.get("label", 0),
                "confidence": detection.get("confidence", 0.0),
                "detector": detection.get("detector"),
            }

            report = await asyncio.to_thread(
                self.report_generator.generate_alert_report,
                anomaly_data,
                explanation,
                {"raw_detection": detection},
            )

            alert = None
            try:
                if self._alert_engine:
                    alert = self._alert_engine.process_anomaly(
                        report, report.get("explanation", {})
                    )
            except Exception as e:
                logger.error("alert_engine_error", error=str(e))
                alert = None

            if not alert:
                return

            alert_severity = str(alert.get("severity", severity_label))
            self.metrics.record_alert(alert_severity)

            try:
                if getattr(self, "notifier", None):
                    await asyncio.to_thread(self.notifier.notify_all, alert)
            except Exception as e:
                logger.error("local_notification_error", error=str(e))

            try:
                anomaly_entry = self.hash_chain.create_entry("anomaly_detected", detection)
                if not self.hash_chain.append(anomaly_entry):
                    logger.error("hash_chain_append_failed", event_type="anomaly_detected")
                alert_entry = self.hash_chain.create_entry("alert_generated", alert)
                if not self.hash_chain.append(alert_entry):
                    logger.error("hash_chain_append_failed", event_type="alert_generated")
            except Exception as e:
                logger.error("hash_chain_error", error=str(e))

            await self.event_bus.publish(Event(
                type=EventType.ALERT,
                data={"alert": alert},
                timestamp=datetime.utcnow(),
                source="async_agent",
            ))

        async def handle_sync_completed(event: Event):
            data = event.data
            logger.info("sync_completed", items=data.get('count', 0))
            self.metrics.increment_counter(StandardMetrics.SYNC_ATTEMPTS_TOTAL)
            self.metrics.set_gauge(StandardMetrics.SYNC_SUCCESS_RATE, 1.0)
            try:
                sync_entry = self.hash_chain.create_entry(
                    "sync_completed", {"count": data.get("count", 0)}
                )
                if not self.hash_chain.append(sync_entry):
                    logger.error("hash_chain_append_failed", event_type="sync_completed")
            except Exception as e:
                logger.error("hash_chain_error", error=str(e))

        self.event_bus.subscribe(EventType.DETECTION, handle_anomaly)
        self.event_bus.subscribe(EventType.SYNC, handle_sync_completed)

    # ------------------------------------------------------------------
    # Background tasks
    # ------------------------------------------------------------------

    async def _start_background_tasks(self) -> None:
        self._tasks.append(asyncio.create_task(self._health_check_loop()))
        self._tasks.append(asyncio.create_task(self._metrics_collection_loop()))
        self._tasks.append(asyncio.create_task(self._data_cleanup_loop()))

    async def _health_check_loop(self) -> None:
        await asyncio.sleep(5)
        while self._running:
            try:
                pipeline_healthy = self._pipeline is not None and self._pipeline._running
                api_healthy = (
                    not self.settings.should_enable_api() or self.api_server.is_healthy()
                )
                if not pipeline_healthy or not api_healthy:
                    logger.warning(
                        "component_health_issue",
                        pipeline_healthy=pipeline_healthy,
                        api_healthy=api_healthy,
                    )
                await asyncio.sleep(self.settings.health_check_interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("health_check_error", error=str(e))
                await asyncio.sleep(30)

    async def _metrics_collection_loop(self) -> None:
        while self._running:
            try:
                import psutil
                self.metrics.set_gauge(StandardMetrics.CPU_USAGE, psutil.cpu_percent())
                self.metrics.set_gauge(
                    StandardMetrics.MEMORY_USAGE, psutil.virtual_memory().percent
                )
                if self.sync_queue:
                    stats = self.sync_queue.get_stats()
                    self.metrics.set_gauge(
                        StandardMetrics.SYNC_QUEUE_SIZE, stats['queue_size']
                    )
                await asyncio.sleep(self.settings.metrics.collection_interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("metrics_collection_error", error=str(e))
                await asyncio.sleep(30)

    async def _data_cleanup_loop(self) -> None:
        while self._running:
            try:
                await asyncio.sleep(86400)
                if self._running:
                    cleanup_results = await self.database.cleanup_old_data(
                        retention_days=self.settings.get_data_retention_days()
                    )
                    logger.info("data_cleanup_completed", results=cleanup_results)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("data_cleanup_error", error=str(e))

    async def _save_state(self) -> None:
        try:
            for detector in self._detectors:
                if hasattr(detector, 'save_model'):
                    await asyncio.to_thread(detector.save_model)
            if hasattr(self, 'normalizer') and self.normalizer.is_fitted:
                await asyncio.to_thread(self.normalizer.save_baseline)
            logger.info("agent_state_saved")
        except Exception as e:
            logger.error("state_save_error", error=str(e))

    # ------------------------------------------------------------------
    # Status
    # ------------------------------------------------------------------

    def get_status(self) -> Dict[str, Any]:
        return {
            "device_id": self.device_id,
            "running": self._running,
            "environment": self.settings.environment,
            "api_enabled": self.settings.should_enable_api(),
            "sync_enabled": self.settings.should_enable_sync(),
            "ml_enabled": self.settings.should_enable_ml(),
            "pipeline_running": self._pipeline is not None and self._pipeline._running,
            "api_server_info": self.api_server.get_server_info() if self.api_server else None,
            "sync_queue_stats": self.sync_queue.get_stats() if self.sync_queue else None,
        }