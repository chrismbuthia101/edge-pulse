
import argparse
import asyncio
import sys
from pathlib import Path

from edgepulse.platform import is_windows, is_linux

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

if is_windows():
    try:
        from edgepulse.platform.windows.windows_service.installer import ServiceInstaller
        WINDOWS_SERVICE_AVAILABLE = True
    except ImportError:
        WINDOWS_SERVICE_AVAILABLE = False
else:
    WINDOWS_SERVICE_AVAILABLE = False

if is_linux():
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


def _load_credentials_into_env() -> bool:
    """
    Load device credentials from the credential manager and inject them
    as environment variables so AgentSettings picks them up via
    pydantic-settings' env_nested_delimiter.

    Returns True if valid credentials were found, False otherwise.
    """
    import os
    try:
        from edgepulse.auth.credentials import CredentialManager
        credential_manager = CredentialManager()
        credentials = credential_manager.get_device_credentials()
        if credentials:
            if credentials.supabase_url:
                os.environ["SYNC__SUPABASE_URL"] = credentials.supabase_url
            if credentials.api_key:
                os.environ["SYNC__SUPABASE_KEY"] = credentials.api_key
            if credentials.device_id:
                os.environ["DEVICE_ID"] = credentials.device_id
            return bool(credentials.supabase_url and credentials.api_key)
    except Exception:
        pass
    return False


def main():
    parser = argparse.ArgumentParser(
        description="EdgePulse - Edge Security Monitoring Agent"
    )

    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    run_parser = subparsers.add_parser("run", help="Run the EdgePulse agent")
    run_parser.add_argument("--config", type=str, help="Path to configuration file")
    run_parser.add_argument("--daemon", action="store_true", help="Run as daemon")
    run_parser.add_argument("--verbose", action="store_true", help="Enable verbose logging")

    if _BOOTSTRAP_AVAILABLE:
        add_bootstrap_subcommand(subparsers)

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
        enroll_parser.add_argument(
            "--anon-key",
            type=str,
            help="Supabase anon key (can also be provided via config file)",
        )

    subparsers.add_parser("status", help="Show enrollment and agent status")

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
        logs_parser.add_argument("--lines", type=int, default=50, help="Number of log lines to show")
        service_subparsers.add_parser("cleanup", help="Clean up Windows Service data")

    if LINUX_SERVICE_AVAILABLE:
        linux_parser = subparsers.add_parser("service", help="Manage Linux systemd Service")
        linux_subparsers = linux_parser.add_subparsers(
            dest="service_action", help="Service actions"
        )
        linux_install = linux_subparsers.add_parser("install", help="Install systemd service unit")
        linux_install.add_argument("--python-exe", type=str, help="Python executable path")
        linux_install.add_argument("--user", action="store_true")
        linux_subparsers.add_parser("uninstall", help="Remove the systemd unit file")
        linux_subparsers.add_parser("start", help="Start the systemd service")
        linux_subparsers.add_parser("stop", help="Stop the systemd service")
        linux_subparsers.add_parser("restart", help="Restart the systemd service")
        linux_subparsers.add_parser("status", help="Show the systemd service status")
        logs_linux = linux_subparsers.add_parser("logs", help="Show service journal logs")
        logs_linux.add_argument("--lines", type=int, default=50)
        linux_subparsers.add_parser("cleanup", help="Clean up service data directories")

    args = parser.parse_args()

    if args.command == "status":
        _show_status()
        return

    if args.command == "service" and is_windows() and WINDOWS_SERVICE_AVAILABLE:
        _dispatch_windows_service(args)
        return

    if args.command == "service" and is_linux() and LINUX_SERVICE_AVAILABLE:
        _dispatch_linux_service(args)
        return

    if args.command == "bootstrap":
        if not _BOOTSTRAP_AVAILABLE:
            print("Bootstrap command not available (edgepulse.bootstrap_cli not found)")
            sys.exit(1)
        sys.exit(run_bootstrap(args))

    if args.command == "enroll":
        if not _ENROLLMENT_AVAILABLE:
            print("Enrollment command not available")
            sys.exit(1)
        sys.exit(_run_enrollment(args))

    if args.command is None or args.command == "run":
        _run_agent(args)


def _show_status():
    print("\nEdgePulse Agent — Status")
    print("=" * 50)

    try:
        from edgepulse.auth.credentials import CredentialManager
        cm = CredentialManager()
        creds = cm.get_device_credentials()
        if creds and creds.device_id and creds.api_key:
            print(f"  Enrollment  : ✓ Enrolled")
            print(f"  Device ID   : {creds.device_id}")
            url = creds.supabase_url or "(stored in credentials)"
            print(f"  Backend URL : {url}")
        else:
            print("  Enrollment  : ✗ Not enrolled")
            cli_path = PathManager().base_dir / "venv" / "bin" / "edge-agent"
            print(f"  Run: sudo {cli_path} enroll")
    except Exception as e:
        print(f"  Enrollment  : ✗ Error reading credentials: {e}")

    from edgepulse.utils.path_manager import PathManager
    pm = PathManager()
    model_path = pm.models_dir / "edgepulse_primary_isolation_forest.joblib"
    if model_path.exists():
        print(f"  ML Model    : ✓ Present ({model_path})")
    else:
        print(f"  ML Model    : ✗ Not bootstrapped")
        python_path = pm.base_dir / "venv" / "bin" / "python"
        bootstrap_path = pm.base_dir / "bootstrap_model.py"
        print(f"  Run: sudo {python_path} {bootstrap_path}")

    enroll_cfg = PathManager().get_config_path().parent / "enrollment.json"
    if enroll_cfg.exists():
        try:
            import json
            data = json.loads(enroll_cfg.read_text())
            if "YOUR_PROJECT" in data.get("supabase_url", "") or \
               "YOUR_ENROLLMENT_TOKEN" in data.get("enrollment_token", ""):
                print(f"  Enroll cfg  : ⚠  Placeholder values — edit before enrolling")
                print(f"  File        : {enroll_cfg}")
            else:
                print(f"  Enroll cfg  : ✓ Configured ({enroll_cfg})")
        except Exception:
            print(f"  Enroll cfg  : ✓ Present ({enroll_cfg})")
    else:
        print(f"  Enroll cfg  : — Not present (create at {enroll_cfg} to enroll)")

    print()


def _run_enrollment(args) -> int:
    from edgepulse.auth.credentials import CredentialManager
    from edgepulse.auth.enrollment import DeviceEnrollmentClient

    credential_manager = CredentialManager()
    enrollment_client = DeviceEnrollmentClient(credential_manager)

    config = None

    if hasattr(args, "config") and args.config:
        from edgepulse.auth.enrollment import EnrollmentConfig
        import json as _json
        try:
            data = _json.loads(Path(args.config).read_text())
            config = EnrollmentConfig(
                supabase_url=data["supabase_url"],
                enrollment_token=data["enrollment_token"],
                supabase_anon_key=data.get("supabase_anon_key"),
                device_hostname=data.get("device_hostname"),
                device_os=data.get("device_os"),
                agent_version=data.get("agent_version"),
                timeout_seconds=data.get("timeout_seconds", 30),
            )
        except Exception as e:
            print(f"Error reading config file {args.config}: {e}")

    if config is None:
        config = enrollment_client.read_enrollment_config()

    if config is None and hasattr(args, "token") and args.token \
            and hasattr(args, "supabase_url") and args.supabase_url:
        from edgepulse.auth.enrollment import EnrollmentConfig
        anon_key = getattr(args, "anon_key", None)
        config = EnrollmentConfig(
            supabase_url=args.supabase_url,
            enrollment_token=args.token,
            supabase_anon_key=anon_key,
        )

    if not config:
        from edgepulse.utils.path_manager import PathManager
        pm = PathManager()
        enroll_path = pm.get_config_path().parent / "enrollment.json"
        cli_path = pm.base_dir / "venv" / "bin" / "edge-agent"
        print()
        print("Error: No enrollment configuration found.")
        print()
        print(f"Create {enroll_path} with your project details:")
        print()
        print(f'  sudo nano {enroll_path}')
        print()
        print("  Contents:")
        print('  {')
        print('    "supabase_url": "https://YOUR_PROJECT_REF.supabase.co",')
        print('    "enrollment_token": "YOUR_ENROLLMENT_TOKEN",')
        print('    "supabase_anon_key": "YOUR_ANON_KEY"')
        print('  }')
        print()
        print(f"Then run:  sudo {cli_path} enroll")
        print()
        return 1

    # Validate no placeholders
    if "YOUR_PROJECT" in (config.supabase_url or "") or \
       "YOUR_ENROLLMENT_TOKEN" in (config.enrollment_token or ""):
        from edgepulse.utils.path_manager import PathManager
        enroll_path = PathManager().get_config_path().parent / "enrollment.json"
        print()
        print("Error: enrollment.json still contains placeholder values.")
        print(f"  Edit: sudo nano {enroll_path}")
        print("  Replace YOUR_PROJECT_REF with your actual Supabase project reference.")
        print("  Replace YOUR_ENROLLMENT_TOKEN with the token from your EdgePulse dashboard.")
        print()
        return 1

    async def do_enrollment():
        result = await enrollment_client.enroll_device(config)
        if result:
            if enrollment_client.complete_enrollment(result, supabase_url=config.supabase_url, supabase_anon_key=config.supabase_anon_key):
                print()
                print("✓ Device enrolled successfully!")
                print(f"  Device ID : {result.device_id}")
                print(f"  API Key   : {result.api_key[:10]}...")
                print()
                print("Next steps:")
                if is_windows():
                    print("  1. Start the agent service via Windows Service Manager")
                    print("       net start EdgePulseAgent")
                    print()
                    print("  2. Check service status:")
                    print("       net start | findstr EdgePulseAgent")
                    print()
                    print("  3. View logs in C:\\ProgramData\\EdgePulse\\logs\\")
                else:
                    print("  1. Start the agent service:")
                    print("       sudo systemctl start edgepulse-agent")
                    print()
                    print("  2. Check service status:")
                    print("       sudo systemctl status edgepulse-agent")
                    print()
                    print("  3. View live logs:")
                    print("       sudo journalctl -u edgepulse-agent -f")
                print()
                return 0
            else:
                print("Error: Enrollment succeeded but credentials could not be saved.")
                return 1
        else:
            print()
            print("✗ Enrollment failed. Common causes:")
            print("  • Invalid or expired enrollment token")
            print("  • Wrong Supabase URL")
            print("  • Network connectivity issues")
            print()
            if is_windows():
                print("  Check logs in C:\\ProgramData\\EdgePulse\\logs\\")
            else:
                print("  Check: sudo journalctl -u edgepulse-agent -n 50")
            print()
            return 1

    return asyncio.run(do_enrollment())


def _run_agent(args):
    enrolled = _load_credentials_into_env()

    try:
        config_path = (
            Path(args.config)
            if hasattr(args, "config") and args.config
            else None
        )

        settings = AgentSettings(config_path=config_path)

        if not enrolled and not settings.should_enable_sync():
            import logging
            logging.getLogger(__name__).warning(
                "Device is not enrolled. Running in local-only mode. "
                "Sync and cloud features are disabled. "
                "Run 'edge-agent enroll' to enroll this device."
            )
            print()
            from edgepulse.utils.path_manager import PathManager
            cli_path = PathManager().base_dir / "venv" / "bin" / "edge-agent"
            print("⚠  Device not enrolled — running in local-only mode.")
            print("   Anomaly detection is active but events will NOT be synced to the cloud.")
            print(f"   To enroll: sudo {cli_path} enroll")
            print()

        agent = EdgePulseAgent(settings=settings)

        if hasattr(args, "verbose") and args.verbose:
            import logging
            logging.getLogger().setLevel(logging.DEBUG)

        asyncio.run(agent.run_forever())

    except ConfigurationError as exc:
        print(f"Configuration Error: {exc}")
        msg = str(exc).lower()
        if "supabase" in msg or "sync" in msg or "enrolled" in msg or "credential" in msg:
            sys.exit(0)
        sys.exit(1)
    except EdgePulseError as exc:
        print(f"EdgePulse Error: {exc}")
        sys.exit(1)
    except Exception as exc:
        print(f"Unexpected Error: {exc}")
        sys.exit(1)


def _dispatch_windows_service(args):
    from edgepulse.platform.windows.windows_service.installer import ServiceInstaller
    _dispatch_service_action(ServiceInstaller(), args)


def _dispatch_linux_service(args):
    from edgepulse.platform.linux.linux_service.installer import ServiceInstaller
    _dispatch_service_action(ServiceInstaller(), args)


def _dispatch_service_action(installer, args):
    action = args.service_action
    dispatch = {
        "install": lambda: installer.install_service(getattr(args, "python_exe", None)),
        "uninstall": installer.uninstall_service,
        "start": installer.start_service,
        "stop": installer.stop_service,
        "status": lambda: print(f"Service status: {installer.get_service_status()}"),
        "logs": lambda: print(installer.get_service_logs(args.lines)),
        "cleanup": installer.cleanup_service_data,
    }
    if action == "restart":
        result = installer.stop_service()
        if result is not False:
            result = installer.start_service()
    else:
        fn = dispatch.get(action)
        if not fn:
            print(f"Unknown service action: {action}")
            sys.exit(1)
        result = fn()
    if result is False:
        sys.exit(1)


if __name__ == "__main__":
    main()