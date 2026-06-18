import asyncio
import time
from datetime import datetime
from typing import Any, Dict, List, Optional, cast

from edgepulse.agent.events import EventBus, Event, EventType, get_event_bus
from edgepulse.pipeline.collect.process import ProcessMonitor
from edgepulse.pipeline.detect.base import DetectionResult
from edgepulse.utils.log_handler import get_logger
from edgepulse.utils.error_handler import EdgePulseError, DetectionError
from edgepulse.models import create_metrics_collector, StandardMetrics, TelemetryEvent
from edgepulse.storage.database import Database
from edgepulse.pipeline.protocols import AlertEngine, Collector, Detector, FeatureExtractor

logger = get_logger(__name__)

_COLLECTOR_TIMEOUT_SECONDS = 30.0
_MAX_BACKOFF_SECONDS = 60.0


class PipelineMetrics:

    def __init__(self, metrics_collector):
        self.metrics = metrics_collector
        self._start_time: Optional[float] = None

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

    def __init__(
        self,
        collectors: List[Collector],
        feature_extractor: FeatureExtractor,
        detectors: List[Detector],
        alert_engine: Optional[AlertEngine] = None,
        device_id: str = "default-device",
        event_bus: Optional[EventBus] = None,
        metrics_collector: Optional[Any] = None,
        database: Optional[Database] = None,
        sync_queue: Optional[Any] = None,
    ):
        self.collectors = collectors
        self.extractor = feature_extractor
        self.detectors = detectors
        self.alert_engine = alert_engine
        self.device_id = device_id
        self.database = database
        self.sync_queue = sync_queue

        self.event_bus = event_bus or get_event_bus()
        self.metrics = metrics_collector or create_metrics_collector(
            f"pipeline_{device_id}", device_id
        )

        self._running = False
        self._task: Optional[asyncio.Task] = None
        self._collection_interval: float = 60.0
        self._consecutive_failures: int = 0

        logger.info("async_pipeline_initialized", device_id=device_id)

    @property
    def running(self) -> bool:
        return self._running

    async def start(self, interval: float = 60.0) -> None:
        if self._running:
            logger.warning("pipeline_already_running")
            return

        self._running = True
        self._collection_interval = interval

        if not self.event_bus.running:
            await self.event_bus.start()

        self._task = asyncio.create_task(self._run_loop())

        await self.event_bus.publish(
            Event(
                type=EventType.SYSTEM,
                data={"interval": interval},
                timestamp=datetime.utcnow(),
                source="async_pipeline",
            )
        )

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

        if self.event_bus.running:
            await self.event_bus.publish(
                Event(
                    type=EventType.SYSTEM,
                    data={},
                    timestamp=datetime.utcnow(),
                    source="async_pipeline",
                )
            )

        logger.info("pipeline_stopped")

    async def _run_loop(self) -> None:
        pipeline_metrics = PipelineMetrics(self.metrics)

        while self._running:
            try:
                async with pipeline_metrics:
                    await self.process_cycle()

                self._consecutive_failures = 0
                await asyncio.sleep(self._collection_interval)

                if not self._running:
                    break

            except asyncio.CancelledError:
                break
            except (DetectionError, EdgePulseError, Exception) as e:
                error_type = type(e).__name__
                logger.error("pipeline_error", error=str(e), error_type=error_type)
                await self._publish_error_event(str(e), error_type)
                self._consecutive_failures += 1
                backoff = min(
                    self._collection_interval * (2 ** (self._consecutive_failures - 1)),
                    _MAX_BACKOFF_SECONDS,
                )
                await asyncio.sleep(backoff)

    async def process_cycle(self) -> Dict[str, Any]:
        logger.debug("starting_cycle")

        telemetry = await self._collect_telemetry()
        if not telemetry:
            logger.warning("no_telemetry_collected")
            return {"status": "no_data"}

        if self.database:
            try:
                await self._save_telemetry(telemetry)
                await self._save_telemetry_event(telemetry)
            except Exception as e:
                logger.error("telemetry_save_error", error=str(e))

        features = await self._extract_features(telemetry)
        if features is None or (hasattr(features, "size") and features.size == 0):
            logger.warning("no_features_extracted")
            return {"status": "no_features"}

        if self.database:
            try:
                await self._save_features(features)
            except Exception as e:
                logger.error("features_save_error", error=str(e))

        detections = await self._run_detectors(features)
        alerts_generated = await self._process_detections(detections, features)

        result = {
            "status": "success",
            "telemetry_points": len(telemetry) if isinstance(telemetry, list) else 1,
            "features_extracted": (
                int(features.size)
                if hasattr(features, "size")
                else (len(features) if isinstance(features, dict) else 0)
            ),
            "detections": len(detections),
            "alerts_generated": alerts_generated,
        }

        logger.debug("cycle_completed", **result)
        return result

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
                            cast(ProcessMonitor, self.collectors[i]).get_running_processes
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

    async def _safe_collect(self, collector: Any) -> Any:
        try:
            if hasattr(collector, "collect") and asyncio.iscoroutinefunction(collector.collect):
                coro = collector.collect()
            elif hasattr(collector, "collect"):
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

    async def _extract_features(self, telemetry: Dict[str, Any]) -> Optional[Any]:
        try:
            if hasattr(self.extractor, "extract_all_features"):
                if asyncio.iscoroutinefunction(self.extractor.extract_all_features):
                    return await self.extractor.extract_all_features(telemetry)
                else:
                    return await asyncio.to_thread(self.extractor.extract_all_features, telemetry)
            else:
                logger.error("feature_extractor_no_method")
                return None
        except Exception as e:
            logger.error("feature_extraction_error", error=str(e))
            return None

    async def _run_detectors(self, features: Any) -> List[Dict[str, Any]]:
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

            if not isinstance(result, dict):
                continue

            result["detector"] = detector_name
            detections.append(result)

        return detections

    async def _safe_detect(self, detector: Any, features: Any) -> Optional[Dict[str, Any]]:
        try:
            if not hasattr(detector, "detect"):
                logger.warning(
                    "detector_no_detect_method",
                    detector=detector.__class__.__name__,
                )
                return None

            coro = (
                detector.detect(features)
                if asyncio.iscoroutinefunction(detector.detect)
                else asyncio.to_thread(detector.detect, features)
            )
            result = await coro

            if isinstance(result, DetectionResult):
                return result.to_dict()
            if isinstance(result, dict):
                return result
            if isinstance(result, (list, tuple)) and result:
                first = result[0]
                if isinstance(first, dict):
                    return first
                if isinstance(first, (list, tuple)) and len(first) >= 2:
                    return {"label": int(first[0]), "anomaly_score": float(first[1])}

            size = getattr(result, "size", None)
            if isinstance(size, int) and size > 0:
                try:
                    first = result.flat[0]  # type: ignore[union-attr]
                    if isinstance(first, (list, tuple)) and len(first) >= 2:
                        return {"label": int(first[0]), "anomaly_score": float(first[1])}
                except Exception:
                    pass

            logger.warning(
                "detector_unexpected_result",
                detector=detector.__class__.__name__,
                result_type=type(result).__name__,
            )
            return None

        except Exception as e:
            logger.error(
                "detector_exception",
                detector=detector.__class__.__name__,
                error=str(e),
            )
            raise

    async def _process_detections(self, detections: List[Dict[str, Any]], features: Any) -> int:
        alerts_generated = 0

        for detection in detections:
            if detection.get("is_alert_triggered", False) or detection.get(
                "anomaly_score", 0
            ) >= detection.get("detection_threshold_applied", 0.5):
                severity = detection.get("severity", "medium")
                self.metrics.record_anomaly(severity)

                await self.event_bus.publish(
                    Event(
                        type=EventType.DETECTION,
                        data={
                            "detection": detection,
                            "features": features,
                            "severity": severity,
                        },
                        timestamp=datetime.utcnow(),
                        source="async_pipeline",
                    )
                )

                alerts_generated += 1

        return alerts_generated

    async def _save_telemetry(self, telemetry: Dict[str, Any]) -> None:
        if not self.database:
            return

        try:
            system_metrics = telemetry.get("system_metrics", {})
            cpu = system_metrics.get("cpu", {})
            memory = system_metrics.get("memory", {})
            disk = system_metrics.get("disk", {})

            cpu_pct = cpu.get("cpu_percent") or cpu.get("cpu_percent_total")
            mem_pct = memory.get("memory_percent")
            disk_pct = None
            disk_usage = disk.get("disk_usage")
            if isinstance(disk_usage, dict):
                # First partition's percent
                for v in disk_usage.values():
                    if isinstance(v, dict):
                        disk_pct = v.get("percent")
                        break
            elif isinstance(disk_usage, (int, float)):
                disk_pct = float(disk_usage)

            telemetry_event = TelemetryEvent(
                device_id=self.device_id,
                component="async_pipeline",
                cpu_percent=cpu_pct,
                memory_percent=mem_pct,
                disk_usage=disk_pct,
                process_count=len(telemetry.get("processes", [])),
                network_connections=len(telemetry.get("network_connections", [])),
                metrics_json=system_metrics,
            )
            await self.database.insert_telemetry(telemetry_event)
            logger.debug("telemetry_saved", device_id=self.device_id)
        except Exception as e:
            logger.error("telemetry_save_error", error=str(e))

    async def _save_telemetry_event(self, telemetry: Dict[str, Any]) -> None:
        if not self.database:
            return
        try:
            payload = {
                "cpu": telemetry.get("system_metrics", {}).get("cpu", {}),
                "memory": telemetry.get("system_metrics", {}).get("memory", {}),
                "process_count": len(telemetry.get("processes", [])),
                "network_connections": len(telemetry.get("network_connections", [])),
                "timestamp": telemetry.get("timestamp"),
            }
            await self.database.insert_telemetry_event(
                device_id=self.device_id,
                event_type="RESOURCE",
                payload=payload,
                agent_version="1.0.0",
            )

            if self.sync_queue:
                await self.sync_queue.enqueue(
                    "telemetry_events",
                    {"device_id": self.device_id, **payload},
                    priority=1,
                )

            await self.event_bus.publish(
                Event(
                    type=EventType.TELEMETRY,
                    data={"telemetry": payload, "source": "async_pipeline"},
                    timestamp=datetime.utcnow(),
                    source="async_pipeline",
                )
            )
        except Exception as e:
            logger.error("telemetry_event_save_error", error=str(e))

    async def _save_features(self, features: Any) -> None:
        if not self.database:
            return
        try:
            feature_names = self.extractor.get_feature_names()
            await self.database.insert_feature_array(
                device_id=self.device_id,
                feature_array=features,
                feature_names=feature_names,
                model_version="1.0",
                normalized=False,
            )
            logger.debug("features_saved", device_id=self.device_id)
        except Exception as e:
            logger.error("features_save_error", error=str(e))

    async def _publish_error_event(self, error_message: str, error_type: str) -> None:
        if self.event_bus.running:
            await self.event_bus.publish(
                Event(
                    type=EventType.SYSTEM,
                    data={"error": error_message, "error_type": error_type},
                    timestamp=datetime.utcnow(),
                    source="async_pipeline",
                )
            )
