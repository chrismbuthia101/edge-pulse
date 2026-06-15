

import asyncio
import json
import signal
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Optional, List, Dict, Any
from pathlib import Path

from edgepulse.platform import is_windows

from edgepulse.core.events_bus import EventBus, Event, EventType, get_event_bus
from edgepulse.core.async_pipeline import AsyncPipeline
from edgepulse.config.settings import AgentSettings
from edgepulse.utils.log_handler import configure_logging, get_logger
from edgepulse.storage.database import Database
from edgepulse.sync.sync_queue import SyncQueue
from edgepulse.api.api_server import AdaptiveAPIServer, register_detector_health_provider

from edgepulse.collectors.system_collector import SystemMetricsCollector
from edgepulse.collectors.process_collector import ProcessMonitor
from edgepulse.collectors.network_collector import NetworkMonitor
from edgepulse.features.feature_extractor import FeatureExtractor
from edgepulse.features.feature_normalizer import DeviceNormalizer
from edgepulse.detectors.isolation_forest_detector import IsolationForestDetector
from edgepulse.detectors.autoencoder_reconstruction_detector import AutoencoderDetector
from edgepulse.detectors.ensemble_detector import EnsembleDetector
from edgepulse.analysis.report_generator import ReportGenerator
from edgepulse.alerts.alert_engine import AlertEngine
from edgepulse.alerts.notifier import LocalNotifier
from edgepulse.config.privacy import PrivacyController
from edgepulse.utils.path_manager import PathManager
from edgepulse.utils.error_handler import (
    EdgePulseError, ConfigurationError, ModelError,
    SyncError, NetworkError,
)
from edgepulse.shared.metrics import create_metrics_collector, StandardMetrics
from edgepulse.core.device_registry import DeviceRegistry
from edgepulse.core.explainer_service import ExplainerService
from edgepulse.core.alert_handler import AlertHandler
from edgepulse.core.sync_service import SyncService
from edgepulse.utils.version import get_agent_version

logger = get_logger(__name__)

_WARMUP_CYCLES = 1


class EdgePulseAgent:

    def __init__(
        self,
        settings: Optional[AgentSettings] = None,
        device_id: Optional[str] = None,
        event_bus: Optional[EventBus] = None,
        database: Optional[Database] = None,
        sync_queue: Optional[SyncQueue] = None,
        api_server: Optional[AdaptiveAPIServer] = None,
        collectors: Optional[List[Any]] = None,
        detectors: Optional[List[Any]] = None,
        feature_extractor: Optional[Any] = None,
        alert_engine: Optional[Any] = None,
        device_registry: Optional[DeviceRegistry] = None,
        explainer_service: Optional[ExplainerService] = None,
        alert_handler: Optional[AlertHandler] = None,
        sync_service: Optional[SyncService] = None,
    ):
        self.settings = settings or AgentSettings()
        if device_id:
            self.settings.device_id = device_id

        # Load credentials early to get the real device_id
        try:
            from edgepulse.auth.credentials import CredentialManager
            cred_manager = CredentialManager()
            creds = cred_manager.get_device_credentials()
            if creds and creds.device_id:
                self.settings.device_id = creds.device_id
                logger.info("loaded_device_credentials_early", device_id=creds.device_id)
            else:
                logger.debug("early_credentials_no_device_id", creds_exists=bool(creds))
        except Exception as e:
            logger.debug("early_credentials_load_failed", error=str(e))

        self.device_id = self.settings.device_id

        self.event_bus = event_bus or get_event_bus()
        self.database = database or Database(
            PathManager().data_dir / "edgepulse.db"
        )
        self.sync_queue = sync_queue or SyncQueue(
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
        self.metrics = create_metrics_collector("agent", self.device_id)
        self._health_snapshot_interval = 300

        self._running = False
        self._shutdown_event: Optional[asyncio.Event] = None
        self._tasks: List[asyncio.Task] = []
        self._pipeline: Optional[AsyncPipeline] = None
        self._sync_client: Optional[Any] = None

        self._warmup_cycles_remaining: int = _WARMUP_CYCLES

        self._collectors = collectors or self._create_collectors()
        self._detectors = detectors or self._create_detectors()
        self._feature_extractor = feature_extractor or self._create_feature_extractor()
        self._alert_engine = alert_engine or self._create_alert_engine()

        self.device_registry = device_registry or DeviceRegistry(
            self.device_id, self.database,
            agent_version=get_agent_version(),
        )
        self.explainer_service = explainer_service or ExplainerService(self.device_id)

        logger.info("async_agent_initialized", device_id=self.device_id)

    async def initialize(self) -> None:
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
                database=self.database,
                sync_queue=self.sync_queue,
            )

            await self._setup_event_handlers()

            if self.settings.should_enable_sync():
                self.sync_service = self._initialize_sync_service()
                if self.sync_service is not None:
                    ok = await self.sync_service.initialize()
                    if ok:
                        self._sync_client = self.sync_service.client

            logger.info("async_agent_initialized_successfully", device_id=self.device_id)

        except Exception as e:
            logger.error("agent_initialization_failed", error=str(e))
            raise EdgePulseError(f"Failed to initialize agent: {e}") from e

    async def start(self) -> None:
        if self._running:
            logger.warning("agent_already_running")
            return

        logger.info("starting_async_agent", device_id=self.device_id)

        try:
            self._running = True

            await self.event_bus.start()

            if self._pipeline:
                await self._pipeline.start(self.settings.get_collection_interval_seconds())

            if self.sync_service:
                await self.sync_service.start_worker()

            if self.settings.should_enable_api():
                await self.api_server.start()

            await self._start_background_tasks()

            await self.event_bus.publish(Event(
                type=EventType.SYSTEM,
                data={"device_id": self.device_id, "event": "agent_started"},
                timestamp=datetime.utcnow(),
                source="async_agent",
            ))

            logger.info("agent_started", device_id=self.device_id)

            if self._warmup_cycles_remaining > 0:
                logger.info(
                    "warmup_mode_active",
                    warmup_cycles=self._warmup_cycles_remaining,
                    detail=(
                        f"Alert generation suppressed for first {self._warmup_cycles_remaining} "
                        "pipeline cycle(s) while baseline is established."
                    ),
                )

        except SyncError as e:
            logger.error("agent_start_failed", error=str(e))
            await self.stop()
            raise
        except Exception as e:
            logger.error("agent_start_failed", error=str(e))
            await self.stop()
            raise EdgePulseError(f"Failed to start agent: {e}") from e

    async def stop(self) -> None:
        if not self._running:
            return

        logger.info("stopping_async_agent", device_id=self.device_id)

        self._running = False
        if self._shutdown_event is not None and not self._shutdown_event.is_set():
            self._shutdown_event.set()

        try:
            for task in self._tasks:
                task.cancel()
            await asyncio.gather(*self._tasks, return_exceptions=True)
            self._tasks.clear()

            for collector in self._collectors:
                if hasattr(collector, 'stop'):
                    collector.stop()
                    logger.info("collector_stopped", collector=collector.__class__.__name__)

            if self._pipeline:
                await self._pipeline.stop()

            if self.api_server:
                await self.api_server.stop()

            if self.sync_service:
                await self.sync_service.stop()
            elif self.sync_queue:
                await self.sync_queue.stop()

            await self._save_state()
            await self.event_bus.publish(Event(
                type=EventType.SYSTEM,
                data={"device_id": self.device_id, "event": "agent_stopped"},
                timestamp=datetime.utcnow(),
                source="async_agent",
            ))

            await self.event_bus.stop()

            logger.info("async_agent_stopped", device_id=self.device_id)

        except Exception as e:
            logger.error("agent_stop_error", error=str(e))
            raise EdgePulseError(f"Failed to stop agent: {e}") from e

    async def run_forever(self) -> None:
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
        await self.initialize()
        try:
            await self.start()
            yield self
        finally:
            await self.stop()

    def _setup_signal_handlers(self) -> None:
        loop = asyncio.get_running_loop()

        def request_shutdown() -> None:
            logger.info("shutdown_signal_received")
            if self._shutdown_event and not self._shutdown_event.is_set():
                self._shutdown_event.set()

        if is_windows():
            def _windows_sigint_handler(signum, frame) -> None:
                loop.call_soon_threadsafe(request_shutdown)

            def _windows_sigterm_handler(signum, frame) -> None:
                loop.call_soon_threadsafe(request_shutdown)

            signal.signal(signal.SIGINT, _windows_sigint_handler)
            signal.signal(signal.SIGTERM, _windows_sigterm_handler)
            logger.debug("signal_handlers_registered", platform="windows")
        else:
            loop.add_signal_handler(signal.SIGINT, request_shutdown)
            loop.add_signal_handler(signal.SIGTERM, request_shutdown)
            logger.debug("signal_handlers_registered", platform="unix")

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
            logger.info("feature_normalizer_baseline_loaded")
            self._warmup_cycles_remaining = 0
        else:
            logger.info(
                "no_baseline_found",
                warmup_cycles=self._warmup_cycles_remaining,
                detail="Normalizer will learn from live data during warmup period.",
            )

        self.report_generator = ReportGenerator(device_id=self.device_id)

        if self.settings.alerting.enable_local_notifications:
            self.notifier = LocalNotifier()

        self.alert_handler = AlertHandler(
            device_id=self.device_id,
            report_generator=self.report_generator,
            alert_engine=self._alert_engine,
            database=self.database,
            sync_queue=self.sync_queue,
            metrics=self.metrics,
            notifier=getattr(self, 'notifier', None),
        )

        primary_detectors = [d for d in self._detectors if hasattr(d, "get_health")]

        if primary_detectors:
            primary = primary_detectors[0]
            register_detector_health_provider(primary.get_health)
            logger.info(
                "detector_health_provider_registered",
                detector=primary.__class__.__name__,
            )
            self.explainer_service.try_initialize(
                self._detectors, self._feature_extractor
            )
        else:
            def _no_detector_health():
                return {
                    "status": "degraded",
                    "is_trained": False,
                    "action_required": (
                        "Run `python src/edgepulse/scripts/bootstrap_model.py` and restart."
                    ),
                }
            register_detector_health_provider(_no_detector_health)
            logger.warning("no_trained_detector_health_provider_registered")

        await self.device_registry.register()

    def _initialize_sync_service(self) -> Optional[SyncService]:
        raw_key = self.settings.sync.supabase_key
        if raw_key is None:
            logger.warning("sync_client_skipped: supabase_key is None")
            return None

        supabase_key = (
            raw_key.get_secret_value()
            if hasattr(raw_key, 'get_secret_value')
            else raw_key
        )

        service = SyncService(
            sync_queue=self.sync_queue,
            supabase_url=self.settings.sync.supabase_url,
            supabase_key=supabase_key,
            device_id=self.settings.device_id,
        )
        return service

    async def _setup_event_handlers(self) -> None:
        async def handle_anomaly(event: Event):
            data = event.data or {}
            detection = data.get("detection", {}) or {}
            features = data.get("features")
            severity_label = data.get("severity", detection.get("severity", "medium"))

            if self._warmup_cycles_remaining > 0:
                self._warmup_cycles_remaining -= 1
                logger.info(
                    "warmup_cycle_suppressed",
                    cycles_remaining=self._warmup_cycles_remaining,
                    anomaly_score=detection.get("anomaly_score", 0.0),
                )
                if features is not None and hasattr(self, "normalizer"):
                    try:
                        import numpy as np
                        feat_array = np.asarray(features, dtype=float)
                        if feat_array.ndim == 1:
                            feat_array = feat_array.reshape(1, -1)
                        self.normalizer.update_baseline(feat_array)
                    except Exception as e:
                        logger.debug("warmup_baseline_update_error", error=str(e))
                return

            logger.info(
                "anomaly_detected",
                severity=severity_label,
                detector=detection.get("detector"),
            )

            await self.alert_handler.handle(
                detection, features, severity_label,
                explainer=self.explainer_service if self.explainer_service.is_available else None,
            )

            try:
                if self.sync_queue:
                    anomaly_payload = {
                        "model_id": f"iforest-{self.device_id[:8]}",
                        "score": detection.get("anomaly_score", 0.0),
                        "label": str(detection.get("label", 0)),
                        "threshold_applied": 0.75,
                        "above_threshold": detection.get("anomaly_score", 0.0) >= 0.75,
                        "inference_latency_ms": detection.get("inference_latency_ms", 0),
                        "connectivity_state": "online",
                        "scored_at": datetime.utcnow().isoformat() + "Z",
                        "created_at": datetime.utcnow().isoformat() + "Z",
                    }
                    await self.sync_queue.enqueue("anomaly_scores", anomaly_payload, priority=3)

                    if features is not None:
                        import numpy as np
                        feat_arr = np.asarray(features, dtype=float).flatten()
                        feature_dict = {
                            f"feature_{i}": float(v) for i, v in enumerate(feat_arr)
                        }
                        fv_payload = {
                            "model_id": f"iforest-{self.device_id[:8]}",
                            "features": feature_dict,
                            "feature_version": "v1.0",
                            "computed_at": datetime.utcnow().isoformat() + "Z",
                            "created_at": datetime.utcnow().isoformat() + "Z",
                        }
                        await self.sync_queue.enqueue("feature_vectors", fv_payload, priority=3)
            except Exception as e:
                logger.error("alert_sync_queue_error", error=str(e))

        async def handle_sync_completed(event: Event):
            data = event.data
            logger.info("sync_completed", items=data.get('count', 0))
            self.metrics.increment_counter(StandardMetrics.SYNC_ATTEMPTS_TOTAL)
            self.metrics.set_gauge(StandardMetrics.SYNC_SUCCESS_RATE, 1.0)
        async def handle_telemetry(event: Event):
            pass

        self.event_bus.subscribe(EventType.DETECTION, handle_anomaly)
        self.event_bus.subscribe(EventType.SYNC, handle_sync_completed)
        self.event_bus.subscribe(EventType.TELEMETRY, handle_telemetry)

    async def _start_background_tasks(self) -> None:
        self._tasks.append(asyncio.create_task(self._health_check_loop()))
        self._tasks.append(asyncio.create_task(self._metrics_collection_loop()))
        self._tasks.append(asyncio.create_task(self._data_cleanup_loop()))
        self._tasks.append(asyncio.create_task(self._health_snapshot_sync_loop()))

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

    async def _health_snapshot_sync_loop(self) -> None:
        await asyncio.sleep(30)
        while self._running:
            try:
                client = self.sync_service.client if self.sync_service else None
                if client and hasattr(client, 'sync_health_snapshots'):
                    snapshot = await self._collect_health_snapshot()
                    if snapshot:
                        success = await client.sync_health_snapshots([snapshot])
                        if success:
                            logger.debug("health_snapshot_synced", device_id=self.device_id)
                        else:
                            logger.warning("health_snapshot_sync_failed", device_id=self.device_id)
                await asyncio.sleep(self._health_snapshot_interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("health_snapshot_sync_error", error=str(e))
                await asyncio.sleep(60)

    async def _collect_health_snapshot(self) -> Optional[Dict[str, Any]]:
        try:
            import psutil
            boot_time = datetime.fromtimestamp(psutil.boot_time())
            uptime_seconds = (datetime.utcnow() - boot_time).total_seconds()
            uptime_percentage = min(100.0, (uptime_seconds / 86400) * 100)

            cpu_percent = psutil.cpu_percent(interval=1)
            memory = psutil.virtual_memory()
            disk = psutil.disk_usage('/')

            network_status = True
            try:
                psutil.net_io_counters()
            except Exception:
                network_status = False

            error_count = 0
            warning_count = 0
            for collector in self._collectors:
                if hasattr(collector, '_error_count'):
                    error_count += getattr(collector, '_error_count', 0)
                if hasattr(collector, '_warning_count'):
                    warning_count += getattr(collector, '_warning_count', 0)

            alert_count = 0
            try:
                recent_alerts = await self.database.get_recent_alerts(hours=24)
                alert_count = len(recent_alerts) if recent_alerts else 0
            except Exception:
                pass

            snapshot = {
                "device_id": self.device_id,
                "status": "ONLINE" if network_status else "WARNING",
                "cpu_usage": cpu_percent,
                "memory_usage": memory.percent,
                "disk_usage": round(disk.percent, 2),
                "network_status": network_status,
                "alerts_last_24h": alert_count,
                "uptime_percentage": round(uptime_percentage, 2),
                "response_time_ms": 0,
                "error_count": error_count,
                "warning_count": warning_count,
                "last_restart": boot_time.isoformat(),
            }
            return snapshot
        except Exception as e:
            logger.error("health_snapshot_collection_error", error=str(e))
            return None

    async def _save_state(self) -> None:
        try:
            for detector in self._detectors:
                if hasattr(detector, 'save_model'):
                    await asyncio.to_thread(detector.save_model)
            if hasattr(self, 'normalizer') and self.normalizer.is_fitted:
                await asyncio.to_thread(self.normalizer.save_baseline)
            logger.info("agent_state_saved", device_id=self.device_id)
        except Exception as e:
            logger.error("state_save_error", error=str(e))

    def get_status(self) -> Dict[str, Any]:
        from edgepulse.api.api_server import _get_detector_health
        explainer_info: Dict[str, Any] = {"available": self.explainer_service.is_available}
        if self.explainer_service.manager is not None:
            explainer_info = {
                "available": self.explainer_service.is_available,
                "methods": self.explainer_service.available_methods,
                "cache_stats": self.explainer_service.manager.cache_stats(),
            }
        return {
            "device_id": self.device_id,
            "running": self._running,
            "environment": self.settings.environment,
            "api_enabled": self.settings.should_enable_api(),
            "sync_enabled": self.settings.should_enable_sync(),
            "ml_enabled": self.settings.should_enable_ml(),
            "pipeline_running": self._pipeline is not None and self._pipeline._running,
            "warmup_cycles_remaining": self._warmup_cycles_remaining,
            "explainer": explainer_info,
            "api_server_info": self.api_server.get_server_info() if self.api_server else None,
            "sync_queue_stats": self.sync_queue.get_stats() if self.sync_queue else None,
            "detector_health": _get_detector_health(),
        }