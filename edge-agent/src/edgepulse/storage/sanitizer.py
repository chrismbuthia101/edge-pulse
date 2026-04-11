# Data sanitization helpers for logging.

from typing import Any, Dict

SENSITIVE_KEYS = ("password", "token", "secret", "api_key", "key", "auth", "credential")


def sanitize(data: Any) -> Any:
    """Recursively sanitize sensitive data by redacting values."""
    if isinstance(data, dict):
        sanitized: Dict[str, Any] = {}
        for key, value in data.items():
            key_lower = str(key).lower()
            if any(s in key_lower for s in SENSITIVE_KEYS):
                sanitized[key] = "***REDACTED***"
            else:
                sanitized[key] = sanitize(value)
        return sanitized

    if isinstance(data, list):
        return [sanitize(item) for item in data]

    return data
