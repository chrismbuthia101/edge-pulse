from typing import Optional
from edgepulse.utils.log_handler import get_logger
from edgepulse.auth.enrollment import DeviceEnrollmentClient
from edgepulse.auth.credentials import CredentialManager
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
                logger.error("No enrollment configuration found")
                raise ConfigurationError("Device enrollment required")
            
            logger.info("Attempting automatic enrollment...")
            result = await self.enrollment_client.enroll_device(enrollment_config)

            if result:
                success = self.enrollment_client.complete_enrollment(
                    result, supabase_url=enrollment_config.supabase_url, supabase_anon_key=enrollment_config.supabase_anon_key
                )
                if success:
                    self._is_enrolled = True
                    logger.info("Automatic enrollment successful")
                    return True
                else:
                    raise ConfigurationError("Failed to complete enrollment")
            else:
                logger.error("Automatic enrollment failed")
                raise ConfigurationError("Device enrollment required")
                
        except Exception as e:
            logger.error(f"Automatic enrollment failed: {e}")
            raise
    
    def is_enrolled(self) -> bool:
        return self._is_enrolled
    
    def get_device_credentials(self):
        if not self.enrollment_client or not self._is_enrolled:
            return None
        return self.enrollment_client.get_device_credentials()
    
    def create_sync_client(self, supabase_url: str, device_id: str, api_key: str) -> CloudSync:
        self.sync_client = CloudSync(
            supabase_url=supabase_url,
            supabase_key=api_key,
            device_id=device_id,
            api_key=api_key,
        )
        logger.info("Sync client initialized")
        return self.sync_client

    def get_sync_client(self) -> Optional[CloudSync]:
        return self.sync_client
