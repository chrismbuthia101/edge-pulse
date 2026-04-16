import os
import sys
from pathlib import Path
from typing import Optional


def _detect_install_mode() -> bool:
    return str(Path(__file__)).startswith("/opt/edgepulse")


class PathManager:

    def __init__(self, base_dir: Optional[Path] = None) -> None:
        if base_dir is not None:
            self.base_dir = Path(base_dir).resolve()
            self._system_install = False
        elif env_base := os.environ.get("EDGE_PULSE_DATA_DIR"):
            self.base_dir = Path(env_base).resolve()
            self._system_install = False
        elif _detect_install_mode():
            self.base_dir = Path(os.environ.get("EDGE_PULSE_SYSTEM_DATA_DIR", "/var/lib/edgepulse"))
            self._system_install = True
        else:
            self.base_dir = Path(__file__).parent.parent.parent.resolve()
            self._system_install = False

        self.base_dir.mkdir(parents=True, exist_ok=True)

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
        if self._system_install:
            path = Path(os.environ.get("EDGE_PULSE_SYSTEM_DATA_DIR", "/var/lib/edgepulse")) / "models"
        else:
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

    def get_hash_chain_path(self, device_id: str) -> Path:
        return self.logs_dir / f"{device_id}_hash_chain.json"

    def get_config_path(self) -> Path:
        if self._system_install:
            return Path(os.environ.get("EDGE_PULSE_SYSTEM_CONFIG_DIR", "/etc/edgepulse")) / "agent_config.json"
        config_dir = Path.home() / ".edge-pulse"
        config_dir.mkdir(parents=True, exist_ok=True)
        return config_dir / "config.yaml"