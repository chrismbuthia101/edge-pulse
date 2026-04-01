"""
EdgePulse Agent Core - Portable Monitoring Logic

This module contains all core monitoring, detection, and sync logic
"""

import asyncio
import time
import uuid
from typing import Dict, Any, Optional
from datetime import datetime
from dataclasses import dataclass

from edgepulse_win.utils.log_handler import get_logger, ConfigurationError
from edgepulse_win.utils.version import get_agent_version
from edgepulse_win.detectors.model_manager import ModelManager
from edgepulse_win.core.enrollment_manager import EnrollmentManager
from edgepulse_win.sync.supabase import SupabaseSync
from edgepulse_win.analysis.report_generator import ReportGenerator  # canonical _calculate_severity

logger = get_logger(__name__)


@dataclass
class AgentConfig:
    """Portable agent configuration"""
    collection_interval: int = 60
    detection_threshold: float = 0.5
    sync_enabled: bool = True
    offline_queue_size: int = 10000
    logging_level: str = "INFO"
    enable_process_monitoring: bool = True
    enable_network_monitoring: bool = True
    enable_filesystem_monitoring: bool = True
    model_type: str = "isolation_forest"
    model_path: Optional[str] = None

    device_id: Optional[str] = None
    api_key: Optional[str] = None
    supabase_url: Optional[str] = None
    enrollment_config_path: Optional[str] = None
    service_mode: bool = False


class AgentCore:
    """Portable EdgePulse agent core logic"""

    def __init__(self, config: AgentConfig):
        self.config = config
        self._running = False
        self._shutdown_event = asyncio.Event()

        self.telemetry_collector = None
        self.model_manager = None
        self.explainable_ai = None
        self.sync_manager = None
        self.config_manager = None
        self.credential_manager = None
        self.enrollment_manager = None
        self.supabase_client = None
        self._report_generator: Optional[ReportGenerator] = None

        self._last_collection_time = 0
        self._last_detection_time = 0
        self._last_sync_time = 0
        self._is_enrolled = False

        logger.info("AgentCore initialized")

    async def initialize(self) -> None:
        """Initialize all core components"""
        try:
            logger.info("Initializing AgentCore components")

            await self._init_credential_manager()
            await self._init_enrollment_manager()
            await self._init_config_manager()
            await self._init_telemetry_collector()
            await self._init_model_manager()
            await self._init_explainable_ai()
            await self._init_sync_manager()

            logger.info("AgentCore initialization complete")

        except Exception as e:
            logger.error(f"Failed to initialize AgentCore: {e}")
            raise ConfigurationError(f"AgentCore initialization failed: {e}")

    async def _init_credential_manager(self) -> None:
        """Initialize credential manager"""
        try:
            from .auth.credentials import CredentialManager

            self.credential_manager = CredentialManager()

            if not self.credential_manager.is_enrolled():
                logger.warning("Device not enrolled - enrollment required")
                raise ConfigurationError("Device not enrolled")

            logger.info("Credential manager initialized")

        except Exception as e:
            logger.error(f"Failed to initialize credential manager: {e}")
            raise

    async def _init_enrollment_manager(self) -> None:
        """Initialize enrollment manager and check enrollment status"""
        try:
            self.enrollment_manager = EnrollmentManager(self.credential_manager)
            
            await self.enrollment_manager.initialize(service_mode=self.config.service_mode)
            self._is_enrolled = self.enrollment_manager.is_enrolled()
            
            # Get device credentials and update config
            credentials = self.enrollment_manager.get_device_credentials()
            if credentials:
                self.config.device_id = credentials.device_id
                self.config.api_key = credentials.api_key
                logger.info(f"Device enrolled: {credentials.device_id}")
            
            # Create Supabase client if we have the required configuration
            if (self.config.supabase_url and self.config.device_id and 
                self.config.api_key and self._is_enrolled):
                self.supabase_client = self.enrollment_manager.create_supabase_client(
                    self.config.supabase_url, self.config.device_id, self.config.api_key
                )
                
        except Exception as e:
            logger.error(f"Failed to initialize enrollment manager: {e}")
            raise

    async def _init_telemetry_collector(self) -> None:
        """Initialize telemetry collector"""
        try:
            from .collectors.telemetry_collector import TelemetryCollector

            self.telemetry_collector = TelemetryCollector(
                agent_version=get_agent_version()
            )

            self.telemetry_collector.start()
            logger.info("Telemetry collector initialized")

        except Exception as e:
            logger.error(f"Failed to initialize telemetry collector: {e}")
            raise

    async def _init_model_manager(self) -> None:
        """Initialize model manager"""
        try:
            self.model_manager = ModelManager(self.config_manager)

            success = await self.model_manager.initialize()
            if not success:
                raise ConfigurationError("ModelManager initialization failed")

            logger.info("Model manager initialized")

        except Exception as e:
            logger.error(f"Failed to initialize model manager: {e}")
            raise

    async def _init_explainable_ai(self) -> None:
        """Initialize explainable AI"""
        try:
            from .analysis.explainable_ai import ExplainableAIManager

            model_id = (
                self.model_manager.model_id if self.model_manager else "unknown"
            )

            self.explainable_ai = ExplainableAIManager(model_id=model_id)

            import numpy as np

            dummy_training_data = np.random.random((100, 10))
            feature_names = [f"feature_{i}" for i in range(10)]

            success = self.explainable_ai.initialize(
                model=self.model_manager.current_detector,
                training_data=dummy_training_data,
                feature_names=feature_names,
            )

            if success:
                logger.info("Explainable AI initialized")
            else:
                logger.warning("Explainable AI initialization failed, explanations disabled")

        except Exception as e:
            logger.error(f"Failed to initialize explainable AI: {e}")
            self.explainable_ai = None

    async def _init_sync_manager(self) -> None:
        """Initialize sync manager"""
        try:
            if not self.config.sync_enabled:
                logger.info("Sync disabled by configuration")
                return

            from .sync.async_queue import AsyncSyncQueue
            from .sync.supabase import SupabaseSync
            from .sync.sync_fsm import SyncFSM
            from .auth.auth_client import AuthenticatedClient, AuthConfig

            credentials = self.credential_manager.get_device_credentials()
            if not credentials:
                raise ConfigurationError("No device credentials available")

            auth_config = AuthConfig(
                supabase_url=self._get_supabase_url(),
                timeout_seconds=30,
            )
            auth_client = AuthenticatedClient(auth_config, self.credential_manager)

            from edgepulse_win.utils.path_manager import PathManager

            sync_queue = AsyncSyncQueue(
                storage_path=PathManager().data_dir / "sync",
                max_size=self.config.offline_queue_size,
            )
            supabase_sync = SupabaseSync(auth_client)
            sync_fsm = SyncFSM(supabase_sync, sync_queue)

            self.sync_manager = {
                "queue": sync_queue,
                "supabase": supabase_sync,
                "fsm": sync_fsm,
                "auth_client": auth_client,
            }

            await sync_queue.initialize()
            await sync_fsm.start()

            logger.info("Sync manager initialized")

        except Exception as e:
            logger.error(f"Failed to initialize sync manager: {e}")
            if self.config.sync_enabled:
                raise ConfigurationError(f"Sync manager initialization failed: {e}")

    async def _init_config_manager(self) -> None:
        """Initialize configuration manager"""
        try:
            from .config.manager import ConfigManager

            if self.sync_manager:
                auth_client = self.sync_manager["auth_client"]
                self.config_manager = ConfigManager(auth_client)
                await self.config_manager.start()
                logger.info("Configuration manager initialized")
            else:
                logger.info("Configuration manager disabled (no sync)")

        except Exception as e:
            logger.error(f"Failed to initialize config manager: {e}")

    async def start(self) -> None:
        """Start the agent core"""
        if self._running:
            logger.warning("AgentCore already running")
            return

        try:
            await self.initialize()
            self._running = True

            if self.config.device_id:
                self._report_generator = ReportGenerator(device_id=self.config.device_id)

            logger.info("AgentCore started")

        except Exception as e:
            logger.error(f"Failed to start AgentCore: {e}")
            raise

    async def stop(self) -> None:
        """Stop the agent core"""
        if not self._running:
            return

        self._running = False
        self._shutdown_event.set()

        try:
            if self.telemetry_collector:
                self.telemetry_collector.stop()

            if self.sync_manager:
                await self.sync_manager["fsm"].stop()
                await self.sync_manager["queue"].close()

            if self.config_manager:
                await self.config_manager.stop()

            logger.info("AgentCore stopped")

        except Exception as e:
            logger.error(f"Error stopping AgentCore: {e}")

    async def run_forever(self) -> None:
        """Main agent loop"""
        try:
            await self.start()

            while self._running:
                try:
                    current_time = time.time()

                    if current_time - self._last_collection_time >= self.config.collection_interval:
                        await self._collect_and_process_telemetry()
                        self._last_collection_time = current_time

                    if (
                        self.config_manager
                        and current_time - self._last_sync_time >= 900
                    ):
                        await self.config_manager.force_refresh()
                        self._last_sync_time = current_time

                    await asyncio.sleep(1)

                except asyncio.CancelledError:
                    break
                except Exception as e:
                    logger.error(f"Error in main loop: {e}")
                    await asyncio.sleep(5)

        except Exception as e:
            logger.error(f"Fatal error in agent loop: {e}")
            raise
        finally:
            await self.stop()

    async def _collect_and_process_telemetry(self) -> None:
        """Collect telemetry and process through detection pipeline"""
        try:
            telemetry_events = self.telemetry_collector.collect()

            if not telemetry_events:
                logger.debug("No telemetry events collected")
                return

            logger.debug(f"Collected {len(telemetry_events)} telemetry events")

            for event in telemetry_events:
                await self._process_telemetry_event(event)

        except Exception as e:
            logger.error(f"Error collecting/processing telemetry: {e}")

    async def _process_telemetry_event(self, event: Dict[str, Any]) -> None:
        """Process individual telemetry event"""
        try:
            features = self._extract_features(event)

            if self.model_manager:
                detection_result = await self.model_manager.detect_anomaly(features)

                if detection_result and detection_result.get("is_alert_triggered"):
                    await self._handle_alert(event, detection_result)

                await self._store_anomaly_score(event, detection_result)

            await self._store_telemetry_event(event)

        except Exception as e:
            logger.error(f"Error processing telemetry event: {e}")

    def _extract_features(self, event: Dict[str, Any]) -> Any:
        """Extract features from telemetry event"""
        import numpy as np

        if event.get("event_type") == "PROCESS":
            return np.array(
                [
                    event.get("cpu_percent", 0.0),
                    event.get("memory_percent", 0.0),
                    len(event.get("cmdline_args", [])),
                    1.0 if event.get("privilege_level") == "ADMIN" else 0.0,
                ]
            )
        elif event.get("event_type") == "NETWORK":
            return np.array(
                [
                    event.get("remote_port", 0),
                    1.0 if event.get("remote_address") else 0.0,
                    len(event.get("remote_address", "")),
                    1.0 if event.get("status") == "ESTABLISHED" else 0.0,
                ]
            )
        else:
            import numpy as np

            return np.random.random(4)

    async def _handle_alert(self, event: Dict[str, Any], detection_result: Any) -> None:
        """Handle anomaly alert"""
        try:
            explanation = None
            if self.explainable_ai:
                import numpy as np

                features = self._extract_features(event)
                explanation = self.explainable_ai.explain_prediction(
                    features, detection_result.get("anomaly_score", 0.0)
                )

            severity = (
                self._report_generator.assign_severity(
                    detection_result.get("anomaly_score", 0.0)
                ).value
                if self._report_generator
                else self._calculate_severity(detection_result.get("anomaly_score", 0.0))
            )

            credentials = self.credential_manager.get_device_credentials()
            alert_record = {
                "alert_id": str(uuid.uuid4()),
                "device_id": credentials.device_id if credentials else "unknown",
                "alert_severity": severity,
                "alert_status": "PENDING",
                "explanation_json": (
                    self.explainable_ai.explanation_to_json(explanation)
                    if explanation and self.explainable_ai
                    else "{}"
                ),
                "created_at": datetime.utcnow().isoformat(),
                "updated_at": datetime.utcnow().isoformat(),
            }

            await self._store_alert(alert_record)

            logger.warning(
                f"Alert generated: {alert_record['alert_id']} "
                f"(score: {detection_result.get('anomaly_score', 0):.4f})"
            )

        except Exception as e:
            logger.error(f"Error handling alert: {e}")

    async def _store_telemetry_event(self, event: Dict[str, Any]) -> None:
        try:
            if self.sync_manager:
                await self.sync_manager["queue"].enqueue("telemetry_events", event)
            else:
                logger.debug(f"Storing telemetry locally: {event.get('event_id')}")
        except Exception as e:
            logger.error(f"Error storing telemetry event: {e}")

    async def _store_anomaly_score(self, event: Dict[str, Any], detection_result: Any) -> None:
        try:
            if not detection_result:
                return
            credentials = self.credential_manager.get_device_credentials()
            score_record = {
                "score_id": str(uuid.uuid4()),
                "device_id": credentials.device_id if credentials else "unknown",
                "model_id": detection_result.get("model_id"),
                "anomaly_score": detection_result.get("anomaly_score"),
                "detection_threshold_applied": detection_result.get(
                    "detection_threshold_applied"
                ),
                "is_alert_triggered": detection_result.get("is_alert_triggered"),
                "inference_latency_ms": detection_result.get("inference_latency_ms"),
                "scored_at": datetime.utcnow().isoformat(),
            }
            if self.sync_manager:
                await self.sync_manager["queue"].enqueue("anomaly_scores", score_record)
        except Exception as e:
            logger.error(f"Error storing anomaly score: {e}")

    async def _store_alert(self, alert_record: Dict[str, Any]) -> None:
        try:
            if self.sync_manager:
                await self.sync_manager["queue"].enqueue("alert_records", alert_record)
            else:
                logger.debug(f"Storing alert locally: {alert_record['alert_id']}")
        except Exception as e:
            logger.error(f"Error storing alert: {e}")

    def _calculate_severity(self, anomaly_score: float) -> str:
        """
        Fallback severity calculation used only when ReportGenerator is unavailable.
        The canonical implementation lives in ReportGenerator.assign_severity().
        """
        if anomaly_score >= 0.9:
            return "CRITICAL"
        elif anomaly_score >= 0.7:
            return "HIGH"
        elif anomaly_score >= 0.5:
            return "MEDIUM"
        else:
            return "LOW"

    def _get_platform(self) -> str:
        """Get current platform"""
        import platform

        return platform.system()

    def _get_supabase_url(self) -> str:
        """Get Supabase URL from environment or config"""
        import os

        return os.environ.get("SUPABASE_URL", "https://placeholder.supabase.co")

    def get_status(self) -> Dict[str, Any]:
        """Get current agent status"""
        return {
            "running": self._running,
            "config": self.config.__dict__,
            "last_collection_time": self._last_collection_time,
            "last_detection_time": self._last_detection_time,
            "last_sync_time": self._last_sync_time,
            "components": {
                "telemetry_collector": self.telemetry_collector is not None,
                "model_manager": self.model_manager is not None,
                "explainable_ai": self.explainable_ai is not None,
                "sync_manager": self.sync_manager is not None,
                "config_manager": self.config_manager is not None,
            },
        }

    async def force_sync(self) -> bool:
        """Force immediate sync"""
        if self.sync_manager:
            return await self.sync_manager["fsm"].force_sync()
        return False

    async def update_config(self, key: str, value: Any) -> bool:
        """Update configuration"""
        try:
            if hasattr(self.config, key):
                setattr(self.config, key, value)
                logger.info(f"Configuration updated: {key} = {value}")
                return True
            else:
                logger.warning(f"Unknown configuration key: {key}")
                return False
        except Exception as e:
            logger.error(f"Error updating configuration: {e}")
            return False