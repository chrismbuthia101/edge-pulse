"""
SyncService
===========
Owns initialisation of the SupabaseSync client and the AsyncSyncQueue worker.
"""

from __future__ import annotations

import asyncio
from typing import Any, Optional

from edgepulse.utils.log_handler import get_logger
from edgepulse.utils.error_handler import NetworkError, SyncError

logger = get_logger(__name__)


class SyncService:
    """Lifecycle wrapper for SupabaseSync + AsyncSyncQueue worker."""

    def __init__(
        self,
        sync_queue: Any,
        supabase_url: str,
        supabase_key: str,
        device_id: str,
    ) -> None:
        self._sync_queue = sync_queue
        self._supabase_url = supabase_url
        self._supabase_key = supabase_key
        self._device_id = device_id
        self._client: Optional[Any] = None

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    @property
    def client(self) -> Optional[Any]:
        return self._client

    async def initialize(self) -> bool:
        """Build and initialise the SupabaseSync client. Returns True on success."""
        try:
            from edgepulse.sync.supabase import SupabaseSync
            from edgepulse.auth.credentials import CredentialManager

            device_id = self._device_id
            api_key: Optional[str] = None

            try:
                cred_manager = CredentialManager()
                creds = cred_manager.get_device_credentials()
                if creds:
                    device_id = creds.device_id or device_id
                    api_key = creds.api_key
            except Exception as exc:
                logger.warning("sync_credentials_load_failed", error=str(exc))

            self._client = SupabaseSync(
                supabase_url=self._supabase_url,
                supabase_key=self._supabase_key,
                device_id=device_id,
                api_key=api_key,
                timeout=10.0,
                max_retries=3,
            )
            await self._client.initialize()
            logger.info("sync_client_initialized")
            return True

        except (SyncError, NetworkError) as exc:
            logger.error("sync_client_init_failed", error=str(exc))
            self._client = None
            return False
        except Exception as exc:
            logger.error("sync_client_init_unexpected", error=str(exc))
            self._client = None
            return False

    async def start_worker(self) -> None:
        """Start the queue worker if client is available."""
        if self._client is None:
            return
        await self._sync_queue.start_worker(self._client)
        logger.info("sync_queue_worker_started")

    async def stop(self) -> None:
        """Stop the queue and close the client."""
        try:
            await self._sync_queue.stop()
        except Exception as exc:
            logger.error("sync_queue_stop_error", error=str(exc))
        if self._client is not None:
            try:
                await self._client.close()
            except Exception as exc:
                logger.error("sync_client_close_error", error=str(exc))
            self._client = None