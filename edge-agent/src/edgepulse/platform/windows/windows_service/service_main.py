import logging
import sys
from pathlib import Path

import win32serviceutil

from edgepulse.utils.log_handler import get_logger

logger = get_logger(__name__)


def setup_service_logging() -> None:
    log_dir = Path(r"C:\ProgramData\EdgePulse\logs")
    handlers: list[logging.Handler] = [logging.StreamHandler(sys.stdout)]

    try:
        log_dir.mkdir(parents=True, exist_ok=True)
        log_file = log_dir / "service.log"
        file_handler = logging.FileHandler(log_file, mode="a")
        file_handler.setFormatter(
            logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s")
        )
        handlers.append(file_handler)
    except Exception as exc:
        print(f"Warning: Could not open log file: {exc}", file=sys.stderr)

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
        handlers=handlers,
        force=True,
    )
    logger.info("windows_service_logging_configured")


def main() -> None:
    setup_service_logging()

    from edgepulse.platform.windows.windows_service.service import (
        EdgePulseWindowsService,
        set_agent_wrapper,
    )
    from edgepulse.platform.windows.windows_service.service_wrapper import (
        WindowsServiceWrapper,
    )

    wrapper = WindowsServiceWrapper()
    set_agent_wrapper(wrapper)
    win32serviceutil.HandleCommandLine(EdgePulseWindowsService)


if __name__ == "__main__":
    main()
