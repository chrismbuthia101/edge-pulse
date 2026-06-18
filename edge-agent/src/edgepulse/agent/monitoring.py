import asyncio
from datetime import datetime
from typing import Any, Dict, List, Optional

import psutil

from edgepulse.config.settings import AgentSettings
from edgepulse.models.metrics import MetricCollector, StandardMetrics
from edgepulse.pipeline.protocols import Collector
from edgepulse.storage.database import Database
from edgepulse.sync.service import SyncService
from edgepulse.sync.sync_queue import SyncQueue
from edgepulse.utils.log_handler import get_logger

logger = get_logger(__name__)


class HealthMonitor:

    def __init__(
        self,
        settings: AgentSettings,
        database: Database,
        collectors: List[Collector],
        sync_service: Optional[SyncService],
        sync_queue: Optional[SyncQueue],
        metrics: MetricCollector,
        device_id: str,
        is_pipeline_running: Any,
        is_api_healthy: Any,
    ) -> None:
        self._settings = settings
        self._database = database
        self._collectors = collectors
        self._sync_service = sync_service
        self._sync_queue = sync_queue
        self._metrics = metrics
        self._device_id = device_id
        self._is_pipeline_running = is_pipeline_running
        self._is_api_healthy = is_api_healthy
        self._health_snapshot_interval = 300
        self._running = False

    def start(self) -> None:
        self._running = True

    def stop(self) -> None:
        self._running = False

    async def health_check_loop(self) -> None:
        await asyncio.sleep(5)
        while self._running:
            try:
                pipeline_healthy = self._is_pipeline_running()
                api_healthy = not self._settings.api.enabled or self._is_api_healthy()
                if not pipeline_healthy or not api_healthy:
                    logger.warning(
                        "component_health_issue",
                        pipeline_healthy=pipeline_healthy,
                        api_healthy=api_healthy,
                    )
                await asyncio.sleep(self._settings.health_check_interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("health_check_error", error=str(e))
                await asyncio.sleep(30)

    async def metrics_collection_loop(self) -> None:
        while self._running:
            try:
                self._metrics.set_gauge(StandardMetrics.CPU_USAGE, psutil.cpu_percent())
                self._metrics.set_gauge(
                    StandardMetrics.MEMORY_USAGE, psutil.virtual_memory().percent
                )
                if self._sync_queue:
                    stats = self._sync_queue.get_stats()
                    self._metrics.set_gauge(StandardMetrics.SYNC_QUEUE_SIZE, stats["queue_depth"])
                await asyncio.sleep(self._settings.metrics.collection_interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("metrics_collection_error", error=str(e))
                await asyncio.sleep(30)

    async def data_cleanup_loop(self) -> None:
        while self._running:
            try:
                await asyncio.sleep(86400)
                if self._running:
                    cleanup_results = await self._database.cleanup_old_data(
                        retention_days=self._settings.privacy.data_retention_days,
                        alert_retention_days=self._settings.privacy.alert_retention_days,
                    )
                    logger.info("data_cleanup_completed", results=cleanup_results)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("data_cleanup_error", error=str(e))

    async def health_snapshot_sync_loop(self) -> None:
        await asyncio.sleep(30)
        while self._running:
            try:
                client = self._sync_service.client if self._sync_service else None
                if client and hasattr(client, "sync_health_snapshots"):
                    snapshot = await self._collect_health_snapshot()
                    if snapshot:
                        success = await client.sync_health_snapshots([snapshot])
                        if success:
                            logger.debug("health_snapshot_synced", device_id=self._device_id)
                        else:
                            logger.warning("health_snapshot_sync_failed", device_id=self._device_id)
                await asyncio.sleep(self._health_snapshot_interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("health_snapshot_sync_error", error=str(e))
                await asyncio.sleep(60)

    async def _collect_health_snapshot(self) -> Optional[Dict[str, Any]]:
        try:
            boot_time = datetime.fromtimestamp(psutil.boot_time())
            uptime_seconds = (datetime.utcnow() - boot_time).total_seconds()
            uptime_percentage = min(100.0, (uptime_seconds / 86400) * 100)

            cpu_percent = psutil.cpu_percent(interval=1)
            memory = psutil.virtual_memory()
            disk = psutil.disk_usage("/")

            network_status = True
            try:
                psutil.net_io_counters()
            except Exception:
                network_status = False

            error_count = 0
            warning_count = 0
            for collector in self._collectors:
                if hasattr(collector, "_error_count"):
                    error_count += getattr(collector, "_error_count", 0)
                if hasattr(collector, "_warning_count"):
                    warning_count += getattr(collector, "_warning_count", 0)

            alert_count = 0
            try:
                recent_alerts = await self._database.get_recent_alerts(hours=24)
                alert_count = len(recent_alerts) if recent_alerts else 0
            except Exception:
                pass

            return {
                "device_id": self._device_id,
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
        except Exception as e:
            logger.error("health_snapshot_collection_error", error=str(e))
            return None
