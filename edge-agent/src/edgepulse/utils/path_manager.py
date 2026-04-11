# Path management utility for consistent path handling.

from pathlib import Path
from typing import Optional


class PathManager:
    """Manages all file paths consistently."""

    def __init__(self, base_dir: Optional[Path] = None) -> None:
   
        if base_dir is None:
            self.base_dir = Path(__file__).parent.parent.parent.resolve()
        else:
            self.base_dir = Path(base_dir).resolve()

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
        config_dir = Path.home() / ".edge-pulse"
        config_dir.mkdir(parents=True, exist_ok=True)
        return config_dir / "config.yaml"
