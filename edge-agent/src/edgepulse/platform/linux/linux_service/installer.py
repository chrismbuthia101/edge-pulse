"""
Linux (systemd) Service Installer for EdgePulse

Provides installation, removal, and management of the EdgePulse Linux systemd
service unit.
"""

import os
import shutil
import subprocess
import sys
import textwrap
from pathlib import Path
from typing import Optional

from edgepulse.utils.log_handler import get_logger

logger = get_logger(__name__)

# ─── Constants ────────────────────────────────────────────────────────────────

SERVICE_NAME = "edgepulse-agent"
SERVICE_DISPLAY_NAME = "EdgePulse Monitoring Agent"
SERVICE_DESCRIPTION = (
    "EdgePulse AI-powered security monitoring and anomaly detection agent "
    "for Linux edge devices."
)

_BASE_DIR = Path("/var/lib/edgepulse")
_CONFIG_DIR = Path("/etc/edgepulse")
_LOG_DIR = Path("/var/log/edgepulse")
_RUN_DIR = Path("/run/edgepulse")

_SYSTEMD_SYSTEM_DIR = Path("/etc/systemd/system")
_UNIT_FILE = _SYSTEMD_SYSTEM_DIR / f"{SERVICE_NAME}.service"


def _get_safe_base_dir() -> Path:
    """Return /var/lib/edgepulse resolved to prevent traversal."""
    return _BASE_DIR.resolve()


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _run(cmd: list[str], check: bool = True, capture: bool = False) -> subprocess.CompletedProcess:
    """Run a shell command and optionally capture output."""
    return subprocess.run(
        cmd,
        check=check,
        text=True,
        capture_output=capture,
    )


def _systemctl(*args: str, check: bool = True) -> subprocess.CompletedProcess:
    return _run(["systemctl", *args], check=check, capture=True)


def _is_root() -> bool:
    return os.geteuid() == 0


def _python_executable() -> str:
    """Return the absolute path to the running Python interpreter."""
    return sys.executable


def _service_main_path() -> Path:
    """Locate service_main.py relative to this file."""
    return Path(__file__).with_name("service_main.py")


def _build_unit_file(python_exe: Optional[str] = None) -> str:
    exe = python_exe or _python_executable()
    main = _service_main_path()

    return textwrap.dedent(f"""\
        [Unit]
        Description={SERVICE_DESCRIPTION}
        Documentation=https://docs.edgepulse.io
        After=network-online.target
        Wants=network-online.target
        StartLimitIntervalSec=60
        StartLimitBurst=3

        [Service]
        Type=simple
        ExecStart={exe} {main} --service-mode
        WorkingDirectory={_BASE_DIR}
        Restart=on-failure
        RestartSec=10
        StandardOutput=journal
        StandardError=journal
        SyslogIdentifier=edgepulse-agent
        # Security hardening
        NoNewPrivileges=true
        ProtectSystem=strict
        ProtectHome=read-only
        ReadWritePaths={_BASE_DIR} {_LOG_DIR} {_RUN_DIR} {_CONFIG_DIR}
        PrivateTmp=true
        # Resource limits
        LimitNOFILE=65535
        TimeoutStopSec=30

        [Install]
        WantedBy=multi-user.target
    """)


# ─── ServiceInstaller ─────────────────────────────────────────────────────────

class ServiceInstaller:
    """
    systemd service installer and lifecycle manager for EdgePulse on Linux.
    """

    def __init__(self) -> None:
        self.service_name = SERVICE_NAME
        self.display_name = SERVICE_DISPLAY_NAME
        self.description = SERVICE_DESCRIPTION

        # Directory layout
        self.service_dir = _get_safe_base_dir()
        self.config_dir = _CONFIG_DIR
        self.log_dir = _LOG_DIR
        self.data_dir = self.service_dir / "data"
        self.models_dir = self.service_dir / "models"

    # ── Directory setup ───────────────────────────────────────────────────────

    def create_directories(self) -> bool:
        """Create service-owned directories with safe permissions."""
        dirs = [
            self.service_dir,
            self.config_dir,
            self.log_dir,
            _RUN_DIR,
            self.data_dir,
            self.models_dir,
        ]
        try:
            for d in dirs:
                d.mkdir(parents=True, exist_ok=True)
                # 0o750 → owner rwx, group rx, others nothing
                d.chmod(0o750)
            logger.info("linux_service_directories_created")
            return True
        except Exception as exc:
            logger.error("create_directories_failed", error=str(exc))
            return False

    # ── Install / uninstall ───────────────────────────────────────────────────

    def install_service(self, python_exe: Optional[str] = None) -> bool:
        if not sys.platform.startswith("linux"):
            logger.error("linux_service_linux_only")
            print("Error: Linux service can only be installed on Linux.")
            return False

        if not _is_root():
            logger.error("linux_service_requires_root")
            print("Error: Installing a systemd service requires root (sudo) privileges.")
            return False

        if not shutil.which("systemctl"):
            logger.error("systemctl_not_found")
            print("Error: systemctl not found. Is systemd running on this system?")
            return False

        try:
            unit_content = _build_unit_file(python_exe)
            _UNIT_FILE.write_text(unit_content)
            _UNIT_FILE.chmod(0o644)
            logger.info("unit_file_written", path=str(_UNIT_FILE))

            _systemctl("daemon-reload")
            _systemctl("enable", SERVICE_NAME)

            self.create_directories()
            self._write_default_config()

            print(f"Service '{SERVICE_NAME}' installed and enabled successfully.")
            print(f"Unit file: {_UNIT_FILE}")
            print(f"Data directory: {self.service_dir}")
            print("Run  sudo systemctl start edgepulse-agent  to start it now.")
            return True

        except subprocess.CalledProcessError as exc:
            logger.error("systemctl_error", error=str(exc), stderr=exc.stderr)
            print(f"systemctl error: {exc.stderr or exc}")
            return False
        except Exception as exc:
            logger.error("install_service_failed", error=str(exc))
            print(f"Error installing service: {exc}")
            return False

    def uninstall_service(self) -> bool:
        """Stop, disable, and remove the systemd unit file."""
        if not sys.platform.startswith("linux"):
            print("Error: Linux service can only be uninstalled on Linux.")
            return False
        if not _is_root():
            print("Error: Removing a systemd service requires root privileges.")
            return False

        try:
            _systemctl("stop", SERVICE_NAME, check=False)
            _systemctl("disable", SERVICE_NAME, check=False)

            if _UNIT_FILE.exists():
                _UNIT_FILE.unlink()
                logger.info("unit_file_removed", path=str(_UNIT_FILE))

            _systemctl("daemon-reload", check=False)
            print(f"Service '{SERVICE_NAME}' uninstalled successfully.")
            return True

        except Exception as exc:
            logger.error("uninstall_service_failed", error=str(exc))
            print(f"Error uninstalling service: {exc}")
            return False

    def start_service(self) -> bool:
        if not sys.platform.startswith("linux"):
            print("Error: Linux service can only be started on Linux.")
            return False
        try:
            _systemctl("start", SERVICE_NAME)
            print(f"Service '{SERVICE_NAME}' started successfully.")
            logger.info("linux_service_started")
            return True
        except subprocess.CalledProcessError as exc:
            logger.error("start_service_failed", stderr=exc.stderr)
            print(f"Failed to start service: {exc.stderr or exc}")
            return False
        except Exception as exc:
            logger.error("start_service_failed", error=str(exc))
            return False

    def stop_service(self) -> bool:
        if not sys.platform.startswith("linux"):
            print("Error: Linux service can only be stopped on Linux.")
            return False
        try:
            _systemctl("stop", SERVICE_NAME)
            print(f"Service '{SERVICE_NAME}' stopped successfully.")
            logger.info("linux_service_stopped")
            return True
        except subprocess.CalledProcessError as exc:
            logger.error("stop_service_failed", stderr=exc.stderr)
            print(f"Failed to stop service: {exc.stderr or exc}")
            return False
        except Exception as exc:
            logger.error("stop_service_failed", error=str(exc))
            return False

    def restart_service(self) -> bool:
        if not sys.platform.startswith("linux"):
            print("Error: Linux service can only be restarted on Linux.")
            return False
        try:
            _systemctl("restart", SERVICE_NAME)
            print(f"Service '{SERVICE_NAME}' restarted successfully.")
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
            result = _systemctl("is-active", SERVICE_NAME, check=False)
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
        """Retrieve the most recent *lines* from the systemd journal."""
        try:
            result = _run(
                ["journalctl", "-u", SERVICE_NAME, "-n", str(lines), "--no-pager"],
                check=False,
                capture=True,
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
        """Remove data and cache directories; preserve logs."""
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

    # ── Default configuration ─────────────────────────────────────────────────

    def _write_default_config(self) -> None:
        """Write a starter agent_config.json to /etc/edgepulse if absent."""
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
            logger.info("default_config_written", path=str(config_file))
        except Exception as exc:
            logger.warning("default_config_write_failed", error=str(exc))