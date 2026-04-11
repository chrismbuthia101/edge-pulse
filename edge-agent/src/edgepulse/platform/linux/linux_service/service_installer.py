"""
Detailed Linux Service Installer for EdgePulse

A more complete installer that supports user-mode systemd units (--user flag),
pre-flight dependency checks, and polkit / sudoers integration hints.
"""

import os
import shutil
import subprocess
import sys
import textwrap
import time
from pathlib import Path
from typing import Any, Dict, Optional

from edgepulse.utils.log_handler import get_logger

logger = get_logger(__name__)

SERVICE_NAME = "edgepulse-agent"
SERVICE_DISPLAY_NAME = "EdgePulse Security Agent"
SERVICE_DESCRIPTION = (
    "EdgePulse AI-powered security monitoring and anomaly detection agent "
    "for Linux edge devices."
)

_BASE_DIR = Path("/var/lib/edgepulse")
_CONFIG_DIR = Path("/etc/edgepulse")
_LOG_DIR = Path("/var/log/edgepulse")
_RUN_DIR = Path("/run/edgepulse")
_SYSTEMD_SYSTEM_DIR = Path("/etc/systemd/system")
_SYSTEMD_USER_DIR_TEMPLATE = "~/.config/systemd/user"

def _systemd_unit_path(user_mode: bool = False) -> Path:
    if user_mode:
        return Path(_SYSTEMD_USER_DIR_TEMPLATE).expanduser() / f"{SERVICE_NAME}.service"
    return _SYSTEMD_SYSTEM_DIR / f"{SERVICE_NAME}.service"


def _run(cmd: list, check: bool = True, capture: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, check=check, text=True, capture_output=capture)


def _systemctl(*args: str, user_mode: bool = False, check: bool = True) -> subprocess.CompletedProcess:
    base = ["systemctl"]
    if user_mode:
        base.append("--user")
    return _run(base + list(args), check=check)

class EdgePulseLinuxInstaller:

    def __init__(self, agent_path: Optional[str] = None, user_mode: bool = False) -> None:
        self.agent_path = (
            Path(agent_path).resolve()
            if agent_path
            else Path(__file__).resolve().parents[5]
        )
        self.user_mode = user_mode
        self.python_executable = sys.executable

        self.service_dir = _BASE_DIR if not user_mode else (Path.home() / ".local/share/edgepulse")
        self.config_dir = _CONFIG_DIR if not user_mode else (Path.home() / ".config/edgepulse")
        self.log_dir = _LOG_DIR if not user_mode else (Path.home() / ".local/share/edgepulse/logs")

        logger.info(
            "linux_installer_initialized",
            agent_path=str(self.agent_path),
            user_mode=user_mode,
        )

    def verify_prerequisites(self) -> bool:
        """Verify everything needed for installation is present."""
        ok = True

        if not sys.platform.startswith("linux"):
            logger.error("linux_installer_not_linux")
            print("Error: Linux service management is only supported on Linux.")
            return False

        if not self.user_mode and os.geteuid() != 0:
            logger.error("linux_installer_not_root")
            print("Error: System-wide service installation requires root (sudo).")
            ok = False

        if not shutil.which("systemctl"):
            logger.error("linux_installer_systemctl_missing")
            print("Error: systemctl not found. Is systemd available on this system?")
            ok = False

        if not Path(self.python_executable).exists():
            logger.error("linux_installer_python_missing", exe=self.python_executable)
            print(f"Error: Python executable not found: {self.python_executable}")
            ok = False

        service_main = self.agent_path / "src" / "edgepulse" / "platform" / "linux" / "linux_service" / "service_main.py"
        if not service_main.exists():
            logger.warning("linux_installer_service_main_missing", path=str(service_main))

        if ok:
            logger.info("linux_installer_prerequisites_ok")
        return ok

    def _build_unit_content(self) -> str:
        service_main = (
            self.agent_path
            / "src"
            / "edgepulse"
            / "platform"
            / "linux"
            / "linux_service"
            / "service_main.py"
        )
        exe = self.python_executable
        work_dir = self.service_dir

        hardening = (
            ""
            if self.user_mode
            else textwrap.dedent(
                f"""\
                # Security hardening (system mode only)
                NoNewPrivileges=true
                ProtectSystem=strict
                ProtectHome=read-only
                ReadWritePaths={self.service_dir} {self.log_dir} {_RUN_DIR} {self.config_dir}
                PrivateTmp=true
                """
            )
        )

        return textwrap.dedent(
            f"""\
            [Unit]
            Description={SERVICE_DESCRIPTION}
            Documentation=https://docs.edgepulse.io
            After=network-online.target
            Wants=network-online.target
            StartLimitIntervalSec=60
            StartLimitBurst=3

            [Service]
            Type=simple
            ExecStart={exe} {service_main} --service-mode
            WorkingDirectory={work_dir}
            Restart=on-failure
            RestartSec=10
            StandardOutput=journal
            StandardError=journal
            SyslogIdentifier=edgepulse-agent
            {hardening}
            LimitNOFILE=65535
            TimeoutStopSec=30

            [Install]
            WantedBy={'default.target' if self.user_mode else 'multi-user.target'}
            """
        )

    def install_service(self) -> bool:
        if not self.verify_prerequisites():
            return False

        unit_path = _systemd_unit_path(self.user_mode)

        try:
            unit_path.parent.mkdir(parents=True, exist_ok=True)
            unit_path.write_text(self._build_unit_content())
            unit_path.chmod(0o644)
            logger.info("linux_unit_file_written", path=str(unit_path))

            _systemctl("daemon-reload", user_mode=self.user_mode)
            _systemctl("enable", SERVICE_NAME, user_mode=self.user_mode)

            self._create_directories()
            self._write_default_config()

            print(f"Service '{SERVICE_NAME}' installed and enabled.")
            print(f"Unit file: {unit_path}")
            print(f"Data directory: {self.service_dir}")
            if self.user_mode:
                print(f"Run:  systemctl --user start {SERVICE_NAME}")
            else:
                print(f"Run:  sudo systemctl start {SERVICE_NAME}")
            return True

        except subprocess.CalledProcessError as exc:
            logger.error("linux_install_systemctl_error", stderr=exc.stderr)
            print(f"systemctl error: {exc.stderr or exc}")
            return False
        except Exception as exc:
            logger.error("linux_install_failed", error=str(exc))
            print(f"Installation failed: {exc}")
            return False

    def uninstall_service(self) -> bool:
        try:
            _systemctl("stop", SERVICE_NAME, user_mode=self.user_mode, check=False)
            _systemctl("disable", SERVICE_NAME, user_mode=self.user_mode, check=False)

            unit_path = _systemd_unit_path(self.user_mode)
            if unit_path.exists():
                unit_path.unlink()
                logger.info("linux_unit_file_removed", path=str(unit_path))

            _systemctl("daemon-reload", user_mode=self.user_mode, check=False)
            print(f"Service '{SERVICE_NAME}' uninstalled.")
            return True
        except Exception as exc:
            logger.error("linux_uninstall_failed", error=str(exc))
            print(f"Uninstallation failed: {exc}")
            return False

    def start_service(self) -> bool:
        try:
            _systemctl("start", SERVICE_NAME, user_mode=self.user_mode)
            # Poll for up to 10 seconds
            for _ in range(10):
                status = self.get_service_status()
                if status and status.get("status") == "RUNNING":
                    logger.info("linux_service_confirmed_running")
                    print(f"Service '{SERVICE_NAME}' started.")
                    return True
                time.sleep(1)
            logger.error("linux_service_start_timeout")
            print("Service did not reach RUNNING state within 10 seconds.")
            return False
        except subprocess.CalledProcessError as exc:
            print(f"Failed to start: {exc.stderr or exc}")
            return False
        except Exception as exc:
            logger.error("linux_start_failed", error=str(exc))
            return False

    def stop_service(self) -> bool:
        try:
            _systemctl("stop", SERVICE_NAME, user_mode=self.user_mode)
            for _ in range(10):
                status = self.get_service_status()
                if status and status.get("status") == "STOPPED":
                    print(f"Service '{SERVICE_NAME}' stopped.")
                    return True
                time.sleep(1)
            print("Service did not reach STOPPED state within 10 seconds.")
            return False
        except subprocess.CalledProcessError as exc:
            print(f"Failed to stop: {exc.stderr or exc}")
            return False
        except Exception as exc:
            logger.error("linux_stop_failed", error=str(exc))
            return False

    def restart_service(self) -> bool:
        if not self.stop_service():
            return False
        time.sleep(1)
        return self.start_service()

    def get_service_status(self) -> Dict[str, Any]:
        try:
            result = _systemctl(
                "is-active", SERVICE_NAME,
                user_mode=self.user_mode,
                check=False,
            )
            raw = (result.stdout or "").strip().upper()
            mapping = {
                "ACTIVE": "RUNNING",
                "INACTIVE": "STOPPED",
                "FAILED": "FAILED",
                "ACTIVATING": "STARTING",
                "DEACTIVATING": "STOPPING",
            }
            status = mapping.get(raw, raw or "UNKNOWN")
            unit_path = _systemd_unit_path(self.user_mode)
            return {
                "service_name": SERVICE_NAME,
                "status": status,
                "is_installed": unit_path.exists(),
                "user_mode": self.user_mode,
                "unit_file": str(unit_path),
            }
        except Exception as exc:
            return {
                "service_name": SERVICE_NAME,
                "status": "NOT_INSTALLED",
                "is_installed": False,
                "user_mode": self.user_mode,
                "error": str(exc),
            }

    def _create_directories(self) -> bool:
        dirs = [self.service_dir, self.config_dir, self.log_dir]
        if not self.user_mode:
            dirs.append(_RUN_DIR)
        try:
            for d in dirs:
                d.mkdir(parents=True, exist_ok=True)
                d.chmod(0o750)
            logger.info("linux_directories_created")
            return True
        except Exception as exc:
            logger.error("linux_directories_creation_failed", error=str(exc))
            return False

    def _write_default_config(self) -> None:
        import json

        config_file = self.config_dir / "agent_config.json"
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
            "enable_filesystem_monitoring": False,
            "model_type": "isolation_forest",
        }
        try:
            config_file.write_text(json.dumps(default, indent=2))
            config_file.chmod(0o640)
        except Exception as exc:
            logger.warning("linux_default_config_write_failed", error=str(exc))

    def configure_service_directory(self) -> bool:
        return self._create_directories()


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(
        description="EdgePulse Linux Service Manager",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "action",
        choices=["install", "uninstall", "start", "stop", "restart", "status", "configure"],
        help="Service management action",
    )
    parser.add_argument("--path", help="Agent installation path")
    parser.add_argument(
        "--user",
        action="store_true",
        help="Manage a user-mode systemd unit (no root needed)",
    )
    args = parser.parse_args()

    installer = EdgePulseLinuxInstaller(args.path, user_mode=args.user)

    action_map = {
        "install": installer.install_service,
        "uninstall": installer.uninstall_service,
        "start": installer.start_service,
        "stop": installer.stop_service,
        "restart": installer.restart_service,
        "configure": installer.configure_service_directory,
    }

    if args.action == "status":
        info = installer.get_service_status()
        print(f"Service: {info['service_name']}")
        print(f"Status:  {info['status']}")
        print(f"Installed: {info['is_installed']}")
        return

    fn = action_map.get(args.action)
    if fn:
        success = fn()
        if not success:
            sys.exit(1)
    else:
        print(f"Unknown action: {args.action}")
        sys.exit(1)


if __name__ == "__main__":
    main()