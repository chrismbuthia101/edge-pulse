#!/usr/bin/env python3
"""
Log Export Script

Exports forensic logs with integrity verification.
"""

import sys
import os
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from agent.logging import LogManager
from datetime import datetime

def main():
    """Export logs."""
    import argparse
    
    parser = argparse.ArgumentParser(description="Export EdgePulse logs")
    parser.add_argument("--device-id", default="default-device", help="Device ID")
    parser.add_argument("--output", default="forensic_export", help="Output directory")
    
    args = parser.parse_args()
    
    db_path = f"data/logs/{args.device_id}.db"
    
    if not os.path.exists(db_path):
        print(f"Database not found: {db_path}")
        return
    
    log_manager = LogManager(
        db_path=db_path,
        device_id=args.device_id,
    )
    
    output_path = Path(args.output)
    output_path.mkdir(parents=True, exist_ok=True)
    
    print(f"Exporting logs to {output_path}...")
    log_manager.export_forensic_package(str(output_path))
    
    print("Export complete!")
    print(f"Files exported to: {output_path}")

if __name__ == "__main__":
    main()
