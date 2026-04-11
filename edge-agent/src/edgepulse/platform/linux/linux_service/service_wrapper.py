"""
Linux Service Wrapper for EdgePulse

This wrapper imports and runs the portable AgentCore
"""

import asyncio
import json
import sys
from pathlib import Path
from typing import Optional

from edgepulse.agent_core import AgentCore, AgentConfig
from edgepulse.utils.log_handler import get_logger

if sys.platform.startswith("linux"):
    from edgepulse.platform.linux.linux_service.service import EdgePulseLinuxService
    from edgepulse.platform.linux.linux_service.installer import ServiceInstaller, SERVICE_NAME
else:
    class EdgePulseLinuxService:  # type: ignore[no-redef]
        pass

    class ServiceInstaller:  # type: ignore[no-redef]
        pass

    SERVICE_NAME = "edgepulse-agent"

logger = get_logger(__name__)

_BASE_DIR = Path("/var/lib/edgepulse")
_CONFIG_DIR = Path("/etc/edgepulse")
_LOG_DIR = Path("/var/log/edgepulse")


def _get_safe_base_dir() -> Path:
    return _BASE_DIR.resolve()

class LinuxServiceWrapper:

    def __init__(self) -> None:
        self.service_name = SERVICE_NAME
        self.service_display_name = "EdgePulse Monitoring Agent"
        self.service_description = (
            "EdgePulse anomaly detection and monitoring agent for Linux edge devices."
        )

        self.agent_core: Optional[AgentCore] = None
        self.service_instance: Optional[EdgePulseLinuxService] = None

        self.program_data_path = _get_safe_base_dir()
        self.models_path = self.program_data_path / "models"
        self.logs_path = _LOG_DIR

        self._create_directories()

    def _create_directories(self) -> None:
        for d in [self.program_data_path, self.models_path, self.logs_path, _CONFIG_DIR]:
            try:
                d.mkdir(parents=True, exist_ok=True)
            except PermissionError:
                logger.debug("directory_creation_skipped_no_permission", path=str(d))

    # ── Agent configuration ───────────────────────────────────────────────────

    def create_agent_config(self) -> AgentConfig:
        """
        Build an AgentConfig, optionally loading overrides from
        /etc/edgepulse/agent_config.json.
        """
        config = AgentConfig()
        config.model_path = str(self.models_path / "isolation_forest.joblib")

        config_file = _CONFIG_DIR / "agent_config.json"
        if config_file.exists():
            try:
                config_data: dict = json.loads(config_file.read_text())
                for key, value in config_data.items():
                    if hasattr(config, key):
                        setattr(config, key, value)
                logger.info("agent_config_loaded", path=str(config_file))
            except Exception as exc:
                logger.error("agent_config_load_failed", error=str(exc))

        return config

    async def run_agent(self) -> None:
        try:
            logger.info("linux_wrapper_starting_agent_core")
            config = self.create_agent_config()
            self.agent_core = AgentCore(config)
            await self.agent_core.run_forever()
        except Exception as exc:
            logger.error("linux_wrapper_agent_core_error", error=str(exc))
            raise
        finally:
            logger.info("linux_wrapper_agent_core_stopped")

    def install_service(self, python_exe: Optional[str] = None) -> bool:
        if not sys.platform.startswith("linux"):
            logger.error("install_service_linux_only")
            return False
        installer = ServiceInstaller()
        success = installer.install_service(python_exe)
        if success:
            installer._write_default_config()
        return success

    def uninstall_service(self) -> bool:
        if not sys.platform.startswith("linux"):
            return False
        return ServiceInstaller().uninstall_service()

    def start_service(self) -> bool:
        if not sys.platform.startswith("linux"):
            return False
        return ServiceInstaller().start_service()

    def stop_service(self) -> bool:
        if not sys.platform.startswith("linux"):
            return False
        return ServiceInstaller().stop_service()

    def get_service_status(self) -> Optional[str]:
        if not sys.platform.startswith("linux"):
            return "Not supported on this platform"
        return ServiceInstaller().get_service_status()

    def run_as_service(self) -> None:
        self.service_instance = EdgePulseLinuxService(agent_wrapper=self)
        self.service_instance.run_sync()

    def run_standalone(self) -> None:
        try:
            logger.info("linux_wrapper_standalone_mode")
            asyncio.run(self.run_agent())
        except KeyboardInterrupt:
            logger.info("linux_wrapper_standalone_interrupted")
        except Exception as exc:
            logger.error("linux_wrapper_standalone_error", error=str(exc))
            raise


def service_main() -> None:
    """Main entry point when running as a systemd service."""
    wrapper = LinuxServiceWrapper()
    wrapper.run_as_service()


def standalone_main() -> None:
    """Main entry point for foreground / development runs."""
    wrapper = LinuxServiceWrapper()
    wrapper.run_standalone()


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--service":
        service_main()
    else:
        standalone_main()