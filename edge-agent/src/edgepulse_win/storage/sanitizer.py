"""Data sanitization helpers for logging."""

from typing import Any

SENSITIVE_KEYS = ("password", "token", "secret", "api_key", "key", "auth", "credential")


def sanitize(data: Any) -> Any:
    if isinstance(data, dict):
        sanitized = {}
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
