"""
Pytest configuration and fixtures
"""

import pytest
import tempfile
from pathlib import Path


@pytest.fixture
def temp_dir():
    """Provide a temporary directory for tests"""
    with tempfile.TemporaryDirectory() as tmpdir:
        yield Path(tmpdir)


@pytest.fixture
def sample_config():
    """Provide sample configuration for tests"""
    return {
        "collection": {
            "interval": 60,
            "window_1min": 60,
        },
        "detection": {
            "isolation_forest": {
                "contamination": 0.1,
                "n_estimators": 100,
            }
        },
        "privacy": {
            "data_retention_days": 30,
            "anonymization_level": "medium",
            "collect_command_lines": False,
        }
    }
