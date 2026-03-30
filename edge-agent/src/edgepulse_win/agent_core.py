"""
EdgePulse Agent Core - Portable Monitoring Logic

This module contains all core monitoring, detection, and sync logic
with NO Windows-specific imports. It's designed to be portable across
platforms and can be wrapped by platform-specific services.
"""

import asyncio
import time
import uuid
from typing import Dict, Any, Optional
from datetime import datetime
from dataclasses import dataclass

# Core imports (platform-agnostic interfaces)
from edgepulse_win.utils.log_handler import get_logger, ConfigurationError
from edgepulse_win.detectors.model_manager import ModelManager
from edgepulse_win.auth.device_enrollment import DeviceEnrollmentClient
from edgepulse_win.sync.supabase import SupabaseSync

logger = get_logger(__name__)


@dataclass
class AgentConfig:
    """Portable agent configuration"""
    collection_interval: int = 60  # seconds
    detection_threshold: float = 0.5
    sync_enabled: bool = True
    offline_queue_size: int = 10000
    logging_level: str = "INFO"
    enable_process_monitoring: bool = True
    enable_network_monitoring: bool = True
    enable_filesystem_monitoring: bool = True
    model_type: str = "isolation_forest"  # or "autoencoder"
    model_path: Optional[str] = None
    
    # Authentication configuration
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
        
        # Core components (platform-agnostic interfaces)
        self.telemetry_collector = None
        self.model_manager = None
        self.explainable_ai = None
        self.sync_manager = None
        self.config_manager = None
        self.credential_manager = None
        self.enrollment_client = None
        self.supabase_client = None
        
        # State
        self._last_collection_time = 0
        self._last_detection_time = 0
        self._last_sync_time = 0
        self._is_enrolled = False
        
        logger.info("AgentCore initialized")
    
    async def initialize(self) -> None:
        """Initialize all core components"""
        try:
            logger.info("Initializing AgentCore components")
            
            # Initialize credential manager
            await self._init_credential_manager()
            
            # Initialize enrollment client and check enrollment status
            await self._init_enrollment_client()
            
            # Initialize config manager
            await self._init_config_manager()
            
            # Initialize telemetry collector
            await self._init_telemetry_collector()
            
            # Initialize model manager
            await self._init_model_manager()
            
            # Initialize explainable AI
            await self._init_explainable_ai()
            
            # Initialize sync manager
            await self._init_sync_manager()
            
            logger.info("AgentCore initialization complete")
            
        except Exception as e:
            logger.error(f"Failed to initialize AgentCore: {e}")
            raise ConfigurationError(f"AgentCore initialization failed: {e}")
    
    async def _init_credential_manager(self) -> None:
        """Initialize credential manager (platform-specific implementation)"""
        try:
            # Import platform-specific implementation
            if self._get_platform() == "Windows":
                from .auth.credentials import CredentialManager
                self.credential_manager = CredentialManager()
            else:
                # Placeholder for future Linux/macOS implementation
                from .auth.credentials import CredentialManager
                self.credential_manager = CredentialManager()
            
            # Check if device is enrolled
            if not self.credential_manager.is_enrolled():
                logger.warning("Device not enrolled - enrollment required")
                raise ConfigurationError("Device not enrolled")
            
            logger.info("Credential manager initialized")
            
        except Exception as e:
            logger.error(f"Failed to initialize credential manager: {e}")
            raise
    
    async def _init_enrollment_client(self) -> None:
        """Initialize enrollment client and check enrollment status"""
        try:
            self.enrollment_client = DeviceEnrollmentClient(self.config.enrollment_config_path)
            
            # Check if already enrolled
            self._is_enrolled = await self.enrollment_client.check_enrollment_status()
            
            if not self._is_enrolled:
                if self.config.service_mode:
                    # In service mode, try to auto-enroll if config exists
                    enrollment_config = self.enrollment_client.load_enrollment_config()
                    if enrollment_config:
                        logger.info("Attempting automatic enrollment...")
                        result = await self.enrollment_client.enroll_device(enrollment_config)
                        
                        if result.success:
                            self._is_enrolled = True
                            self.config.device_id = result.device_id
                            self.config.api_key = result.api_key
                            logger.info("Automatic enrollment successful")
                        else:
                            logger.error(f"Automatic enrollment failed: {result.message}")
                            raise ConfigurationError("Device enrollment required")
                    else:
                        logger.error("No enrollment configuration found")
                        raise ConfigurationError("Device enrollment required")
                else:
                    logger.warning("Device not enrolled - enrollment required")
                    raise ConfigurationError("Device not enrolled")
            else:
                # Load existing credentials
                device_id, api_key = self.enrollment_client.get_credentials()
                self.config.device_id = device_id
                self.config.api_key = api_key
                logger.info(f"Device already enrolled: {device_id}")
            
            # Initialize Supabase client with credentials
            if self.config.supabase_url and self.config.device_id and self.config.api_key:
                self.supabase_client = SupabaseSync(
                    supabase_url=self.config.supabase_url,
                    supabase_key=self.config.api_key,
                    device_id=self.config.device_id,
                    api_key=self.config.api_key
                )
                logger.info("Supabase client initialized")
            
        except Exception as e:
            logger.error(f"Failed to initialize enrollment client: {e}")
            raise
    
    async def _init_telemetry_collector(self) -> None:
        """Initialize telemetry collector"""
        try:
            from .collectors.telemetry_collector import TelemetryCollector
            
            self.telemetry_collector = TelemetryCollector(
                agent_version=self._get_agent_version()
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
            
            # Initialize model manager
            success = await self.model_manager.initialize()
            if not success:
                logger.error("Failed to initialize model manager")
                raise
            
            logger.info("Model manager initialized")
            
        except Exception as e:
            logger.error(f"Failed to initialize model manager: {e}")
            raise
    
    async def _init_explainable_ai(self) -> None:
        """Initialize explainable AI"""
        try:
            from .analysis.explainable_ai import ExplainableAIManager
            
            model_id = self.model_manager.model_id if self.model_manager else "unknown"
            
            self.explainable_ai = ExplainableAIManager(model_id=model_id)
            
            # Initialize with training data (placeholder)
            # In production, this would use actual training data
            import numpy as np
            dummy_training_data = np.random.random((100, 10))
            feature_names = [f"feature_{i}" for i in range(10)]
            
            success = self.explainable_ai.initialize(
                model=self.model_manager.current_detector,
                training_data=dummy_training_data,
                feature_names=feature_names
            )
            
            if success:
                logger.info("Explainable AI initialized")
            else:
                logger.warning("Explainable AI initialization failed, explanations disabled")
                
        except Exception as e:
            logger.error(f"Failed to initialize explainable AI: {e}")
            # Continue without explanations
            self.explainable_ai = None
    
    async def _init_sync_manager(self) -> None:
        """Initialize sync manager"""
        try:
            if not self.config.sync_enabled:
                logger.info("Sync disabled by configuration")
                return
            
            # Initialize sync components
            from .sync.async_queue import AsyncSyncQueue
            from .sync.supabase import SupabaseSync
            from .sync.sync_fsm import SyncFSM
            from .auth.auth_client import AuthenticatedClient, AuthConfig
            
            # Get credentials for auth
            credentials = self.credential_manager.get_device_credentials()
            if not credentials:
                raise ConfigurationError("No device credentials available")
            
            # Initialize auth client
            auth_config = AuthConfig(
                supabase_url=self._get_supabase_url(),
                timeout_seconds=30
            )
            auth_client = AuthenticatedClient(auth_config, self.credential_manager)
            
            # Initialize sync components
            sync_queue = AsyncSyncQueue(max_size=self.config.offline_queue_size)
            supabase_sync = SupabaseSync(auth_client)
            sync_fsm = SyncFSM(supabase_sync, sync_queue)
            
            self.sync_manager = {
                'queue': sync_queue,
                'supabase': supabase_sync,
                'fsm': sync_fsm,
                'auth_client': auth_client
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
                auth_client = self.sync_manager['auth_client']
                self.config_manager = ConfigManager(auth_client)
                await self.config_manager.start()
                logger.info("Configuration manager initialized")
            else:
                logger.info("Configuration manager disabled (no sync)")
                
        except Exception as e:
            logger.error(f"Failed to initialize config manager: {e}")
            # Continue without remote config
    
    async def start(self) -> None:
        """Start the agent core"""
        if self._running:
            logger.warning("AgentCore already running")
            return
        
        try:
            await self.initialize()
            self._running = True
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
            # Stop components
            if self.telemetry_collector:
                self.telemetry_collector.stop()
            
            if self.sync_manager:
                await self.sync_manager['fsm'].stop()
                await self.sync_manager['queue'].close()
            
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
                    
                    # Collect telemetry
                    if current_time - self._last_collection_time >= self.config.collection_interval:
                        await self._collect_and_process_telemetry()
                        self._last_collection_time = current_time
                    
                    # Check for configuration updates
                    if self.config_manager and current_time - self._last_sync_time >= 900:  # 15 minutes
                        await self.config_manager.force_refresh()
                        self._last_sync_time = current_time
                    
                    # Wait for next cycle
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
            # Collect telemetry events
            telemetry_events = self.telemetry_collector.collect()
            
            if not telemetry_events:
                logger.debug("No telemetry events collected")
                return
            
            logger.debug(f"Collected {len(telemetry_events)} telemetry events")
            
            # Process each event through detection pipeline
            for event in telemetry_events:
                await self._process_telemetry_event(event)
                
        except Exception as e:
            logger.error(f"Error collecting/processing telemetry: {e}")
    
    async def _process_telemetry_event(self, event: Dict[str, Any]) -> None:
        """Process individual telemetry event"""
        try:
            # Extract features (placeholder implementation)
            features = self._extract_features(event)
            
            # Perform anomaly detection
            if self.model_manager:
                detection_result = await self.model_manager.detect_anomaly(features)
                
                if detection_result.is_alert_triggered:
                    await self._handle_alert(event, detection_result)
                
                # Store anomaly score
                await self._store_anomaly_score(event, detection_result)
            
            # Store telemetry event
            await self._store_telemetry_event(event)
            
        except Exception as e:
            logger.error(f"Error processing telemetry event: {e}")
    
    def _extract_features(self, event: Dict[str, Any]) -> Any:
        """Extract features from telemetry event"""
        # Placeholder implementation
        # In production, this would use proper feature extraction
        import numpy as np
        
        # Simple feature extraction based on event type
        if event.get('event_type') == 'PROCESS':
            # Process-based features
            return np.array([
                event.get('cpu_percent', 0.0),
                event.get('memory_percent', 0.0),
                len(event.get('cmdline_args', [])),
                1.0 if event.get('privilege_level') == 'ADMIN' else 0.0
            ])
        elif event.get('event_type') == 'NETWORK':
            # Network-based features
            return np.array([
                event.get('remote_port', 0),
                1.0 if event.get('remote_address') else 0.0,
                len(event.get('remote_address', '')),
                1.0 if event.get('status') == 'ESTABLISHED' else 0.0
            ])
        else:
            # Default features
            return np.random.random(4)  # Placeholder
    
    async def _handle_alert(self, event: Dict[str, Any], detection_result: Any) -> None:
        """Handle anomaly alert"""
        try:
            # Generate explanation if available
            explanation = None
            if self.explainable_ai:
                import numpy as np
                features = self._extract_features(event)
                explanation = self.explainable_ai.explain_prediction(
                    features, detection_result.anomaly_score
                )
            
            # Create alert record
            alert_record = {
                'alert_id': str(uuid.uuid4()),
                'device_id': self.credential_manager.get_device_credentials().device_id,
                'alert_severity': self._calculate_severity(detection_result.anomaly_score),
                'alert_status': 'PENDING',
                'explanation_json': self.explainable_ai.explanation_to_json(explanation) if explanation else '{}',
                'created_at': datetime.utcnow().isoformat(),
                'updated_at': datetime.utcnow().isoformat()
            }
            
            # Store alert
            await self._store_alert(alert_record)
            
            logger.warning(f"Alert generated: {alert_record['alert_id']} (score: {detection_result.anomaly_score:.4f})")
            
        except Exception as e:
            logger.error(f"Error handling alert: {e}")
    
    async def _store_telemetry_event(self, event: Dict[str, Any]) -> None:
        """Store telemetry event"""
        try:
            if self.sync_manager:
                # Queue for sync to cloud
                await self.sync_manager['queue'].add_item('telemetry_events', event)
            else:
                # Store locally (placeholder)
                logger.debug(f"Storing telemetry locally: {event.get('event_id')}")
                
        except Exception as e:
            logger.error(f"Error storing telemetry event: {e}")
    
    async def _store_anomaly_score(self, event: Dict[str, Any], detection_result: Any) -> None:
        """Store anomaly score"""
        try:
            score_record = {
                'score_id': str(uuid.uuid4()),
                'device_id': self.credential_manager.get_device_credentials().device_id,
                'model_id': detection_result.model_id,
                'anomaly_score': detection_result.anomaly_score,
                'detection_threshold_applied': detection_result.detection_threshold_applied,
                'is_alert_triggered': detection_result.is_alert_triggered,
                'inference_latency_ms': detection_result.inference_latency_ms,
                'scored_at': datetime.utcnow().isoformat()
            }
            
            if self.sync_manager:
                await self.sync_manager['queue'].add_item('anomaly_scores', score_record)
            else:
                logger.debug(f"Storing anomaly score locally: {score_record['score_id']}")
                
        except Exception as e:
            logger.error(f"Error storing anomaly score: {e}")
    
    async def _store_alert(self, alert_record: Dict[str, Any]) -> None:
        """Store alert record"""
        try:
            if self.sync_manager:
                await self.sync_manager['queue'].add_item('alert_records', alert_record)
            else:
                logger.debug(f"Storing alert locally: {alert_record['alert_id']}")
                
        except Exception as e:
            logger.error(f"Error storing alert: {e}")
    
    def _calculate_severity(self, anomaly_score: float) -> str:
        """Calculate alert severity from anomaly score"""
        if anomaly_score >= 0.9:
            return 'CRITICAL'
        elif anomaly_score >= 0.7:
            return 'HIGH'
        elif anomaly_score >= 0.5:
            return 'MEDIUM'
        else:
            return 'LOW'
    
    def _get_platform(self) -> str:
        """Get current platform"""
        import platform
        return platform.system()
    
    def _get_agent_version(self) -> str:
        """Get agent version"""
        try:
            import pkg_resources
            return pkg_resources.get_distribution('edge-agent').version
        except:
            return "0.1.0"
    
    def _get_supabase_url(self) -> str:
        """Get Supabase URL from environment or config"""
        import os
        return os.environ.get('SUPABASE_URL', 'https://placeholder.supabase.co')
    
    def get_status(self) -> Dict[str, Any]:
        """Get current agent status"""
        return {
            'running': self._running,
            'config': self.config.__dict__,
            'last_collection_time': self._last_collection_time,
            'last_detection_time': self._last_detection_time,
            'last_sync_time': self._last_sync_time,
            'components': {
                'telemetry_collector': self.telemetry_collector is not None,
                'model_manager': self.model_manager is not None,
                'explainable_ai': self.explainable_ai is not None,
                'sync_manager': self.sync_manager is not None,
                'config_manager': self.config_manager is not None
            }
        }
    
    async def force_sync(self) -> bool:
        """Force immediate sync"""
        if self.sync_manager:
            return await self.sync_manager['fsm'].force_sync()
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
