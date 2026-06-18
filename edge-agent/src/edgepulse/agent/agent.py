import asyncio
import signal
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from edgepulse.agent.events import EventBus, Event, EventType, get_event_bus
from edgepulse.agent.factory import ComponentFactory
from edgepulse.agent.handlers import AnomalyEventHandler, SyncEventHandler
from edgepulse.agent.monitoring import HealthMonitor
from edgepulse.agent.pipeline import AsyncPipeline
from edgepulse.analysis.service import ExplainerService
from edgepulse.api import APIDependencies, FastAPIServer
from edgepulse.config.settings import AgentSettings
from edgepulse.platform import is_windows
from edgepulse.pipeline.protocols import AlertEngine, Collector, Detector, FeatureExtractor
from edgepulse.registry import DeviceRegistry
from edgepulse.storage.database import Database
from edgepulse.sync.sync_queue import SyncQueue
from edgepulse.utils.error_handler import EdgePulseError, SyncError
from edgepulse.utils.log_handler import configure_logging, get_logger
from edgepulse.utils.path_manager import PathManager
from edgepulse.utils.version import get_agent_version

logger = get_logger(__name__)


class EdgePulseAgent:

    def __init__(
        self,
        settings: Optional[AgentSettings] = None,
        device_id: Optional[str] = None,
        event_bus: Optional[EventBus] = None,
        database: Optional[Database] = None,
        sync_queue: Optional[SyncQueue] = None,
        api_server: Optional[FastAPIServer] = None,
        collectors: Optional[List[Collector]] = None,
        detectors: Optional[List[Detector]] = None,
        feature_extractor: Optional[FeatureExtractor] = None,
        alert_engine: Optional[AlertEngine] = None,
        device_registry: Optional[DeviceRegistry] = None,
        explainer_service: Optional[ExplainerService] = None,
    ):
        self.settings = settings or AgentSettings()
        if device_id:
            self.settings.device_id = device_id

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
        self._factory = ComponentFactory(self.settings, self.device_id)

        self.event_bus = event_bus or get_event_bus()
        self.database = database or Database(PathManager().data_dir / "edgepulse.db")
        self.sync_queue = sync_queue or SyncQueue(
            PathManager().data_dir / "sync",
            max_size=self.settings.sync.offline_queue_max,
            max_retry_attempts=self.settings.sync.retry_max_attempts,
            batch_size=self.settings.sync.batch_size,
        )
        self.api_server = api_server or FastAPIServer(
            port=self.settings.api.port,
            host=self.settings.api.host,
        )
        self.metrics = self._factory.create_metrics()

        self._collectors = collectors or self._factory.create_collectors()
        self._detectors = detectors or self._factory.create_detectors()
        self._feature_extractor = feature_extractor or self._factory.create_feature_extractor()
        self._alert_engine = alert_engine or self._factory.create_alert_engine()
        self.explainer_service = explainer_service or self._factory.create_explainer_service()

        self.device_registry = device_registry or DeviceRegistry(
            self.device_id,
            self.database,
            agent_version=get_agent_version(),
        )

        self._running = False
        self._shutdown_event: Optional[asyncio.Event] = None
        self._tasks: List[asyncio.Task] = []
        self._pipeline: Optional[AsyncPipeline] = None
        self._sync_client: Optional[Any] = None
        self._sync_service: Optional[Any] = None
        self._api_deps: Optional[APIDependencies] = None
        self._health_monitor: Optional[HealthMonitor] = None
        self._anomaly_handler: Optional[AnomalyEventHandler] = None

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

            for collector in self._collectors:
                if hasattr(collector, "start"):
                    collector.start()
                    logger.info("collector_started", collector=collector.__class__.__name__)

            normalizer = self._factory.create_normalizer()
            baseline_loaded = normalizer.load_baseline()
            self._normalizer = normalizer

            alert_handler = self._factory.create_alert_handler(
                database=self.database,
                sync_queue=self.sync_queue,
                alert_engine=self._alert_engine,
                metrics=self.metrics,
            )

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

            self._anomaly_handler = AnomalyEventHandler(
                alert_handler=alert_handler,
                sync_queue=self.sync_queue,
                explainer_service=self.explainer_service,
                normalizer=normalizer,
                metrics=self.metrics,
                device_id=self.device_id,
            )
            if baseline_loaded:
                self._anomaly_handler.warmup_remaining = 0

            sync_event_handler = SyncEventHandler(metrics=self.metrics)

            self.event_bus.subscribe(EventType.DETECTION, self._anomaly_handler)
            self.event_bus.subscribe(EventType.SYNC, sync_event_handler)

            if self.settings.should_enable_sync():
                self._sync_service = self._factory.create_sync_service(self.sync_queue)
                if self._sync_service is not None:
                    ok = await self._sync_service.initialize()
                    if ok:
                        self._sync_client = self._sync_service.client

            primary_detectors = [d for d in self._detectors if hasattr(d, "get_health")]
            if primary_detectors:
                self.explainer_service.try_initialize(self._detectors, self._feature_extractor)

            def _detector_health():
                if primary_detectors:
                    return primary_detectors[0].get_health()
                return {
                    "status": "degraded",
                    "is_trained": False,
                    "action_required": "Trained model not found \u2014 reinstall the package.",
                }

            async def _dead_letter_provider():
                if self.sync_queue:
                    return await self.sync_queue.get_dead_letter_items()
                return {"items": [], "total": 0}

            self._api_deps = APIDependencies(
                database=self.database,
                sync_queue=self.sync_queue,
                detector_health_provider=_detector_health,
                sync_dead_letter_provider=_dead_letter_provider,
            )

            await self.device_registry.register()

            self._health_monitor = HealthMonitor(
                settings=self.settings,
                database=self.database,
                collectors=self._collectors,
                sync_service=self._sync_service,
                sync_queue=self.sync_queue,
                metrics=self.metrics,
                device_id=self.device_id,
                is_pipeline_running=lambda: self._pipeline is not None and self._pipeline.running,
                is_api_healthy=lambda: self.api_server.is_healthy(),
            )

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
                await self._pipeline.start(self.settings.collection.interval)

            if self._sync_service:
                await self._sync_service.start_worker()

            if self.settings.api.enabled:
                await self.api_server.start(deps=self._api_deps)

            if self._health_monitor:
                self._health_monitor.start()
                self._tasks.append(asyncio.create_task(self._health_monitor.health_check_loop()))
                self._tasks.append(
                    asyncio.create_task(self._health_monitor.metrics_collection_loop())
                )
                self._tasks.append(asyncio.create_task(self._health_monitor.data_cleanup_loop()))
                self._tasks.append(
                    asyncio.create_task(self._health_monitor.health_snapshot_sync_loop())
                )

            await self.event_bus.publish(
                Event(
                    type=EventType.SYSTEM,
                    data={"device_id": self.device_id, "event": "agent_started"},
                    timestamp=datetime.utcnow(),
                    source="async_agent",
                )
            )

            self._log_startup_status()
            logger.info("agent_started", device_id=self.device_id)

        except SyncError as e:
            logger.error("agent_start_failed", error=str(e))
            await self.stop()
            raise
        except Exception as e:
            logger.error("agent_start_failed", error=str(e))
            await self.stop()
            raise EdgePulseError(f"Failed to start agent: {e}") from e

    def _log_startup_status(self) -> None:
        if self._anomaly_handler and self._anomaly_handler.warmup_remaining > 0:
            logger.info(
                "warmup_mode_active",
                warmup_cycles=self._anomaly_handler.warmup_remaining,
                detail=(
                    f"Alert generation suppressed for first "
                    f"{self._anomaly_handler.warmup_remaining} pipeline cycle(s) "
                    "while baseline is established."
                ),
            )

    async def stop(self) -> None:
        if not self._running:
            return

        logger.info("stopping_async_agent", device_id=self.device_id)

        self._running = False
        if self._health_monitor:
            self._health_monitor.stop()
        if self._shutdown_event is not None and not self._shutdown_event.is_set():
            self._shutdown_event.set()

        try:
            for task in self._tasks:
                task.cancel()
            await asyncio.gather(*self._tasks, return_exceptions=True)
            self._tasks.clear()

            for collector in self._collectors:
                if hasattr(collector, "stop"):
                    collector.stop()
                    logger.info("collector_stopped", collector=collector.__class__.__name__)

            if self._pipeline:
                await self._pipeline.stop()

            if self.api_server:
                await self.api_server.stop()

            if self._sync_service:
                await self._sync_service.stop()
            elif self.sync_queue:
                await self.sync_queue.stop()

            await self._save_state()

            await self.event_bus.publish(
                Event(
                    type=EventType.SYSTEM,
                    data={"device_id": self.device_id, "event": "agent_stopped"},
                    timestamp=datetime.utcnow(),
                    source="async_agent",
                )
            )

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

    async def _save_state(self) -> None:
        try:
            for detector in self._detectors:
                if hasattr(detector, "save_model"):
                    await asyncio.to_thread(detector.save_model)
            if hasattr(self, "_normalizer") and self._normalizer.is_fitted:
                await asyncio.to_thread(self._normalizer.save_baseline)
            logger.info("agent_state_saved", device_id=self.device_id)
        except Exception as e:
            logger.error("state_save_error", error=str(e))

    def _get_detector_health(self) -> Dict[str, Any]:
        primary = [d for d in self._detectors if hasattr(d, "get_health")]
        if primary:
            return primary[0].get_health()
        return {
            "status": "degraded",
            "is_trained": False,
            "action_required": "Trained model not found \u2014 reinstall the package.",
        }

    def get_status(self) -> Dict[str, Any]:
        explainer_info: Dict[str, Any] = {"available": self.explainer_service.is_available}
        if self.explainer_service.manager is not None:
            explainer_info = {
                "available": self.explainer_service.is_available,
                "methods": self.explainer_service.available_methods,
                "cache_stats": self.explainer_service.manager.cache_stats(),
            }

        warmup = 0
        if self._anomaly_handler is not None:
            warmup = self._anomaly_handler.warmup_remaining

        return {
            "device_id": self.device_id,
            "running": self._running,
            "environment": self.settings.environment,
            "api_enabled": self.settings.api.enabled,
            "sync_enabled": self.settings.should_enable_sync(),
            "pipeline_running": self._pipeline is not None and self._pipeline.running,
            "warmup_cycles_remaining": warmup,
            "explainer": explainer_info,
            "api_server_info": self.api_server.get_server_info() if self.api_server else None,
            "sync_queue_stats": self.sync_queue.get_stats() if self.sync_queue else None,
            "detector_health": self._get_detector_health(),
        }
