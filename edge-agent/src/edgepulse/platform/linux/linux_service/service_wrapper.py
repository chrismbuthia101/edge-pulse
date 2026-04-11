"""
Linux Service Wrapper for EdgePulse
====================================
Runs the canonical EdgePulseAgent (core/agent.py) under systemd.
"""

import asyncio
import json
import sys
from pathlib import Path
from typing import Optional

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


def _safe_base_dir() -> Path:
    return _BASE_DIR.resolve()


class LinuxServiceWrapper:
    """Thin systemd wrapper around EdgePulseAgent."""

    def __init__(self) -> None:
        self.service_name = SERVICE_NAME
        self.service_display_name = "EdgePulse Monitoring Agent"
        self.service_description = (
            "EdgePulse anomaly detection and monitoring agent for Linux edge devices."
        )

        # The running EdgePulseAgent instance — set in run_agent()
        self.agent = None

        self.program_data_path = _safe_base_dir()
        self.models_path = self.program_data_path / "models"
        self.logs_path = _LOG_DIR

        self._create_directories()

    def _create_directories(self) -> None:
        for d in [self.program_data_path, self.models_path, self.logs_path, _CONFIG_DIR]:
            try:
                d.mkdir(parents=True, exist_ok=True)
            except PermissionError:
                logger.debug("directory_skipped_no_permission", path=str(d))

    # ------------------------------------------------------------------
    # AgentSettings overrides loaded from /etc/edgepulse/agent_config.json
    # ------------------------------------------------------------------

    def _build_settings(self):
        """Return an AgentSettings instance, optionally patched from the
        JSON config file written by the installer."""
        from edgepulse.config.settings import AgentSettings

        config_file = _CONFIG_DIR / "agent_config.json"
        if not config_file.exists():
            return AgentSettings()

        try:
            overrides: dict = json.loads(config_file.read_text())
        except Exception as exc:
            logger.error("agent_config_parse_failed", error=str(exc))
            return AgentSettings()

        # Map flat config-file keys to the nested AgentSettings fields.
        env_patch: dict = {}
        key_map = {
            "collection_interval":            "COLLECTION__INTERVAL",
            "detection_threshold":            "DETECTION__THRESHOLD",
            "sync_enabled":                   "SYNC__ENABLED",
            "offline_queue_size":             "SYNC__OFFLINE_QUEUE_MAX",
            "logging_level":                  "LOG__LEVEL",
            "enable_process_monitoring":      "COLLECTION__ENABLE_PROCESS_MONITORING",
            "enable_network_monitoring":      "COLLECTION__ENABLE_NETWORK_MONITORING",
        }
        import os
        for cfg_key, env_key in key_map.items():
            if cfg_key in overrides:
                env_patch[env_key] = str(overrides[cfg_key])

        # Temporarily inject as environment variables so AgentSettings picks
        # them up via pydantic-settings' env_nested_delimiter.
        original = {}
        for k, v in env_patch.items():
            original[k] = os.environ.get(k)
            os.environ[k] = v

        try:
            settings = AgentSettings()
        finally:
            for k, orig_v in original.items():
                if orig_v is None:
                    os.environ.pop(k, None)
                else:
                    os.environ[k] = orig_v

        logger.info("agent_config_loaded", path=str(config_file))
        return settings

    # ------------------------------------------------------------------
    # Main coroutine
    # ------------------------------------------------------------------

    async def run_agent(self) -> None:
        """Create and run EdgePulseAgent — the same class used by the CLI."""
        from edgepulse.core.agent import EdgePulseAgent

        try:
            logger.info("linux_wrapper_starting_agent")
            settings = self._build_settings()
            self.agent = EdgePulseAgent(settings=settings)
            await self.agent.run_forever()
        except Exception as exc:
            logger.error("linux_wrapper_agent_error", error=str(exc))
            raise
        finally:
            self.agent = None
            logger.info("linux_wrapper_agent_stopped")

    # ------------------------------------------------------------------
    # Service lifecycle helpers (used by CLI / installer)
    # ------------------------------------------------------------------

    def install_service(self, python_exe: Optional[str] = None) -> bool:
        if not sys.platform.startswith("linux"):
            logger.error("install_service_linux_only")
            return False
        installer = ServiceInstaller()
        success = installer.install_service(python_exe)
        if success:
            self._write_default_config()
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
        """Entry point when launched by systemd."""
        service_instance = EdgePulseLinuxService(agent_wrapper=self)
        service_instance.run_sync()

    def run_standalone(self) -> None:
        """Entry point for foreground / development runs."""
        try:
            logger.info("linux_wrapper_standalone_mode")
            asyncio.run(self.run_agent())
        except KeyboardInterrupt:
            logger.info("linux_wrapper_standalone_interrupted")
        except Exception as exc:
            logger.error("linux_wrapper_standalone_error", error=str(exc))
            raise

    def _write_default_config(self) -> None:
        import json as _json

        config_file = _CONFIG_DIR / "agent_config.json"
        if config_file.exists():
            return

        default: dict = {
            "collection_interval": 60,
            "detection_threshold": 0.5,
            "sync_enabled": False,
            "offline_queue_size": 10000,
            "logging_level": "INFO",
            "enable_process_monitoring": True,
            "enable_network_monitoring": True,
        }
        try:
            config_file.write_text(_json.dumps(default, indent=2))
            config_file.chmod(0o640)
            logger.info("default_config_written", path=str(config_file))
        except Exception as exc:
            logger.warning("default_config_write_failed", error=str(exc))


# ── Entry points ──────────────────────────────────────────────────────────────

def service_main() -> None:
    wrapper = LinuxServiceWrapper()
    wrapper.run_as_service()


def standalone_main() -> None:
    wrapper = LinuxServiceWrapper()
    wrapper.run_standalone()


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--service":
        service_main()
    else:
        standalone_main()