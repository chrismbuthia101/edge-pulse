from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import sys
from pathlib import Path
from typing import Callable, Optional

from edgepulse.auth.credentials import CredentialManager, load_credentials_into_env
from edgepulse.config.settings import AgentSettings
from edgepulse.agent.agent import EdgePulseAgent
from edgepulse.platform import is_linux, is_windows, ServiceManager
from edgepulse.utils.log_handler import ConfigurationError, EdgePulseError
from edgepulse.utils.path_manager import PathManager

CommandHandler = Callable[[argparse.Namespace], int]


def _init_environment() -> None:
    try:
        from dotenv import load_dotenv

        env_path = Path(__file__).parent.parent.parent / ".env"
        if env_path.exists():
            load_dotenv(env_path)
            os.chmod(env_path, 0o600)
        else:
            load_dotenv()
    except ImportError:
        pass


def _get_service_installer() -> Optional[ServiceManager]:
    if is_windows():
        try:
            from edgepulse.platform.windows.windows_service.installer import (
                ServiceInstaller as WindowsServiceInstaller,
            )

            return WindowsServiceInstaller()
        except ImportError:
            return None
    if is_linux():
        try:
            from edgepulse.platform.linux.linux_service.installer import (
                ServiceInstaller as LinuxServiceInstaller,
            )

            return LinuxServiceInstaller()
        except ImportError:
            return None
    return None


def _is_enrollment_available() -> bool:
    try:
        from edgepulse.auth.enrollment import DeviceEnrollmentClient  # noqa: F401

        return True
    except ImportError:
        return False


def _print_next_steps() -> None:
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


def _print_enrollment_failure_help() -> None:
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


def _build_run_parser(subparsers: argparse._SubParsersAction) -> None:
    p = subparsers.add_parser("run", help="Run the EdgePulse agent")
    p.add_argument("--config", type=str, help="Path to configuration file")
    p.add_argument("--daemon", action="store_true", help="Run as daemon")
    p.add_argument("--verbose", action="store_true", help="Enable verbose logging")


def _build_enroll_parser(subparsers: argparse._SubParsersAction) -> None:
    p = subparsers.add_parser(
        "enroll",
        help="Enroll this device with the EdgePulse backend",
        description="Register this device with the EdgePulse cloud backend "
        "using an enrollment token.",
    )
    p.add_argument(
        "token",
        type=str,
        nargs="?",
        help="Enrollment token (or place in enrollment.json for automated deployment)",
    )
    p.add_argument(
        "--supabase-url",
        type=str,
        help=argparse.SUPPRESS,
    )


def _build_service_parser(subparsers: argparse._SubParsersAction) -> None:
    p = subparsers.add_parser("service", help="Manage the EdgePulse system service")
    subs = p.add_subparsers(dest="service_action", help="Service actions")

    install = subs.add_parser("install", help="Install the service")
    install.add_argument("--python-exe", type=str, help="Python executable path")
    install.add_argument("--user", action="store_true")

    subs.add_parser("uninstall", help="Uninstall the service")
    subs.add_parser("start", help="Start the service")
    subs.add_parser("stop", help="Stop the service")
    subs.add_parser("restart", help="Restart the service")
    subs.add_parser("status", help="Show service status")

    logs = subs.add_parser("logs", help="Show service logs")
    logs.add_argument("--lines", type=int, default=50, help="Number of log lines to show")

    subs.add_parser("cleanup", help="Clean up service data")


def _build_status_parser(subparsers: argparse._SubParsersAction) -> None:
    subparsers.add_parser("status", help="Show enrollment and agent status")


def _handle_run(args: argparse.Namespace) -> int:
    enrolled = load_credentials_into_env()
    config_path = Path(args.config) if getattr(args, "config", None) else None

    try:
        settings = AgentSettings.model_validate({"config_path": config_path})

        if not enrolled and not settings.should_enable_sync():
            logging.getLogger(__name__).warning(
                "Device is not enrolled. Running in local-only mode. "
                "Sync and cloud features are disabled. "
                "Run 'edge-agent enroll' to enroll this device.",
            )
            print()
            print("⚠  Device not enrolled — running in local-only mode.")
            print("   Anomaly detection is active but events will NOT be synced to the cloud.")
            print("   To enroll: sudo /opt/edgepulse/bin/edge-agent enroll")
            print()

        agent = EdgePulseAgent(settings=settings)

        if getattr(args, "verbose", False):
            logging.getLogger().setLevel(logging.DEBUG)

        asyncio.run(agent.run_forever())
        return 0

    except ConfigurationError as exc:
        print(f"Configuration Error: {exc}")
        msg = str(exc).lower()
        return 0 if any(kw in msg for kw in ("supabase", "sync", "enrolled", "credential")) else 1
    except EdgePulseError as exc:
        print(f"EdgePulse Error: {exc}")
        return 1
    except Exception as exc:
        print(f"Unexpected Error: {exc}")
        return 1


def _handle_enroll(args: argparse.Namespace) -> int:
    from edgepulse.auth.enrollment import DeviceEnrollmentClient, EnrollmentConfig
    from edgepulse.config.sealed_config import get_supabase_url, set_supabase_url_override

    credential_manager = CredentialManager()
    enrollment_client = DeviceEnrollmentClient(credential_manager)

    supabase_url = get_supabase_url()

    if args.supabase_url:
        supabase_url = args.supabase_url
        set_supabase_url_override(supabase_url)

    config: Optional[EnrollmentConfig] = None

    config = enrollment_client.read_enrollment_config()

    if config is None and args.token:
        config = EnrollmentConfig(
            supabase_url=supabase_url,
            enrollment_token=args.token,
        )

    if not config:
        print()
        print("Error: No enrollment configuration found.")
        print()
        print("Usage:")
        print("  edge-agent enroll <ENROLLMENT_TOKEN>")
        print()
        print("Or for automated deployment, create /etc/edgepulse/enrollment.json")
        print("with your enrollment token and run the command.")
        print()
        return 1

    if "YOUR_PROJECT" in (config.supabase_url or "") or "YOUR_ENROLLMENT_TOKEN" in (
        config.enrollment_token or ""
    ):
        print()
        print("Error: configuration still contains placeholder values.")
        print("  Replace with actual values from your EdgePulse dashboard.")
        print()
        return 1

    if not config.supabase_url:
        print()
        print("Error: Supabase URL is required but not configured.")
        print("  Either bake it at build time or pass --supabase-url.")
        print()
        return 1

    async def _do_enroll():
        return await enrollment_client.enroll_device(config)

    enroll_result = asyncio.run(_do_enroll())

    if not enroll_result:
        _print_enrollment_failure_help()
        return 1

    if enrollment_client.complete_enrollment(enroll_result, supabase_url=config.supabase_url):
        print()
        print("✓ Device enrolled successfully!")
        print(f"  Device ID : {enroll_result.device_id}")
        print(f"  API Key   : {enroll_result.api_key[:10]}...")
        print()
        print("Next steps:")
        _print_next_steps()
        print()
        return 0

    print("Error: Enrollment succeeded but credentials could not be saved.")
    return 1


def _handle_status(args: argparse.Namespace) -> int:
    print()
    print("EdgePulse Agent — Status")
    print("=" * 50)

    try:
        creds = CredentialManager().get_device_credentials()
        if creds and creds.device_id and creds.api_key:
            print("  Enrollment  : ✓ Enrolled")
            print(f"  Device ID   : {creds.device_id}")
            url = creds.supabase_url or "(stored in credentials)"
            if url and url.startswith("http"):
                parsed = url.split("/")
                masked = "//".join(parsed[:2]) + "/***"
                print(f"  Backend URL : {masked}")
            else:
                print(f"  Backend URL : {url}")
        else:
            print("  Enrollment  : ✗ Not enrolled")
            print("  Run: sudo /opt/edgepulse/bin/edge-agent enroll")
    except Exception as e:
        print(f"  Enrollment  : ✗ Error reading credentials: {e}")

    pm = PathManager()
    model_path = pm.models_dir / "edgepulse_primary_isolation_forest.joblib"
    if model_path.exists():
        print(f"  ML Model    : ✓ Present ({model_path})")
    else:
        print("  ML Model    : ✗ Not found")

    enroll_cfg = PathManager().get_config_path().parent / "enrollment.json"
    if enroll_cfg.exists():
        try:
            data = json.loads(enroll_cfg.read_text())
            if "YOUR_PROJECT" in data.get(
                "supabase_url", ""
            ) or "YOUR_ENROLLMENT_TOKEN" in data.get("enrollment_token", ""):
                print("  Enroll cfg  : ⚠  Placeholder values — edit before enrolling")
                print(f"  File        : {enroll_cfg}")
            else:
                print(f"  Enroll cfg  : ✓ Configured ({enroll_cfg})")
        except Exception:
            print(f"  Enroll cfg  : ✓ Present ({enroll_cfg})")
    else:
        print("  Enroll cfg  : — Not present")
        print("  Run: sudo edge-agent enroll <TOKEN>")

    print()
    return 0


def _handle_service(args: argparse.Namespace) -> int:
    installer = _get_service_installer()
    if installer is None:
        print("Service management is not available on this platform.")
        return 1

    action = args.service_action
    if action is None:
        print(
            "No service action specified. "
            "Try: install, uninstall, start, stop, restart, status, logs, cleanup",
        )
        return 1

    if action == "install":
        result = installer.install_service(getattr(args, "python_exe", None))
    elif action == "restart":
        result = installer.stop_service()
        if result is not False:
            result = installer.start_service()
    elif action == "status":
        print(f"Service status: {installer.get_service_status()}")
        return 0
    elif action == "logs":
        print(installer.get_service_logs(getattr(args, "lines", 50)))
        return 0
    else:
        fn = {
            "uninstall": installer.uninstall_service,
            "start": installer.start_service,
            "stop": installer.stop_service,
            "cleanup": installer.cleanup_service_data,
        }.get(action)
        if fn is None:
            print(f"Unknown service action: {action}")
            return 1
        result = fn()

    return 1 if result is False else 0


def main() -> int:
    _init_environment()

    parser = argparse.ArgumentParser(description="EdgePulse - Edge Security Monitoring Agent")
    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    _build_run_parser(subparsers)

    if _is_enrollment_available():
        _build_enroll_parser(subparsers)

    _build_status_parser(subparsers)

    if _get_service_installer() is not None:
        _build_service_parser(subparsers)

    args = parser.parse_args()

    if args.command is None or args.command == "run":
        return _handle_run(args)

    dispatch: dict[str, CommandHandler] = {
        "enroll": _handle_enroll,
        "status": _handle_status,
        "service": _handle_service,
    }

    handler = dispatch.get(args.command)
    if handler:
        return handler(args)

    parser.print_help()
    return 1


if __name__ == "__main__":
    sys.exit(main())
