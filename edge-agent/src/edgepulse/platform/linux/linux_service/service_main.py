import logging
import sys
from pathlib import Path

from edgepulse.utils.log_handler import get_logger

logger = get_logger(__name__)


def setup_service_logging() -> None:
    log_dir = Path("/var/log/edgepulse")
    log_file = log_dir / "agent.log"

    handlers: list[logging.Handler] = [logging.StreamHandler(sys.stdout)]

    try:
        log_dir.mkdir(parents=True, exist_ok=True)
        file_handler = logging.FileHandler(log_file, mode="a")
        file_handler.setFormatter(
            logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s")
        )
        handlers.append(file_handler)
    except PermissionError:
        pass
    except Exception as exc:
        print(f"Warning: Could not open log file {log_file}: {exc}", file=sys.stderr)

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
        handlers=handlers,
        force=True,
    )
    logger.info("linux_service_logging_configured")


def main() -> None:
    setup_service_logging()

    service_mode = "--service-mode" in sys.argv

    try:
        from edgepulse.platform.linux.linux_service.service_wrapper import (
            LinuxServiceWrapper,
        )

        wrapper = LinuxServiceWrapper()

        if service_mode:
            logger.info("linux_service_main_starting_service_mode")
            wrapper.run_as_service()
        else:
            print("EdgePulse Linux Agent – Console Mode")
            print("Use --service-mode to run as a systemd service.")
            logger.info("linux_service_main_starting_standalone_mode")
            wrapper.run_standalone()

    except KeyboardInterrupt:
        logger.info("linux_service_main_keyboard_interrupt")
        print("\nInterrupted by user.")
    except Exception as exc:
        logger.error("linux_service_main_fatal_error", error=str(exc))
        print(f"Fatal error: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
