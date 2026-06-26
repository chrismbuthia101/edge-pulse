import os
import shutil
import subprocess
import sys
import textwrap
import time
from pathlib import Path
from typing import Optional

from edgepulse.utils.log_handler import get_logger
from edgepulse.platform._paths import (
    _BASE_DIR,
    _CONFIG_DIR,
    _LOG_DIR,
    _RUN_DIR,
    _safe_base_dir,
    write_default_config,
)
from edgepulse.platform import ServiceManager

logger = get_logger(__name__)

SERVICE_NAME = "edgepulse-agent"
SERVICE_DISPLAY_NAME = "EdgePulse Monitoring Agent"
SERVICE_DESCRIPTION = (
    "EdgePulse AI-powered security monitoring and anomaly detection agent "
    "for Linux edge devices."
)

_SYSTEMD_SYSTEM_DIR = Path("/etc/systemd/system")
_SYSTEMD_USER_DIR_TEMPLATE = "~/.config/systemd/user"


def _systemd_unit_path(user_mode: bool = False) -> Path:
    if user_mode:
        return Path(_SYSTEMD_USER_DIR_TEMPLATE).expanduser() / f"{SERVICE_NAME}.service"
    return _SYSTEMD_SYSTEM_DIR / f"{SERVICE_NAME}.service"


def _run(
    cmd: "list[str]", check: bool = True, capture_output: bool = True
) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, check=check, text=True, capture_output=capture_output)


def _systemctl(
    *args: str, user_mode: bool = False, check: bool = True
) -> subprocess.CompletedProcess:
    base = ["systemctl"]
    if user_mode:
        base.append("--user")
    return _run(base + list(args), check=check)


def _is_root() -> bool:
    return os.geteuid() == 0


def _service_main_path() -> Path:
    return Path(__file__).with_name("service_main.py")


def _installed_launcher() -> Optional[Path]:
    launcher = Path("/opt/edgepulse/bin/edge-agent")
    return launcher if launcher.exists() else None


def _build_unit_file(python_exe: Optional[str] = None, user_mode: bool = False) -> str:
    installed = _installed_launcher()
    if installed is not None and python_exe is None:
        exe = str(installed)
        exec_args = "run --config /etc/edgepulse/agent_config.json"
    else:
        exe = python_exe or sys.executable
        main = _service_main_path()
        exec_args = f"{main} --service-mode"

    _data_dir = Path("/var/lib/edgepulse")
    hardening = (
        ""
        if user_mode
        else textwrap.dedent(
            """\
            # Security hardening (system mode only)
            NoNewPrivileges=true
            ProtectSystem=strict
            ProtectHome=read-only
            ReadWritePaths={} {} {} {} {}
            PrivateTmp=true
            """.format(
                _BASE_DIR, _LOG_DIR, _RUN_DIR, _CONFIG_DIR, _data_dir
            )
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
        Environment="EDGE_PULSE_DATA_DIR={_data_dir}"
        Environment="MPLCONFIGDIR={_data_dir}/.matplotlib"
        ExecStart={exe} {exec_args}
        WorkingDirectory={_BASE_DIR}
        Restart=on-failure
        RestartSec=10
        StandardOutput=journal
        StandardError=journal
        SyslogIdentifier=edgepulse-agent
        {hardening}
        LimitNOFILE=65535
        TimeoutStopSec=30

        [Install]
        WantedBy={'default.target' if user_mode else 'multi-user.target'}
        """
    )


class ServiceInstaller(ServiceManager):

    def __init__(self, user_mode: bool = False) -> None:
        self.user_mode = user_mode
        self.service_dir = (
            _safe_base_dir() if not user_mode else (Path.home() / ".local/share/edgepulse")
        )
        self.config_dir = _CONFIG_DIR if not user_mode else (Path.home() / ".config/edgepulse")
        self.log_dir = _LOG_DIR if not user_mode else (Path.home() / ".local/share/edgepulse/logs")
        self.data_dir = self.service_dir / "data"
        self.models_dir = self.service_dir / "models"

    def verify_prerequisites(self) -> bool:
        ok = True

        if not sys.platform.startswith("linux"):
            logger.error("linux_installer_not_linux")
            print("Error: Linux service management is only supported on Linux.")
            return False

        if not self.user_mode and not _is_root():
            logger.error("linux_installer_not_root")
            print("Error: System-wide service installation requires root (sudo).")
            ok = False

        if not shutil.which("systemctl"):
            logger.error("linux_installer_systemctl_missing")
            print("Error: systemctl not found. Is systemd available on this system?")
            ok = False

        if ok:
            logger.info("linux_installer_prerequisites_ok")
        return ok

    def create_directories(self) -> bool:
        dirs = [
            self.service_dir,
            self.config_dir,
            self.log_dir,
            self.data_dir,
            self.models_dir,
        ]
        if not self.user_mode:
            dirs.append(_RUN_DIR)
        try:
            for d in dirs:
                d.mkdir(parents=True, exist_ok=True)
                d.chmod(0o750)
            logger.info("linux_service_directories_created")
            return True
        except Exception as exc:
            logger.error("create_directories_failed", error=str(exc))
            return False

    def install_service(self, python_exe: Optional[str] = None) -> bool:
        if not self.verify_prerequisites():
            return False

        unit_path = _systemd_unit_path(self.user_mode)

        try:
            unit_path.parent.mkdir(parents=True, exist_ok=True)
            unit_path.write_text(_build_unit_file(python_exe, user_mode=self.user_mode))
            unit_path.chmod(0o644)
            logger.info("linux_unit_file_written", path=str(unit_path))

            _systemctl("daemon-reload", user_mode=self.user_mode)
            _systemctl("enable", SERVICE_NAME, user_mode=self.user_mode)

            self.create_directories()
            write_default_config(self.config_dir)

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
        if not sys.platform.startswith("linux"):
            print("Error: Linux service can only be uninstalled on Linux.")
            return False
        if not self.user_mode and not _is_root():
            print("Error: Removing a systemd service requires root privileges.")
            return False

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
            for _ in range(10):
                status = self.get_service_status()
                if status == "RUNNING":
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
            _systemctl("stop", SERVICE_NAME, user_mode=self.user_mode, check=False)
            for _ in range(10):
                status = self.get_service_status()
                if status == "STOPPED":
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
        try:
            _systemctl("restart", SERVICE_NAME, user_mode=self.user_mode)
            print(f"Service '{SERVICE_NAME}' restarted.")
            logger.info("linux_service_restarted")
            return True
        except subprocess.CalledProcessError as exc:
            logger.error("restart_service_failed", stderr=exc.stderr)
            print(f"Failed to restart service: {exc.stderr or exc}")
            return False
        except Exception as exc:
            logger.error("restart_service_failed", error=str(exc))
            return False

    def get_service_status(self) -> Optional[str]:
        if not sys.platform.startswith("linux"):
            return None

        try:
            result = _systemctl("is-active", SERVICE_NAME, user_mode=self.user_mode, check=False)
            raw = (result.stdout or "").strip().upper()

            mapping = {
                "ACTIVE": "RUNNING",
                "INACTIVE": "STOPPED",
                "FAILED": "FAILED",
                "ACTIVATING": "START_PENDING",
                "DEACTIVATING": "STOP_PENDING",
            }
            return mapping.get(raw, raw or "UNKNOWN")
        except Exception as exc:
            logger.error("get_service_status_error", error=str(exc))
            return None

    def is_service_running(self) -> bool:
        return self.get_service_status() == "RUNNING"

    def get_service_logs(self, lines: int = 50) -> str:
        try:
            result = _run(
                ["journalctl", "-u", SERVICE_NAME, "-n", str(lines), "--no-pager"],
                check=False,
                capture_output=True,
            )
            return result.stdout or "No journal entries found."
        except FileNotFoundError:
            log_file = self.log_dir / "agent.log"
            if log_file.exists():
                try:
                    all_lines = log_file.read_text(errors="replace").splitlines()
                    return "\n".join(all_lines[-lines:])
                except Exception:
                    pass
            return "No log output available (journalctl not found)."
        except Exception as exc:
            logger.error("get_service_logs_error", error=str(exc))
            return f"Error reading logs: {exc}"

    def cleanup_service_data(self) -> bool:
        try:
            for sub in [self.data_dir, self.models_dir]:
                if sub.exists():
                    shutil.rmtree(sub)
                    sub.mkdir(parents=True, exist_ok=True)
                    sub.chmod(0o750)
            print("Service data cleaned up (logs preserved).")
            logger.info("linux_service_data_cleaned")
            return True
        except Exception as exc:
            logger.error("cleanup_service_data_failed", error=str(exc))
            print(f"Error cleaning service data: {exc}")
            return False
