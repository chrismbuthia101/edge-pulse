import logging
import structlog
from pathlib import Path
from typing import Optional

from edgepulse_win.utils.error_handler import LoggingError, ConfigurationError

def configure_logging(
    log_level: str = "INFO", 
    log_file: Optional[Path] = None,
    device_id: Optional[str] = None
) -> None:
    """Configure structlog with processors for structured logging"""
    
    try:
        # Validate log level
        valid_levels = ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]
        if log_level.upper() not in valid_levels:
            raise ConfigurationError(f"Invalid log level: {log_level}. Must be one of {valid_levels}")
        
        # Configure file handler if log file is specified
        file_handler = None
        if log_file:
            try:
                # Ensure parent directory exists
                log_file.parent.mkdir(parents=True, exist_ok=True)
                file_handler = logging.FileHandler(log_file, mode='a')
                file_handler.setFormatter(logging.Formatter("%(message)s"))
            except (OSError, IOError) as e:
                raise LoggingError(f"Failed to setup log file {log_file}: {e}") from e
        
        # Configure standard logging for structlog
        logging.basicConfig(
            format="%(message)s",
            level=getattr(logging, log_level.upper()),
            handlers=[file_handler] if file_handler else None,
            force=True  # Override existing configuration
        )
        
        # Define processors for structlog
        processors = [
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
        ]
        
        # Add device_id to all logs if provided
        if device_id:
            structlog.contextvars.bind_contextvars(device_id=device_id)
        
        # Choose renderer based on whether we're writing to file or console
        if log_file:
            processors.append(structlog.processors.JSONRenderer())
        else:
            processors.append(structlog.dev.ConsoleRenderer())
        
        structlog.configure(
            processors=processors,
            wrapper_class=structlog.make_filtering_bound_logger(
                getattr(logging, log_level.upper())
            ),
            context_class=dict,
            logger_factory=structlog.PrintLoggerFactory(),
            cache_logger_on_first_use=True,
        )
        
    except Exception as e:
        if isinstance(e, (LoggingError, ConfigurationError)):
            raise
        raise LoggingError(f"Failed to configure logging: {e}") from e

def get_logger(name: str) -> structlog.BoundLogger:
    """Get a structured logger instance"""
    return structlog.get_logger(name)
