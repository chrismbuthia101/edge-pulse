"""
DeviceRegistry
==============
Responsible for keeping the local `devices` table up to date.
"""

from __future__ import annotations

import asyncio
import psutil
from datetime import datetime
from typing import Optional, TYPE_CHECKING

from edgepulse.utils.log_handler import get_logger
from edgepulse.shared.schemas import DeviceInfo, DeviceStatus

if TYPE_CHECKING:
    from edgepulse.storage.database import DatabaseManager

logger = get_logger(__name__)


class DeviceRegistry:
    """
    Upserts the device row into the local SQLite database so that the
    `devices` table is always populated.
    """

    def __init__(
        self,
        device_id: str,
        database: DatabaseManager,
        agent_version: str = "1.0.0",
    ) -> None:
        self.device_id = device_id
        self.database = database
        self.agent_version = agent_version

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def register(self) -> None:
        """Write (or update) the device row when the agent starts."""
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
        """Refresh `last_seen` and live resource metrics."""
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
        """Mark the device as offline when the agent stops."""
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

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

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