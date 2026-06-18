import shutil
import sys
import time
from pathlib import Path
from typing import Optional

import win32api
import win32con
import win32security
import win32service
import win32serviceutil

from edgepulse.utils.log_handler import get_logger
from edgepulse.platform._paths import _safe_program_data
from edgepulse.platform import ServiceManager

logger = get_logger(__name__)

SERVICE_NAME = "EdgePulseAgent"
SERVICE_DISPLAY_NAME = "EdgePulse Monitoring Agent"
SERVICE_DESCRIPTION = "EdgePulse anomaly detection and monitoring agent for edge devices"

_LOCAL_SYSTEM_SID = "S-1-5-18"


def _is_admin() -> bool:
    try:
        token = win32security.OpenProcessToken(
            win32api.GetCurrentProcess(),
            win32con.TOKEN_QUERY,
        )
        return bool(win32security.GetTokenInformation(token, win32security.TokenElevation))
    except Exception:
        return False


def _set_local_system_permissions(directory: Path) -> None:
    try:
        system_sid = win32security.ConvertStringSidToSid(_LOCAL_SYSTEM_SID)
        sd = win32security.GetFileSecurity(str(directory), win32security.DACL_SECURITY_INFORMATION)
        dacl = win32security.ACL()
        dacl.AddAccessAllowedAce(
            win32security.ACL_REVISION,
            win32con.GENERIC_ALL,
            system_sid,
        )
        sd.SetSecurityDescriptorDacl(1, dacl, 0)
        win32security.SetFileSecurity(str(directory), win32security.DACL_SECURITY_INFORMATION, sd)
    except Exception as e:
        logger.warning("permission_config_failed", path=str(directory), error=str(e))


class ServiceInstaller(ServiceManager):

    def __init__(self):
        self.service_dir = _safe_program_data()
        self.config_dir = self.service_dir / "config"
        self.log_dir = self.service_dir / "logs"
        self.data_dir = self.service_dir / "data"

    def verify_prerequisites(self) -> bool:
        if sys.platform != "win32":
            logger.error("windows_installer_not_windows")
            print("Error: Windows Service management requires Windows.")
            return False

        if not _is_admin():
            logger.error("windows_installer_not_admin")
            print("Error: Service installation requires Administrator privileges.")
            return False

        if not Path(sys.executable).exists():
            logger.error("windows_installer_python_missing", exe=sys.executable)
            print(f"Error: Python executable not found: {sys.executable}")
            return False

        logger.info("windows_installer_prerequisites_ok")
        return True

    def create_directories(self) -> bool:
        try:
            for directory in [self.service_dir, self.config_dir, self.log_dir, self.data_dir]:
                directory.mkdir(parents=True, exist_ok=True)
                _set_local_system_permissions(directory)
            logger.info("windows_directories_created")
            return True
        except Exception as e:
            logger.error("windows_directories_creation_failed", error=str(e))
            return False

    def install_service(self, python_exe: Optional[str] = None) -> bool:
        if not self.verify_prerequisites():
            return False

        try:
            python_exe = python_exe or sys.executable
            service_script = Path(__file__).parent / "service_main.py"
            service_cmd = f'"{python_exe}" "{service_script}"'

            win32serviceutil.InstallService(
                None,
                SERVICE_NAME,
                SERVICE_DISPLAY_NAME,
                description=SERVICE_DESCRIPTION,
                startType=win32service.SERVICE_AUTO_START,
                exeName=service_cmd,
            )

            self.create_directories()

            print(f"Service '{SERVICE_NAME}' installed successfully")
            print(f"Command: {service_cmd}")
            print(f"Data directory: {self.service_dir}")
            return True

        except Exception as e:
            print(f"Error installing service: {e}")
            logger.error("windows_install_failed", error=str(e))
            return False

    def uninstall_service(self) -> bool:
        if sys.platform != "win32":
            print("Error: Windows Service can only be uninstalled on Windows.")
            return False

        try:
            if self.is_service_running():
                self.stop_service()

            win32serviceutil.RemoveService(SERVICE_NAME)
            print(f"Service '{SERVICE_NAME}' uninstalled successfully")
            return True

        except Exception as e:
            print(f"Error uninstalling service: {e}")
            logger.error("windows_uninstall_failed", error=str(e))
            return False

    def start_service(self) -> bool:
        try:
            win32serviceutil.StartService(SERVICE_NAME)
            for _ in range(10):
                status = self.get_service_status()
                if status == "RUNNING":
                    logger.info("windows_service_confirmed_running")
                    print(f"Service '{SERVICE_NAME}' started.")
                    return True
                time.sleep(1)
            logger.error("windows_service_start_timeout")
            print("Service did not reach RUNNING state within 10 seconds.")
            return False
        except Exception as e:
            print(f"Failed to start service: {e}")
            logger.error("windows_start_failed", error=str(e))
            return False

    def stop_service(self) -> bool:
        try:
            win32serviceutil.StopService(SERVICE_NAME)
            for _ in range(10):
                status = self.get_service_status()
                if status == "STOPPED":
                    print(f"Service '{SERVICE_NAME}' stopped.")
                    return True
                time.sleep(1)
            print("Service did not reach STOPPED state within 10 seconds.")
            return False
        except Exception as e:
            print(f"Failed to stop service: {e}")
            logger.error("windows_stop_failed", error=str(e))
            return False

    def restart_service(self) -> bool:
        if not self.stop_service():
            return False
        time.sleep(1)
        return self.start_service()

    def get_service_status(self) -> Optional[str]:
        if sys.platform != "win32":
            return None
        try:
            status_info = win32serviceutil.QueryServiceStatus(SERVICE_NAME)
            status_code = status_info[1]
            status_map = {
                win32service.SERVICE_STOPPED: "STOPPED",
                win32service.SERVICE_START_PENDING: "START_PENDING",
                win32service.SERVICE_STOP_PENDING: "STOP_PENDING",
                win32service.SERVICE_RUNNING: "RUNNING",
                win32service.SERVICE_CONTINUE_PENDING: "CONTINUE_PENDING",
                win32service.SERVICE_PAUSE_PENDING: "PAUSE_PENDING",
                win32service.SERVICE_PAUSED: "PAUSED",
            }
            return status_map.get(status_code, "UNKNOWN")
        except Exception as e:
            logger.error("windows_status_error", error=str(e))
            return None

    def is_service_running(self) -> bool:
        return self.get_service_status() == "RUNNING"

    def get_service_logs(self, lines: int = 50) -> str:
        try:
            log_file = self.log_dir / "service.log"
            if not log_file.exists():
                return "No service log file found"
            with open(log_file, "r", encoding="utf-8") as f:
                all_lines = f.readlines()
            recent = all_lines[-lines:] if len(all_lines) > lines else all_lines
            return "".join(recent)
        except Exception as e:
            logger.error("windows_logs_error", error=str(e))
            return f"Error reading logs: {e}"

    def cleanup_service_data(self) -> bool:
        try:
            if self.service_dir.exists():
                for item in self.service_dir.iterdir():
                    if item.name != "logs" and item.is_dir():
                        shutil.rmtree(item)
                    elif item.is_file() and item.suffix not in [".log"]:
                        item.unlink()
                print("Service data cleaned up (logs preserved).")
                return True
        except Exception as e:
            print(f"Error cleaning service data: {e}")
            logger.error("windows_cleanup_failed", error=str(e))
        return False
