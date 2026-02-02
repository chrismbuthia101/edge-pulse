# Command line interface for EdgePulse


import argparse
import asyncio
import sys
from edgepulse_win.core.agent import EdgePulseAgent
from edgepulse_win.config.settings import AgentSettings
from edgepulse_win.utils.error_handler import ConfigurationError, EdgePulseError


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
        settings = AgentSettings()
        agent = EdgePulseAgent(settings=settings)
        
        if args.daemon:
            asyncio.run(agent.run_forever())
        else:
            asyncio.run(agent.run_forever())
            
    except KeyboardInterrupt:
        print("\nShutting down EdgePulse...")
        sys.exit(0)
    except ConfigurationError as e:
        print(f"Configuration Error: {e}")
        sys.exit(1)
    except EdgePulseError as e:
        print(f"EdgePulse Error: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"Unexpected Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
