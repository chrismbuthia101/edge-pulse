"""
Version utilities for EdgePulse agent
"""

import logging
import re
from pathlib import Path

logger = logging.getLogger(__name__)

def get_agent_version() -> str:
    """Get agent version using standard library methods with fallbacks"""
    
    # Try importlib.metadata (Python 3.8+) first
    try:
        from importlib.metadata import version
        return version("edge-agent")
    except Exception as e:
        logger.debug(f"Could not get version from importlib.metadata: {e}")
    
    # Fallback to importlib_metadata for older Python versions
    try:
        from importlib_metadata import version
        return version("edge-agent")
    except Exception as e:
        logger.debug(f"Could not get version from importlib_metadata: {e}")
    
    # Fallback to reading pyproject.toml with tomllib (Python 3.11+) or tomli
    try:
        current_dir = Path(__file__).parent.parent.parent.parent
        pyproject_path = current_dir / "pyproject.toml"
        
        if pyproject_path.exists():
            # Try tomllib first (Python 3.11+)
            try:
                import tomllib
                with open(pyproject_path, 'rb') as f:
                    data = tomllib.load(f)
                    version = data.get("tool", {}).get("poetry", {}).get("version", "unknown")
                    if version != "unknown":
                        return version
            except ImportError:
                pass
            
            # Try tomli as fallback
            try:
                import tomli
                with open(pyproject_path, 'rb') as f:
                    data = tomli.load(f)
                    version = data.get("tool", {}).get("poetry", {}).get("version", "unknown")
                    if version != "unknown":
                        return version
            except ImportError:
                pass
            
            # Last resort: parse with regex (no external dependencies)
            try:
                with open(pyproject_path, 'r') as f:
                    content = f.read()
                    # Look for version in [tool.poetry] section
                    match = re.search(r'\[tool\.poetry\][\s\S]*?version\s*=\s*["\']([^"\']+)["\']', content)
                    if match:
                        return match.group(1)
            except Exception as e:
                logger.debug(f"Could not parse version with regex: {e}")
                
    except Exception as e:
        logger.debug(f"Could not get version from pyproject.toml: {e}")
    
    # Final fallback: try to read from __init__.py or setup.py
    try:
        current_dir = Path(__file__).parent.parent.parent.parent
        init_path = current_dir / "__init__.py"
        
        if init_path.exists():
            with open(init_path, 'r') as f:
                content = f.read()
                # Look for __version__ variable
                match = re.search(r'__version__\s*=\s*["\']([^"\']+)["\']', content)
                if match:
                    return match.group(1)
    except Exception as e:
        logger.debug(f"Could not get version from __init__.py: {e}")
    
    return "unknown"
