import asyncio
import time
from datetime import datetime
from typing import Dict, List, Optional, Any

from edgepulse.core.events_bus import EventBus, Event, EventType, get_event_bus
from edgepulse.utils.log_handler import get_logger
from edgepulse.utils.error_handler import EdgePulseError, DetectionError
from edgepulse.shared import create_metrics_collector, StandardMetrics

logger = get_logger(__name__)

# Maximum seconds to wait for a single collector before skipping it.
# Prevents one slow/hung collector from blocking the entire pipeline cycle.
_COLLECTOR_TIMEOUT_SECONDS = 30.0


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
                {"device_id": self.metrics.device_id},
            )

    async def __aenter__(self):
        self._start_time = time.time()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self._start_time:
            duration = time.time() - self._start_time
            self.metrics.observe_histogram(
                StandardMetrics.PIPELINE_CYCLE_DURATION,
                duration,
                {"device_id": self.metrics.device_id},
            )
            self.metrics.increment_counter(
                StandardMetrics.PIPELINE_CYCLES_TOTAL,
                labels={"device_id": self.metrics.device_id},
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

        self.event_bus = event_bus or get_event_bus()
        self.metrics = metrics_collector or create_metrics_collector(
            f"pipeline_{device_id}", device_id
        )

        self._running = False
        self._task: Optional[asyncio.Task] = None
        self._collection_interval: float = 60.0

        logger.info("async_pipeline_initialized", device_id=device_id)

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def start(self, interval: float = 60.0) -> None:
        if self._running:
            logger.warning("pipeline_already_running")
            return

        self._running = True
        self._collection_interval = interval

        if not self.event_bus._running:
            await self.event_bus.start()

        self._task = asyncio.create_task(self._run_loop())

        await self.event_bus.publish(Event(
            type=EventType.SYSTEM,
            data={"interval": interval},
            timestamp=datetime.utcnow(),
            source="async_pipeline",
        ))

        logger.info("pipeline_started", interval=interval)

    async def stop(self) -> None:
        if not self._running:
            return

        self._running = False

        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

        if self.event_bus._running:
            await self.event_bus.publish(Event(
                type=EventType.SYSTEM,
                data={},
                timestamp=datetime.utcnow(),
                source="async_pipeline",
            ))

        logger.info("pipeline_stopped")

    # ------------------------------------------------------------------
    # Main loop
    # ------------------------------------------------------------------

    async def _run_loop(self) -> None:
        """Main processing loop.
        """
        pipeline_metrics = PipelineMetrics(self.metrics)

        while self._running:
            try:
                async with pipeline_metrics:
                    await self.process_cycle()

                await asyncio.sleep(self._collection_interval)

                if not self._running:
                    break

            except asyncio.CancelledError:
                break
            except DetectionError as e:
                logger.error("pipeline_detection_error", error=str(e))
                await self._publish_error_event(str(e), "DetectionError")
            except EdgePulseError as e:
                logger.error("pipeline_error", error=str(e))
                await self._publish_error_event(str(e), "EdgePulseError")
            except Exception as e:
                logger.error("pipeline_error", error=str(e))
                await self._publish_error_event(str(e), "UnexpectedError")
                await asyncio.sleep(min(self._collection_interval, 10.0))

    # ------------------------------------------------------------------
    # Cycle
    # ------------------------------------------------------------------

    async def process_cycle(self) -> Dict[str, Any]:
        logger.debug("starting_cycle")

        telemetry = await self._collect_telemetry()
        if not telemetry:
            logger.warning("no_telemetry_collected")
            return {"status": "no_data"}

        features = await self._extract_features(telemetry)
        if features is None or features.size == 0:
            logger.warning("no_features_extracted")
            return {"status": "no_features"}

        detections = await self._run_detectors(features)
        alerts_generated = await self._process_detections(detections, features)

        result = {
            "status": "success",
            "telemetry_points": len(telemetry) if isinstance(telemetry, list) else 1,
            "features_extracted": (
                int(features.size)
                if hasattr(features, 'size')
                else (len(features) if isinstance(features, dict) else 0)
            ),
            "detections": len(detections),
            "alerts_generated": alerts_generated,
        }

        logger.debug("cycle_completed", **result)
        return result

    # ------------------------------------------------------------------
    # Collection
    # ------------------------------------------------------------------

    async def _collect_telemetry(self) -> Dict[str, Any]:
        logger.debug("collecting_telemetry")

        tasks = [self._safe_collect(collector) for collector in self.collectors]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        structured_telemetry: Dict[str, Any] = {
            "system_metrics": {},
            "processes": [],
            "network_connections": [],
            "timestamp": datetime.utcnow().isoformat(),
        }

        for i, result in enumerate(results):
            collector_name = self.collectors[i].__class__.__name__

            if isinstance(result, Exception):
                logger.error("collector_error", collector=collector_name, error=str(result))
                continue

            if not result:
                continue

            if collector_name == "SystemMetricsCollector":
                if isinstance(result, list) and result:
                    result = result[0]
                if isinstance(result, dict):
                    structured_telemetry["system_metrics"] = {
                        "cpu": result.get("cpu", {}),
                        "memory": result.get("memory", {}),
                        "disk": result.get("disk", {}),
                        "network": result.get("network", {}),
                        "uptime": result.get("uptime", {}),
                    }

            elif collector_name == "ProcessMonitor":
                try:
                    process_list = await asyncio.wait_for(
                        asyncio.to_thread(
                            self.collectors[i].get_running_processes
                        ),
                        timeout=_COLLECTOR_TIMEOUT_SECONDS,
                    )
                    structured_telemetry["processes"] = process_list or []
                except Exception as e:
                    logger.error("process_list_collection_error", error=str(e))

            elif collector_name == "NetworkMonitor":
                if isinstance(result, list):
                    structured_telemetry["network_connections"] = result
                elif isinstance(result, dict):
                    structured_telemetry["network_connections"] = [result]

            else:
                if isinstance(result, dict):
                    structured_telemetry["system_metrics"][collector_name.lower()] = result

        logger.debug(
            "telemetry_collected",
            system_metrics_keys=list(structured_telemetry["system_metrics"].keys()),
            processes_count=len(structured_telemetry["processes"]),
            network_connections_count=len(structured_telemetry["network_connections"]),
        )

        return structured_telemetry

    async def _safe_collect(self, collector: Any) -> Optional[Dict[str, Any]]:
        """Collect from one collector with a hard timeout.
        """
        try:
            if hasattr(collector, 'collect') and asyncio.iscoroutinefunction(collector.collect):
                coro = collector.collect()
            elif hasattr(collector, 'collect'):
                coro = asyncio.to_thread(collector.collect)
            else:
                logger.warning(
                    "collector_no_collect_method",
                    collector=collector.__class__.__name__,
                )
                return None

            return await asyncio.wait_for(coro, timeout=_COLLECTOR_TIMEOUT_SECONDS)

        except asyncio.TimeoutError:
            logger.error(
                "collector_timeout",
                collector=collector.__class__.__name__,
                timeout=_COLLECTOR_TIMEOUT_SECONDS,
            )
            return None
        except Exception as e:
            logger.error(
                "collector_exception",
                collector=collector.__class__.__name__,
                error=str(e),
            )
            raise

    # ------------------------------------------------------------------
    # Feature extraction
    # ------------------------------------------------------------------

    async def _extract_features(self, telemetry: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        try:
            if hasattr(self.extractor, 'extract_all_features'):
                if asyncio.iscoroutinefunction(self.extractor.extract_all_features):
                    return await self.extractor.extract_all_features(telemetry)
                else:
                    return await asyncio.to_thread(
                        self.extractor.extract_all_features, telemetry
                    )
            else:
                logger.error("feature_extractor_no_method")
                return None
        except Exception as e:
            logger.error("feature_extraction_error", error=str(e))
            return None

    # ------------------------------------------------------------------
    # Detection
    # ------------------------------------------------------------------

    async def _run_detectors(self, features: Dict[str, Any]) -> List[Dict[str, Any]]:
        if not self.detectors:
            return []

        tasks = [self._safe_detect(detector, features) for detector in self.detectors]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        detections: List[Dict[str, Any]] = []

        for i, result in enumerate(results):
            detector_name = self.detectors[i].__class__.__name__

            if isinstance(result, Exception):
                logger.error("detector_error", detector=detector_name, error=str(result))
                continue

            if result is None:
                continue

            detection: Optional[Dict[str, Any]] = None

            if isinstance(result, dict):
                detection = result
            elif isinstance(result, (list, tuple)):
                if not result:
                    continue
                first = result[0]
                if isinstance(first, dict):
                    detection = first
                elif isinstance(first, (list, tuple)) and len(first) >= 2:
                    detection = {"label": int(first[0]), "anomaly_score": float(first[1])}
                else:
                    logger.warning(
                        "detector_unexpected_result",
                        detector=detector_name,
                        result_type=type(first).__name__,
                    )
                    continue
            else:
                size = getattr(result, "size", None)
                if isinstance(size, int):
                    if size == 0:
                        continue
                    try:
                        first = result.flat[0]
                    except Exception:
                        first = None
                    if isinstance(first, (list, tuple)) and len(first) >= 2:
                        detection = {
                            "label": int(first[0]),
                            "anomaly_score": float(first[1]),
                        }
                    else:
                        logger.warning(
                            "detector_unexpected_result",
                            detector=detector_name,
                            result_type=type(result).__name__,
                        )
                        continue
                else:
                    logger.warning(
                        "detector_unexpected_result",
                        detector=detector_name,
                        result_type=type(result).__name__,
                    )
                    continue

            if detection is None:
                continue

            detection["detector"] = detector_name
            detections.append(detection)

        return detections

    async def _safe_detect(self, detector: Any, features: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        try:
            if hasattr(detector, 'detect'):
                if asyncio.iscoroutinefunction(detector.detect):
                    return await detector.detect(features)
                else:
                    return await asyncio.to_thread(detector.detect, features)
            else:
                logger.warning(
                    "detector_no_detect_method",
                    detector=detector.__class__.__name__,
                )
                return None
        except Exception as e:
            logger.error(
                "detector_exception",
                detector=detector.__class__.__name__,
                error=str(e),
            )
            raise

    # ------------------------------------------------------------------
    # Alerting
    # ------------------------------------------------------------------

    async def _process_detections(
        self, detections: List[Dict[str, Any]], features: Dict[str, Any]
    ) -> int:
        """Publish anomaly events and return the count of anomalies detected.
        """
        alerts_generated = 0

        for detection in detections:
            if detection.get('label') == 1 or detection.get('anomaly_score', 0) > 0.5:
                severity = detection.get('severity', 'medium')
                self.metrics.record_anomaly(severity)

                await self.event_bus.publish(Event(
                    type=EventType.DETECTION,
                    data={
                        "detection": detection,
                        "features": features,
                        "severity": severity,
                    },
                    timestamp=datetime.utcnow(),
                    source="async_pipeline",
                ))

                # FIX: was missing — counter remained 0 forever
                alerts_generated += 1

        return alerts_generated

    async def _publish_error_event(self, error_message: str, error_type: str) -> None:
        if self.event_bus._running:
            await self.event_bus.publish(Event(
                type=EventType.SYSTEM,
                data={"error": error_message, "error_type": error_type},
                timestamp=datetime.utcnow(),
                source="async_pipeline",
            ))

    # ------------------------------------------------------------------
    # Control
    # ------------------------------------------------------------------

    def set_collection_interval(self, interval: float) -> None:
        self._collection_interval = max(5.0, min(3600.0, interval))
        self.metrics.update_collection_interval(self._collection_interval)
        logger.info("collection_interval_updated", interval=self._collection_interval)