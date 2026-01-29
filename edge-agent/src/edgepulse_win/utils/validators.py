"""
Validation utilities for EdgePulse
"""

import re
from typing import Any, Dict, List
from edgepulse_win.exceptions import ValidationError


def validate_device_id(device_id: str) -> bool:
    """Validate device ID format"""
    if not device_id or not isinstance(device_id, str):
        raise ValidationError("Device ID must be a non-empty string")
    
    if len(device_id) > 100:
        raise ValidationError("Device ID too long (max 100 characters)")
        
    if not re.match(r'^[a-zA-Z0-9_-]+$', device_id):
        raise ValidationError("Device ID can only contain alphanumeric characters, underscores, and hyphens")
        
    return True


def validate_config(config: Dict[str, Any]) -> bool:
    """Validate configuration dictionary"""
    required_fields = ['collection', 'detection', 'privacy']
    
    for field in required_fields:
        if field not in config:
            raise ValidationError(f"Missing required config field: {field}")
            
    return True


def validate_telemetry_data(data: Dict[str, Any]) -> bool:
    """Validate telemetry data structure"""
    if not isinstance(data, dict):
        raise ValidationError("Telemetry data must be a dictionary")
        
    if 'timestamp' not in data:
        raise ValidationError("Telemetry data missing timestamp")
        
    if 'device_id' not in data:
        raise ValidationError("Telemetry data missing device_id")
        
    return True
