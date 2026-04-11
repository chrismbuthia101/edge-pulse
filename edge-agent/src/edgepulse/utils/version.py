"""
Version utilities for EdgePulse agent
"""

import logging

logger = logging.getLogger(__name__)

def get_agent_version() -> str:
    try:
        import pkg_resources
        version = pkg_resources.get_distribution("edge-agent").version
        return version
    except Exception as e:
        logger.debug(f"Could not get version from pkg_resources: {e}")
        
    try:
        # Fallback to pyproject.toml if available
        from pathlib import Path
        import toml
        
        # Try to find pyproject.toml
        current_dir = Path(__file__).parent.parent.parent.parent
        pyproject_path = current_dir / "pyproject.toml"
        
        if pyproject_path.exists():
            with open(pyproject_path, 'r') as f:
                data = toml.load(f)
                return data.get("tool", {}).get("poetry", {}).get("version", "unknown")
    except Exception as e:
        logger.debug(f"Could not get version from pyproject.toml: {e}")
    
    return "unknown"
