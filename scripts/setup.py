#!/usr/bin/env python3
"""
Setup script for EdgePulse

Initializes directories and configuration.
"""

import os
import sys
from pathlib import Path

def setup_directories():
    """Create necessary directories."""
    directories = [
        "data/logs",
        "data/cache",
        "models",
        "tests/unit",
        "tests/integration",
        "tests/simulation",
    ]
    
    for directory in directories:
        Path(directory).mkdir(parents=True, exist_ok=True)
        print(f"Created directory: {directory}")

def setup_config():
    """Create default configuration if it doesn't exist."""
    config_dir = Path.home() / ".edge-pulse"
    config_file = config_dir / "config.yaml"
    
    if not config_file.exists():
        config_dir.mkdir(parents=True, exist_ok=True)
        print(f"Configuration directory created: {config_dir}")
        print("Please create config.yaml or use default settings")
    else:
        print(f"Configuration file exists: {config_file}")

def main():
    """Main setup function."""
    print("Setting up EdgePulse...")
    setup_directories()
    setup_config()
    print("\nSetup complete!")
    print("\nNext steps:")
    print("1. Copy .env.example to .env and configure")
    print("2. Install dependencies: pip install -r requirements.txt")
    print("3. Run the agent: python -m agent.main")

if __name__ == "__main__":
    main()
