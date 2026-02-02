import asyncio
import signal
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Optional, List, Dict, Any
from pathlib import Path

from edgepulse_win.core.events_bus import EventBus, Event, EventType, get_event_bus
from edgepulse_win.core.async_pipeline import AsyncPipeline
from edgepulse_win.config.settings import AgentSettings
from edgepulse_win.utils.log_handler import configure_logging, get_logger
from edgepulse_win.storage.database import DatabaseManager
from edgepulse_win.sync.async_queue import AsyncSyncQueue
from edgepulse_win.api.adaptive import AdaptiveAPIServer

from edgepulse_win.collectors.system_collector import SystemMetricsCollector
from edgepulse_win.collectors.process_collector import ProcessMonitor
from edgepulse_win.collectors.network_collector import NetworkMonitor
from edgepulse_win.features.feature_extractor import FeatureExtractor
from edgepulse_win.features.feature_normalizer import DeviceNormalizer
from edgepulse_win.detectors.isolation_forest import IsolationForestDetector
from edgepulse_win.detectors.autoencoder import AutoencoderDetector
from edgepulse_win.detectors.ensemble import EnsembleDetector
from edgepulse_win.analysis.shap_explainer import SHAPExplainer
from edgepulse_win.analysis.report_generator import ReportGenerator
from edgepulse_win.alerts.alert_engine import AlertEngine
from edgepulse_win.alerts.notifier import LocalNotifier
from edgepulse_win.sync.supabase import SupabaseSync
from edgepulse_win.config.privacy import PrivacyController
from edgepulse_win.utils.path_manager import PathManager
from edgepulse_win.utils.error_handler import EdgePulseError, ConfigurationError, ModelError, DetectionError, LoggingError, SyncError, NetworkError, ResourceError

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
        # Settings
        self.settings = settings or AgentSettings()
        if device_id:
            self.settings.device_id = device_id
        
        self.device_id = self.settings.device_id
        
        # Core dependencies
        self.event_bus = event_bus or get_event_bus()
        self.database = database or DatabaseManager(
            PathManager().get_data_path() / "edgepulse.db"
        )
        self.sync_queue = sync_queue or AsyncSyncQueue(
            PathManager().get_data_path() / "sync",
            max_size=self.settings.sync.offline_queue_max,
            max_retry_attempts=self.settings.sync.retry_max_attempts,
            batch_size=self.settings.sync.batch_size
        )
        self.api_server = api_server or AdaptiveAPIServer(
            mode=self.settings.api.mode,
            port=self.settings.api.port,
            min_memory_mb=self.settings.api.min_memory_mb,
            min_cpu_cores=self.settings.api.min_cpu_cores
        )
        
        # Metrics
        self.metrics = initialize_metrics(self.device_id)
        
        # State
        self._running = False
        self._tasks: List[asyncio.Task] = []
        self._pipeline: Optional[AsyncPipeline] = None
        self._sync_client: Optional[Any] = None
        
        # Initialize components
        self._collectors = collectors or self._create_collectors()
        self._detectors = detectors or self._create_detectors()
        self._feature_extractor = feature_extractor or self._create_feature_extractor()
        self._alert_engine = alert_engine or self._create_alert_engine()
        
        logger.info("async_agent_initialized", device_id=self.device_id)
    
    async def initialize(self) -> None:
        """Initialize the agent and all components"""
        logger.info("initializing_async_agent", device_id=self.device_id)
        
        try:
            # Configure logging
            configure_logging(
                log_level=self.settings.logging.level,
                log_file=Path(self.settings.logging.file_path) if self.settings.logging.file_path else None,
                device_id=self.device_id
            )
            
            # Initialize database
            await self.database.initialize()
            
            # Initialize sync queue
            await self.sync_queue.initialize()
            
            # Initialize components
            await self._initialize_components()
            
            # Create pipeline
            self._pipeline = AsyncPipeline(
                collectors=self._collectors,
                feature_extractor=self._feature_extractor,
                detectors=self._detectors,
                alert_engine=self._alert_engine,
                device_id=self.device_id,
                event_bus=self.event_bus,
                metrics=self.metrics
            )
            
            # Setup event handlers
            await self._setup_event_handlers()
            
            # Initialize sync client if enabled
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
            
            # Start event bus
            await self.event_bus.start()
            
            # Start pipeline
            if self._pipeline:
                await self._pipeline.start(self.settings.get_collection_interval_seconds())
            
            # Start sync queue if enabled
            if self._sync_client:
                await self.sync_queue.start_worker(self._sync_client)
            
            # Start API server if enabled
            if self.settings.should_enable_api():
                await self.api_server.start()
            
            # Start background tasks
            await self._start_background_tasks()
            
            # Publish start event
            await self.event_bus.publish(Event(
                type=EventType.AGENT_STARTED,
                data={"device_id": self.device_id},
                timestamp=datetime.utcnow(),
                source="async_agent"
            ))
            
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
        
        try:
            # Cancel background tasks
            for task in self._tasks:
                task.cancel()
            await asyncio.gather(*self._tasks, return_exceptions=True)
            
            # Stop components
            if self._pipeline:
                await self._pipeline.stop()
            
            if self.api_server:
                await self.api_server.stop()
            
            if self.sync_queue:
                await self.sync_queue.stop()
            
            if self._sync_client:
                await self._sync_client.close()
            
            await self.event_bus.stop()
            
            # Save state
            await self._save_state()
            
            # Publish stop event
            await self.event_bus.publish(Event(
                type=EventType.AGENT_STOPPED,
                data={"device_id": self.device_id},
                timestamp=datetime.utcnow(),
                source="async_agent"
            ))
            
            logger.info("async_agent_stopped", device_id=self.device_id)
            
        except Exception as e:
            logger.error("agent_stop_error", error=str(e))
            raise EdgePulseError(f"Failed to stop agent: {e}") from e
    
    async def run_forever(self) -> None:
        """Run the agent until shutdown"""
        await self.initialize()
        await self.start()
        
        # Setup signal handlers
        self._setup_signal_handlers()
        
        try:
            # Keep running until stopped
            while self._running:
                await asyncio.sleep(1)
        except KeyboardInterrupt:
            logger.info("received_keyboard_interrupt")
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
    
    def _create_collectors(self) -> List[Any]:
        """Create default collectors"""
        collectors = [
            SystemMetricsCollector(
                collection_interval=self.settings.collection.interval
            )
        ]
        
        if self.settings.collection.enable_process_monitoring:
            collectors.append(ProcessMonitor())
        
        if self.settings.collection.enable_network_monitoring:
            collectors.append(NetworkMonitor())
        
        return collectors
    
    def _create_detectors(self) -> List[Any]:
        """Create default detectors"""
        path_manager = PathManager()
        detectors = []
        
        # Isolation Forest
        isolation_forest = IsolationForestDetector(
            n_estimators=self.settings.detection.isolation_forest_n_estimators,
            contamination=self.settings.detection.isolation_forest_contamination,
            device_id=self.device_id,
            path_manager=path_manager,
        )
        isolation_forest.load_model()
        
        if isolation_forest.is_trained:
            detectors.append(isolation_forest)
        
        # Autoencoder (if enabled)
        if self.settings.detection.use_autoencoder:
            autoencoder = AutoencoderDetector(
                input_dim=self.settings.detection.autoencoder_input_dim or self.settings.features.feature_dimension,
                encoding_dim=self.settings.detection.autoencoder_encoding_dim,
                hidden_layers=self.settings.detection.autoencoder_hidden_layers,
                learning_rate=self.settings.detection.autoencoder_learning_rate,
                device_id=self.device_id,
                path_manager=path_manager,
            )
            autoencoder.load_model()
            
            if autoencoder.is_trained:
                detectors.append(autoencoder)
        
        # Ensemble (if multiple detectors)
        if self.settings.detection.use_ensemble and len(detectors) > 1:
            ensemble = EnsembleDetector(
                detectors=detectors,
                voting_strategy="weighted",
                threshold=self.settings.detection.threshold,
            )
            detectors = [ensemble]
        
        return detectors
    
    def _create_feature_extractor(self) -> Any:
        """Create feature extractor"""
        return FeatureExtractor(
            window_1min=self.settings.collection.window_1min,
            window_5min=self.settings.collection.window_5min,
            window_15min=self.settings.collection.window_15min,
            feature_dimension=self.settings.features.feature_dimension,
            history_retention_hours=self.settings.features.history_retention_hours,
        )
    
    def _create_alert_engine(self) -> Any:
        """Create alert engine"""
        return AlertEngine(
            correlation_window=self.settings.alerting.correlation_window,
            rate_limit=self.settings.alerting.rate_limit,
            rate_window=self.settings.alerting.rate_window,
            min_severity=self.settings.alerting.min_severity,
        )
    
    async def _initialize_components(self) -> None:
        """Initialize all components"""
        # Initialize feature normalizer
        self.normalizer = DeviceNormalizer(
            device_id=self.device_id,
            path_manager=PathManager(),
        )
        self.normalizer.load_baseline()
        
        # Initialize SHAP explainer
        if self._detectors:
            primary_detector = self._detectors[0]
            if hasattr(primary_detector, 'model') and primary_detector.model:
                self.shap_explainer = SHAPExplainer(model=primary_detector.model)
        
        # Initialize report generator
        self.report_generator = ReportGenerator(device_id=self.device_id)
        
        # Initialize notifier
        if self.settings.alerting.enable_local_notifications:
            self.notifier = LocalNotifier()
    
    async def _setup_event_handlers(self) -> None:
        """Setup event handlers"""
        # Handle anomaly detected events
        async def handle_anomaly(event: Event):
            data = event.data
            logger.info("anomaly_detected", severity=data.get('severity'))
            
            # Update metrics
            self.metrics.record_anomaly(data.get('severity', 'medium'))
            
            # Generate report if needed
            if self.settings.alerting.min_severity in ['high', 'critical']:
                await asyncio.to_thread(
                    self.report_generator.generate_anomaly_report,
                    data.get('detection'),
                    data.get('features')
                )
        
        # Handle sync completed events
        async def handle_sync_completed(event: Event):
            data = event.data
            logger.info("sync_completed", items=data.get('count', 0))
            self.metrics.record_sync_attempt('success')
        
        # Subscribe to events
        self.event_bus.subscribe(EventType.ANOMALY_DETECTED, handle_anomaly)
        self.event_bus.subscribe(EventType.SYNC_COMPLETED, handle_sync_completed)
    
    async def _initialize_sync_client(self) -> None:
        """Initialize sync client"""
        try:
            self._sync_client = SupabaseSync(
                supabase_url=self.settings.sync.supabase_url,
                supabase_key=self.settings.sync.supabase_key.get_secret_value(),
                enabled=self.settings.sync.enabled,
                timeout=10.0,
                max_retries=3
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
    
    async def _start_background_tasks(self) -> None:
        """Start background tasks"""
        # Health check task
        health_task = asyncio.create_task(self._health_check_loop())
        self._tasks.append(health_task)
        
        # Metrics collection task
        metrics_task = asyncio.create_task(self._metrics_collection_loop())
        self._tasks.append(metrics_task)
        
        # Data cleanup task
        cleanup_task = asyncio.create_task(self._data_cleanup_loop())
        self._tasks.append(cleanup_task)
    
    async def _health_check_loop(self) -> None:
        """Background health check loop"""
        while self._running:
            try:
                # Check component health
                pipeline_healthy = self._pipeline is not None and self._pipeline._running
                api_healthy = not self.settings.should_enable_api() or self.api_server.is_healthy()
                
                if not pipeline_healthy or not api_healthy:
                    logger.warning(
                        "component_health_issue",
                        pipeline_healthy=pipeline_healthy,
                        api_healthy=api_healthy
                    )
                
                await asyncio.sleep(self.settings.health_check_interval)
                
            except asyncio.CancelledError:
                break
            except ResourceError as e:
                logger.error("health_check_error", error=str(e))
                await asyncio.sleep(30)
            except Exception as e:
                logger.error("health_check_error", error=str(e))
                await asyncio.sleep(30)
    
    async def _metrics_collection_loop(self) -> None:
        """Background metrics collection loop"""
        while self._running:
            try:
                import psutil
                
                # Update system metrics
                self.metrics.update_cpu_usage(psutil.cpu_percent())
                self.metrics.update_memory_usage(psutil.virtual_memory().percent)
                
                # Update queue size
                if self.sync_queue:
                    stats = self.sync_queue.get_stats()
                    self.metrics.update_queue_size(stats['queue_size'])
                
                await asyncio.sleep(self.settings.metrics.collection_interval)
                
            except asyncio.CancelledError:
                break
            except ResourceError as e:
                logger.error("metrics_collection_error", error=str(e))
                await asyncio.sleep(30)
            except Exception as e:
                logger.error("metrics_collection_error", error=str(e))
                await asyncio.sleep(30)
    
    async def _data_cleanup_loop(self) -> None:
        """Background data cleanup loop"""
        while self._running:
            try:
                # Run cleanup every 24 hours
                await asyncio.sleep(86400)  # 24 hours
                
                if self._running:  # Check again after sleep
                    cleanup_results = await self.database.cleanup_old_data(
                        days=self.settings.get_data_retention_days()
                    )
                    logger.info("data_cleanup_completed", results=cleanup_results)
                
            except asyncio.CancelledError:
                break
            except LoggingError as e:
                logger.error("data_cleanup_error", error=str(e))
            except Exception as e:
                logger.error("data_cleanup_error", error=str(e))
    
    async def _save_state(self) -> None:
        """Save agent state"""
        try:
            # Save models
            for detector in self._detectors:
                if hasattr(detector, 'save_model'):
                    await asyncio.to_thread(detector.save_model)
            
            # Save normalizer
            if hasattr(self, 'normalizer') and self.normalizer.is_fitted:
                await asyncio.to_thread(self.normalizer.save_baseline)
            
            logger.info("agent_state_saved")
            
        except ModelError as e:
            logger.error("state_save_error", error=str(e))
        except StorageError as e:
            logger.error("state_save_error", error=str(e))
        except Exception as e:
            logger.error("state_save_error", error=str(e))
    
    def _setup_signal_handlers(self) -> None:
        """Setup signal handlers for graceful shutdown"""
        def signal_handler(signum, frame):
            logger.info("received_signal", signal=signum)
            asyncio.create_task(self.stop())
        
        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)
    
    def get_status(self) -> Dict[str, Any]:
        """Get agent status"""
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
