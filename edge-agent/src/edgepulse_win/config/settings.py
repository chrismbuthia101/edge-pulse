"""
Settings Manager

Centralized configuration management with Pydantic validation.
"""

import logging
import os
import yaml
from typing import Any, Dict, Optional
from pathlib import Path

from pydantic import ValidationError as PydanticValidationError
from pydantic_settings import BaseSettings, SettingsConfigDict

from edgepulse_win.exceptions import ConfigurationError
from edgepulse_win.models.config import AgentConfig
from edgepulse_win.utils import PathManager

logger = logging.getLogger(__name__)


class SettingsManager:
    """
    Manages system configuration with validation and persistence.
    
    Uses Pydantic models for type safety and validation.
    """

    def __init__(self, config_path: Optional[Path] = None, path_manager: Optional[PathManager] = None):
        """
        Initialize settings manager.
        
        Args:
            config_path: Path to config file (uses path_manager if None)
            path_manager: Path manager instance (creates new if None)
        """
        self.path_manager = path_manager or PathManager()
        
        if config_path:
            self.config_path = Path(config_path)
        else:
            self.config_path = self.path_manager.get_config_path()
        
        self.config: AgentConfig = AgentConfig()
        self.load_config()

    def load_config(self, path: Optional[Path] = None) -> AgentConfig:
        """
        Load configuration from file.
        
        Args:
            path: Config file path (default: self.config_path)
            
        Returns:
            AgentConfig instance
        """
        load_path = path or self.config_path
        
        if not load_path.exists():
            logger.warning(f"Config file not found: {load_path}, using defaults")
            self.config = AgentConfig()
            return self.config
        
        try:
            with open(load_path, 'r') as f:
                config_dict = yaml.safe_load(f) or {}
            
            # Validate with Pydantic
            try:
                self.config = AgentConfig(**config_dict)
            except PydanticValidationError as e:
                logger.warning(f"Config validation errors: {e}")
                # Use defaults for invalid fields
                self.config = AgentConfig()
                logger.info("Using default configuration due to validation errors")
            
            logger.info(f"Loaded config from {load_path}")
            return self.config
        except Exception as e:
            logger.error(f"Error loading config: {e}")
            self.config = AgentConfig()
            return self.config

    def save_config(self, config: Optional[AgentConfig] = None, path: Optional[Path] = None) -> None:
        """
        Save configuration to file.
        
        Args:
            config: AgentConfig instance (default: self.config)
            path: Config file path (default: self.config_path)
        """
        save_config = config or self.config
        save_path = path or self.config_path
        
        try:
            save_path.parent.mkdir(parents=True, exist_ok=True)
            
            # Convert Pydantic model to dict
            config_dict = save_config.model_dump()
            
            with open(save_path, 'w') as f:
                yaml.dump(config_dict, f, default_flow_style=False)
            
            self.config = save_config
            logger.info(f"Saved config to {save_path}")
        except Exception as e:
            logger.error(f"Error saving config: {e}")
            raise ConfigurationError(f"Failed to save config: {e}") from e

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
        value = self.config.model_dump()
        
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
        config_dict = self.config.model_dump()
        config = config_dict
        
        for k in keys[:-1]:
            if k not in config:
                config[k] = {}
            config = config[k]
        
        config[keys[-1]] = value
        
        # Rebuild config with validation
        try:
            self.config = AgentConfig(**config_dict)
            self.save_config()
        except PydanticValidationError as e:
            raise ConfigurationError(f"Invalid configuration value: {e}") from e

    def validate_config(self) -> tuple[bool, list[str]]:
        """
        Validate current configuration.
        
        Returns:
            Tuple of (is_valid, list_of_errors)
        """
        errors = []
        
        try:
            # Pydantic validates on model creation
            AgentConfig(**self.config.model_dump())
            return (True, [])
        except PydanticValidationError as e:
            for error in e.errors():
                errors.append(f"{'.'.join(str(loc) for loc in error['loc'])}: {error['msg']}")
            return (False, errors)

    def reset_to_defaults(self) -> None:
        """Reset configuration to defaults."""
        self.config = AgentConfig()
        self.save_config()
        logger.info("Reset config to defaults")

    def get_config(self) -> AgentConfig:
        """
        Get the current configuration.
        
        Returns:
            AgentConfig instance
        """
        return self.config
