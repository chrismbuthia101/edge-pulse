# Shared history utilities for feature extraction.

from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any


def safe_parse_timestamp(
    item: Dict[str, Any], default: Optional[datetime] = None
) -> Optional[datetime]:
    try:
        timestamp_str = item.get("timestamp")
        if timestamp_str:
            if isinstance(timestamp_str, str) and timestamp_str.endswith("Z"):
                timestamp_str = timestamp_str[:-1] + "+00:00"
            return datetime.fromisoformat(timestamp_str)
    except (ValueError, TypeError):
        return default
    return default


def get_window_data(history: List[Dict[str, Any]], window_seconds: int) -> List[Dict[str, Any]]:
    if not history:
        return []

    cutoff_time = datetime.utcnow() - timedelta(seconds=window_seconds)
    result: List[Dict[str, Any]] = []
    for item in history:
        parsed_timestamp = safe_parse_timestamp(item)
        if parsed_timestamp is not None and parsed_timestamp >= cutoff_time:
            result.append(item)
    return result


def trim_history(history: List[Dict[str, Any]], retention_hours: int) -> List[Dict[str, Any]]:
    cutoff = datetime.utcnow() - timedelta(hours=retention_hours)
    result: List[Dict[str, Any]] = []
    for item in history:
        parsed_timestamp = safe_parse_timestamp(item)
        if parsed_timestamp is not None and parsed_timestamp >= cutoff:
            result.append(item)
    return result
