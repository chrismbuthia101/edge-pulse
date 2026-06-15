import os
import json
import asyncio
import hashlib
import base64
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional
from dataclasses import dataclass, asdict
from datetime import datetime

try:
    from cryptography.fernet import Fernet
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
    import base64
    CRYPTO_AVAILABLE = True
except ImportError:
    CRYPTO_AVAILABLE = False

from edgepulse.utils.log_handler import get_logger
from edgepulse.auth.auth_client import AuthenticatedClient
from edgepulse.platform._paths import _safe_program_data

logger = get_logger(__name__)


@dataclass
class ConfigItem:
    key: str
    value: Any
    version: int
    updated_at: str
    updated_by: Optional[str] = None


class ConfigManager:

    def __init__(
        self,
        auth_client: Optional[AuthenticatedClient],
        poll_interval_minutes: int = 15,
    ):
        # auth_client may legitimately be None when sync is disabled
        self.auth_client = auth_client
        self.poll_interval = poll_interval_minutes * 60

        self._current_config: Dict[str, ConfigItem] = {}
        self._config_version = 0
        self._last_remote_update: Optional[datetime] = None

        self._cache_file: Optional[Path] = None
        self._encryption_key: Optional[bytes] = None

        self._polling_task: Optional[asyncio.Task] = None
        self._running = False

        self._change_callbacks: Dict[str, List[Callable[[Any, Any], None]]] = {}

        self._initialize_local_cache()

        logger.info(
            f"ConfigManager initialized with {poll_interval_minutes} minute polling interval"
        )

    def _initialize_local_cache(self) -> None:
        try:
            if os.name == "nt":
                cache_dir = _safe_program_data()
            else:
                cache_dir = Path.home() / ".edgepulse"

            # Ensure the path is within expected bounds
            cache_dir = cache_dir.resolve()
            if os.name == "nt" and not str(cache_dir).startswith(str(_safe_program_data())):
                raise ValueError("Invalid path: traversal detected")

            cache_dir.mkdir(parents=True, exist_ok=True)
            self._cache_file = cache_dir / "last_known_config.json.enc"

            self._encryption_key = self._generate_encryption_key()
            self._load_cached_config()

            logger.info(f"Local cache initialized: {self._cache_file}")

        except Exception as e:
            logger.error(f"Error initializing local cache: {e}")
            self._cache_file = None
            self._encryption_key = None

    def _generate_encryption_key(self) -> bytes:
        try:
            if not CRYPTO_AVAILABLE:
                # Generate a simple hash-based key when crypto is not available
                import hashlib
                import platform
                machine_data = f"{platform.node()}{platform.machine()}{platform.system()}"
                return hashlib.sha256(machine_data.encode()).digest()[:32]

            import platform

            machine_data = f"{platform.node()}{platform.machine()}{platform.system()}"

            kdf = PBKDF2HMAC(
                algorithm=hashes.SHA256(),
                length=32,
                salt=b"edgepulse_config_salt",
                iterations=100_000,
            )
            key = base64.urlsafe_b64encode(kdf.derive(machine_data.encode()))
            return key

        except Exception as e:
            logger.error(f"Error generating encryption key: {e}")
            # Generate emergency key from timestamp and process ID
            import hashlib
            import time
            import os
            emergency_data = f"{time.time()}{os.getpid()}{platform.node()}"
            return hashlib.sha256(emergency_data.encode()).digest()[:32]

    def _encrypt_data(self, data: str) -> bytes:
        try:
            if not CRYPTO_AVAILABLE or not self._encryption_key:
                return data.encode()
            fernet = Fernet(self._encryption_key)
            return fernet.encrypt(data.encode())
        except Exception as e:
            logger.error(f"Error encrypting data: {e}")
            return data.encode()

    def _decrypt_data(self, encrypted_data: bytes) -> str:
        try:
            if not CRYPTO_AVAILABLE or not self._encryption_key:
                return encrypted_data.decode()
            fernet = Fernet(self._encryption_key)
            return fernet.decrypt(encrypted_data).decode()
        except Exception as e:
            logger.error(f"Error decrypting data: {e}")
            return encrypted_data.decode(errors="replace")

    def _load_cached_config(self) -> None:
        try:
            if not self._cache_file or not self._cache_file.exists():
                logger.info("No cached configuration found")
                return

            with open(self._cache_file, "rb") as f:
                encrypted_data = f.read()

            decrypted_json = self._decrypt_data(encrypted_data)
            cache_data = json.loads(decrypted_json)

            for key, item_data in cache_data.get("config_items", {}).items():
                self._current_config[key] = ConfigItem(**item_data)

            self._config_version = cache_data.get("version", 0)
            last_update_str = cache_data.get("last_remote_update")
            if last_update_str:
                self._last_remote_update = datetime.fromisoformat(last_update_str)

            logger.info(
                f"Loaded {len(self._current_config)} config items from cache"
            )

        except Exception as e:
            logger.error(f"Error loading cached config: {e}")

    def _save_cached_config(self) -> None:
        try:
            if not self._cache_file:
                return

            cache_data: Dict[str, Any] = {
                "version": self._config_version,
                "last_remote_update": (
                    self._last_remote_update.isoformat()
                    if self._last_remote_update
                    else None
                ),
                "config_items": {
                    key: asdict(item) for key, item in self._current_config.items()
                },
                "saved_at": datetime.utcnow().isoformat(),
            }

            cache_json = json.dumps(cache_data, sort_keys=True)
            cache_data["checksum"] = hashlib.sha256(cache_json.encode()).hexdigest()

            encrypted_data = self._encrypt_data(json.dumps(cache_data))

            with open(self._cache_file, "wb") as f:
                f.write(encrypted_data)

            logger.debug(
                f"Saved {len(self._current_config)} config items to cache"
            )

        except Exception as e:
            logger.error(f"Error saving cached config: {e}")

    async def start(self) -> None:
        if self._running:
            logger.warning("ConfigManager already running")
            return

        self._running = True
        self._polling_task = asyncio.create_task(self._polling_loop())
        logger.info("ConfigManager started")

    async def stop(self) -> None:
        self._running = False

        if self._polling_task:
            self._polling_task.cancel()
            try:
                await self._polling_task
            except asyncio.CancelledError:
                pass

        self._save_cached_config()
        logger.info("ConfigManager stopped")

    async def _polling_loop(self) -> None:
        logger.info("Configuration polling loop started")

        while self._running:
            try:
                await self._poll_remote_config()
                await asyncio.sleep(self.poll_interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in polling loop: {e}")
                await asyncio.sleep(60)

    async def _poll_remote_config(self) -> None:
        if not self.auth_client:
            logger.debug("No auth_client available, skipping remote poll")
            return

        try:
            remote_config = await self.auth_client.get_agent_config()

            if not remote_config:
                logger.debug("No remote configuration available")
                return

            updates = self._process_remote_config(remote_config)

            if updates:
                logger.info(f"Applied {len(updates)} configuration updates")
                self._save_cached_config()

        except Exception as e:
            logger.error(f"Error polling remote config: {e}")

    def _process_remote_config(self, remote_config: Dict[str, Any]) -> List[str]:
        updates: List[str] = []

        for key, value in remote_config.items():
            old_value = self.get(key)

            if old_value != value:
                self._set_config_item(key, value, "remote_poll")
                updates.append(key)

                if key in self._change_callbacks:
                    for callback in self._change_callbacks[key]:
                        try:
                            callback(old_value, value)
                        except Exception as e:
                            logger.error(
                                f"Error in config change callback for {key}: {e}"
                            )

        return updates

    def _set_config_item(
        self, key: str, value: Any, source: str = "local"
    ) -> None:
        self._config_version += 1

        config_item = ConfigItem(
            key=key,
            value=value,
            version=self._config_version,
            updated_at=datetime.utcnow().isoformat(),
            updated_by=source,
        )

        self._current_config[key] = config_item

        if source == "remote_poll":
            self._last_remote_update = datetime.utcnow()

    def get(self, key: str, default: Any = None) -> Any:
        config_item = self._current_config.get(key)
        return config_item.value if config_item else default

    def set(self, key: str, value: Any, source: str = "local") -> None:
        old_value = self.get(key)
        self._set_config_item(key, value, source)

        if key in self._change_callbacks and old_value != value:
            for callback in self._change_callbacks[key]:
                try:
                    callback(old_value, value)
                except Exception as e:
                    logger.error(
                        f"Error in config change callback for {key}: {e}"
                    )

        self._save_cached_config()

    def get_all(self) -> Dict[str, Any]:
        return {key: item.value for key, item in self._current_config.items()}

    def add_change_callback(
        self, key: str, callback: Callable[[Any, Any], None]
    ) -> None:
        if key not in self._change_callbacks:
            self._change_callbacks[key] = []
        self._change_callbacks[key].append(callback)

    def remove_change_callback(
        self, key: str, callback: Callable[[Any, Any], None]
    ) -> None:
        if key in self._change_callbacks:
            try:
                self._change_callbacks[key].remove(callback)
            except ValueError:
                pass

    def get_config_info(self) -> Dict[str, Any]:
        return {
            "version": self._config_version,
            "item_count": len(self._current_config),
            "last_remote_update": (
                self._last_remote_update.isoformat()
                if self._last_remote_update
                else None
            ),
            "poll_interval_minutes": self.poll_interval / 60,
            "cache_file": str(self._cache_file) if self._cache_file else None,
            "running": self._running,
        }

    async def force_refresh(self) -> bool:
        if not self.auth_client:
            logger.warning("No auth_client; cannot force refresh")
            return False

        try:
            logger.info("Forcing configuration refresh")
            remote_config = await self.auth_client.get_agent_config()

            if remote_config:
                updates = self._process_remote_config(remote_config)
                self._save_cached_config()
                logger.info(f"Force refresh applied {len(updates)} updates")
                return True
            else:
                logger.warning("No remote configuration available during force refresh")
                return False

        except Exception as e:
            logger.error(f"Error during force refresh: {e}")
            return False

    def validate_config(self) -> Dict[str, Any]:
        validation_results: Dict[str, Any] = {
            "valid": True,
            "errors": [],
            "warnings": [],
        }

        try:
            required_items = [
                "collection.interval",
                "detection.threshold",
                "sync.supabase_url",
                "sync.supabase_key",
            ]

            for item in required_items:
                if item not in self._current_config:
                    validation_results["errors"].append(
                        f"Missing required config: {item}"
                    )
                    validation_results["valid"] = False

            if "collection.interval" in self._current_config:
                interval = self.get("collection.interval")
                if not isinstance(interval, (int, float)) or interval < 1:
                    validation_results["errors"].append(
                        "collection.interval must be >= 1"
                    )
                    validation_results["valid"] = False

            if "detection.threshold" in self._current_config:
                threshold = self.get("detection.threshold")
                if not isinstance(threshold, (int, float)) or not 0 <= threshold <= 1:
                    validation_results["errors"].append(
                        "detection.threshold must be between 0 and 1"
                    )
                    validation_results["valid"] = False

            deprecated_items = ["legacy_mode", "old_api_endpoint"]
            for item in deprecated_items:
                if item in self._current_config:
                    validation_results["warnings"].append(
                        f"Deprecated config item: {item}"
                    )

        except Exception as e:
            validation_results["valid"] = False
            validation_results["errors"].append(f"Validation error: {e}")

        return validation_results

