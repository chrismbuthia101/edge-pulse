"""
Command line interface for EdgePulse
"""

import argparse
import sys
from edgepulse_win.core.agent import EdgePulseAgent
from edgepulse_win.config.settings import SettingsManager


def main():
    """Main CLI entry point"""
    parser = argparse.ArgumentParser(
        description="EdgePulse - Edge Security Monitoring Agent"
    )
    parser.add_argument(
        "--config", 
        type=str, 
        help="Path to configuration file"
    )
    parser.add_argument(
        "--daemon", 
        action="store_true", 
        help="Run as daemon"
    )
    parser.add_argument(
        "--verbose", 
        action="store_true", 
        help="Enable verbose logging"
    )
    
    args = parser.parse_args()
    
    try:
        settings_manager = SettingsManager(config_path=args.config)
        agent = EdgePulseAgent(settings=settings_manager)
        
        if args.daemon:
            agent.run_daemon()
        else:
            agent.run()
            
    except KeyboardInterrupt:
        print("\nShutting down EdgePulse...")
        sys.exit(0)
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
