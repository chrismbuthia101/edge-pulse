"""
Credential Management for EdgePulse

Provides secure storage and retrieval of device credentials using
platform-specific credential managers (keyring on Windows, etc.).
"""

import os
import platform
import hashlib
import secrets
from pathlib import Path
from typing import Optional
from dataclasses import dataclass

try:
    import keyring
    KEYRING_AVAILABLE = True
except ImportError:
    KEYRING_AVAILABLE = False

from edgepulse_win.utils.log_handler import get_logger

logger = get_logger(__name__)

# Credential service and application names
SERVICE_NAME = "EdgePulse"
APP_NAME = "EdgePulseAgent"

# Credential keys
DEVICE_ID_KEY = "device_id"
API_KEY_KEY = "api_key"
ENROLLMENT_TOKEN_KEY = "enrollment_token"


@dataclass
class DeviceCredentials:
    """Device credential information"""
    device_id: str
    api_key: str
    enrollment_token: Optional[str] = None


class CredentialManager:
    """Manages secure storage of device credentials"""
    
    def __init__(self):
        self.platform = platform.system()
        self._fallback_storage = None
        
        # Initialize credential backend
        if KEYRING_AVAILABLE:
            try:
                # Test keyring availability
                keyring.get_password(SERVICE_NAME, "test")
                self._use_keyring = True
                logger.info("Using system keyring for credential storage")
            except Exception as e:
                logger.warning(f"Keyring not available: {e}, using fallback storage")
                self._use_keyring = False
        else:
            logger.warning("Keyring not installed, using fallback storage")
            self._use_keyring = False
            
        if not self._use_keyring:
            self._init_fallback_storage()
    
    def _init_fallback_storage(self):
        """Initialize fallback encrypted storage"""
        try:
            # Use user data directory
            if self.platform == "Windows":
                data_dir = Path(os.environ.get('ProgramData', 'C:\\ProgramData')) / 'EdgePulse'
            else:
                data_dir = Path.home() / '.edgepulse'
                
            data_dir.mkdir(parents=True, exist_ok=True)
            self._fallback_storage = data_dir / 'credentials.enc'
            logger.info(f"Using fallback credential storage: {self._fallback_storage}")
            
        except Exception as e:
            logger.error(f"Failed to initialize fallback storage: {e}")
            raise
    
    def _get_fallback_key(self) -> bytes:
        """Generate encryption key for fallback storage"""
        # Use machine-specific key derivation
        machine_id = platform.node() + platform.machine()
        if self.platform == "Windows":
            try:
                import winreg
                with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, 
                                 r"SOFTWARE\Microsoft\Windows NT\CurrentVersion") as key:
                    machine_id += str(winreg.QueryValueEx(key, "ProductId")[0])
            except:
                pass
        
        return hashlib.sha256(machine_id.encode()).digest()
    
    def _encrypt_fallback(self, data: str) -> bytes:
        """Encrypt data for fallback storage"""
        try:
            from cryptography.fernet import Fernet
            key = self._get_fallback_key()
            fernet_key = hashlib.sha256(key).digest()[:32]
            fernet = Fernet(fernet_key)
            return fernet.encrypt(data.encode())
        except ImportError:
            logger.error("cryptography not available for fallback encryption")
            raise
    
    def _decrypt_fallback(self, encrypted_data: bytes) -> str:
        """Decrypt data from fallback storage"""
        try:
            from cryptography.fernet import Fernet
            key = self._get_fallback_key()
            fernet_key = hashlib.sha256(key).digest()[:32]
            fernet = Fernet(fernet_key)
            return fernet.decrypt(encrypted_data).decode()
        except ImportError:
            logger.error("cryptography not available for fallback decryption")
            raise
    
    def store_credential(self, key: str, value: str) -> bool:
        """Store a credential securely"""
        try:
            if self._use_keyring:
                keyring.set_password(SERVICE_NAME, key, value)
                logger.debug(f"Stored credential {key} in keyring")
                return True
            else:
                # Use fallback storage
                credentials = self._load_fallback_credentials()
                credentials[key] = value
                self._save_fallback_credentials(credentials)
                logger.debug(f"Stored credential {key} in fallback storage")
                return True
                
        except Exception as e:
            logger.error(f"Failed to store credential {key}: {e}")
            return False
    
    def get_credential(self, key: str) -> Optional[str]:
        """Retrieve a credential securely"""
        try:
            if self._use_keyring:
                value = keyring.get_password(SERVICE_NAME, key)
                logger.debug(f"Retrieved credential {key} from keyring")
                return value
            else:
                # Use fallback storage
                credentials = self._load_fallback_credentials()
                value = credentials.get(key)
                logger.debug(f"Retrieved credential {key} from fallback storage")
                return value
                
        except Exception as e:
            logger.error(f"Failed to retrieve credential {key}: {e}")
            return None
    
    def delete_credential(self, key: str) -> bool:
        """Delete a credential securely"""
        try:
            if self._use_keyring:
                try:
                    keyring.delete_password(SERVICE_NAME, key)
                    logger.debug(f"Deleted credential {key} from keyring")
                    return True
                except keyring.errors.PasswordDeleteError:
                    # Credential doesn't exist
                    return True
            else:
                # Use fallback storage
                credentials = self._load_fallback_credentials()
                if key in credentials:
                    del credentials[key]
                    self._save_fallback_credentials(credentials)
                    logger.debug(f"Deleted credential {key} from fallback storage")
                return True
                
        except Exception as e:
            logger.error(f"Failed to delete credential {key}: {e}")
            return False
    
    def _load_fallback_credentials(self) -> dict:
        """Load credentials from fallback storage"""
        try:
            if not self._fallback_storage.exists():
                return {}
                
            with open(self._fallback_storage, 'rb') as f:
                encrypted_data = f.read()
                
            decrypted_data = self._decrypt_fallback(encrypted_data)
            import json
            return json.loads(decrypted_data)
            
        except Exception as e:
            logger.error(f"Failed to load fallback credentials: {e}")
            return {}
    
    def _save_fallback_credentials(self, credentials: dict):
        """Save credentials to fallback storage"""
        try:
            import json
            
            data = json.dumps(credentials)
            encrypted_data = self._encrypt_fallback(data)
            
            with open(self._fallback_storage, 'wb') as f:
                f.write(encrypted_data)
                
            # Set appropriate permissions
            if self.platform != "Windows":
                os.chmod(self._fallback_storage, 0o600)
                
        except Exception as e:
            logger.error(f"Failed to save fallback credentials: {e}")
            raise
    
    def generate_device_id(self) -> str:
        """Generate a unique device ID"""
        try:
            # Try to get a stable machine identifier
            machine_id = platform.node() + platform.machine()
            
            if self.platform == "Windows":
                try:
                    import winreg
                    with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, 
                                     r"SOFTWARE\Microsoft\Windows NT\CurrentVersion") as key:
                        machine_id += str(winreg.QueryValueEx(key, "ProductId")[0])
                except:
                    pass
            
            # Add some randomness for uniqueness
            machine_id += str(secrets.token_bytes(8))
            
            device_id = hashlib.sha256(machine_id.encode()).hexdigest()[:32]
            logger.info(f"Generated device ID: {device_id}")
            return device_id
            
        except Exception as e:
            logger.error(f"Failed to generate device ID: {e}")
            # Fallback to random ID
            return secrets.token_hex(16)
    
    def generate_api_key(self) -> str:
        """Generate a secure API key"""
        return f"ep_{secrets.token_urlsafe(32)}"
    
    def get_device_credentials(self) -> Optional[DeviceCredentials]:
        """Get all device credentials"""
        try:
            device_id = self.get_credential(DEVICE_ID_KEY)
            api_key = self.get_credential(API_KEY_KEY)
            enrollment_token = self.get_credential(ENROLLMENT_TOKEN_KEY)
            
            if not device_id or not api_key:
                return None
                
            return DeviceCredentials(
                device_id=device_id,
                api_key=api_key,
                enrollment_token=enrollment_token
            )
            
        except Exception as e:
            logger.error(f"Failed to get device credentials: {e}")
            return None
    
    def store_device_credentials(self, credentials: DeviceCredentials) -> bool:
        """Store all device credentials"""
        try:
            success = True
            
            if not self.store_credential(DEVICE_ID_KEY, credentials.device_id):
                success = False
                
            if not self.store_credential(API_KEY_KEY, credentials.api_key):
                success = False
                
            if credentials.enrollment_token:
                if not self.store_credential(ENROLLMENT_TOKEN_KEY, credentials.enrollment_token):
                    success = False
                    
            return success
            
        except Exception as e:
            logger.error(f"Failed to store device credentials: {e}")
            return False
    
    def clear_credentials(self) -> bool:
        """Clear all stored credentials"""
        try:
            success = True
            
            for key in [DEVICE_ID_KEY, API_KEY_KEY, ENROLLMENT_TOKEN_KEY]:
                if not self.delete_credential(key):
                    success = False
                    
            return success
            
        except Exception as e:
            logger.error(f"Failed to clear credentials: {e}")
            return False
    
    def is_enrolled(self) -> bool:
        """Check if device is enrolled"""
        device_id = self.get_credential(DEVICE_ID_KEY)
        api_key = self.get_credential(API_KEY_KEY)
        
        return bool(device_id and api_key)
    
    def clear_enrollment_token(self) -> bool:
        """Clear the enrollment token after successful enrollment"""
        return self.delete_credential(ENROLLMENT_TOKEN_KEY)
