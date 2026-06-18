import os
import sys
from pathlib import Path
from typing import Optional


class PathManager:

    def __init__(self, base_dir: Optional[Path] = None) -> None:
        self._system_install = False

        if base_dir is not None:
            self.base_dir = Path(base_dir).resolve()
        elif env_base := os.environ.get("EDGE_PULSE_DATA_DIR"):
            self.base_dir = Path(env_base).resolve()
        elif self._is_system_install():
            self.base_dir = self._system_data_dir()
            self._system_install = True
        else:
            self.base_dir = self._dev_data_dir()

        self.base_dir.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def _is_windows() -> bool:
        return sys.platform == "win32"

    @staticmethod
    def _safe_program_data() -> Path:
        return Path("C:\\ProgramData").resolve()

    @staticmethod
    def _is_system_install() -> bool:
        if "EDGE_PULSE_SYSTEM_INSTALL" in os.environ:
            return True
        if PathManager._is_windows():
            return (PathManager._safe_program_data() / "EdgePulse" / ".system-install").exists()
        return Path("/opt/edgepulse/.system-install").exists()

    @staticmethod
    def _system_data_dir() -> Path:
        if PathManager._is_windows():
            return PathManager._safe_program_data() / "EdgePulse"
        return Path(os.environ.get("EDGE_PULSE_SYSTEM_DATA_DIR", "/var/lib/edgepulse"))

    @staticmethod
    def _system_config_dir() -> Path:
        if PathManager._is_windows():
            return PathManager._safe_program_data() / "EdgePulse" / "config"
        return Path(os.environ.get("EDGE_PULSE_SYSTEM_CONFIG_DIR", "/etc/edgepulse"))

    @staticmethod
    def _dev_data_dir() -> Path:
        if PathManager._is_windows():
            return Path.home() / ".edgepulse"
        return Path(__file__).resolve().parent.parent.parent

    @property
    def data_dir(self) -> Path:
        path = self.base_dir / "data"
        path.mkdir(parents=True, exist_ok=True)
        return path

    @property
    def logs_dir(self) -> Path:
        path = self.data_dir / "logs"
        path.mkdir(parents=True, exist_ok=True)
        return path

    @property
    def cache_dir(self) -> Path:
        path = self.data_dir / "cache"
        path.mkdir(parents=True, exist_ok=True)
        return path

    @property
    def models_dir(self) -> Path:
        path = self.base_dir / "models"
        path.mkdir(parents=True, exist_ok=True)
        return path

    def get_log_db_path(self, device_id: str) -> Path:
        return self.logs_dir / f"{device_id}.db"

    def get_model_path(self, model_name: str, device_id: Optional[str] = None) -> Path:
        if device_id:
            filename = f"{device_id}_{model_name}.pkl"
        else:
            filename = f"{model_name}.pkl"
        return self.models_dir / filename

    def get_baseline_path(self, device_id: str) -> Path:
        return self.models_dir / f"{device_id}_baseline.pkl"

    def get_config_path(self) -> Path:
        if self._system_install:
            return self._system_config_dir() / "agent_config.json"
        config_dir = Path.home() / ".edge-pulse"
        config_dir.mkdir(parents=True, exist_ok=True)
        return config_dir / "config.yaml"
