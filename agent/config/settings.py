"""
Settings Manager

Centralized configuration management.
"""

import logging
import os
import yaml
from typing import Any, Dict, List, Optional
from pathlib import Path

logger = logging.getLogger(__name__)


class SettingsManager:
    """
    Manages system configuration with validation and persistence.
    """

    def __init__(self, config_path: Optional[str] = None):
        """
        Initialize settings manager.
        
        Args:
            config_path: Path to config file (default: ~/.edgeguardian/config.yaml)
        """
        if config_path:
            self.config_path = config_path
        else:
            config_dir = Path.home() / ".edgeguardian"
            config_dir.mkdir(parents=True, exist_ok=True)
            self.config_path = str(config_dir / "config.yaml")
        
        self.config: Dict = {}
        self.load_config()

    def load_config(self, path: Optional[str] = None) -> Dict:
        """
        Load configuration from file.
        
        Args:
            path: Config file path (default: self.config_path)
            
        Returns:
            Configuration dictionary
        """
        load_path = path or self.config_path
        
        if not os.path.exists(load_path):
            logger.warning(f"Config file not found: {load_path}, using defaults")
            self.config = self._get_default_config()
            return self.config
        
        try:
            with open(load_path, 'r') as f:
                self.config = yaml.safe_load(f) or {}
            
            # Merge with defaults
            defaults = self._get_default_config()
            self.config = {**defaults, **self.config}
            
            # Validate
            is_valid, errors = self.validate_config(self.config)
            if not is_valid:
                logger.warning(f"Config validation errors: {errors}")
            
            logger.info(f"Loaded config from {load_path}")
            return self.config
        except Exception as e:
            logger.error(f"Error loading config: {e}")
            self.config = self._get_default_config()
            return self.config

    def save_config(self, config: Optional[Dict] = None, path: Optional[str] = None) -> None:
        """
        Save configuration to file.
        
        Args:
            config: Config dictionary (default: self.config)
            path: Config file path (default: self.config_path)
        """
        save_config = config or self.config
        save_path = path or self.config_path
        
        try:
            os.makedirs(os.path.dirname(save_path), exist_ok=True)
            
            with open(save_path, 'w') as f:
                yaml.dump(save_config, f, default_flow_style=False)
            
            self.config = save_config
            logger.info(f"Saved config to {save_path}")
        except Exception as e:
            logger.error(f"Error saving config: {e}")
            raise

    def get_setting(self, key: str, default: Any = None) -> Any:
        """
        Get a setting value.
        
        Args:
            key: Setting key (supports dot notation, e.g., "detection.threshold")
            default: Default value if not found
            
        Returns:
            Setting value
        """
        keys = key.split('.')
        value = self.config
        
        for k in keys:
            if isinstance(value, dict):
                value = value.get(k)
            else:
                return default
            
            if value is None:
                return default
        
        return value if value is not None else default

    def set_setting(self, key: str, value: Any) -> None:
        """
        Set a setting value.
        
        Args:
            key: Setting key (supports dot notation)
            value: Setting value
        """
        keys = key.split('.')
        config = self.config
        
        for k in keys[:-1]:
            if k not in config:
                config[k] = {}
            config = config[k]
        
        config[keys[-1]] = value
        self.save_config()

    def validate_config(self, config: Dict) -> tuple[bool, List[str]]:
        """
        Validate configuration.
        
        Args:
            config: Configuration dictionary
            
        Returns:
            Tuple of (is_valid, list_of_errors)
        """
        errors = []
        
        # Validate detection settings
        detection = config.get("detection", {})
        threshold = detection.get("threshold", 0.5)
        if not isinstance(threshold, (int, float)) or not 0 <= threshold <= 1:
            errors.append("detection.threshold must be between 0 and 1")
        
        # Validate collection settings
        collection = config.get("collection", {})
        interval = collection.get("interval", 5)
        if not isinstance(interval, int) or interval < 1:
            errors.append("collection.interval must be a positive integer")
        
        # Add more validations as needed
        
        return (len(errors) == 0, errors)

    def reset_to_defaults(self) -> None:
        """Reset configuration to defaults."""
        self.config = self._get_default_config()
        self.save_config()
        logger.info("Reset config to defaults")

    def _get_default_config(self) -> Dict:
        """Get default configuration."""
        return {
            "detection": {
                "threshold": 0.5,
                "isolation_forest": {
                    "n_estimators": 100,
                    "contamination": "auto",
                },
            },
            "collection": {
                "interval": 5,
                "window_1min": 60,
                "window_5min": 300,
                "window_15min": 900,
            },
            "privacy": {
                "data_retention_days": 30,
                "anonymization_level": "strict",
                "collect_command_lines": False,
            },
            "sync": {
                "enabled": False,
                "interval": 3600,
                "sync_only_alerts": True,
            },
            "alerting": {
                "correlation_window": 300,
                "rate_limit": 10,
                "rate_window": 3600,
                "min_severity": "medium",
            },
        }
