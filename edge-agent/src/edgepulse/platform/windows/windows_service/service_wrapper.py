"""
Windows Service Wrapper for EdgePulse
=======================================
Runs the canonical EdgePulseAgent (core/agent.py) as a Windows Service.
"""

import sys
import os
import json
import asyncio
from pathlib import Path
from typing import Optional

from edgepulse.utils.log_handler import get_logger


def _safe_program_data() -> Path:
    """Return C:\\ProgramData resolved — prevents environment-variable traversal."""
    return Path("C:\\ProgramData").resolve()


if sys.platform == "win32":
    import win32serviceutil
    import win32service
    import win32event
    import servicemanager

    from edgepulse.platform.windows.windows_service.service import EdgePulseWindowsService
    from edgepulse.platform.windows.windows_service.installer import ServiceInstaller
else:
    class EdgePulseWindowsService:  # type: ignore[no-redef]
        pass

    class ServiceInstaller:  # type: ignore[no-redef]
        pass

logger = get_logger(__name__)


class WindowsServiceWrapper:
    """Thin SCM wrapper around EdgePulseAgent."""

    def __init__(self) -> None:
        self.service_name = "EdgePulseAgent"
        self.service_display_name = "EdgePulse Monitoring Agent"
        self.service_description = (
            "EdgePulse anomaly detection and monitoring agent for edge devices"
        )

        # The running EdgePulseAgent instance — set in run_agent()
        self.agent = None

        base = _safe_program_data()
        self.program_data_path = base / "EdgePulse"
        self.models_path = self.program_data_path / "models"
        self.logs_path = self.program_data_path / "logs"

        self._create_directories()

    def _create_directories(self) -> None:
        for d in [self.program_data_path, self.models_path, self.logs_path]:
            try:
                d.mkdir(parents=True, exist_ok=True)
            except Exception as exc:
                logger.warning("directory_creation_failed", path=str(d), error=str(exc))

    # ------------------------------------------------------------------
    # Settings
    # ------------------------------------------------------------------

    def _build_settings(self):
        """Return AgentSettings, optionally patched from agent_config.json."""
        from edgepulse.config.settings import AgentSettings

        config_file = self.program_data_path / "agent_config.json"
        if not config_file.exists():
            return AgentSettings()

        try:
            overrides: dict = json.loads(config_file.read_text())
        except Exception as exc:
            logger.error("agent_config_parse_failed", error=str(exc))
            return AgentSettings()

        key_map = {
            "collection_interval":       "COLLECTION__INTERVAL",
            "detection_threshold":       "DETECTION__THRESHOLD",
            "offline_queue_size":        "SYNC__OFFLINE_QUEUE_MAX",
            "logging_level":             "LOG__LEVEL",
            "enable_process_monitoring": "COLLECTION__ENABLE_PROCESS_MONITORING",
            "enable_network_monitoring": "COLLECTION__ENABLE_NETWORK_MONITORING",
        }

        original: dict = {}
        for cfg_key, env_key in key_map.items():
            if cfg_key in overrides:
                original[env_key] = os.environ.get(env_key)
                os.environ[env_key] = str(overrides[cfg_key])

        try:
            settings = AgentSettings()
        finally:
            for env_key, orig_v in original.items():
                if orig_v is None:
                    os.environ.pop(env_key, None)
                else:
                    os.environ[env_key] = orig_v

        logger.info("agent_config_loaded", path=str(config_file))
        return settings

    # ------------------------------------------------------------------
    # Main coroutine
    # ------------------------------------------------------------------

    async def run_agent(self) -> None:
        """Create and run EdgePulseAgent — the same class used by the CLI."""
        from edgepulse.core.agent import EdgePulseAgent

        try:
            logger.info("windows_wrapper_starting_agent")
            settings = self._build_settings()
            self.agent = EdgePulseAgent(settings=settings)
            await self.agent.run_forever()
        except Exception as exc:
            logger.error("windows_wrapper_agent_error", error=str(exc))
            raise
        finally:
            self.agent = None
            logger.info("windows_wrapper_agent_stopped")

    # ------------------------------------------------------------------
    # Service lifecycle helpers
    # ------------------------------------------------------------------

    def install_service(self, python_exe: Optional[str] = None) -> bool:
        if sys.platform != "win32":
            logger.error("install_service_windows_only")
            return False
        installer = ServiceInstaller()
        success = installer.install_service(python_exe)
        if success:
            self._write_default_config()
        return success

    def uninstall_service(self) -> bool:
        if sys.platform != "win32":
            return False
        return ServiceInstaller().uninstall_service()

    def start_service(self) -> bool:
        if sys.platform != "win32":
            return False
        return ServiceInstaller().start_service()

    def stop_service(self) -> bool:
        if sys.platform != "win32":
            return False
        return ServiceInstaller().stop_service()

    def get_service_status(self) -> Optional[str]:
        if sys.platform != "win32":
            return "Not supported on this platform"
        return ServiceInstaller().get_service_status()

    def run_as_service(self) -> None:
        """Entry point when launched by the Windows SCM."""
        if sys.platform != "win32":
            logger.error("run_as_service_windows_only")
            return

        service_instance = EdgePulseWindowsService(
            service_name=self.service_name,
            service_display_name=self.service_display_name,
            service_description=self.service_description,
            agent_wrapper=self,
        )
        win32serviceutil.HandleCommandLine(service_instance)

    def run_standalone(self) -> None:
        """Entry point for foreground / development runs on Windows."""
        try:
            logger.info("windows_wrapper_standalone_mode")
            asyncio.run(self.run_agent())
        except KeyboardInterrupt:
            logger.info("windows_wrapper_standalone_interrupted")
        except Exception as exc:
            logger.error("windows_wrapper_standalone_error", error=str(exc))
            raise

    def _write_default_config(self) -> None:
        config_file = self.program_data_path / "agent_config.json"
        if config_file.exists():
            return

        default: dict = {
            "collection_interval": 60,
            "detection_threshold": 0.5,
            "offline_queue_size": 10000,
            "logging_level": "INFO",
            "enable_process_monitoring": True,
            "enable_network_monitoring": True,
        }
        try:
            config_file.write_text(json.dumps(default, indent=2))
            logger.info("default_config_written", path=str(config_file))
        except Exception as exc:
            logger.warning("default_config_write_failed", error=str(exc))


# ── Entry points ──────────────────────────────────────────────────────────────

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