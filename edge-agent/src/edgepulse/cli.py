# Command line interface for EdgePulse

import argparse
import asyncio
import sys
import platform
from pathlib import Path

# Load environment variables from .env file
try:
    from dotenv import load_dotenv
    env_path = Path(__file__).parent.parent.parent / ".env"
    if env_path.exists():
        load_dotenv(env_path)
    else:
        load_dotenv()
except ImportError:
    pass

from edgepulse.core.agent import EdgePulseAgent
from edgepulse.config.settings import AgentSettings
from edgepulse.utils.error_handler import ConfigurationError, EdgePulseError

# ─── Platform-specific service module ─────────────────────────────────────────

_current_platform = platform.system()

if _current_platform == "Windows":
    try:
        from edgepulse.windows_service.installer import ServiceInstaller
        WINDOWS_SERVICE_AVAILABLE = True
    except ImportError:
        WINDOWS_SERVICE_AVAILABLE = False
else:
    WINDOWS_SERVICE_AVAILABLE = False

if sys.platform.startswith("linux"):
    try:
        from edgepulse.platform.linux.linux_service.installer import ServiceInstaller as LinuxServiceInstaller
        LINUX_SERVICE_AVAILABLE = True
    except ImportError:
        LINUX_SERVICE_AVAILABLE = False
else:
    LINUX_SERVICE_AVAILABLE = False

try:
    from edgepulse.bootstrap_cli import add_bootstrap_subcommand, run_bootstrap
    _BOOTSTRAP_AVAILABLE = True
except ImportError:
    _BOOTSTRAP_AVAILABLE = False

try:
    from edgepulse.auth.enrollment import DeviceEnrollmentClient
    _ENROLLMENT_AVAILABLE = True
except ImportError:
    _ENROLLMENT_AVAILABLE = False

def main():
    """Main CLI entry point"""
    parser = argparse.ArgumentParser(
        description="EdgePulse - Edge Security Monitoring Agent"
    )

    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # ── run ───────────────────────────────────────────────────────────────────
    run_parser = subparsers.add_parser("run", help="Run the EdgePulse agent")
    run_parser.add_argument("--config", type=str, help="Path to configuration file")
    run_parser.add_argument("--daemon", action="store_true", help="Run as daemon")
    run_parser.add_argument("--verbose", action="store_true", help="Enable verbose logging")

    # ── bootstrap subcommand ─────────────────────────────────────────────────
    if _BOOTSTRAP_AVAILABLE:
        add_bootstrap_subcommand(subparsers)

    # ── enroll subcommand ─────────────────────────────────────────────────────
    if _ENROLLMENT_AVAILABLE:
        enroll_parser = subparsers.add_parser(
            "enroll",
            help="Enroll this device with the EdgePulse backend",
            description="Register this device with the EdgePulse cloud backend using an enrollment token.",
        )
        enroll_parser.add_argument(
            "--config",
            type=str,
            help="Path to enrollment configuration file (enroll.cfg or enrollment.json)",
        )
        enroll_parser.add_argument(
            "--token",
            type=str,
            help="Enrollment token (can also be provided via config file)",
        )
        enroll_parser.add_argument(
            "--supabase-url",
            type=str,
            help="Supabase URL (can also be provided via config file)",
        )

    # ── Windows service ───────────────────────────────────────────────────────
    if WINDOWS_SERVICE_AVAILABLE:
        service_parser = subparsers.add_parser("service", help="Manage Windows Service")
        service_subparsers = service_parser.add_subparsers(
            dest="service_action", help="Service actions"
        )

        install_parser = service_subparsers.add_parser("install", help="Install Windows Service")
        install_parser.add_argument("--python-exe", type=str, help="Python executable path")

        service_subparsers.add_parser("uninstall", help="Uninstall Windows Service")
        service_subparsers.add_parser("start", help="Start Windows Service")
        service_subparsers.add_parser("stop", help="Stop Windows Service")
        service_subparsers.add_parser("status", help="Get Windows Service status")

        logs_parser = service_subparsers.add_parser("logs", help="Get Windows Service logs")
        logs_parser.add_argument(
            "--lines", type=int, default=50, help="Number of log lines to show"
        )

        service_subparsers.add_parser("cleanup", help="Clean up Windows Service data")

    # ── Linux service ─────────────────────────────────────────────────────────
    if LINUX_SERVICE_AVAILABLE:
        linux_parser = subparsers.add_parser("service", help="Manage Linux systemd Service")
        linux_subparsers = linux_parser.add_subparsers(
            dest="service_action", help="Service actions"
        )

        linux_install = linux_subparsers.add_parser("install", help="Install systemd service unit")
        linux_install.add_argument("--python-exe", type=str, help="Python executable path")
        linux_install.add_argument(
            "--user",
            action="store_true",
            help="Install as a user-mode systemd unit (no root required)",
        )

        linux_subparsers.add_parser("uninstall", help="Remove the systemd unit file")
        linux_subparsers.add_parser("start", help="Start the systemd service")
        linux_subparsers.add_parser("stop", help="Stop the systemd service")
        linux_subparsers.add_parser("restart", help="Restart the systemd service")
        linux_subparsers.add_parser("status", help="Show the systemd service status")

        logs_linux = linux_subparsers.add_parser("logs", help="Show service journal logs")
        logs_linux.add_argument(
            "--lines", type=int, default=50, help="Number of log lines to show"
        )

        linux_subparsers.add_parser("cleanup", help="Clean up service data directories")

    args = parser.parse_args()

    # ── Dispatch: Windows service ─────────────────────────────────────────────
    if args.command == "service" and WINDOWS_SERVICE_AVAILABLE:
        installer = ServiceInstaller()

        if args.service_action == "install":
            success = installer.install_service(getattr(args, "python_exe", None))
            if success:
                installer.create_directories()
                print("Windows Service installed successfully")
            else:
                print("Failed to install Windows Service")
                sys.exit(1)

        elif args.service_action == "uninstall":
            if installer.uninstall_service():
                print("Windows Service uninstalled successfully")
            else:
                print("Failed to uninstall Windows Service")
                sys.exit(1)

        elif args.service_action == "start":
            if installer.start_service():
                print("Windows Service started successfully")
            else:
                print("Failed to start Windows Service")
                sys.exit(1)

        elif args.service_action == "stop":
            if installer.stop_service():
                print("Windows Service stopped successfully")
            else:
                print("Failed to stop Windows Service")
                sys.exit(1)

        elif args.service_action == "status":
            status = installer.get_service_status()
            if status:
                print(f"Windows Service status: {status}")
            else:
                print("Could not determine Windows Service status")
                sys.exit(1)

        elif args.service_action == "logs":
            print(installer.get_service_logs(args.lines))

        elif args.service_action == "cleanup":
            if installer.cleanup_service_data():
                print("Windows Service data cleaned up successfully")
            else:
                print("Failed to clean up Windows Service data")
                sys.exit(1)

        else:
            print(f"Unknown service action: {args.service_action}")
            sys.exit(1)

        return

    # ── Dispatch: Linux service ───────────────────────────────────────────────
    if args.command == "service" and LINUX_SERVICE_AVAILABLE:
        installer = LinuxServiceInstaller()

        if args.service_action == "install":
            success = installer.install_service(getattr(args, "python_exe", None))
            if not success:
                sys.exit(1)

        elif args.service_action == "uninstall":
            if not installer.uninstall_service():
                sys.exit(1)

        elif args.service_action == "start":
            if not installer.start_service():
                sys.exit(1)

        elif args.service_action == "stop":
            if not installer.stop_service():
                sys.exit(1)

        elif args.service_action == "restart":
            if hasattr(installer, "restart_service"):
                if not installer.restart_service():
                    sys.exit(1)
            else:
                installer.stop_service()
                installer.start_service()

        elif args.service_action == "status":
            status = installer.get_service_status()
            print(f"Service status: {status}")

        elif args.service_action == "logs":
            print(installer.get_service_logs(args.lines))

        elif args.service_action == "cleanup":
            if not installer.cleanup_service_data():
                sys.exit(1)

        else:
            print(f"Unknown service action: {args.service_action}")
            sys.exit(1)

        return

    # ── Dispatch: bootstrap ──────────────────────────────────────────────────
    if args.command == "bootstrap":
        if not _BOOTSTRAP_AVAILABLE:
            print("Bootstrap command not available (edgepulse.bootstrap_cli not found)")
            sys.exit(1)
        sys.exit(run_bootstrap(args))

    # ── Dispatch: enroll ───────────────────────────────────────────────────────
    if args.command == "enroll":
        if not _ENROLLMENT_AVAILABLE:
            print("Enrollment command not available")
            sys.exit(1)

        from edgepulse.auth.credentials import CredentialManager

        credential_manager = CredentialManager()
        enrollment_client = DeviceEnrollmentClient(credential_manager)

        if hasattr(args, "config") and args.config:
            config = enrollment_client.read_enrollment_config()
        else:
            config = enrollment_client.read_enrollment_config()

        if not config and (hasattr(args, "token") and args.token and hasattr(args, "supabase_url") and args.supabase_url):
            from edgepulse.auth.enrollment import EnrollmentConfig
            config = EnrollmentConfig(
                supabase_url=args.supabase_url,
                enrollment_token=args.token,
            )

        if not config:
            print("Error: No enrollment configuration found.")
            print("Please provide either:")
            print("  1. A config file (enroll.cfg or enrollment.json) in ~/.edgepulse/")
            print("  2. Both --token and --supabase-url arguments")
            print("")
            print("Example enrollment.json:")
            print('  {"supabase_url": "https://your-project.supabase.co", "enrollment_token": "your-token"}')
            sys.exit(1)

        async def do_enrollment():
            result = await enrollment_client.enroll_device(config)
            if result:
                if enrollment_client.complete_enrollment(result):
                    print(f"Device enrolled successfully!")
                    print(f"  Device ID: {result.device_id}")
                    print(f"  API Key: {result.api_key[:10]}...")
                    return 0
                else:
                    print("Failed to store credentials")
                    return 1
            else:
                print("Enrollment failed. Check logs for details.")
                return 1

        sys.exit(asyncio.run(do_enrollment()))

    # ── Default: run the agent ────────────────────────────────────────────────
    if args.command is None or args.command == "run":
        try:
            config_path = (
                Path(args.config)
                if hasattr(args, "config") and args.config
                else None
            )
            settings = AgentSettings(config_path=config_path)
            agent = EdgePulseAgent(settings=settings)

            if hasattr(args, "verbose") and args.verbose:
                import logging
                logging.getLogger().setLevel(logging.DEBUG)

            asyncio.run(agent.run_forever())

        except ConfigurationError as exc:
            print(f"Configuration Error: {exc}")
            sys.exit(1)
        except EdgePulseError as exc:
            print(f"EdgePulse Error: {exc}")
            sys.exit(1)
        except Exception as exc:
            print(f"Unexpected Error: {exc}")
            sys.exit(1)
    else:
        print(f"Unknown command: {args.command}")
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()