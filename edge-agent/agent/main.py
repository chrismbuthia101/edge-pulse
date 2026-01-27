"""
EdgePulse Main Agent

Main orchestration script for the monitoring agent.
"""

import logging
import signal
import sys
import time
import threading
import queue
from typing import Optional
from datetime import datetime

import numpy as np

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('edge-pulse.log'),
        logging.StreamHandler(sys.stdout),
    ],
)

logger = logging.getLogger(__name__)

# Import all modules
from agent.collectors import SystemMetricsCollector, ProcessMonitor, NetworkMonitor
from agent.features import FeatureExtractor, DeviceNormalizer
from agent.detection import IsolationForestDetector, AutoencoderDetector, EnsembleDetector
from agent.explainability import SHAPExplainer, ReportGenerator
from agent.logging import LogManager
from agent.alerting import AlertEngine, LocalNotifier
from agent.sync import SupabaseSync
from agent.config import SettingsManager, PrivacyController
from agent.core import TrainingManager, DetectionPipeline
from agent.exceptions import EdgePulseError
from agent.utils import PathManager
from agent.models import TelemetryData


class EdgePulseAgent:
    """
    Main orchestration class for EdgePulse agent.
    
    Coordinates all components and manages the main execution loop.
    """

    def __init__(self, device_id: str = "default-device"):
        """
        Initialize the EdgePulse agent.
        
        Args:
            device_id: Device identifier
        """
        self.device_id = device_id
        self.running = False
        
        # Initialize path manager
        self.path_manager = PathManager()
        
        # Initialize configuration
        self.settings = SettingsManager(path_manager=self.path_manager)
        config = self.settings.get_config()
        
        # Initialize privacy controls
        self.privacy = PrivacyController(
            data_retention_days=config.privacy.data_retention_days,
            anonymization_level=config.privacy.anonymization_level,
            collect_command_lines=config.privacy.collect_command_lines,
        )
        
        # Initialize collectors
        self.metrics_collector = SystemMetricsCollector(
            collection_interval=config.collection.interval
        )
        self.process_monitor = ProcessMonitor()
        self.network_monitor = NetworkMonitor()
        
        # Initialize feature engineering
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
        
        # Try to load existing baseline
        self.normalizer.load_baseline()
        
        # Initialize detection - Isolation Forest
        self.isolation_forest = IsolationForestDetector(
            n_estimators=config.detection.isolation_forest.get("n_estimators", 100),
            contamination=config.detection.isolation_forest.get("contamination", "auto"),
            device_id=device_id,
            path_manager=self.path_manager,
        )
        
        # Try to load existing model
        self.isolation_forest.load_model()
        
        # Initialize detection - Autoencoder (if enabled)
        self.autoencoder: Optional[AutoencoderDetector] = None
        if config.detection.use_autoencoder:
            autoencoder_config = config.detection.autoencoder
            # Ensure autoencoder input_dim matches feature dimension
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
            
            # Try to load existing model
            self.autoencoder.load_model()
            
            # Validate loaded model matches current feature dimension
            if self.autoencoder.is_trained and self.autoencoder.input_dim != config.features.feature_dimension:
                logger.warning(
                    f"Loaded autoencoder input_dim ({self.autoencoder.input_dim}) doesn't match "
                    f"current feature_dimension ({config.features.feature_dimension}), "
                    f"will retrain on next training cycle"
                )
                self.autoencoder.is_trained = False
        
        # Initialize ensemble with available detectors
        detectors = []
        if self.isolation_forest.is_trained:
            detectors.append(self.isolation_forest)
        if self.autoencoder and self.autoencoder.is_trained:
            detectors.append(self.autoencoder)
        
        self.ensemble = EnsembleDetector(
            detectors=detectors,
            voting_strategy='weighted',
            threshold=config.detection.threshold,
        )
        
        # Initialize explainability
        self.shap_explainer = SHAPExplainer(
            model=self.isolation_forest.model if self.isolation_forest.is_trained else None,
        )
        self.report_generator = ReportGenerator(device_id=device_id)
        
        # Initialize logging
        self.log_manager = LogManager(
            device_id=device_id,
            retention_days=config.privacy.data_retention_days,
            path_manager=self.path_manager,
        )
        
        # Initialize alerting
        self.alert_engine = AlertEngine(
            correlation_window=config.alerting.correlation_window,
            rate_limit=config.alerting.rate_limit,
            rate_window=config.alerting.rate_window,
            min_severity=config.alerting.min_severity,
        )
        self.notifier = LocalNotifier()
        
        # Initialize sync (optional)
        if config.sync.enabled:
            import os
            self.sync_client = SupabaseSync(
                supabase_url=os.getenv("SUPABASE_URL", ""),
                supabase_key=os.getenv("SUPABASE_KEY", ""),
                enabled=config.sync.enabled,
            )
        else:
            self.sync_client = None
        
        # Initialize training manager (thread-safe)
        self.training_manager = TrainingManager(
            device_id=device_id,
            training_period_hours=config.training.training_period_hours,
            min_training_samples=config.training.min_training_samples,
            max_training_samples=config.training.max_training_samples,
            path_manager=self.path_manager,
        )
        
        # Initialize detection pipeline
        self.detection_pipeline = DetectionPipeline(
            device_id=device_id,
            feature_extractor=self.feature_extractor,
            normalizer=self.normalizer,
            ensemble=self.ensemble,
            shap_explainer=self.shap_explainer,
            report_generator=self.report_generator,
            alert_engine=self.alert_engine,
        )
        
        # Threading
        self.collection_queue: queue.Queue = queue.Queue(maxsize=1000)
        self.alert_queue: queue.Queue = queue.Queue(maxsize=1000)

    def initialize(self) -> None:
        """Initialize all components."""
        logger.info("Initializing EdgePulse agent...")
        
        # Verify log integrity
        if not self.log_manager.verify_all_logs():
            logger.warning("Log integrity verification failed")
        
        logger.info("EdgePulse agent initialized")

    def start(self) -> None:
        """Start the agent."""
        logger.info("Starting EdgePulse agent...")
        self.running = True
        
        # Register signal handlers
        signal.signal(signal.SIGINT, self.handle_shutdown)
        signal.signal(signal.SIGTERM, self.handle_shutdown)
        
        # Start threads
        collector_thread = threading.Thread(target=self._collector_loop, daemon=True)
        detection_thread = threading.Thread(target=self._detection_loop, daemon=True)
        sync_thread = threading.Thread(target=self._sync_loop, daemon=True)
        
        collector_thread.start()
        detection_thread.start()
        if self.sync_client:
            sync_thread.start()
        
        # Main loop
        try:
            self.main_loop()
        except KeyboardInterrupt:
            self.handle_shutdown(signal.SIGINT, None)
        except Exception as e:
            logger.error(f"Error in main loop: {e}")
            self.handle_shutdown(signal.SIGTERM, None)

    def stop(self) -> None:
        """Stop the agent."""
        logger.info("Stopping EdgePulse agent...")
        self.running = False
        
        # Save models and baselines
        if self.isolation_forest.is_trained:
            self.isolation_forest.save_model()
        if self.autoencoder and self.autoencoder.is_trained:
            self.autoencoder.save_model()
        if self.normalizer.is_fitted:
            self.normalizer.save_baseline()
        
        # Enforce retention
        self.log_manager.enforce_retention()
        
        logger.info("EdgePulse agent stopped")

    def handle_shutdown(self, signum, frame) -> None:
        """Handle shutdown signals."""
        logger.info(f"Received signal {signum}, shutting down...")
        self.stop()
        sys.exit(0)

    def _collector_loop(self) -> None:
        """Collector thread loop."""
        while self.running:
            try:
                # Collect all telemetry
                system_metrics = self.metrics_collector.collect_all()
                processes = self.process_monitor.get_running_processes()
                network_connections = self.network_monitor.get_active_connections()
                
                telemetry = {
                    "system_metrics": system_metrics,
                    "processes": processes,
                    "network_connections": network_connections,
                    "timestamp": datetime.utcnow().isoformat(),
                }
                
                # Apply privacy controls
                telemetry = self.privacy.apply_data_minimization(telemetry)
                telemetry = self.privacy.anonymize_identifiers(telemetry)
                
                # Put in queue for detection (non-blocking with timeout)
                try:
                    self.collection_queue.put(telemetry, timeout=1)
                except queue.Full:
                    logger.warning("Collection queue full, dropping telemetry")
                    continue
                
                # Log system state
                self.log_manager.log_event("system_state", telemetry)
                
                time.sleep(self.metrics_collector.collection_interval)
            except Exception as e:
                logger.error(f"Error in collector loop: {e}")
                time.sleep(5)

    def _detection_loop(self) -> None:
        """Detection thread loop."""
        while self.running:
            try:
                # Get telemetry from queue
                try:
                    telemetry = self.collection_queue.get(timeout=1)
                except queue.Empty:
                    continue
                
                # Extract features
                features = self.feature_extractor.extract_all_features(telemetry)
                
                # Check if in training period
                if self.training_manager.is_in_training_period():
                    # Collect training data (thread-safe)
                    self.training_manager.add_training_sample(features)
                    
                    # Update normalizer baseline incrementally
                    sample_count = self.training_manager.get_training_data_count()
                    if sample_count > 0 and sample_count % 10 == 0:
                        training_array = self.training_manager.get_training_data()
                        if len(training_array) > 0:
                            self.normalizer.update_baseline(training_array)
                    
                    continue
                
                # Process through detection pipeline
                training_data = self.training_manager.get_training_data()
                alert = self.detection_pipeline.process_telemetry(
                    telemetry,
                    training_data=training_data if len(training_data) > 0 else None,
                )
                
                if alert:
                    # Notify user
                    self.notifier.notify_all(alert)
                    
                    # Log
                    report = alert.get("anomaly", {})
                    self.log_manager.log_anomaly(report)
                    self.log_manager.log_alert(alert)
                    
                    # Put in sync queue
                    try:
                        self.alert_queue.put(alert, timeout=1)
                    except queue.Full:
                        logger.warning("Alert queue full, dropping alert")
                
            except Exception as e:
                logger.error(f"Error in detection loop: {e}")

    def _sync_loop(self) -> None:
        """Sync thread loop."""
        if not self.sync_client:
            return
        
        config = self.settings.get_config()
        sync_interval = config.sync.interval
        last_sync = time.time()
        
        while self.running:
            try:
                if time.time() - last_sync >= sync_interval:
                    if self.sync_client.is_online():
                        # Sync alerts from queue
                        synced_count = 0
                        while not self.alert_queue.empty():
                            try:
                                alert = self.alert_queue.get_nowait()
                                if self.sync_client.sync_alert(alert):
                                    synced_count += 1
                            except queue.Empty:
                                break
                        
                        if synced_count > 0:
                            logger.info(f"Synced {synced_count} alerts to cloud")
                    
                    last_sync = time.time()
                
                time.sleep(60)  # Check every minute
            except Exception as e:
                logger.error(f"Error in sync loop: {e}")
                time.sleep(60)

    def main_loop(self) -> None:
        """Main execution loop."""
        logger.info("EdgePulse agent running...")
        
        while self.running:
            try:
                # Check if training should be performed
                if self.training_manager.should_train():
                    try:
                        config = self.settings.get_config()
                        
                        # Prepare detectors to train
                        detectors_to_train = [self.isolation_forest]
                        if config.detection.use_autoencoder and self.autoencoder:
                            detectors_to_train.append(self.autoencoder)
                        
                        # Train all detectors
                        self.training_manager.train_models(
                            self.normalizer,
                            detectors_to_train,
                        )
                        
                        # Update ensemble with trained detectors
                        trained_detectors = []
                        if self.isolation_forest.is_trained:
                            trained_detectors.append(self.isolation_forest)
                        if self.autoencoder and self.autoencoder.is_trained:
                            trained_detectors.append(self.autoencoder)
                        
                        self.ensemble = EnsembleDetector(
                            detectors=trained_detectors,
                            voting_strategy='weighted',
                            threshold=config.detection.threshold,
                        )
                        
                        # Update detection pipeline
                        self.detection_pipeline = DetectionPipeline(
                            device_id=self.device_id,
                            feature_extractor=self.feature_extractor,
                            normalizer=self.normalizer,
                            ensemble=self.ensemble,
                            shap_explainer=self.shap_explainer,
                            report_generator=self.report_generator,
                            alert_engine=self.alert_engine,
                        )
                        
                        # Update SHAP explainer (use Isolation Forest as primary)
                        if self.isolation_forest.is_trained:
                            self.shap_explainer = SHAPExplainer(
                                model=self.isolation_forest.model,
                            )
                        
                        logger.info(f"Model training completed: {len(trained_detectors)} detector(s) trained")
                    except Exception as e:
                        logger.error(f"Error training models: {e}")
                
                time.sleep(10)  # Main loop check interval
            except Exception as e:
                logger.error(f"Error in main loop: {e}")
                time.sleep(10)


def main():
    """Main entry point."""
    import os
    
    device_id = os.getenv("DEVICE_ID", "default-device")
    
    agent = EdgePulseAgent(device_id=device_id)
    agent.initialize()
    agent.start()


if __name__ == "__main__":
    main()
