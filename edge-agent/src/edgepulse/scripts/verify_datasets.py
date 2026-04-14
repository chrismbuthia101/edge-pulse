#!/usr/bin/env python3
"""
verify_datasets.py
==================
Run this BEFORE train_models.py to confirm every dataset is in the
expected location and has files the training script can actually read.

Usage:
    python verify_datasets.py --datasets-dir ~/Datasets

Exit code 0 = all checks passed (or only warnings).
Exit code 1 = one or more critical errors found.
"""

import argparse
import sys
from pathlib import Path


GREEN  = "\033[92m"
YELLOW = "\033[93m"
RED    = "\033[91m"
RESET  = "\033[0m"
BOLD   = "\033[1m"


def ok(msg: str)   -> None: print(f"  {GREEN}✓{RESET}  {msg}")
def warn(msg: str) -> None: print(f"  {YELLOW}⚠{RESET}  {msg}")
def err(msg: str)  -> None: print(f"  {RED}✗{RESET}  {msg}")
def hdr(msg: str)  -> None: print(f"\n{BOLD}{msg}{RESET}")


errors = 0


def check(condition: bool, ok_msg: str, err_msg: str, critical: bool = True) -> bool:
    global errors
    if condition:
        ok(ok_msg)
        return True
    else:
        if critical:
            err(err_msg)
            errors += 1
        else:
            warn(err_msg)
        return False


def count_files(path: Path, pattern: str) -> int:
    return sum(1 for _ in path.rglob(pattern))


def verify(datasets_dir: Path) -> None:
    global errors

    if not datasets_dir.exists():
        err(f"datasets-dir does not exist: {datasets_dir}")
        errors += 1
        return

    ok(f"datasets-dir found: {datasets_dir}")

    # ── 1. UNSW-NB15 ─────────────────────────────────────────────────────────
    hdr("1. UNSW-NB15")
    unsw_dir = datasets_dir / "UNSW_NB15"
    if check(unsw_dir.exists(), f"UNSW_NB15/ found", f"UNSW_NB15/ not found at {unsw_dir}"):
        parquets = list(unsw_dir.glob("*.parquet"))
        check(len(parquets) >= 2,
              f"{len(parquets)} parquet file(s) found",
              f"Expected 2 parquet files, found {len(parquets)}")
        for p in parquets:
            ok(f"  {p.name}  ({p.stat().st_size // 1024 // 1024} MB)")

    # ── 2. CSE-CIC-IDS2018 ────────────────────────────────────────────────────
    hdr("2. CSE-CIC-IDS2018")
    cic_candidates = [
        datasets_dir / "CSE-CIC-IDS2018" / "CSE-CIC-IDS2018.csv",
        datasets_dir / "CSE-CIC-IDS2018.csv",
    ]
    cic_found = next((p for p in cic_candidates if p.exists()), None)
    if cic_found:
        ok(f"CSV found: {cic_found.relative_to(datasets_dir)}")
        ok(f"  size: {cic_found.stat().st_size // 1024 // 1024} MB")
    else:
        err("CSE-CIC-IDS2018.csv not found. Tried:")
        for p in cic_candidates:
            err(f"  {p.relative_to(datasets_dir)}")
        errors += 1

    # ── 3. CERT r4.2 ─────────────────────────────────────────────────────────
    hdr("3. CERT Insider Threat r4.2")
    cert_dir = datasets_dir / "CERT Insider Threat r4.2"
    if check(cert_dir.exists(), "CERT directory found",
             f"CERT directory not found: {cert_dir}"):
        required_csvs = ["logon.csv", "file.csv", "http.csv", "email.csv"]
        for csv in required_csvs:
            p = cert_dir / csv
            if p.exists():
                ok(f"{csv}  ({p.stat().st_size // 1024} KB)")
            else:
                warn(f"{csv} missing — this source will be skipped", )
        device = cert_dir / "device.csv"
        if device.exists():
            ok(f"device.csv found (not used in training)")

    # ── 4. ADFA-LD ────────────────────────────────────────────────────────────
    hdr("4. ADFA-LD  (Linux syscall traces)")
    adfa_ld_dir = datasets_dir / "ADFA-LD"
    if check(adfa_ld_dir.exists(), "ADFA-LD/ found",
             f"ADFA-LD/ not found at {adfa_ld_dir}"):
        train_dir = adfa_ld_dir / "Training_Data_Master"
        attack_dir = adfa_ld_dir / "Attack_Data_Master"

        if check(train_dir.exists(), "Training_Data_Master/ found",
                 f"Training_Data_Master/ not found"):
            n = count_files(train_dir, "*.txt")
            check(n > 0, f"{n} .txt trace files in Training_Data_Master/",
                  "No .txt files in Training_Data_Master/ — wrong extension?")

        if attack_dir.exists():
            subdirs = [d for d in attack_dir.iterdir() if d.is_dir()]
            n = count_files(attack_dir, "*.txt")
            ok(f"Attack_Data_Master/  {len(subdirs)} subdirs  {n} .txt files")
        else:
            warn("Attack_Data_Master/ not found — adfa_ld will run as normal-only")

    # ── 5. ADFA-WD  (Windows Full_Process_Traces) ─────────────────────────────
    hdr("5. ADFA-WD / Full_Process_Traces  (Windows syscall traces)")

    # Layout B: root-level Full_Process_Traces
    root_fpt = datasets_dir / "Full_Process_Traces"
    if root_fpt.exists():
        ok(f"Full_Process_Traces/ found at root level")
        train_d = root_fpt / "Full_Trace_Training_Data"
        valid_d = root_fpt / "Full_Trace_Validation_Data"
        attack_d = root_fpt / "Full_Trace_Attack_Data"

        if train_d.exists():
            n = count_files(train_d, "*.GHC")
            check(n > 0, f"Full_Trace_Training_Data/  {n} .GHC files",
                  "No .GHC files in Full_Trace_Training_Data/")
        else:
            err("Full_Trace_Training_Data/ not found")
            errors += 1

        if valid_d.exists():
            n = count_files(valid_d, "*.GHC")
            ok(f"Full_Trace_Validation_Data/  {n} .GHC files")
        else:
            warn("Full_Trace_Validation_Data/ not found (optional)")

        if attack_d.exists():
            subdirs = [d for d in attack_d.iterdir() if d.is_dir()]
            n = count_files(attack_d, "*.GHC")
            ok(f"Full_Trace_Attack_Data/  {len(subdirs)} subdirs  {n} .GHC files")
        else:
            warn("Full_Trace_Attack_Data/ not found — adfa_wd will run as normal-only")
    else:
        # Layout A: ADFA-WD-SAA_Master
        saa_dir = datasets_dir / "ADFA-WD-SAA_Master"
        if saa_dir.exists():
            ok(f"ADFA-WD-SAA_Master/ found")
            fpt = saa_dir / "Full_Process_Traces"
            if fpt.exists():
                n = count_files(fpt, "*.GHC")
                if n > 0:
                    ok(f"  Full_Process_Traces/  {n} .GHC files")
                else:
                    warn("  Full_Process_Traces/ exists but contains no .GHC files")
                    warn("  The S1-S4 scaffold may contain files without extension")
                    warn("  Listing first 5 files found:")
                    for i, f in enumerate(fpt.rglob("*")):
                        if f.is_file() and i < 5:
                            warn(f"    {f.relative_to(fpt)}")
            else:
                warn("ADFA-WD-SAA_Master/Full_Process_Traces/ not found")
        else:
            warn("Neither Full_Process_Traces/ nor ADFA-WD-SAA_Master/ found")
            warn("adfa_wd will be skipped during training")

    # ── 6. DAPT2020 ───────────────────────────────────────────────────────────
    hdr("6. DAPT2020")
    dapt_dir = datasets_dir / "DAPT2020"
    if check(dapt_dir.exists(), "DAPT2020/ found",
             f"DAPT2020/ not found at {dapt_dir}"):
        csvs = list(dapt_dir.glob("*.csv"))
        check(len(csvs) >= 10,
              f"{len(csvs)} CSV files found",
              f"Expected ~10 CSV files, found {len(csvs)}")

        normal_files = [f for f in csvs if "pvt" not in f.stem.lower()]
        attack_files = [f for f in csvs if "pvt" in f.stem.lower()]
        ok(f"  Normal files (no 'pvt' in name): {len(normal_files)}")
        ok(f"  Attack files ('pvt' in name):     {len(attack_files)}")

        if not attack_files:
            warn("No attack files found (expected files with 'pvt' in the name)")
            warn("Training will use DAPT as normal-only data")

    # ── Summary ───────────────────────────────────────────────────────────────
    print()
    print("=" * 60)
    if errors == 0:
        print(f"{GREEN}{BOLD}All checks passed.{RESET} Ready to train.")
        print()
        print("Suggested smoke-test command:")
        print(f"  python src/edgepulse/scripts/train_models.py \\")
        print(f"      --datasets-dir {datasets_dir} \\")
        print(f"      --output-dir edge-agent/src/models \\")
        print(f"      --max-rows 5000 \\")
        print(f"      --datasets unsw cert dapt \\")
        print(f"      --n-estimators 50")
        print()
        print("Full training command:")
        print(f"  python src/edgepulse/scripts/train_models.py \\")
        print(f"      --datasets-dir {datasets_dir} \\")
        print(f"      --output-dir edge-agent/src/models \\")
        print(f"      --max-rows 200000 \\")
        print(f"      --datasets unsw cic cert adfa_ld adfa_wd dapt \\")
        print(f"      --n-estimators 200")
    else:
        print(f"{RED}{BOLD}{errors} error(s) found.{RESET} Fix them before running train_models.py.")
    print("=" * 60)


def main() -> None:
    parser = argparse.ArgumentParser(description="Verify dataset layout before training")
    parser.add_argument(
        "--datasets-dir", type=Path, required=True,
        help="Root directory containing all dataset folders",
    )
    args = parser.parse_args()
    verify(args.datasets_dir.expanduser().resolve())
    sys.exit(0 if errors == 0 else 1)


if __name__ == "__main__":
    main()