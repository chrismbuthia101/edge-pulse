#!/usr/bin/env python3
"""Build-time encryptor for EdgePulse sealed configuration.

Usage:
    SUPABASE_URL="https://project.supabase.co" python3 seal_config.py --output _build_vars.py

Reads SUPABASE_URL from environment (set via CI secret).
Must be run from the repo root so it can import sealed_config.
"""

import argparse
import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SRC_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, "..", "..", "src"))
if SRC_DIR not in sys.path:
    sys.path.insert(0, SRC_DIR)

from edgepulse.config.sealed_config import encrypt


def main() -> None:
    parser = argparse.ArgumentParser(description="Encrypt SUPABASE_URL for agent packaging")
    parser.add_argument(
        "--output", "-o",
        type=str,
        help="Output file path (default: stdout)",
    )
    args = parser.parse_args()

    supabase_url = os.environ.get("SUPABASE_URL", "")
    if not supabase_url:
        print("Error: SUPABASE_URL environment variable is required.", file=sys.stderr)
        sys.exit(1)

    sealed = encrypt(supabase_url)

    content = (
        "# Auto-generated at package build time\n"
        "# Contains AES-256-GCM encrypted configuration.\n"
        f'SEALED_CONFIG: str = {sealed!r}\n'
    )

    if args.output:
        with open(args.output, "w") as f:
            f.write(content)
        print(f"Wrote {args.output}", file=sys.stderr)
    else:
        sys.stdout.write(content)


if __name__ == "__main__":
    main()
