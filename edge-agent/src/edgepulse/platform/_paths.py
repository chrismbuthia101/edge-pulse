import json
import os
import sys
from pathlib import Path

_BASE_DIR = Path("/opt/edgepulse")
_CONFIG_DIR = Path("/etc/edgepulse")
_LOG_DIR = Path("/var/log/edgepulse")
_RUN_DIR = Path("/var/run/edgepulse")


def _safe_program_data() -> Path:
    try:
        return Path(os.environ.get("ProgramData", "C:\\ProgramData")) / "EdgePulse"
    except Exception:
        return Path("C:\\ProgramData\\EdgePulse")


def _safe_base_dir() -> Path:
    if sys.platform.startswith("linux"):
        return _BASE_DIR.resolve()
    return _safe_program_data()


def write_default_config(config_dir: Path) -> None:
    config_file = config_dir / "agent_config.json"
    if config_file.exists():
        return

    default = {
        "sync": {
            "supabase_url": "",
            "api_key": "",
        },
        "collection_interval": 60,
        "detection_threshold": 0.5,
        "offline_queue_size": 10000,
        "logging_level": "INFO",
        "enable_process_monitoring": True,
        "enable_network_monitoring": True,
    }
    try:
        config_file.write_text(json.dumps(default, indent=2))
        config_file.chmod(0o640)
    except Exception:
        pass
