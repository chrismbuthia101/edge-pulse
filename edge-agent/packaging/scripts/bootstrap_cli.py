"""
bootstrap_cli.py
================
Exposes ``edge-agent bootstrap`` as a CLI subcommand so the Windows
NSIS installer and Linux postinst script can call it consistently:
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path


def add_bootstrap_subcommand(subparsers: argparse._SubParsersAction) -> None:
    """Register the `bootstrap` subcommand with the CLI parser."""
    bootstrap_parser = subparsers.add_parser(
        "bootstrap",
        help="Bootstrap the Isolation Forest model (required on first install)",
        description=(
            "Generates a synthetic training dataset and trains the primary "
            "Isolation Forest model.  Must be run once before the agent can "
            "detect anomalies."
        ),
    )
    bootstrap_parser.add_argument(
        "--output-dir",
        default=None,
        help=(
            "Directory to write the model file.  "
            "Defaults to <install>/models/ on Linux "
            "or C:\\ProgramData\\EdgePulse\\models on Windows."
        ),
    )
    bootstrap_parser.add_argument(
        "--n-samples",
        type=int,
        default=2000,
        help="Number of synthetic training samples (default: 2000)",
    )
    bootstrap_parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="Random seed for reproducibility (default: 42)",
    )


def run_bootstrap(args: argparse.Namespace) -> int:
    """
    Execute the bootstrap procedure.

    Returns 0 on success, 1 on failure.
    """
    import platform

    # Resolve output directory
    if args.output_dir:
        output_dir = Path(args.output_dir)
    elif platform.system() == "Windows":
        output_dir = Path("C:/ProgramData/EdgePulse/models")
    else:
        output_dir = Path("/var/lib/edgepulse/models")

    # Fall back to ./models/ if we are running directly from source
    if not output_dir.exists():
        try:
            output_dir.mkdir(parents=True, exist_ok=True)
        except PermissionError:
            output_dir = Path(__file__).parent.parent.parent / "models"
            output_dir.mkdir(parents=True, exist_ok=True)

    try:
        import importlib.util, os

        # Locations to search for bootstrap_model.py
        candidates = [
            Path(sys.executable).parent / "bootstrap_model.py",
            Path(__file__).parent.parent.parent / "bootstrap_model.py",
            Path("/opt/edgepulse/share/edgepulse/bootstrap_model.py"),
        ]

        bootstrap_path = next((p for p in candidates if p.exists()), None)

        if bootstrap_path is None:
            print(
                "ERROR: bootstrap_model.py not found in any of these locations:\n"
                + "\n".join(f"  {p}" for p in candidates),
                file=sys.stderr,
            )
            return 1

        spec = importlib.util.spec_from_file_location("bootstrap_model", bootstrap_path)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)

        # Call main with our args injected
        sys.argv = [
            "bootstrap_model.py",
            "--output-dir", str(output_dir),
            "--n-samples", str(args.n_samples),
            "--seed", str(args.seed),
        ]
        mod.main()
        return 0

    except SystemExit as exc:
        return int(exc.code) if exc.code is not None else 0
    except Exception as exc:
        print(f"Bootstrap failed: {exc}", file=sys.stderr)
        return 1