import logging
import structlog
from pathlib import Path
from typing import Any, Optional


class EdgePulseError(Exception):
    def __init__(self, message: str, details: Optional[dict] = None) -> None:
        super().__init__(message)
        self.message = message
        self.details = details or {}

    def __str__(self) -> str:
        if self.details:
            return f"{self.message} (Details: {self.details})"
        return self.message


class ConfigurationError(EdgePulseError):
    pass


class LoggingError(EdgePulseError):
    pass


def configure_logging(
    log_level: str = "INFO", log_file: Optional[Path] = None, device_id: Optional[str] = None
) -> None:
    valid_levels = ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]
    if log_level.upper() not in valid_levels:
        raise ConfigurationError(f"Invalid log level: {log_level}. Must be one of {valid_levels}")

    file_handler = None
    if log_file:
        try:
            log_file.parent.mkdir(parents=True, exist_ok=True)
            file_handler = logging.FileHandler(log_file, mode="a")
            file_handler.setFormatter(logging.Formatter("%(message)s"))
        except (OSError, IOError) as e:
            raise LoggingError(f"Failed to setup log file {log_file}: {e}") from e

    logging.basicConfig(
        format="%(message)s",
        level=getattr(logging, log_level.upper()),
        handlers=[file_handler] if file_handler else None,
        force=True,
    )

    processors: list[Any] = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
    ]

    if device_id:
        structlog.contextvars.bind_contextvars(device_id=device_id)

    if log_file:
        processors.append(structlog.processors.JSONRenderer())
    else:
        processors.append(structlog.dev.ConsoleRenderer())

    structlog.configure(
        processors=processors,
        wrapper_class=structlog.make_filtering_bound_logger(getattr(logging, log_level.upper())),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str) -> structlog.BoundLogger:
    return structlog.get_logger(name)
