from __future__ import annotations

from typing import Any, Optional

from edgepulse.utils.log_handler import get_logger
from edgepulse.utils.error_handler import NetworkError, SyncError

logger = get_logger(__name__)


class SyncService:

    def __init__(
        self,
        sync_queue: Any,
        supabase_url: str,
        api_key: str,
        device_id: str,
    ) -> None:
        self._sync_queue = sync_queue
        self._supabase_url = supabase_url
        self._api_key = api_key
        self._device_id = device_id
        self._client: Optional[Any] = None

    @property
    def client(self) -> Optional[Any]:
        return self._client

    async def initialize(self) -> bool:
        try:
            from edgepulse.auth.auth_client import EdgePulseClient, ClientConfig
            from edgepulse.auth.credentials import CredentialManager
            from edgepulse.sync.cloud_sync import CloudSync

            device_id = self._device_id

            try:
                cred_manager = CredentialManager()
                creds = cred_manager.get_device_credentials()
                if creds:
                    device_id = creds.device_id or device_id
            except Exception as exc:
                logger.warning("sync_credentials_load_failed", error=str(exc))
                cred_manager = None

            client = EdgePulseClient(
                ClientConfig(
                    supabase_url=self._supabase_url,
                    timeout_seconds=10,
                    max_retries=3,
                ),
                credential_manager=cred_manager,
            )
            self._client = CloudSync(client)
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
        if self._client is None:
            return
        await self._sync_queue.start_worker(self._client)
        logger.info("sync_queue_worker_started")

    async def stop(self) -> None:
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
