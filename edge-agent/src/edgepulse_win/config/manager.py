"""
Configuration Manager for EdgePulse

Manages agent configuration with remote polling, hot-apply,
and encrypted local caching
"""

import os
import json
import asyncio
import time
import hashlib
from pathlib import Path
from typing import Dict, Any, Optional, Callable
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

from edgepulse_win.utils.log_handler import get_logger
from edgepulse_win.auth.auth_client import AuthenticatedClient

logger = get_logger(__name__)


@dataclass
class ConfigItem:
    """Individual configuration item"""
    key: str
    value: Any
    version: int
    updated_at: str
    updated_by: Optional[str] = None


@dataclass
class ConfigSnapshot:
    """Snapshot of configuration at a point in time"""
    timestamp: str
    version: int
    config_items: Dict[str, ConfigItem]
    checksum: str


class ConfigManager:
    """Configuration manager with remote polling and hot-apply"""
    
    def __init__(self, auth_client: AuthenticatedClient, poll_interval_minutes: int = 15):
        self.auth_client = auth_client
        self.poll_interval = poll_interval_minutes * 60  # Convert to seconds
        
        # Configuration storage
        self._current_config: Dict[str, ConfigItem] = {}
        self._config_version = 0
        self._last_remote_update: Optional[datetime] = None
        
        # Local cache
        self._cache_file: Optional[Path] = None
        self._encryption_key: Optional[bytes] = None
        
        # Polling task
        self._polling_task: Optional[asyncio.Task] = None
        self._running = False
        
        # Change callbacks
        self._change_callbacks: Dict[str, List[Callable[[Any, Any], None]]] = {}
        
        # Initialize local cache
        self._initialize_local_cache()
        
        logger.info(f"ConfigManager initialized with {poll_interval_minutes} minute polling interval")
    
    def _initialize_local_cache(self) -> None:
        """Initialize encrypted local cache"""
        try:
            # Determine cache file location
            if os.name == 'nt':  # Windows
                cache_dir = Path(os.environ.get('ProgramData', 'C:\\ProgramData')) / 'EdgePulse'
            else:  # Unix/Linux
                cache_dir = Path.home() / '.edgepulse'
            
            cache_dir.mkdir(parents=True, exist_ok=True)
            self._cache_file = cache_dir / 'last_known_config.json.enc'
            
            # Generate encryption key
            self._encryption_key = self._generate_encryption_key()
            
            # Load cached config
            self._load_cached_config()
            
            logger.info(f"Local cache initialized: {self._cache_file}")
            
        except Exception as e:
            logger.error(f"Error initializing local cache: {e}")
            self._cache_file = None
            self._encryption_key = None
    
    def _generate_encryption_key(self) -> bytes:
        """Generate encryption key from machine-specific data"""
        try:
            if not CRYPTO_AVAILABLE:
                logger.warning("Cryptography not available, using unencrypted cache")
                return b"dummy_key"
            
            # Use machine-specific data for key derivation
            import platform
            machine_data = f"{platform.node()}{platform.machine()}{platform.system()}"
            
            # Add some entropy
            machine_data += str(time.time())
            
            # Derive key
            kdf = PBKDF2HMAC(
                algorithm=hashes.SHA256(),
                length=32,
                salt=b'edgepulse_config_salt',  # Fixed salt for consistency
                iterations=100000,
            )
            key = base64.urlsafe_b64encode(kdf.derive(machine_data.encode()))
            
            return key
            
        except Exception as e:
            logger.error(f"Error generating encryption key: {e}")
            return b"fallback_key"
    
    def _encrypt_data(self, data: str) -> bytes:
        """Encrypt configuration data"""
        try:
            if not CRYPTO_AVAILABLE or not self._encryption_key:
                return data.encode()
            
            fernet = Fernet(self._encryption_key)
            return fernet.encrypt(data.encode())
            
        except Exception as e:
            logger.error(f"Error encrypting data: {e}")
            return data.encode()
    
    def _decrypt_data(self, encrypted_data: bytes) -> str:
        """Decrypt configuration data"""
        try:
            if not CRYPTO_AVAILABLE or not self._encryption_key:
                return encrypted_data.decode()
            
            fernet = Fernet(self._encryption_key)
            return fernet.decrypt(encrypted_data).decode()
            
        except Exception as e:
            logger.error(f"Error decrypting data: {e}")
            return encrypted_data.decode()
    
    def _load_cached_config(self) -> None:
        """Load configuration from local cache"""
        try:
            if not self._cache_file or not self._cache_file.exists():
                logger.info("No cached configuration found")
                return
            
            with open(self._cache_file, 'rb') as f:
                encrypted_data = f.read()
            
            decrypted_json = self._decrypt_data(encrypted_data)
            cache_data = json.loads(decrypted_json)
            
            # Restore configuration
            for key, item_data in cache_data.get('config_items', {}).items():
                config_item = ConfigItem(**item_data)
                self._current_config[key] = config_item
            
            self._config_version = cache_data.get('version', 0)
            last_update_str = cache_data.get('last_remote_update')
            if last_update_str:
                self._last_remote_update = datetime.fromisoformat(last_update_str)
            
            logger.info(f"Loaded {len(self._current_config)} config items from cache")
            
        except Exception as e:
            logger.error(f"Error loading cached config: {e}")
    
    def _save_cached_config(self) -> None:
        """Save configuration to local cache"""
        try:
            if not self._cache_file:
                return
            
            cache_data = {
                'version': self._config_version,
                'last_remote_update': self._last_remote_update.isoformat() if self._last_remote_update else None,
                'config_items': {key: asdict(item) for key, item in self._current_config.items()},
                'saved_at': datetime.utcnow().isoformat()
            }
            
            # Calculate checksum
            cache_json = json.dumps(cache_data, sort_keys=True)
            cache_data['checksum'] = hashlib.sha256(cache_json.encode()).hexdigest()
            
            # Encrypt and save
            encrypted_data = self._encrypt_data(json.dumps(cache_data))
            
            with open(self._cache_file, 'wb') as f:
                f.write(encrypted_data)
            
            logger.debug(f"Saved {len(self._current_config)} config items to cache")
            
        except Exception as e:
            logger.error(f"Error saving cached config: {e}")
    
    async def start(self) -> None:
        """Start configuration polling"""
        if self._running:
            logger.warning("ConfigManager already running")
            return
        
        self._running = True
        self._polling_task = asyncio.create_task(self._polling_loop())
        logger.info("ConfigManager started")
    
    async def stop(self) -> None:
        """Stop configuration polling"""
        self._running = False
        
        if self._polling_task:
            self._polling_task.cancel()
            try:
                await self._polling_task
            except asyncio.CancelledError:
                pass
        
        # Save final state
        self._save_cached_config()
        
        logger.info("ConfigManager stopped")
    
    async def _polling_loop(self) -> None:
        """Main polling loop"""
        logger.info("Configuration polling loop started")
        
        while self._running:
            try:
                # Poll for configuration updates
                await self._poll_remote_config()
                
                # Wait for next poll
                await asyncio.sleep(self.poll_interval)
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in polling loop: {e}")
                await asyncio.sleep(60)  # Wait before retry
    
    async def _poll_remote_config(self) -> None:
        """Poll remote configuration for updates"""
        try:
            # Get remote configuration
            remote_config = await self.auth_client.get_agent_config()
            
            if not remote_config:
                logger.debug("No remote configuration available")
                return
            
            # Check for updates
            updates = self._process_remote_config(remote_config)
            
            if updates:
                logger.info(f"Applied {len(updates)} configuration updates")
                self._save_cached_config()
            
        except Exception as e:
            logger.error(f"Error polling remote config: {e}")
    
    def _process_remote_config(self, remote_config: Dict[str, Any]) -> List[str]:
        """Process remote configuration and apply updates"""
        updates = []
        
        for key, value in remote_config.items():
            old_value = self.get(key)
            
            if old_value != value:
                # Apply update
                self._set_config_item(key, value, "remote_poll")
                updates.append(key)
                
                # Trigger change callback
                if key in self._change_callbacks:
                    for callback in self._change_callbacks[key]:
                        try:
                            callback(old_value, value)
                        except Exception as e:
                            logger.error(f"Error in config change callback for {key}: {e}")
        
        return updates
    
    def _set_config_item(self, key: str, value: Any, source: str = "local") -> None:
        """Set a configuration item"""
        self._config_version += 1
        
        config_item = ConfigItem(
            key=key,
            value=value,
            version=self._config_version,
            updated_at=datetime.utcnow().isoformat(),
            updated_by=source
        )
        
        self._current_config[key] = config_item
        
        if source == "remote_poll":
            self._last_remote_update = datetime.utcnow()
    
    def get(self, key: str, default: Any = None) -> Any:
        """Get configuration value"""
        config_item = self._current_config.get(key)
        return config_item.value if config_item else default
    
    def set(self, key: str, value: Any, source: str = "local") -> None:
        """Set configuration value"""
        old_value = self.get(key)
        self._set_config_item(key, value, source)
        
        # Trigger change callback
        if key in self._change_callbacks and old_value != value:
            for callback in self._change_callbacks[key]:
                try:
                    callback(old_value, value)
                except Exception as e:
                    logger.error(f"Error in config change callback for {key}: {e}")
        
        # Save to cache
        self._save_cached_config()
    
    def get_all(self) -> Dict[str, Any]:
        """Get all configuration values"""
        return {key: item.value for key, item in self._current_config.items()}
    
    def add_change_callback(self, key: str, callback: Callable[[Any, Any], None]) -> None:
        """Add callback for configuration changes"""
        if key not in self._change_callbacks:
            self._change_callbacks[key] = []
        self._change_callbacks[key].append(callback)
    
    def remove_change_callback(self, key: str, callback: Callable[[Any, Any], None]) -> None:
        """Remove configuration change callback"""
        if key in self._change_callbacks:
            try:
                self._change_callbacks[key].remove(callback)
            except ValueError:
                pass
    
    def get_config_info(self) -> Dict[str, Any]:
        """Get configuration information"""
        return {
            "version": self._config_version,
            "item_count": len(self._current_config),
            "last_remote_update": self._last_remote_update.isoformat() if self._last_remote_update else None,
            "poll_interval_minutes": self.poll_interval / 60,
            "cache_file": str(self._cache_file) if self._cache_file else None,
            "running": self._running
        }
    
    async def force_refresh(self) -> bool:
        """Force immediate refresh from remote"""
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
        """Validate current configuration"""
        validation_results = {
            "valid": True,
            "errors": [],
            "warnings": []
        }
        
        try:
            # Check required configuration items
            required_items = [
                "collection.interval",
                "detection.threshold",
                "sync.enabled"
            ]
            
            for item in required_items:
                if item not in self._current_config:
                    validation_results["errors"].append(f"Missing required config: {item}")
                    validation_results["valid"] = False
            
            # Validate value ranges
            if "collection.interval" in self._current_config:
                interval = self.get("collection.interval")
                if not isinstance(interval, (int, float)) or interval < 1:
                    validation_results["errors"].append("collection.interval must be >= 1")
                    validation_results["valid"] = False
            
            if "detection.threshold" in self._current_config:
                threshold = self.get("detection.threshold")
                if not isinstance(threshold, (int, float)) or not 0 <= threshold <= 1:
                    validation_results["errors"].append("detection.threshold must be between 0 and 1")
                    validation_results["valid"] = False
            
            # Check for deprecated items
            deprecated_items = ["legacy_mode", "old_api_endpoint"]
            for item in deprecated_items:
                if item in self._current_config:
                    validation_results["warnings"].append(f"Deprecated config item: {item}")
            
        except Exception as e:
            validation_results["valid"] = False
            validation_results["errors"].append(f"Validation error: {e}")
        
        return validation_results
    
    def export_config(self, include_sensitive: bool = False) -> Dict[str, Any]:
        """Export configuration for backup"""
        try:
            exported = {
                "version": self._config_version,
                "exported_at": datetime.utcnow().isoformat(),
                "items": {}
            }
            
            sensitive_keys = {"api_key", "database_password", "secret_key"}
            
            for key, item in self._current_config.items():
                if not include_sensitive and key in sensitive_keys:
                    exported["items"][key] = {
                        "value": "***REDACTED***",
                        "version": item.version,
                        "updated_at": item.updated_at,
                        "updated_by": item.updated_by
                    }
                else:
                    exported["items"][key] = asdict(item)
            
            return exported
            
        except Exception as e:
            logger.error(f"Error exporting config: {e}")
            return {}
    
    def import_config(self, config_data: Dict[str, Any], overwrite: bool = False) -> bool:
        """Import configuration from backup"""
        try:
            imported_count = 0
            
            for key, item_data in config_data.get("items", {}).items():
                if not overwrite and key in self._current_config:
                    continue  # Skip existing items unless overwrite is True
                
                if isinstance(item_data, dict) and "value" in item_data:
                    self.set(key, item_data["value"], "import")
                    imported_count += 1
            
            logger.info(f"Imported {imported_count} configuration items")
            return True
            
        except Exception as e:
            logger.error(f"Error importing config: {e}")
            return False
    
    def reset_to_defaults(self) -> None:
        """Reset configuration to defaults"""
        try:
            default_config = {
                "collection.interval": 60,
                "detection.threshold": 0.5,
                "sync.enabled": True,
                "sync.offline_queue_size": 10000,
                "logging.level": "INFO",
                "telemetry.enable_process_monitoring": True,
                "telemetry.enable_network_monitoring": True,
                "telemetry.enable_filesystem_monitoring": True
            }
            
            self._current_config.clear()
            self._config_version = 0
            
            for key, value in default_config.items():
                self.set(key, value, "default")
            
            logger.info("Configuration reset to defaults")
            
        except Exception as e:
            logger.error(f"Error resetting to defaults: {e}")
    
    def get_config_history(self) -> List[Dict[str, Any]]:
        """Get configuration change history (simplified)"""
        try:
            history = []
            
            for key, item in sorted(self._current_config.items(), key=lambda x: x[1].updated_at):
                history.append({
                    "key": key,
                    "value": item.value,
                    "version": item.version,
                    "updated_at": item.updated_at,
                    "updated_by": item.updated_by
                })
            
            return history[-50:]  # Return last 50 changes
            
        except Exception as e:
            logger.error(f"Error getting config history: {e}")
            return []
