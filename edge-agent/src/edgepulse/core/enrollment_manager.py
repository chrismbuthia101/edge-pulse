from typing import Optional
from edgepulse.utils.log_handler import get_logger
from edgepulse.auth.enrollment import DeviceEnrollmentClient
from edgepulse.auth.credentials import CredentialManager
from edgepulse.auth.auth_client import EdgePulseClient, ClientConfig
from edgepulse.sync.cloud_sync import CloudSync
from edgepulse.utils.error_handler import ConfigurationError

logger = get_logger(__name__)


class EnrollmentManager:

    def __init__(self, credential_manager: CredentialManager):
        self.credential_manager = credential_manager
        self.enrollment_client: Optional[DeviceEnrollmentClient] = None
        self.sync_client: Optional[CloudSync] = None
        self._is_enrolled = False

    async def initialize(self, service_mode: bool = False) -> bool:
        try:
            self.enrollment_client = DeviceEnrollmentClient(self.credential_manager)
            self._is_enrolled = self.enrollment_client.is_enrolled()

            if not self._is_enrolled:
                if service_mode:
                    return await self._attempt_automatic_enrollment()
                else:
                    logger.warning("Device not enrolled - enrollment required")
                    raise ConfigurationError("Device not enrolled")

            return True

        except Exception as e:
            logger.error(f"Failed to initialize enrollment manager: {e}")
            raise

    async def _attempt_automatic_enrollment(self) -> bool:
        try:
            enrollment_config = self.enrollment_client.read_enrollment_config()
            if not enrollment_config:
                logger.warning("No enrollment configuration found — will retry on next startup")
                return False

            logger.info("Attempting automatic enrollment...")
            result = await self.enrollment_client.enroll_device(enrollment_config)

            if result:
                success = self.enrollment_client.complete_enrollment(
                    result, supabase_url=enrollment_config.supabase_url
                )
                if success:
                    self._is_enrolled = True
                    logger.info("Automatic enrollment successful")
                    return True
                else:
                    logger.error("Failed to complete enrollment")
                    return False
            else:
                logger.error("Automatic enrollment failed — will retry on next startup")
                return False

        except Exception as e:
            logger.error(f"Automatic enrollment failed: {e}")
            return False

    def is_enrolled(self) -> bool:
        return self._is_enrolled

    def get_device_credentials(self):
        if not self.enrollment_client or not self._is_enrolled:
            return None
        return self.enrollment_client.get_device_credentials()

    def create_sync_client(self, supabase_url: str, device_id: str, api_key: str) -> CloudSync:
        client = EdgePulseClient(
            ClientConfig(supabase_url=supabase_url),
            credential_manager=self.credential_manager,
        )
        self.sync_client = CloudSync(client)
        logger.info("Sync client initialized")
        return self.sync_client

    def get_sync_client(self) -> Optional[CloudSync]:
        return self.sync_client
