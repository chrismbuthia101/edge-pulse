import asyncio
import json
import os
import sys
from typing import Optional

from edgepulse.auth.credentials import load_credentials_into_env
from edgepulse.utils.log_handler import get_logger
from edgepulse.platform._paths import _safe_program_data, write_default_config
import win32serviceutil
from edgepulse.platform.windows.windows_service.service import (
    EdgePulseWindowsService,
    set_agent_wrapper,
)
from edgepulse.platform.windows.windows_service.installer import ServiceInstaller

logger = get_logger(__name__)


class WindowsServiceWrapper:

    def __init__(self) -> None:
        os.environ["EDGE_PULSE_DATA_DIR"] = str(_safe_program_data())

        self.agent = None

        self.program_data_path = _safe_program_data()
        self.models_path = self.program_data_path / "models"
        self.logs_path = self.program_data_path / "logs"

        self._create_directories()

    def _create_directories(self) -> None:
        for d in [self.program_data_path, self.models_path, self.logs_path]:
            try:
                d.mkdir(parents=True, exist_ok=True)
            except Exception as exc:
                logger.warning("directory_creation_failed", path=str(d), error=str(exc))

    def _build_settings(self):
        from edgepulse.config.settings import AgentSettings

        enrolled = load_credentials_into_env()

        config_file = self.program_data_path / "agent_config.json"
        overrides: dict = {}
        if config_file.exists():
            try:
                overrides = json.loads(config_file.read_text())
            except Exception as exc:
                logger.error("agent_config_parse_failed", error=str(exc))

        key_map = {
            "collection_interval": "COLLECTION__INTERVAL",
            "detection_threshold": "DETECTION__THRESHOLD",
            "offline_queue_size": "SYNC__OFFLINE_QUEUE_MAX",
            "logging_level": "LOG__LEVEL",
            "enable_process_monitoring": "COLLECTION__ENABLE_PROCESS_MONITORING",
            "enable_network_monitoring": "COLLECTION__ENABLE_NETWORK_MONITORING",
        }

        for cfg_key, env_key in key_map.items():
            if cfg_key in overrides:
                os.environ[env_key] = str(overrides[cfg_key])

        settings = AgentSettings()

        if not enrolled:
            logger.warning(
                "device_not_enrolled",
                detail=(
                    "Running in local-only mode. Sync is disabled. "
                    "Run 'edge-agent enroll' to enroll this device."
                ),
            )

        if config_file.exists():
            logger.info("agent_config_loaded", path=str(config_file))

        return settings

    async def run_agent(self) -> None:
        from edgepulse.agent.agent import EdgePulseAgent

        try:
            logger.info("windows_wrapper_starting_agent")
            settings = self._build_settings()

            if not settings.should_enable_sync():
                logger.warning(
                    "sync_disabled",
                    reason="No valid credentials. Start agent in local-only mode.",
                )

            self.agent = EdgePulseAgent(settings=settings)
            await self.agent.run_forever()
        except Exception as exc:
            logger.error("windows_wrapper_agent_error", error=str(exc))
            raise
        finally:
            self.agent = None
            logger.info("windows_wrapper_agent_stopped")

    def install_service(self, python_exe: Optional[str] = None) -> bool:
        installer = ServiceInstaller()
        success = installer.install_service(python_exe)
        if success:
            write_default_config(self.program_data_path)
        return success

    def uninstall_service(self) -> bool:
        return ServiceInstaller().uninstall_service()

    def start_service(self) -> bool:
        return ServiceInstaller().start_service()

    def stop_service(self) -> bool:
        return ServiceInstaller().stop_service()

    def get_service_status(self) -> Optional[str]:
        return ServiceInstaller().get_service_status()

    def run_as_service(self) -> None:
        set_agent_wrapper(self)
        win32serviceutil.HandleCommandLine(EdgePulseWindowsService)

    def run_standalone(self) -> None:
        try:
            logger.info("windows_wrapper_standalone_mode")
            asyncio.run(self.run_agent())
        except KeyboardInterrupt:
            logger.info("windows_wrapper_standalone_interrupted")
        except Exception as exc:
            logger.error("windows_wrapper_standalone_error", error=str(exc))
            raise


def service_main() -> None:
    wrapper = WindowsServiceWrapper()
    wrapper.run_as_service()


def standalone_main() -> None:
    wrapper = WindowsServiceWrapper()
    wrapper.run_standalone()


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--service":
        service_main()
    else:
        standalone_main()
