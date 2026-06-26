import importlib
import json
import os
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

_stdlib_platform = importlib.import_module("platform")

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


@dataclass
class CredentialLocation:
    """Resolved credential storage location, with the writable fallback chain."""

    primary: Path
    fallback: Optional[Path] = None


def _try_mkdir(path: Path) -> bool:
    """Create ``path`` if possible; return False on permission errors."""
    try:
        path.mkdir(parents=True, exist_ok=True)
        return True
    except OSError:
        return False


def _resolve_credential_dirs() -> CredentialLocation:
    """Pick a writable directory for the encrypted credential store.

    Order on Linux/system installs:
      1. ``$EDGE_PULSE_CREDENTIALS_DIR`` (explicit override, e.g. from systemd).
      2. ``$XDG_CONFIG_HOME/edgepulse`` (defaults to ``~/.config/edgepulse``).
      3. ``/var/lib/edgepulse/.credentials`` (always writable under hardened
         systemd units — this is where we land on read-only ``$HOME``).
      4. ``$HOME/.edgepulse`` (last resort; works for plain user runs).
    """
    if _stdlib_platform.system() == "Windows":
        from edgepulse.platform._paths import _safe_program_data

        return CredentialLocation(primary=_safe_program_data())

    candidates: list[Path] = []
    override = os.environ.get("EDGE_PULSE_CREDENTIALS_DIR")
    if override:
        candidates.append(Path(override))
    xdg = os.environ.get("XDG_CONFIG_HOME")
    candidates.append(Path(xdg) / "edgepulse" if xdg else Path.home() / ".config" / "edgepulse")
    candidates.append(Path("/var/lib/edgepulse/.credentials"))
    candidates.append(Path.home() / ".edgepulse")

    writable: Optional[Path] = None
    fallback: Optional[Path] = None
    for cand in candidates:
        if _try_mkdir(cand):
            if writable is None:
                writable = cand
            elif fallback is None:
                fallback = cand

    if writable is None:
        # Nothing was writable — last-ditch, try /tmp so we still degrade
        # gracefully instead of crashing. Caller logs a warning.
        writable = Path("/tmp/edgepulse/.credentials")
        writable.mkdir(parents=True, exist_ok=True)

    return CredentialLocation(primary=writable, fallback=fallback)


class EncryptedFileStore(CredentialStore):
    """Encrypted JSON file fallback for platforms without a keyring."""

    def __init__(self, path: Path):
        self._path = path
        self._fallback: Optional[Path] = None
        self._key = self._get_or_create_key(path)

    @staticmethod
    def _safe_write(target: Path, data: bytes) -> bool:
        """Atomically write ``data`` to ``target``, falling back to the parent
        directory if ``target``'s parent is read-only."""
        try:
            tmp = target.with_suffix(".tmp")
            tmp.write_bytes(data)
            tmp.replace(target)
            if _stdlib_platform.system() != "Windows":
                try:
                    target.chmod(0o600)
                except OSError:
                    pass
            return True
        except OSError as exc:
            logger.warning("encrypted_file_write_failed", target=str(target), error=str(exc))
            return False

    @staticmethod
    def _get_or_create_key(path: Path) -> bytes:
        key_file = path.parent / ".machine_key"
        if key_file.exists():
            try:
                raw = key_file.read_bytes()
                return base64.urlsafe_b64encode(raw)
            except OSError:
                pass

        raw = os.urandom(32)
        if EncryptedFileStore._safe_write(key_file, raw):
            return base64.urlsafe_b64encode(raw)

        alt = path.parent.parent / ".machine_key"
        if EncryptedFileStore._safe_write(alt, raw):
            logger.warning("machine_key_written_to_fallback", path=str(alt))
            return base64.urlsafe_b64encode(raw)

        raise OSError(f"Cannot persist machine key: {key_file} and fallback {alt} are read-only")

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
        except Exception as e:
            logger.error("file_store_encrypt_failed", error=str(e))
            return False
        if EncryptedFileStore._safe_write(self._path, encrypted):
            return True
        # Try the fallback dir if the primary isn't writable.
        if self._fallback is None:
            locations = _resolve_credential_dirs()
            self._fallback = locations.fallback
            self._path = locations.primary
        if self._fallback is not None:
            alt = self._fallback / self._path.name
            if EncryptedFileStore._safe_write(alt, encrypted):
                logger.warning(
                    "credentials_saved_to_fallback",
                    primary=str(self._path),
                    fallback=str(alt),
                )
                self._path = alt
                return True
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
        location = _resolve_credential_dirs()
        path = location.primary / "credentials.enc"
        logger.info("Using encrypted file for credential storage: %s", path)
        if location.fallback and location.fallback != location.primary:
            logger.info("Encrypted credential fallback location: %s", location.fallback)
        store = EncryptedFileStore(path)
        store._fallback = location.fallback
        return store

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
