# Shared history utilities for feature extraction.

from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any


def safe_parse_timestamp(item: Dict[str, Any], default: Optional[datetime] = None) -> Optional[datetime]:
    try:
        timestamp_str = item.get("timestamp")
        if timestamp_str:
            return datetime.fromisoformat(timestamp_str)
    except (ValueError, TypeError):
        return default
    return default


def get_window_data(history: List[Dict[str, Any]], window_seconds: int) -> List[Dict[str, Any]]:
    if not history:
        return []

    cutoff_time = datetime.utcnow() - timedelta(seconds=window_seconds)
    return [item for item in history if safe_parse_timestamp(item, datetime.min) >= cutoff_time]


def trim_history(history: List[Dict[str, Any]], retention_hours: int) -> List[Dict[str, Any]]:
    cutoff = datetime.utcnow() - timedelta(hours=retention_hours)
    return [item for item in history if safe_parse_timestamp(item, datetime.min) >= cutoff]
