import asyncio
import time
from datetime import datetime
from typing import Dict, List, Optional, Any, Union

from edgepulse_win.core.events_bus import EventBus, Event, EventType, get_event_bus
from edgepulse_win.utils.log_handler import get_logger
from edgepulse_win.utils.error_handler import EdgePulseError, DetectionError
from edgepulse_win.shared import (
    create_metrics_collector, StandardMetrics
)

logger = get_logger(__name__)

class PipelineMetrics:
    """Metrics tracking for pipeline operations"""
    
    def __init__(self, metrics_collector):
        self.metrics = metrics_collector
        self._start_time: Optional[float] = None
    
    def __enter__(self):
        self._start_time = time.time()
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        if self._start_time:
            duration = time.time() - self._start_time
            self.metrics.observe_histogram(
                StandardMetrics.PIPELINE_CYCLE_DURATION,
                duration,
                {"device_id": self.metrics.device_id}
            )
    
    async def track_cycle(self):
        """Async context manager for tracking pipeline cycles"""
        start_time = time.time()
        try:
            yield
        finally:
            duration = time.time() - start_time
            self.metrics.observe_histogram(
                StandardMetrics.PIPELINE_CYCLE_DURATION,
                duration,
                {"device_id": self.metrics.device_id}
            )
            self.metrics.increment_counter(
                StandardMetrics.PIPELINE_CYCLES_TOTAL,
                labels={"device_id": self.metrics.device_id}
            )

class AsyncPipeline:
    """Async pipeline for processing telemetry data"""
    
    def __init__(
        self,
        collectors: List[Any],
        feature_extractor: Any,
        detectors: List[Any],
        alert_engine: Any,
        device_id: str = "default-device",
        event_bus: Optional[EventBus] = None,
        metrics_collector: Optional[Any] = None,
    ):
        self.collectors = collectors
        self.extractor = feature_extractor
        self.detectors = detectors
        self.alert_engine = alert_engine
        self.device_id = device_id
        
        # Dependencies
        self.event_bus = event_bus or get_event_bus()
        self.metrics = metrics_collector or create_metrics_collector(f"pipeline_{device_id}", device_id)
        
        # State
        self._running = False
        self._task: Optional[asyncio.Task] = None
        self._collection_interval: float = 60.0
        
        logger.info("async_pipeline_initialized", device_id=device_id)
    
    async def start(self, interval: float = 60.0) -> None:
        """Start the pipeline processing loop"""
        if self._running:
            logger.warning("pipeline_already_running")
            return
        
        self._running = True
        self._collection_interval = interval
        
        # Start event bus if not already running
        await self.event_bus.start()
        
        # Start the main processing task
        self._task = asyncio.create_task(self._run_loop())
        
        # Publish start event
        await self.event_bus.publish(Event(
            type=EventType.AGENT_STARTED,
            data={"interval": interval},
            timestamp=datetime.utcnow(),
            source="async_pipeline"
        ))
        
        logger.info("pipeline_started", interval=interval)
    
    async def stop(self) -> None:
        """Stop the pipeline processing"""
        if not self._running:
            return
        
        self._running = False
        
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        
        # Publish stop event
        await self.event_bus.publish(Event(
            type=EventType.AGENT_STOPPED,
            data={},
            timestamp=datetime.utcnow(),
            source="async_pipeline"
        ))
        
        logger.info("pipeline_stopped")
    
    async def _run_loop(self) -> None:
        """Main processing loop"""
        while self._running:
            try:
                async with self.metrics.track_cycle():
                    await self.process_cycle()
                
                # Sleep for the collection interval
                await asyncio.sleep(self._collection_interval)
                
            except asyncio.CancelledError:
                break
            except DetectionError as e:
                logger.error("pipeline_detection_error", error=str(e))
                
                # Publish error event
                await self.event_bus.publish(Event(
                    type=EventType.PIPELINE_ERROR,
                    data={"error": str(e), "error_type": "DetectionError"},
                    timestamp=datetime.utcnow(),
                    source="async_pipeline"
                ))
            except EdgePulseError as e:
                logger.error("pipeline_error", error=str(e))
                
                # Publish error event
                await self.event_bus.publish(Event(
                    type=EventType.PIPELINE_ERROR,
                    data={"error": str(e), "error_type": "EdgePulseError"},
                    timestamp=datetime.utcnow(),
                    source="async_pipeline"
                ))
            except Exception as e:
                logger.error("pipeline_error", error=str(e))
                
                # Publish error event
                await self.event_bus.publish(Event(
                    type=EventType.PIPELINE_ERROR,
                    data={"error": str(e), "error_type": "UnexpectedError"},
                    timestamp=datetime.utcnow(),
                    source="async_pipeline"
                ))
                
                # Continue processing after error
                await asyncio.sleep(min(self._collection_interval, 10.0))
    
    async def process_cycle(self) -> Dict[str, Any]:
        """Process a single collection cycle"""
        logger.debug("starting_cycle")
        
        # 1. Collect telemetry from all collectors (parallel)
        telemetry = await self._collect_telemetry()
        
        if not telemetry:
            logger.warning("no_telemetry_collected")
            return {"status": "no_data"}
        
        # 2. Extract features
        features = await self._extract_features(telemetry)
        
        if not features:
            logger.warning("no_features_extracted")
            return {"status": "no_features"}
        
        # 3. Run detectors (parallel)
        detections = await self._run_detectors(features)
        
        # 4. Process detections and generate alerts
        alerts_generated = await self._process_detections(detections, features)
        
        result = {
            "status": "success",
            "telemetry_points": len(telemetry) if isinstance(telemetry, list) else 1,
            "features_extracted": len(features) if isinstance(features, dict) else 0,
            "detections": len(detections),
            "alerts_generated": alerts_generated
        }
        
        logger.debug("cycle_completed", **result)
        return result
    
    async def _collect_telemetry(self) -> Dict[str, Any]:
        """Collect telemetry from all collectors in parallel"""
        logger.debug("collecting_telemetry")
        
        # Run all collectors concurrently
        tasks = [self._safe_collect(collector) for collector in self.collectors]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Merge results, handling errors
        merged_telemetry = {}
        
        for i, result in enumerate(results):
            collector_name = self.collectors[i].__class__.__name__
            
            if isinstance(result, Exception):
                logger.error("collector_error", collector=collector_name, error=str(result))
                continue
            
            if result:
                if isinstance(result, list):
                    # Handle list of telemetry points
                    for item in result:
                        if isinstance(item, dict):
                            merged_telemetry.update(item)
                elif isinstance(result, dict):
                    merged_telemetry.update(result)
        
        # Add timestamp if not present
        if "timestamp" not in merged_telemetry:
            merged_telemetry["timestamp"] = datetime.utcnow().isoformat()
        
        return merged_telemetry
    
    async def _safe_collect(self, collector: Any) -> Optional[Dict[str, Any]]:
        """Safely collect from a single collector"""
        try:
            if hasattr(collector, 'collect') and asyncio.iscoroutinefunction(collector.collect):
                return await collector.collect()
            elif hasattr(collector, 'collect'):
                # Run blocking collection in thread pool
                return await asyncio.to_thread(collector.collect)
            else:
                logger.warning("collector_no_collect_method", collector=collector.__class__.__name__)
                return None
        except Exception as e:
            logger.error("collector_exception", collector=collector.__class__.__name__, error=str(e))
            raise
    
    async def _extract_features(self, telemetry: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Extract features from telemetry"""
        try:
            if hasattr(self.extractor, 'extract_all_features'):
                if asyncio.iscoroutinefunction(self.extractor.extract_all_features):
                    return await self.extractor.extract_all_features(telemetry)
                else:
                    return await asyncio.to_thread(
                        self.extractor.extract_all_features,
                        telemetry
                    )
            else:
                logger.error("feature_extractor_no_method")
                return None
        except Exception as e:
            logger.error("feature_extraction_error", error=str(e))
            return None
    
    async def _run_detectors(self, features: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Run all detectors in parallel"""
        if not self.detectors:
            return []
        
        tasks = [self._safe_detect(detector, features) for detector in self.detectors]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        detections = []
        for i, result in enumerate(results):
            detector_name = self.detectors[i].__class__.__name__
            
            if isinstance(result, Exception):
                logger.error("detector_error", detector=detector_name, error=str(result))
                continue
            
            if result:
                result["detector"] = detector_name
                detections.append(result)
        
        return detections
    
    async def _safe_detect(self, detector: Any, features: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Safely run a single detector"""
        try:
            if hasattr(detector, 'detect'):
                if asyncio.iscoroutinefunction(detector.detect):
                    return await detector.detect(features)
                else:
                    return await asyncio.to_thread(detector.detect, features)
            else:
                logger.warning("detector_no_detect_method", detector=detector.__class__.__name__)
                return None
        except Exception as e:
            logger.error("detector_exception", detector=detector.__class__.__name__, error=str(e))
            raise
    
    async def _process_detections(self, detections: List[Dict[str, Any]], features: Dict[str, Any]) -> int:
        """Process detections and generate alerts"""
        alerts_generated = 0
        
        for detection in detections:
            # Check if this is an anomaly
            if detection.get('label') == 1 or detection.get('anomaly_score', 0) > 0.5:
                # Record anomaly in metrics
                severity = detection.get('severity', 'medium')
                self.metrics.record_anomaly(severity)
                
                # Publish anomaly event
                await self.event_bus.publish(Event(
                    type=EventType.ANOMALY_DETECTED,
                    data={
                        "detection": detection,
                        "features": features,
                        "severity": severity
                    },
                    timestamp=datetime.utcnow(),
                    source="async_pipeline"
                ))
                
                # Generate alert if alert engine is available
                if self.alert_engine:
                    try:
                        if hasattr(self.alert_engine, 'process_detection'):
                            if asyncio.iscoroutinefunction(self.alert_engine.process_detection):
                                await self.alert_engine.process_detection(detection)
                            else:
                                await asyncio.to_thread(
                                    self.alert_engine.process_detection,
                                    detection
                                )
                        
                        alerts_generated += 1
                        self.metrics.record_alert(severity)
                        
                        # Publish alert event
                        await self.event_bus.publish(Event(
                            type=EventType.ALERT_GENERATED,
                            data={
                                "detection": detection,
                                "severity": severity
                            },
                            timestamp=datetime.utcnow(),
                            source="async_pipeline"
                        ))
                        
                    except Exception as e:
                        logger.error("alert_processing_error", error=str(e))
        
        return alerts_generated
    
    def set_collection_interval(self, interval: float) -> None:
        """Update the collection interval"""
        self._collection_interval = max(5.0, min(3600.0, interval))  # Clamp between 5s and 1h
        self.metrics.update_collection_interval(self._collection_interval)
        logger.info("collection_interval_updated", interval=self._collection_interval)
