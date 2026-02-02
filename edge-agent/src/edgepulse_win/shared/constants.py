# Default values and configuration constants


import os
from pathlib import Path
from typing import Final

# API Server Constants
DEFAULT_API_PORT: Final[int] = int(os.getenv("API_PORT", "8080"))
DEFAULT_API_HOST: Final[str] = os.getenv("API_HOST", "0.0.0.0")
DEFAULT_API_MODE: Final[str] = os.getenv("API_MODE", "auto")

# Resource thresholds for API mode selection
DEFAULT_MIN_MEMORY_MB: Final[int] = int(os.getenv("API_MIN_MEMORY_MB", "512"))
DEFAULT_MIN_CPU_CORES: Final[int] = int(os.getenv("API_MIN_CPU_CORES", "2"))

# Socket API
DEFAULT_SOCKET_PATH: Final[str] = os.getenv("API_SOCKET_PATH", "/tmp/edgepulse.sock")

# Database Constants
DEFAULT_DATABASE_NAME: Final[str] = os.getenv("DATABASE_NAME", "edgepulse.db")
DEFAULT_SYNC_DB_NAME: Final[str] = os.getenv("SYNC_DATABASE_NAME", "sync_queue.db")

# Data Collection Constants
DEFAULT_COLLECTION_INTERVAL: Final[int] = int(os.getenv("COLLECTION_INTERVAL", "60"))
DEFAULT_DATA_RETENTION_DAYS: Final[int] = int(os.getenv("DATA_RETENTION_DAYS", "30"))

# Window sizes for feature extraction (in minutes)
DEFAULT_WINDOW_1MIN: Final[int] = int(os.getenv("WINDOW_1MIN", "1"))
DEFAULT_WINDOW_5MIN: Final[int] = int(os.getenv("WINDOW_5MIN", "5"))
DEFAULT_WINDOW_15MIN: Final[int] = int(os.getenv("WINDOW_15MIN", "15"))

# Feature extraction
DEFAULT_FEATURE_DIMENSION: Final[int] = int(os.getenv("FEATURE_DIMENSION", "50"))
DEFAULT_HISTORY_RETENTION_HOURS: Final[int] = int(os.getenv("HISTORY_RETENTION_HOURS", "24"))

# Detection thresholds
DEFAULT_DETECTION_THRESHOLD: Final[float] = float(os.getenv("DETECTION_THRESHOLD", "0.5"))
DEFAULT_ANOMALY_SCORE_THRESHOLD: Final[float] = float(os.getenv("ANOMALY_SCORE_THRESHOLD", "0.5"))

# Alert settings
DEFAULT_ALERT_RATE_LIMIT: Final[int] = int(os.getenv("ALERT_RATE_LIMIT", "5"))
DEFAULT_ALERT_RATE_WINDOW: Final[int] = int(os.getenv("ALERT_RATE_WINDOW", "300"))  # 5 minutes
DEFAULT_ALERT_CORRELATION_WINDOW: Final[int] = int(os.getenv("ALERT_CORRELATION_WINDOW", "60"))  # 1 minute
DEFAULT_MIN_ALERT_SEVERITY: Final[str] = os.getenv("MIN_ALERT_SEVERITY", "medium")

# Sync settings
DEFAULT_SYNC_QUEUE_MAX_SIZE: Final[int] = int(os.getenv("SYNC_QUEUE_MAX_SIZE", "10000"))
DEFAULT_SYNC_BATCH_SIZE: Final[int] = int(os.getenv("SYNC_BATCH_SIZE", "50"))
DEFAULT_SYNC_RETRY_MAX_ATTEMPTS: Final[int] = int(os.getenv("SYNC_RETRY_MAX_ATTEMPTS", "5"))

# Health check intervals (in seconds)
DEFAULT_HEALTH_CHECK_INTERVAL: Final[int] = int(os.getenv("HEALTH_CHECK_INTERVAL", "30"))
DEFAULT_METRICS_COLLECTION_INTERVAL: Final[int] = int(os.getenv("METRICS_COLLECTION_INTERVAL", "60"))

# File paths
DEFAULT_DATA_DIR: Final[Path] = Path(os.getenv("DATA_DIR", "data"))
DEFAULT_MODELS_DIR: Final[Path] = Path(os.getenv("MODELS_DIR", "models"))
DEFAULT_LOGS_DIR: Final[Path] = Path(os.getenv("LOGS_DIR", "logs"))

# Privacy settings
DEFAULT_ANONYMIZATION_LEVEL: Final[str] = os.getenv("ANONYMIZATION_LEVEL", "medium")
DEFAULT_COLLECT_COMMAND_LINES: Final[bool] = os.getenv("COLLECT_COMMAND_LINES", "false").lower() == "true"

# Logging
DEFAULT_LOG_LEVEL: Final[str] = os.getenv("LOG_LEVEL", "INFO")

# API endpoints
API_ENDPOINTS = {
    "health": "/health",
    "metrics": "/metrics", 
    "status": "/status",
    "alerts": "/alerts",
    "detections": "/detections",
    "telemetry": "/telemetry"
}

# Server modes
API_MODES = {
    "AUTO": "auto",
    "FASTAPI": "fastapi", 
    "SOCKET": "socket",
    "MINIMAL": "minimal"
}

# Severity levels
SEVERITY_LEVELS = {
    "LOW": "low",
    "MEDIUM": "medium", 
    "HIGH": "high",
    "CRITICAL": "critical"
}

# Event types
EVENT_TYPES = {
    "SYSTEM": "system",
    "DETECTION": "detection",
    "ALERT": "alert",
    "SYNC": "sync",
    "METRICS": "metrics"
}

# Default timeouts (in seconds)
DEFAULT_HTTP_TIMEOUT: Final[int] = int(os.getenv("HTTP_TIMEOUT", "30"))
DEFAULT_SYNC_TIMEOUT: Final[int] = int(os.getenv("SYNC_TIMEOUT", "10"))
DEFAULT_API_TIMEOUT: Final[int] = int(os.getenv("API_TIMEOUT", "5"))

# Retry settings
DEFAULT_MAX_RETRIES: Final[int] = int(os.getenv("MAX_RETRIES", "3"))
DEFAULT_RETRY_DELAY: Final[float] = float(os.getenv("RETRY_DELAY", "1.0"))

# Performance settings
DEFAULT_MAX_CONCURRENT_COLLECTORS: Final[int] = int(os.getenv("MAX_CONCURRENT_COLLECTORS", "10"))
DEFAULT_MAX_CONCURRENT_DETECTORS: Final[int] = int(os.getenv("MAX_CONCURRENT_DETECTORS", "5"))
