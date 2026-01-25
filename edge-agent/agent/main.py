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
from agent.detection import IsolationForestDetector, EnsembleDetector
from agent.explainability import SHAPExplainer, ReportGenerator
from agent.logging import LogManager
from agent.alerting import AlertEngine, LocalNotifier
from agent.sync import SupabaseSync
from agent.config import SettingsManager, PrivacyController


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
        
        # Initialize configuration
        self.settings = SettingsManager()
        self.privacy = PrivacyController(
            data_retention_days=self.settings.get_setting("privacy.data_retention_days", 30),
            anonymization_level=self.settings.get_setting("privacy.anonymization_level", "strict"),
            collect_command_lines=self.settings.get_setting("privacy.collect_command_lines", False),
        )
        
        # Initialize collectors
        collection_interval = self.settings.get_setting("collection.interval", 5)
        self.metrics_collector = SystemMetricsCollector(collection_interval=collection_interval)
        self.process_monitor = ProcessMonitor()
        self.network_monitor = NetworkMonitor()
        
        # Initialize feature engineering
        self.feature_extractor = FeatureExtractor(
            window_1min=self.settings.get_setting("collection.window_1min", 60),
            window_5min=self.settings.get_setting("collection.window_5min", 300),
            window_15min=self.settings.get_setting("collection.window_15min", 900),
        )
        self.normalizer = DeviceNormalizer(device_id=device_id)
        
        # Try to load existing baseline
        self.normalizer.load_baseline()
        
        # Initialize detection
        self.isolation_forest = IsolationForestDetector(
            n_estimators=self.settings.get_setting("detection.isolation_forest.n_estimators", 100),
            contamination=self.settings.get_setting("detection.isolation_forest.contamination", "auto"),
        )
        
        # Try to load existing model
        self.isolation_forest.load_model()
        
        # Initialize ensemble (can add autoencoder later)
        self.ensemble = EnsembleDetector(
            detectors=[self.isolation_forest],
            voting_strategy='weighted',
            threshold=self.settings.get_setting("detection.threshold", 0.5),
        )
        
        # Initialize explainability
        self.shap_explainer = SHAPExplainer(
            model=self.isolation_forest.model if self.isolation_forest.is_trained else None,
        )
        self.report_generator = ReportGenerator(device_id=device_id)
        
        # Initialize logging
        db_path = f"data/logs/{device_id}.db"
        self.log_manager = LogManager(
            db_path=db_path,
            device_id=device_id,
            retention_days=self.settings.get_setting("privacy.data_retention_days", 90),
        )
        
        # Initialize alerting
        self.alert_engine = AlertEngine(
            correlation_window=self.settings.get_setting("alerting.correlation_window", 300),
            rate_limit=self.settings.get_setting("alerting.rate_limit", 10),
            rate_window=self.settings.get_setting("alerting.rate_window", 3600),
            min_severity=self.settings.get_setting("alerting.min_severity", "medium"),
        )
        self.notifier = LocalNotifier()
        
        # Initialize sync (optional)
        sync_enabled = self.settings.get_setting("sync.enabled", False)
        if sync_enabled:
            import os
            self.sync_client = SupabaseSync(
                supabase_url=os.getenv("SUPABASE_URL", ""),
                supabase_key=os.getenv("SUPABASE_KEY", ""),
                enabled=sync_enabled,
            )
        else:
            self.sync_client = None
        
        # Threading
        self.collection_queue = queue.Queue()
        self.detection_queue = queue.Queue()
        self.alert_queue = queue.Queue()
        
        # Training data collection
        self.training_data = []
        self.training_period_hours = 24
        self.training_start_time = datetime.utcnow()

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
                
                # Put in queue for detection
                self.collection_queue.put(telemetry)
                
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
                hours_elapsed = (datetime.utcnow() - self.training_start_time).total_seconds() / 3600
                if hours_elapsed < self.training_period_hours:
                    # Collect training data
                    self.training_data.append(features)
                    logger.debug(f"Collecting training data ({len(self.training_data)} samples)")
                    
                    # Update normalizer baseline
                    if len(self.training_data) % 10 == 0:
                        training_array = np.array(self.training_data)
                        self.normalizer.update_baseline(training_array)
                    
                    continue
                
                # Normalize features
                normalized = self.normalizer.transform(features.reshape(1, -1))
                
                # Detect anomalies
                if self.ensemble.detectors and self.isolation_forest.is_trained:
                    label, score, detector_scores = self.ensemble.predict(normalized)
                    
                    if label == 1:
                        # Generate explanation
                        explanation = self.shap_explainer.explain_prediction(
                            normalized[0],
                            background_data=np.array(self.training_data[-100:]) if self.training_data else None,
                        )
                        
                        # Generate report
                        anomaly_data = {
                            "label": label,
                            "score": score,
                            "confidence": score,
                        }
                        report = self.report_generator.generate_alert_report(
                            anomaly_data,
                            explanation,
                            context=telemetry,
                        )
                        
                        # Process alert
                        alert = self.alert_engine.process_anomaly(report, explanation)
                        
                        if alert:
                            # Notify user
                            self.notifier.notify_all(alert)
                            
                            # Log
                            self.log_manager.log_anomaly(report)
                            self.log_manager.log_alert(alert)
                            
                            # Put in sync queue
                            self.alert_queue.put(alert)
                
            except Exception as e:
                logger.error(f"Error in detection loop: {e}")

    def _sync_loop(self) -> None:
        """Sync thread loop."""
        if not self.sync_client:
            return
        
        sync_interval = self.settings.get_setting("sync.interval", 3600)
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
                # Check if training period is complete
                hours_elapsed = (datetime.utcnow() - self.training_start_time).total_seconds() / 3600
                
                if hours_elapsed >= self.training_period_hours and not self.isolation_forest.is_trained:
                    # Train models
                    if len(self.training_data) > 100:
                        logger.info(f"Training models with {len(self.training_data)} samples...")
                        training_array = np.array(self.training_data)
                        
                        # Fit normalizer
                        self.normalizer.fit(training_array)
                        self.normalizer.save_baseline()
                        
                        # Normalize training data
                        normalized_training = self.normalizer.transform(training_array)
                        
                        # Train isolation forest
                        self.isolation_forest.train(normalized_training)
                        self.isolation_forest.save_model()
                        
                        # Update SHAP explainer
                        self.shap_explainer = SHAPExplainer(
                            model=self.isolation_forest.model,
                        )
                        
                        logger.info("Model training completed")
                    else:
                        logger.warning(f"Insufficient training data: {len(self.training_data)} samples")
                
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
