from __future__ import annotations

import psutil
from datetime import datetime
from typing import Optional, TYPE_CHECKING

from edgepulse.utils.log_handler import get_logger
from edgepulse.utils.version import get_agent_version
from edgepulse.models import DeviceInfo, DeviceStatus

if TYPE_CHECKING:
    from edgepulse.storage.database import Database

logger = get_logger(__name__)


class DeviceRegistry:
    def __init__(
        self,
        device_id: str,
        database: Database,
        agent_version: str = get_agent_version(),
    ) -> None:
        self.device_id = device_id
        self.database = database
        self.agent_version = agent_version

    async def register(self) -> None:
        info = DeviceInfo(
            device_id=self.device_id,
            status=DeviceStatus.ONLINE,
            last_seen=datetime.utcnow().isoformat(),
            cpu_usage=self._safe_cpu(),
            memory_usage=self._safe_memory(),
            alerts_count=0,
            version=self.agent_version,
        )
        try:
            await self.database.upsert_device(info)
            logger.info("device_registered_in_db", device_id=self.device_id)
        except Exception as exc:
            logger.error("device_register_error", error=str(exc))

    async def heartbeat(self, alerts_count: int = 0) -> None:
        info = DeviceInfo(
            device_id=self.device_id,
            status=DeviceStatus.ONLINE,
            last_seen=datetime.utcnow().isoformat(),
            cpu_usage=self._safe_cpu(),
            memory_usage=self._safe_memory(),
            alerts_count=alerts_count,
            version=self.agent_version,
        )
        try:
            await self.database.upsert_device(info)
        except Exception as exc:
            logger.error("device_heartbeat_error", error=str(exc))

    async def mark_offline(self) -> None:
        info = DeviceInfo(
            device_id=self.device_id,
            status=DeviceStatus.OFFLINE,
            last_seen=datetime.utcnow().isoformat(),
            version=self.agent_version,
        )
        try:
            await self.database.upsert_device(info)
            logger.info("device_marked_offline", device_id=self.device_id)
        except Exception as exc:
            logger.error("device_mark_offline_error", error=str(exc))

    @staticmethod
    def _safe_cpu() -> Optional[float]:
        try:
            return psutil.cpu_percent(interval=None)
        except Exception:
            return None

    @staticmethod
    def _safe_memory() -> Optional[float]:
        try:
            return psutil.virtual_memory().percent
        except Exception:
            return None
