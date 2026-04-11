"""
Windows Service Wrapper for EdgePulse

This wrapper imports and runs the portable AgentCore.
All Windows-specific code is isolated here.
"""

import sys
import os
import asyncio
import json
from pathlib import Path
from typing import Optional

if sys.platform == "win32":
    import win32serviceutil
    import win32service
    import win32event
    import servicemanager
    from .service import EdgePulseWindowsService
    from .installer import ServiceInstaller
else:
    class EdgePulseWindowsService:  # type: ignore[no-redef]
        pass

    class ServiceInstaller:  # type: ignore[no-redef]
        pass

from edgepulse.utils.log_handler import get_logger
from edgepulse.agent_core import AgentCore, AgentConfig

logger = get_logger(__name__)


class WindowsServiceWrapper:
    """Windows Service wrapper that manages AgentCore"""

    def __init__(self):
        self.service_name = "EdgePulseAgent"
        self.service_display_name = "EdgePulse Monitoring Agent"
        self.service_description = (
            "EdgePulse anomaly detection and monitoring agent for edge devices"
        )

        self.agent_core: Optional[AgentCore] = None
        self.service_instance = None

        self.program_data_path = (
            Path(os.environ.get("ProgramData", "C:\\ProgramData")) / "EdgePulse"
        )
        self.models_path = self.program_data_path / "models"
        self.logs_path = self.program_data_path / "logs"

        self._create_directories()

    def _create_directories(self) -> None:
        """Create necessary directories"""
        try:
            self.program_data_path.mkdir(parents=True, exist_ok=True)
            self.models_path.mkdir(parents=True, exist_ok=True)
            self.logs_path.mkdir(parents=True, exist_ok=True)

            if sys.platform == "win32":
                import win32security
                import ntsecuritycon

                try:
                    dacl = win32security.ACL()
                    system_sid = win32security.ConvertStringSidToSid("S-1-5-18")
                    dacl.AddAccessAllowedAce(
                        win32security.ACL_REVISION,
                        ntsecuritycon.FILE_ALL_ACCESS,
                        system_sid,
                    )
                    win32security.SetNamedSecurityInfo(
                        str(self.program_data_path),
                        win32security.SE_FILE_OBJECT,
                        win32security.DACL_SECURITY_INFORMATION,
                        None,
                        None,
                        dacl,
                        None,
                    )
                except Exception as e:
                    logger.warning(f"Could not set Windows permissions: {e}")

            logger.info(f"Directories created: {self.program_data_path}")

        except Exception as e:
            logger.error(f"Error creating directories: {e}")

    def create_agent_config(self) -> AgentConfig:
        """Create agent configuration with Windows-specific settings"""
        config = AgentConfig()

        config.model_path = str(self.models_path / "isolation_forest.joblib")

        config_file = self.program_data_path / "agent_config.json"
        if config_file.exists():
            try:
                with open(config_file, "r") as f:
                    config_data = json.load(f)

                for key, value in config_data.items():
                    if hasattr(config, key):
                        setattr(config, key, value)

                logger.info(f"Loaded configuration from {config_file}")

            except Exception as e:
                logger.error(f"Error loading config file: {e}")

        return config

    async def run_agent(self) -> None:
        """Run the portable agent core"""
        try:
            logger.info("Starting EdgePulse Agent Core")

            config = self.create_agent_config()

            self.agent_core = AgentCore(config)

            await self.agent_core.run_forever()

        except Exception as e:
            logger.error(f"Error running agent core: {e}")
            raise
        finally:
            logger.info("EdgePulse Agent Core stopped")

    def install_service(self, python_exe: Optional[str] = None) -> bool:
        """Install the Windows Service"""
        if sys.platform != "win32":
            logger.error("Windows Service can only be installed on Windows")
            return False

        try:
            installer = ServiceInstaller()
            success = installer.install_service(python_exe)

            if success:
                self._create_service_config()
                logger.info("Windows Service installed successfully")

            return success

        except Exception as e:
            logger.error(f"Error installing Windows Service: {e}")
            return False

    def uninstall_service(self) -> bool:
        """Uninstall the Windows Service"""
        if sys.platform != "win32":
            logger.error("Windows Service can only be uninstalled on Windows")
            return False

        try:
            installer = ServiceInstaller()
            success = installer.uninstall_service()

            if success:
                logger.info("Windows Service uninstalled successfully")

            return success

        except Exception as e:
            logger.error(f"Error uninstalling Windows Service: {e}")
            return False

    def start_service(self) -> bool:
        """Start the Windows Service"""
        if sys.platform != "win32":
            logger.error("Windows Service can only be started on Windows")
            return False

        try:
            installer = ServiceInstaller()
            success = installer.start_service()

            if success:
                logger.info("Windows Service started successfully")

            return success

        except Exception as e:
            logger.error(f"Error starting Windows Service: {e}")
            return False

    def stop_service(self) -> bool:
        """Stop the Windows Service"""
        if sys.platform != "win32":
            logger.error("Windows Service can only be stopped on Windows")
            return False

        try:
            installer = ServiceInstaller()
            success = installer.stop_service()

            if success:
                logger.info("Windows Service stopped successfully")

            return success

        except Exception as e:
            logger.error(f"Error stopping Windows Service: {e}")
            return False

    def get_service_status(self) -> Optional[str]:
        """Get Windows Service status"""
        if sys.platform != "win32":
            return "Not supported on this platform"

        try:
            installer = ServiceInstaller()
            return installer.get_service_status()

        except Exception as e:
            logger.error(f"Error getting service status: {e}")
            return None

    def _create_service_config(self) -> None:
        """Create service configuration file"""
        try:
            config_file = self.program_data_path / "agent_config.json"

            default_config = {
                "collection_interval": 60,
                "detection_threshold": 0.5,
                "sync_enabled": True,
                "offline_queue_size": 10000,
                "logging_level": "INFO",
                "enable_process_monitoring": True,
                "enable_network_monitoring": True,
                "enable_filesystem_monitoring": True,
                "model_type": "isolation_forest",
            }

            if not config_file.exists():
                with open(config_file, "w") as f:
                    json.dump(default_config, f, indent=2)

                logger.info(f"Created default config: {config_file}")

        except Exception as e:
            logger.error(f"Error creating service config: {e}")

    def run_as_service(self) -> None:
        """Run as Windows Service"""
        if sys.platform != "win32":
            logger.error("Can only run as service on Windows")
            return

        try:
            self.service_instance = EdgePulseWindowsService(
                service_name=self.service_name,
                service_display_name=self.service_display_name,
                service_description=self.service_description,
                agent_wrapper=self,
            )

            win32serviceutil.HandleCommandLine(self.service_instance)

        except Exception as e:
            logger.error(f"Error running as service: {e}")
            raise

    def run_standalone(self) -> None:
        """Run as standalone process (for development/testing)"""
        try:
            logger.info("Running EdgePulse Agent in standalone mode")

            asyncio.run(self.run_agent())

        except KeyboardInterrupt:
            logger.info("Received interrupt signal, shutting down")
        except Exception as e:
            logger.error(f"Error in standalone mode: {e}")
            raise


def service_main() -> None:
    """Main entry point for Windows Service"""
    wrapper = WindowsServiceWrapper()
    wrapper.run_as_service()


def standalone_main() -> None:
    """Main entry point for standalone execution"""
    wrapper = WindowsServiceWrapper()
    wrapper.run_standalone()


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--service":
        service_main()
    else:
        standalone_main()