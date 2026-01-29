"""
Helper utilities for EdgePulse
"""

import hashlib
import json
from datetime import datetime
from typing import Any, Dict, Optional


def generate_hash(data: Dict[str, Any]) -> str:
    """Generate SHA-256 hash of dictionary data"""
    serialized = json.dumps(data, sort_keys=True, default=str)
    return hashlib.sha256(serialized.encode()).hexdigest()


def format_timestamp(timestamp: Optional[datetime] = None) -> str:
    """Format timestamp to ISO format"""
    if timestamp is None:
        timestamp = datetime.utcnow()
    return timestamp.isoformat()


def safe_get(data: Dict[str, Any], key: str, default: Any = None) -> Any:
    """Safely get value from nested dictionary"""
    keys = key.split('.')
    current = data
    
    for k in keys:
        if isinstance(current, dict) and k in current:
            current = current[k]
        else:
            return default
            
    return current


def truncate_string(text: str, max_length: int = 100) -> str:
    """Truncate string to maximum length"""
    if len(text) <= max_length:
        return text
    return text[:max_length-3] + "..."
