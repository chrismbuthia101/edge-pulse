import hashlib
import json
import os
import platform
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Optional

import base64
from cryptography.fernet import Fernet

from edgepulse.utils.log_handler import get_logger

try:
    import keyring
    import keyring.errors

    HAS_KEYRING = True
except ImportError:
    HAS_KEYRING = False

logger = get_logger(__name__)

DEVICE_ID_KEY = "device_id"
API_KEY_KEY = "api_key"
SUPABASE_URL_KEY = "supabase_url"


@dataclass
class DeviceCredentials:
    device_id: str
    api_key: str
    supabase_url: Optional[str] = None


class CredentialStore(ABC):
    """Abstract credential persistence backend."""

    @abstractmethod
    def get(self, key: str) -> Optional[str]: ...

    @abstractmethod
    def set(self, key: str, value: str) -> bool: ...

    @abstractmethod
    def delete(self, key: str) -> bool: ...


class KeyringStore(CredentialStore):
    """Uses the OS system keyring."""

    SERVICE_NAME = "EdgePulse"

    def get(self, key: str) -> Optional[str]:
        try:
            return keyring.get_password(self.SERVICE_NAME, key)
        except Exception as e:
            logger.error("keyring_get_failed", key=key, error=str(e))
            return None

    def set(self, key: str, value: str) -> bool:
        try:
            keyring.set_password(self.SERVICE_NAME, key, value)
            return True
        except Exception as e:
            logger.error("keyring_set_failed", key=key, error=str(e))
            return False

    def delete(self, key: str) -> bool:
        try:
            try:
                keyring.delete_password(self.SERVICE_NAME, key)
            except keyring.errors.PasswordDeleteError:
                pass
            return True
        except Exception as e:
            logger.error("keyring_delete_failed", key=key, error=str(e))
            return False


class EncryptedFileStore(CredentialStore):
    """Encrypted JSON file fallback for platforms without a keyring."""

    def __init__(self, path: Path):
        self._path = path
        self._key = self._derive_key()

    @staticmethod
    def _get_machine_seed() -> str:
        seed = platform.node() + platform.machine()
        if platform.system() == "Windows":
            try:
                import winreg

                with winreg.OpenKey(
                    winreg.HKEY_LOCAL_MACHINE,
                    r"SOFTWARE\Microsoft\Windows NT\CurrentVersion",
                ) as key:
                    seed += str(winreg.QueryValueEx(key, "ProductId")[0])
            except Exception:
                pass
        return seed

    def _derive_key(self) -> bytes:
        return base64.urlsafe_b64encode(hashlib.sha256(self._get_machine_seed().encode()).digest())

    def _encrypt(self, data: str) -> bytes:
        return Fernet(self._key).encrypt(data.encode())

    def _decrypt(self, data: bytes) -> str:
        return Fernet(self._key).decrypt(data).decode()

    def _load_all(self) -> Dict[str, str]:
        if not self._path.exists():
            return {}
        try:
            return json.loads(self._decrypt(self._path.read_bytes()))
        except Exception as e:
            logger.error("file_store_load_failed", path=str(self._path), error=str(e))
            return {}

    def _save_all(self, data: Dict[str, str]) -> bool:
        try:
            encrypted = self._encrypt(json.dumps(data))
            tmp = self._path.with_suffix(".tmp")
            tmp.write_bytes(encrypted)
            tmp.replace(self._path)
            if platform.system() != "Windows":
                self._path.chmod(0o600)
            return True
        except Exception as e:
            logger.error("file_store_save_failed", path=str(self._path), error=str(e))
            return False

    def get(self, key: str) -> Optional[str]:
        return self._load_all().get(key)

    def set(self, key: str, value: str) -> bool:
        data = self._load_all()
        data[key] = value
        return self._save_all(data)

    def delete(self, key: str) -> bool:
        data = self._load_all()
        data.pop(key, None)
        return self._save_all(data)


class CredentialManager:

    def __init__(self):
        self._store = self._detect_backend()

    @staticmethod
    def _detect_backend() -> CredentialStore:
        if HAS_KEYRING:
            try:
                keyring.get_password("_edgepulse_detect", "_")
                logger.info("Using system keyring for credential storage")
                return KeyringStore()
            except Exception:
                logger.info("System keyring unavailable, using encrypted file storage")
        return CredentialManager._create_file_store()

    @staticmethod
    def _create_file_store() -> EncryptedFileStore:
        if platform.system() == "Windows":
            from edgepulse.platform._paths import _safe_program_data

            data_dir = _safe_program_data()
        else:
            data_dir = Path.home() / ".edgepulse"
        data_dir = data_dir.resolve()
        data_dir.mkdir(parents=True, exist_ok=True)
        path = data_dir / "credentials.enc"
        logger.info("Using encrypted file for credential storage: %s", path)
        return EncryptedFileStore(path)

    def get_device_credentials(self) -> Optional[DeviceCredentials]:
        device_id = self._store.get(DEVICE_ID_KEY)
        api_key = self._store.get(API_KEY_KEY)
        if not device_id or not api_key:
            return None
        return DeviceCredentials(
            device_id=device_id,
            api_key=api_key,
            supabase_url=self._store.get(SUPABASE_URL_KEY),
        )

    def store_device_credentials(self, credentials: DeviceCredentials) -> bool:
        success = self._store.set(DEVICE_ID_KEY, credentials.device_id)
        success &= self._store.set(API_KEY_KEY, credentials.api_key)
        if credentials.supabase_url:
            success &= self._store.set(SUPABASE_URL_KEY, credentials.supabase_url)
        return success

    def is_enrolled(self) -> bool:
        return bool(self._store.get(DEVICE_ID_KEY) and self._store.get(API_KEY_KEY))


def load_credentials_into_env() -> bool:
    """Inject stored device credentials as environment variables for pydantic-settings.

    Sets SYNC__SUPABASE_URL, SYNC__API_KEY, and DEVICE_ID from the credential store.
    Returns True if device_id and api_key are both present (device is enrolled).
    """
    try:
        credentials = CredentialManager().get_device_credentials()
        if credentials:
            if credentials.supabase_url:
                os.environ["SYNC__SUPABASE_URL"] = credentials.supabase_url
            if credentials.api_key:
                os.environ["SYNC__API_KEY"] = credentials.api_key
            if credentials.device_id:
                os.environ["DEVICE_ID"] = credentials.device_id
            return bool(credentials.device_id and credentials.api_key)
    except Exception as exc:
        logger.warning("credentials_env_load_failed", error=str(exc))
    return False
