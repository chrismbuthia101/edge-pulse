# Command line interface for EdgePulse


import argparse
import asyncio
import sys
import platform
from pathlib import Path

# Load environment variables from .env file
try:
    from dotenv import load_dotenv
    # Try to load .env from current directory and parent directories
    env_path = Path(__file__).parent.parent.parent / ".env"
    if env_path.exists():
        load_dotenv(env_path)
    else:
        load_dotenv()  # Try current directory
except ImportError:
    pass  # dotenv not available, use system environment

from edgepulse_win.core.agent import EdgePulseAgent
from edgepulse_win.config.settings import AgentSettings
from edgepulse_win.utils.error_handler import ConfigurationError, EdgePulseError

# Windows Service imports
if platform.system() == "Windows":
    try:
        from edgepulse_win.windows_service.installer import ServiceInstaller
        WINDOWS_SERVICE_AVAILABLE = True
    except ImportError:
        WINDOWS_SERVICE_AVAILABLE = False
else:
    WINDOWS_SERVICE_AVAILABLE = False


def main():
    """Main CLI entry point"""
    parser = argparse.ArgumentParser(
        description="EdgePulse - Edge Security Monitoring Agent"
    )
    
    # Create subparsers for different commands
    subparsers = parser.add_subparsers(dest='command', help='Available commands')
    
    # Run command (default behavior)
    run_parser = subparsers.add_parser('run', help='Run the EdgePulse agent')
    run_parser.add_argument(
        "--config", 
        type=str, 
        help="Path to configuration file"
    )
    run_parser.add_argument(
        "--daemon", 
        action="store_true", 
        help="Run as daemon"
    )
    run_parser.add_argument(
        "--verbose", 
        action="store_true", 
        help="Enable verbose logging"
    )
    
    # Windows Service commands
    if WINDOWS_SERVICE_AVAILABLE:
        service_parser = subparsers.add_parser('service', help='Manage Windows Service')
        service_subparsers = service_parser.add_subparsers(dest='service_action', help='Service actions')
        
        # Service install
        install_parser = service_subparsers.add_parser('install', help='Install Windows Service')
        install_parser.add_argument('--python-exe', type=str, help='Python executable path')
        
        # Service uninstall
        service_subparsers.add_parser('uninstall', help='Uninstall Windows Service')
        
        # Service start
        service_subparsers.add_parser('start', help='Start Windows Service')
        
        # Service stop
        service_subparsers.add_parser('stop', help='Stop Windows Service')
        
        # Service status
        service_subparsers.add_parser('status', help='Get Windows Service status')
        
        # Service logs
        logs_parser = service_subparsers.add_parser('logs', help='Get Windows Service logs')
        logs_parser.add_argument('--lines', type=int, default=50, help='Number of log lines to show')
        
        # Service cleanup
        service_subparsers.add_parser('cleanup', help='Clean up Windows Service data')
    
    args = parser.parse_args()
    
    # Handle Windows Service commands
    if args.command == 'service' and WINDOWS_SERVICE_AVAILABLE:
        installer = ServiceInstaller()
        
        if args.service_action == 'install':
            success = installer.install_service(args.python_exe)
            if success:
                installer.create_directories()
                print("Windows Service installed successfully")
            else:
                print("Failed to install Windows Service")
                sys.exit(1)
                
        elif args.service_action == 'uninstall':
            if installer.uninstall_service():
                print("Windows Service uninstalled successfully")
            else:
                print("Failed to uninstall Windows Service")
                sys.exit(1)
                
        elif args.service_action == 'start':
            if installer.start_service():
                print("Windows Service started successfully")
            else:
                print("Failed to start Windows Service")
                sys.exit(1)
                
        elif args.service_action == 'stop':
            if installer.stop_service():
                print("Windows Service stopped successfully")
            else:
                print("Failed to stop Windows Service")
                sys.exit(1)
                
        elif args.service_action == 'status':
            status = installer.get_service_status()
            if status:
                print(f"Windows Service status: {status}")
            else:
                print("Could not determine Windows Service status")
                sys.exit(1)
                
        elif args.service_action == 'logs':
            logs = installer.get_service_logs(args.lines)
            print(logs)
            
        elif args.service_action == 'cleanup':
            if installer.cleanup_service_data():
                print("Windows Service data cleaned up successfully")
            else:
                print("Failed to clean up Windows Service data")
                sys.exit(1)
                
        else:
            print(f"Unknown service action: {args.service_action}")
            service_parser.print_help()
            sys.exit(1)
            
        return
    
    # Default: run the agent
    try:
        config_path = Path(args.config) if args.config else None
        settings = AgentSettings(config_path=config_path)
        agent = EdgePulseAgent(settings=settings)
        
        if args.verbose:
            # Set verbose logging through settings
            import logging
            logging.getLogger().setLevel(logging.DEBUG)
        
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
