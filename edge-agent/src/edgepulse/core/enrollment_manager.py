"""
Enrollment Manager for EdgePulse

Handles device enrollment logic separated from AgentCore to improve SRP compliance.
"""

from typing import Optional
from edgepulse.utils.log_handler import get_logger
from edgepulse.auth.enrollment import DeviceEnrollmentClient
from edgepulse.auth.credentials import CredentialManager
from edgepulse.sync.supabase import SupabaseSync
from edgepulse.utils.log_handler import ConfigurationError

logger = get_logger(__name__)


class EnrollmentManager:
    """Manages device enrollment process and configuration"""
    
    def __init__(self, credential_manager: CredentialManager):
        self.credential_manager = credential_manager
        self.enrollment_client: Optional[DeviceEnrollmentClient] = None
        self.supabase_client: Optional[SupabaseSync] = None
        self._is_enrolled = False
        
    async def initialize(self, service_mode: bool = False) -> bool:
        """Initialize enrollment client and check enrollment status"""
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
        """Attempt automatic enrollment in service mode"""
        try:
            enrollment_config = self.enrollment_client.read_enrollment_config()
            if not enrollment_config:
                logger.error("No enrollment configuration found")
                raise ConfigurationError("Device enrollment required")
            
            logger.info("Attempting automatic enrollment...")
            result = await self.enrollment_client.enroll_device(enrollment_config)
            
            if result:
                success = self.enrollment_client.complete_enrollment(result)
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
        """Check if device is enrolled"""
        return self._is_enrolled
    
    def get_device_credentials(self):
        """Get current device credentials"""
        if not self.enrollment_client or not self._is_enrolled:
            return None
        return self.enrollment_client.get_device_credentials()
    
    def create_supabase_client(self, supabase_url: str, device_id: str, api_key: str) -> SupabaseSync:
        """Create and return Supabase client"""
        self.supabase_client = SupabaseSync(
            supabase_url=supabase_url,
            supabase_key=api_key,
            device_id=device_id,
            api_key=api_key,
        )
        logger.info("Supabase client initialized")
        return self.supabase_client
    
    def get_supabase_client(self) -> Optional[SupabaseSync]:
        """Get current Supabase client"""
        return self.supabase_client
