#!/usr/bin/env python3
"""
EdgePulse Model Training Script
================================
Trains the primary Isolation Forest anomaly detection model from real security
datasets and writes the result in the exact format expected by
IsolationForestDetector.load_model().

Supported datasets (pass any subset via --datasets):
  unsw      UNSW_NB15         (parquet, network flows, labelled)
  cic       CSE-CIC-IDS2018   (csv, network flows, labelled)
  cert      CERT r4.2         (csv, insider-threat behaviour, no attack labels)
  adfa_ld   ADFA-LD           (txt syscall traces, Linux, labelled)
  adfa_wd   ADFA-WD-SAA       (Windows Full_Process_Traces, labelled)
  dapt      DAPT2020          (csv pcap flows, labelled via filename)

Expected directory layout under --datasets-dir:
  <datasets-dir>/
  ├── UNSW_NB15/
  │   ├── UNSW_NB15_training-set.parquet
  │   └── UNSW_NB15_testing-set.parquet
  ├── CSE-CIC-IDS2018/
  │   └── CSE-CIC-IDS2018.csv
  ├── CERT Insider Threat r4.2/
  │   ├── logon.csv  email.csv  file.csv  http.csv  device.csv
  │   └── LDAP/                     (monthly LDAP dumps)
  ├── ADFA-LD/
  │   ├── Training_Data_Master/   (833 *.txt normal traces)
  │   ├── Attack_Data_Master/     (60 subdirs with attack traces)
  │   └── Validation_Data_Master/ (4372 *.txt traces)
  ├── ADFA-WD-SAA_Master/
  │   └── Full_Process_Traces/
  │       └── Full_Process_Traces/
  │           ├── Full_Trace_Training_Data/  (355 *.GHC normal traces)
  │           ├── Full_Trace_Attack_Data/    (240 subdirs with *.GHC attack traces)
  │           └── Full_Trace_Validation_Data/ (*.GHC traces)
  └── DAPT2020/
      └── *.pcap_Flow.csv                         (10 files)

  Training Split Guidelines:
  ─────────────────────────────────────────────────────────────────────
  Dataset      Train  Test  Justification
  ─────────────────────────────────────────────────────────────────────
  UNSW-NB15   80%    20%   Pre-split provided (train parquet + test parquet)
  CIC-IDS2018 80%    20%   Large dataset (~2M rows), stratified
  CERT        70%    30%   No attack labels - treat all as normal
  DAPT2020    80%    20%   Combine 10 files
  ADFA-LD     80%    20%   Training_Data_Master normal only
  ADFA-WD     80%    20%   Full_Trace_Training_Data normal only
  ─────────────────────────────────────────────────────────────────────
  Note: For Isolation Forest training, use NORMAL samples only.
  Attack samples are for evaluation only.

Usage
-----
  # Smoke test — fast, catches path and format errors
  python train_models.py \
      --datasets-dir ~/Datasets \
      --output-dir src/models \
      --max-rows 5000 \
      --datasets unsw cert dapt \
      --n-estimators 50

  # Full run — all datasets
  python train_models.py \
      --datasets-dir ~/Datasets \
      --output-dir src/models \
      --datasets unsw cic cert adfa_ld adfa_wd dapt \
      --n-estimators 200

Requirements
------------
  pip install scikit-learn pandas numpy joblib pyarrow shap
"""

from __future__ import annotations

import argparse
import hashlib
import logging
import math
import sys
from collections import Counter
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.metrics import average_precision_score, roc_auc_score
from sklearn.preprocessing import StandardScaler

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("train")

# ---------------------------------------------------------------------------
# Canonical feature schema — must stay in sync with feature_extractor.py
# ---------------------------------------------------------------------------

FEATURE_SCHEMA: List[str] = [
    # CPU 1-min (5)
    "cpu_mean_1min", "cpu_std_1min", "cpu_max_1min",
    "cpu_rate_change_1min", "cpu_core_imbalance_1min",
    # CPU 5-min (5)
    "cpu_mean_5min", "cpu_std_5min", "cpu_max_5min",
    "cpu_rate_change_5min", "cpu_core_imbalance_5min",
    # Memory 1-min (4)
    "memory_growth_rate_1min", "memory_variance_1min",
    "memory_spike_1min", "memory_cpu_ratio_1min",
    # Memory 5-min (3)
    "memory_growth_rate_5min", "memory_variance_5min",
    "memory_cpu_ratio_5min",
    # Disk 1-min (3)
    "disk_write_burst_1min", "disk_io_spike_1min",
    "disk_write_read_ratio_1min",
    # Network 1-min (6)
    "network_entropy_1min", "network_unusual_ports_1min",
    "network_burst_pattern_1min", "network_error_rate_1min",
    "network_drop_rate_1min", "network_send_recv_ratio_1min",
    # Process 1-min (7)
    "process_spawn_frequency_1min", "process_unique_count_1min",
    "process_rare_executions_1min", "process_cpu_gini_1min",
    "process_admin_ratio_1min", "process_no_exe_path_ratio_1min",
    "process_long_cmdline_ratio_1min",
    # Temporal (3)
    "temporal_hour_sin", "temporal_hour_cos", "temporal_is_weekend",
]

SCHEMA_LEN = len(FEATURE_SCHEMA)   # 36
FEATURE_DIM = 50                   # padded dimension IsolationForestDetector expects

PADDED_NAMES: List[str] = FEATURE_SCHEMA + [
    f"padding_{i}" for i in range(FEATURE_DIM - SCHEMA_LEN)
]

# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def _empty_row() -> Dict[str, float]:
    return {f: 0.0 for f in FEATURE_SCHEMA}


def _col(df: pd.DataFrame, *names: str, default: float = 0.0) -> pd.Series:
    """Return first matching column as float, or a constant series."""
    for n in names:
        if n in df.columns:
            return pd.to_numeric(df[n], errors="coerce").fillna(default)
    return pd.Series(default, index=df.index, dtype=float)


def _shannon_entropy(series: pd.Series) -> float:
    counts = series.value_counts(normalize=True)
    if len(counts) <= 1:
        return 0.0
    return float(-(counts * np.log2(counts + 1e-12)).sum())


def _gini(values: np.ndarray) -> float:
    if len(values) < 2:
        return 0.0
    v = np.sort(np.abs(values))
    n = len(v)
    total = v.sum()
    if total == 0:
        return 0.0
    return float((2 * np.dot(np.arange(1, n + 1), v) / (n * total)) - (n + 1) / n)


def _to_feature_matrix(rows: List[Dict[str, float]]) -> np.ndarray:
    mat = np.zeros((len(rows), SCHEMA_LEN), dtype=np.float32)
    for i, row in enumerate(rows):
        for j, name in enumerate(FEATURE_SCHEMA):
            mat[i, j] = float(row.get(name, 0.0))
    return mat


def _pad_to_50(arr: np.ndarray) -> np.ndarray:
    n, c = arr.shape
    if c == FEATURE_DIM:
        return arr
    if c < FEATURE_DIM:
        return np.hstack([arr, np.zeros((n, FEATURE_DIM - c), dtype=arr.dtype)])
    return arr[:, :FEATURE_DIM]


def _clean(arr: np.ndarray) -> np.ndarray:
    return np.nan_to_num(arr, nan=0.0, posinf=1e6, neginf=-1e6)


# ---------------------------------------------------------------------------
# 1. UNSW-NB15
# ---------------------------------------------------------------------------

def load_unsw_nb15(data_dir: Path, max_rows: Optional[int]) -> Tuple[np.ndarray, np.ndarray]:
    """
    Expects: <data_dir>/UNSW_NB15/*.parquet
    Labels:  column 'label' (0 = normal, 1 = attack) or 'attack_cat' (non-empty = attack)
    """
    parquets = sorted(data_dir.glob("UNSW_NB15/*.parquet"))
    if not parquets:
        raise FileNotFoundError(f"No UNSW-NB15 parquet files found under {data_dir}/UNSW_NB15/")

    frames = []
    for p in parquets:
        df = pd.read_parquet(p)
        if max_rows:
            df = df.sample(min(max_rows, len(df)), random_state=42)
        frames.append(df)
        log.info("  UNSW  %s  rows=%d", p.name, len(df))

    df = pd.concat(frames, ignore_index=True)
    df.columns = df.columns.str.lower().str.strip()

    # Labels
    label_col = next((c for c in ["label", "attack_cat"] if c in df.columns), None)
    if label_col == "attack_cat":
        y = (df[label_col].notna()
             & (df[label_col].astype(str).str.strip() != "")
             & (df[label_col].astype(str).str.lower() != "normal")).astype(int).values
    elif label_col == "label":
        y = pd.to_numeric(df[label_col], errors="coerce").fillna(0).astype(int).values
    else:
        y = np.zeros(len(df), dtype=int)

    sbytes  = _col(df, "sbytes")
    dbytes  = _col(df, "dbytes")
    spkts   = _col(df, "spkts")
    dpkts   = _col(df, "dpkts")
    sloss   = _col(df, "sloss")
    dloss   = _col(df, "dloss")
    dur     = _col(df, "dur").replace(0, 1e-6)
    sjit    = _col(df, "sjit")
    sport   = _col(df, "sport", "src_port")
    dport   = _col(df, "dport", "dsport", "dst_port")

    unusual = ((sport > 1024) | (dport > 1024)).astype(float)
    sjit_mean = sjit.mean() if sjit.mean() > 0 else 1.0

    rows = []
    for i in range(len(df)):
        r = _empty_row()
        r["network_entropy_1min"]         = float(sjit.iloc[i] / sjit_mean)
        r["network_unusual_ports_1min"]   = float(unusual.iloc[i])
        r["network_burst_pattern_1min"]   = float(spkts.iloc[i] / float(dur.iloc[i]))
        r["network_error_rate_1min"]      = float(sloss.iloc[i] / max(spkts.iloc[i], 1))
        r["network_drop_rate_1min"]       = float(dloss.iloc[i] / max(dpkts.iloc[i], 1))
        r["network_send_recv_ratio_1min"] = float((sbytes.iloc[i] + 1) / (dbytes.iloc[i] + 1))
        rows.append(r)

    X = _pad_to_50(_clean(_to_feature_matrix(rows)))
    log.info("  UNSW  final X=%s  anomaly_rate=%.1f%%", X.shape, 100 * y.mean())
    return X, y


# ---------------------------------------------------------------------------
# 2. CSE-CIC-IDS2018
# ---------------------------------------------------------------------------

def load_cic_ids2018(data_dir: Path, max_rows: Optional[int]) -> Tuple[np.ndarray, np.ndarray]:
    """
    Expects: <data_dir>/CSE-CIC-IDS2018/CSE-CIC-IDS2018.csv
    Labels:  column 'label' or 'class', value 'Benign' = normal
    """
    # Support both possible locations
    candidates = [
        data_dir / "CSE-CIC-IDS2018" / "CSE-CIC-IDS2018.csv",
        data_dir / "CSE-CIC-IDS2018.csv",
    ]
    csv_path = next((p for p in candidates if p.exists()), None)
    if csv_path is None:
        raise FileNotFoundError(
            f"CSE-CIC-IDS2018.csv not found. Tried:\n" +
            "\n".join(f"  {p}" for p in candidates)
        )

    log.info("  CIC  reading %s ...", csv_path)
    df = pd.read_csv(csv_path, low_memory=False, nrows=max_rows)
    df.columns = df.columns.str.strip().str.lower().str.replace(" ", "_")
    log.info("  CIC  rows=%d  cols=%d", len(df), df.shape[1])

    label_col = next((c for c in ["label", "class"] if c in df.columns), None)
    y = (df[label_col].astype(str).str.strip().str.lower() != "benign").astype(int).values \
        if label_col else np.zeros(len(df), dtype=int)

    fwd_pkts   = _col(df, "total_fwd_packets", "fwd_packets", "fwd_packet_length_total")
    bwd_pkts   = _col(df, "total_backward_packets", "bwd_packets")
    fwd_bytes  = _col(df, "total_length_of_fwd_packets", "fwd_bytes")
    bwd_bytes  = _col(df, "total_length_of_bwd_packets", "bwd_bytes")
    duration   = _col(df, "flow_duration", "duration").replace(0, 1e-6)
    src_port   = _col(df, "source_port", "src_port")
    dst_port   = _col(df, "destination_port", "dst_port")
    pkt_std    = _col(df, "packet_length_std", "fwd_packet_length_std")
    fwd_iat    = _col(df, "fwd_iat_mean", "fwd_iat_total", "flow_iat_mean")
    bwd_iat    = _col(df, "bwd_iat_mean", "bwd_iat_total")

    pkt_std_mean = pkt_std.mean() if pkt_std.mean() > 0 else 1.0
    fwd_iat_mean = fwd_iat.mean() if fwd_iat.mean() > 0 else 1.0
    bwd_iat_mean = bwd_iat.mean() if bwd_iat.mean() > 0 else 1.0
    unusual = ((src_port > 1024) | (dst_port > 1024)).astype(float)
    total_p = fwd_pkts + bwd_pkts + 1e-9

    rows = []
    for i in range(len(df)):
        r = _empty_row()
        r["network_entropy_1min"]         = float(pkt_std.iloc[i] / pkt_std_mean)
        r["network_unusual_ports_1min"]   = float(unusual.iloc[i])
        r["network_burst_pattern_1min"]   = float(total_p.iloc[i] / float(duration.iloc[i]))
        r["network_error_rate_1min"]      = float(fwd_iat.iloc[i] / fwd_iat_mean)
        r["network_drop_rate_1min"]       = float(bwd_iat.iloc[i] / bwd_iat_mean)
        r["network_send_recv_ratio_1min"] = float((fwd_bytes.iloc[i] + 1) / (bwd_bytes.iloc[i] + 1))
        rows.append(r)

    X = _pad_to_50(_clean(_to_feature_matrix(rows)))
    log.info("  CIC  final X=%s  anomaly_rate=%.1f%%", X.shape, 100 * y.mean())
    return X, y


# ---------------------------------------------------------------------------
# 3. CERT Insider Threat r4.2
# ---------------------------------------------------------------------------

def load_cert(data_dir: Path, max_rows: Optional[int]) -> Tuple[np.ndarray, np.ndarray]:
    """
    Expects: <data_dir>/CERT Insider Threat r4.2/*.csv
    Labels:  none exposed — all treated as normal behaviour.
    """
    cert_dir = data_dir / "CERT Insider Threat r4.2"
    if not cert_dir.exists():
        raise FileNotFoundError(f"CERT directory not found: {cert_dir}")

    def _read(fname: str) -> Optional[pd.DataFrame]:
        p = cert_dir / fname
        if not p.exists():
            log.warning("  CERT  %s not found, skipping", fname)
            return None
        nrows = max_rows if max_rows else None
        df = pd.read_csv(p, low_memory=False, nrows=nrows)
        df.columns = df.columns.str.strip().str.lower()
        if "date" in df.columns:
            df["date"] = pd.to_datetime(df["date"], errors="coerce")
        log.info("  CERT  %s  rows=%d", fname, len(df))
        return df

    logon  = _read("logon.csv")
    file_  = _read("file.csv")
    http   = _read("http.csv")
    email  = _read("email.csv")

    records: List[Dict[str, float]] = []

    if logon is not None and "user" in logon.columns and "date" in logon.columns:
        logon["day"] = logon["date"].dt.date
        for (_, day), g in logon.groupby(["user", "day"]):
            r = _empty_row()
            r["process_spawn_frequency_1min"] = len(g) / 1440.0
            if "date" in g.columns:
                hours = g["date"].dt.hour
                r["process_admin_ratio_1min"] = float(
                    ((hours < 8).sum() + (hours > 18).sum()) / max(len(g), 1)
                )
            dt = pd.Timestamp(str(day))
            hr = dt.hour if hasattr(dt, "hour") else 12.0
            r["temporal_hour_sin"] = math.sin(hr / 24.0 * 2 * math.pi)
            r["temporal_hour_cos"] = math.cos(hr / 24.0 * 2 * math.pi)
            r["temporal_is_weekend"] = float(dt.dayofweek >= 5)
            records.append(r)

    if file_ is not None and "user" in file_.columns and "date" in file_.columns:
        file_["day"] = file_["date"].dt.date
        for (_, day), g in file_.groupby(["user", "day"]):
            r = _empty_row()
            unique_files = g["filename"].nunique() if "filename" in g.columns else len(g)
            r["disk_write_burst_1min"] = unique_files / 1440.0
            r["disk_io_spike_1min"] = float(len(g)) / max(1.0, unique_files)
            if "filename" in g.columns:
                r["process_long_cmdline_ratio_1min"] = float(
                    g["filename"].str.lower().str.endswith((".exe", ".bat", ".ps1")).mean()
                )
            records.append(r)

    if http is not None and "user" in http.columns and "date" in http.columns:
        http["day"] = http["date"].dt.date
        for (_, day), g in http.groupby(["user", "day"]):
            r = _empty_row()
            if "url" in g.columns:
                domains = g["url"].str.extract(r"(?:https?://)?([^/]+)", expand=False)
                r["network_entropy_1min"] = _shannon_entropy(domains.fillna("unknown"))
                r["network_unusual_ports_1min"] = float(min(domains.nunique(), 100)) / 100.0
            r["network_burst_pattern_1min"] = len(g) / 1440.0
            records.append(r)

    if email is not None and "user" in email.columns and "date" in email.columns:
        email["day"] = email["date"].dt.date
        for (_, day), g in email.groupby(["user", "day"]):
            r = _empty_row()
            if "size" in g.columns:
                sizes = pd.to_numeric(g["size"], errors="coerce").fillna(0)
                r["network_send_recv_ratio_1min"] = float(sizes.sum()) / 1e6
                r["disk_write_read_ratio_1min"] = float((sizes > 1e5).mean())
            records.append(r)

    if not records:
        raise ValueError("CERT: no records produced — check CSV paths")

    X = _pad_to_50(_clean(_to_feature_matrix(records)))
    y = np.zeros(len(X), dtype=int)
    log.info("  CERT  final X=%s  (all treated as normal)", X.shape)
    return X, y


# ---------------------------------------------------------------------------
# 4. ADFA-LD  (Linux syscall traces — .txt files)
# ---------------------------------------------------------------------------

# Suspicious Linux syscall numbers (common in privilege escalation / shellcode)
ADFA_LD_SUSPICIOUS = {
    11,   # execve
    2,    # fork
    190,  # vfork
    120,  # clone
    3,    # read (used in shellcode loops)
    5,    # open
    197,  # fstat64
    175,  # sigprocmask (common in exploits)
}

ADFA_LD_PROCESS = {11, 2, 190, 120}


def _parse_syscall_trace(path: Path) -> Optional[np.ndarray]:
    """Read one syscall trace file — space-separated integers, one per line or all on one line."""
    try:
        text = path.read_text(errors="replace").strip()
        ids = np.array(
            [int(x) for x in text.split() if x.strip().lstrip("-").isdigit()],
            dtype=np.int32,
        )
        return ids if len(ids) > 0 else None
    except Exception:
        return None


def _syscall_trace_to_features(syscalls: np.ndarray, suspicious: set, process: set) -> Dict[str, float]:
    r = _empty_row()
    if len(syscalls) == 0:
        return r

    n = len(syscalls)
    counts = Counter(syscalls.tolist())
    unique = len(counts)
    total = n

    proc_calls = sum(counts.get(s, 0) for s in process)
    susp_calls = sum(counts.get(s, 0) for s in suspicious)

    r["process_spawn_frequency_1min"]   = proc_calls / total
    r["process_unique_count_1min"]      = float(unique)
    r["process_rare_executions_1min"]   = sum(1 for c in counts.values() if c == 1) / max(unique, 1)
    r["process_admin_ratio_1min"]       = susp_calls / total
    r["process_no_exe_path_ratio_1min"] = susp_calls / total

    freq_arr = np.array(list(counts.values()), dtype=float)
    r["process_cpu_gini_1min"] = _gini(freq_arr)

    probs = freq_arr / total
    r["network_entropy_1min"] = float(-(probs * np.log2(probs + 1e-12)).sum())

    transitions = int(np.sum(syscalls[1:] != syscalls[:-1]))
    r["network_burst_pattern_1min"] = transitions / max(n, 1)
    return r


def load_adfa_ld(data_dir: Path, max_rows: Optional[int]) -> Tuple[np.ndarray, np.ndarray]:
    """
    Expects: <data_dir>/ADFA-LD/
      Training_Data_Master/   — normal .txt traces
      Attack_Data_Master/     — subdirs containing attack .txt traces
    """
    base = data_dir / "ADFA-LD"
    if not base.exists():
        raise FileNotFoundError(f"ADFA-LD directory not found: {base}")

    train_dir  = base / "Training_Data_Master"
    attack_dir = base / "Attack_Data_Master"

    if not train_dir.exists():
        raise FileNotFoundError(f"ADFA-LD Training_Data_Master not found: {train_dir}")

    limit = max_rows or 50_000

    rows_normal: List[Dict[str, float]] = []
    rows_attack: List[Dict[str, float]] = []

    # Normal traces
    for f in sorted(train_dir.glob("*.txt")):
        if len(rows_normal) >= limit:
            break
        sc = _parse_syscall_trace(f)
        if sc is not None:
            rows_normal.append(_syscall_trace_to_features(sc, ADFA_LD_SUSPICIOUS, ADFA_LD_PROCESS))

    # Attack traces — recurse into subdirs
    if attack_dir.exists():
        for f in sorted(attack_dir.rglob("*.txt")):
            if len(rows_attack) >= limit:
                break
            sc = _parse_syscall_trace(f)
            if sc is not None:
                rows_attack.append(_syscall_trace_to_features(sc, ADFA_LD_SUSPICIOUS, ADFA_LD_PROCESS))

    log.info("  ADFA-LD  normal=%d  attack=%d", len(rows_normal), len(rows_attack))

    if not rows_normal:
        raise ValueError("ADFA-LD: no normal trace files found")

    all_rows = rows_normal + rows_attack
    y = np.array([0] * len(rows_normal) + [1] * len(rows_attack), dtype=int)
    X = _pad_to_50(_clean(_to_feature_matrix(all_rows)))
    log.info("  ADFA-LD  final X=%s  anomaly_rate=%.1f%%", X.shape, 100 * y.mean())
    return X, y


# ---------------------------------------------------------------------------
# 5. ADFA-WD-SAA / Full_Process_Traces (Windows, .GHC files)
# ---------------------------------------------------------------------------

# Suspicious Windows NT syscall IDs
ADFA_WD_SUSPICIOUS = {
    0x0078, 0x0079, 0x007A,  # CreateProcess family
    0x0029, 0x002A, 0x002B,  # Token manipulation
    0x0014, 0x0015,           # Registry writes
    0x0055, 0x0008,           # File create/write
    0x0082, 0x0083, 0x0084,  # Network
}

ADFA_WD_PROCESS = {0x0078, 0x0079, 0x007A, 0x0070, 0x0071}


def _parse_ghc_trace(path: Path) -> Optional[np.ndarray]:
    """Read one .GHC trace file — same format as .txt (space-separated ints)."""
    return _parse_syscall_trace(path)  # same parser works


def load_adfa_wd(data_dir: Path, max_rows: Optional[int]) -> Tuple[np.ndarray, np.ndarray]:
    """
    Supports two layouts:
      Layout A — ADFA-WD-SAA_Master/Full_Process_Traces/Full_Process_Traces/Full_Trace_Training_Data/*.GHC
                 (the current correct location)
      Layout B — Full_Process_Traces/ at datasets-dir root (Full_Trace_Training_Data/*.GHC, etc.)

    Both layouts are tried in order.
    """
    limit = max_rows or 50_000
    rows_normal: List[Dict[str, float]] = []
    rows_attack: List[Dict[str, float]] = []

    # ── Layout A: ADFA-WD-SAA_Master/Full_Process_Traces/Full_Process_Traces (primary data) ───
    saa_base = data_dir / "ADFA-WD-SAA_Master" / "Full_Process_Traces" / "Full_Process_Traces"
    if saa_base.exists():
        log.info("  ADFA-WD  using ADFA-WD-SAA_Master/Full_Process_Traces/Full_Process_Traces/")

        train_dir = saa_base / "Full_Trace_Training_Data"
        valid_dir = saa_base / "Full_Trace_Validation_Data"
        attack_dir = saa_base / "Full_Trace_Attack_Data"

        for d in [train_dir, valid_dir]:
            if d.exists():
                for f in sorted(d.glob("*.GHC")):
                    if len(rows_normal) >= limit:
                        break
                    sc = _parse_ghc_trace(f)
                    if sc is not None:
                        rows_normal.append(
                            _syscall_trace_to_features(sc, ADFA_WD_SUSPICIOUS, ADFA_WD_PROCESS)
                        )

        if attack_dir.exists():
            for subdir in sorted(attack_dir.iterdir()):
                if not subdir.is_dir() or len(rows_attack) >= limit:
                    break
                for f in sorted(subdir.glob("*.GHC")):
                    if len(rows_attack) >= limit:
                        break
                    sc = _parse_ghc_trace(f)
                    if sc is not None:
                        rows_attack.append(
                            _syscall_trace_to_features(sc, ADFA_WD_SUSPICIOUS, ADFA_WD_PROCESS)
                        )

    # ── Layout B: Legacy scaffold layout (S1-S4/S-N-1..10 with .GHC files) ────────
    if not rows_normal:
        saa_fpt_candidates = [
            data_dir / "ADFA-WD-SAA_Master" / "Full_Process_Traces",
            data_dir / "Full_Process_Traces",
        ]
        for base in saa_fpt_candidates:
            if not base.exists():
                continue
            log.info("  ADFA-WD  trying legacy scaffold layout under %s", base)
            for f in sorted(base.rglob("*.GHC")):
                if len(rows_normal) + len(rows_attack) >= limit * 2:
                    break
                sc = _parse_ghc_trace(f)
                if sc is None:
                    continue
                feat = _syscall_trace_to_features(sc, ADFA_WD_SUSPICIOUS, ADFA_WD_PROCESS)
                if "attack" in str(f).lower() or "Attack" in str(f):
                    rows_attack.append(feat)
                else:
                    rows_normal.append(feat)
            if rows_normal:
                break

    log.info("  ADFA-WD  normal=%d  attack=%d", len(rows_normal), len(rows_attack))

    if not rows_normal and not rows_attack:
        raise ValueError(
            "ADFA-WD: no trace files found. Checked:\n"
            f"  {data_dir}/ADFA-WD-SAA_Master/Full_Process_Traces/Full_Process_Traces/Full_Trace_Training_Data/*.GHC\n"
            f"  {data_dir}/Full_Process_Traces/Full_Trace_Training_Data/*.GHC"
        )

    all_rows = rows_normal + rows_attack
    y = np.array([0] * len(rows_normal) + [1] * len(rows_attack), dtype=int)
    X = _pad_to_50(_clean(_to_feature_matrix(all_rows)))
    log.info("  ADFA-WD  final X=%s  anomaly_rate=%.1f%%", X.shape, 100 * y.mean())
    return X, y


# ---------------------------------------------------------------------------
# 6. DAPT2020
# ---------------------------------------------------------------------------

def load_dapt2020(data_dir: Path, max_rows: Optional[int]) -> Tuple[np.ndarray, np.ndarray]:
    """
    Expects: <data_dir>/DAPT2020/*.pcap_Flow.csv
    Labels:  filenames containing 'pvt' = attack (APT C2 traffic).
             Files: enp0s3-monday.pcap_Flow.csv (normal)
                    enp0s3-monday-pvt.pcap_Flow.csv (attack)
                    enp0s3-pvt-tuesday.pcap_Flow.csv (attack)
                    enp0s3-tcpdump-pvt-friday.pcap_Flow.csv (attack)
    """
    dapt_dir = data_dir / "DAPT2020"
    if not dapt_dir.exists():
        raise FileNotFoundError(f"DAPT2020 directory not found: {dapt_dir}")

    csvs = sorted(dapt_dir.glob("*.csv"))
    if not csvs:
        raise FileNotFoundError(f"No CSV files in {dapt_dir}")

    frames = []
    per_file_limit = (max_rows // len(csvs) + 1) if max_rows else None
    for csv_path in csvs:
        df = pd.read_csv(csv_path, low_memory=False, nrows=per_file_limit)
        df["_source_file"] = csv_path.stem
        frames.append(df)
        log.info("  DAPT  %s  rows=%d", csv_path.name, len(df))

    df = pd.concat(frames, ignore_index=True)
    df.columns = df.columns.str.strip().str.lower().str.replace(" ", "_")

    # Label: file stem contains 'pvt' anywhere (handles -pvt-, pvt-, -pvt.)
    y = df["_source_file"].str.contains("pvt", case=False).astype(int).values

    fwd_pkts  = _col(df, "total_fwd_packets", "fwd_packets")
    bwd_pkts  = _col(df, "total_backward_packets", "bwd_packets")
    fwd_bytes = _col(df, "total_length_of_fwd_packets", "fwd_bytes")
    bwd_bytes = _col(df, "total_length_of_bwd_packets", "bwd_bytes")
    duration  = _col(df, "flow_duration", "duration").replace(0, 1e-6)
    dst_port  = _col(df, "destination_port", "dst_port")
    src_port  = _col(df, "source_port", "src_port")
    pkt_size  = _col(df, "average_packet_size", "packet_length_mean")
    fwd_iat_std = _col(df, "fwd_iat_std", "flow_iat_std")

    unusual = ((src_port > 1024) | (dst_port > 1024)).astype(float)
    total_pkts = fwd_pkts + bwd_pkts + 1e-9
    fwd_iat_std_mean = fwd_iat_std.mean() if fwd_iat_std.mean() > 0 else 1.0

    rows = []
    for i in range(len(df)):
        r = _empty_row()
        r["network_entropy_1min"]         = float(fwd_iat_std.iloc[i] / fwd_iat_std_mean)
        r["network_unusual_ports_1min"]   = float(unusual.iloc[i])
        r["network_burst_pattern_1min"]   = float(total_pkts.iloc[i] / float(duration.iloc[i]))
        r["network_error_rate_1min"]      = float(fwd_pkts.iloc[i] / max(total_pkts.iloc[i], 1))
        r["network_drop_rate_1min"]       = float(bwd_pkts.iloc[i] / max(total_pkts.iloc[i], 1))
        r["network_send_recv_ratio_1min"] = float((fwd_bytes.iloc[i] + 1) / (bwd_bytes.iloc[i] + 1))
        r["process_rare_executions_1min"] = float(pkt_size.iloc[i] < 200)
        rows.append(r)

    X = _pad_to_50(_clean(_to_feature_matrix(rows)))
    log.info("  DAPT  final X=%s  anomaly_rate=%.1f%%", X.shape, 100 * y.mean())
    return X, y


# ---------------------------------------------------------------------------
# Training
# ---------------------------------------------------------------------------

def train_isolation_forest(
    X_train: np.ndarray,
    n_estimators: int = 200,
    contamination: str | float = "auto",
    random_state: int = 42,
) -> Tuple[IsolationForest, StandardScaler]:
    log.info("Scaling %d training samples ...", len(X_train))
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X_train)

    log.info("Training Isolation Forest  n_estimators=%d  contamination=%s ...",
             n_estimators, contamination)
    model = IsolationForest(
        n_estimators=n_estimators,
        contamination=contamination,
        max_samples="auto",
        random_state=random_state,
        n_jobs=-1,
    )
    model.fit(X_scaled)
    return model, scaler


def evaluate(
    model: IsolationForest,
    scaler: StandardScaler,
    X_test: np.ndarray,
    y_test: np.ndarray,
    dataset_name: str,
) -> None:
    if y_test.sum() == 0:
        log.info("  %-15s  (no attack labels — skipping evaluation)", dataset_name)
        return
    X_s = scaler.transform(X_test)
    scores = -model.score_samples(X_s)
    try:
        roc = roc_auc_score(y_test, scores)
        ap  = average_precision_score(y_test, scores)
        log.info("  %-15s  ROC-AUC=%.3f  AP=%.3f", dataset_name, roc, ap)
    except Exception as exc:
        log.warning("  %-15s  evaluation error: %s", dataset_name, exc)


# ---------------------------------------------------------------------------
# Save — in IsolationForestDetector format
# ---------------------------------------------------------------------------

def save_model(
    model: IsolationForest,
    scaler: StandardScaler,
    feature_names: List[str],
    training_samples: int,
    background_data: np.ndarray,
    output_path: Path,
) -> None:
    """
    Save in the format read by IsolationForestDetector.load_model():
      {model, is_trained, training_samples, n_estimators, contamination, hash, ...}
    Extra keys (scaler, feature_names, background_data) are silently ignored by the loader
    but are useful for downstream SklearnAnomalyDetector usage.
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)

    model_data = {
        # Keys required by IsolationForestDetector
        "model":            model,
        "is_trained":       True,
        "training_samples": training_samples,
        "n_estimators":     model.n_estimators,
        "contamination":    model.contamination,
        # Extra keys (used by SklearnAnomalyDetector, ignored elsewhere)
        "scaler":           scaler,
        "feature_names":    feature_names,
        "feature_dimension": FEATURE_DIM,
        "feature_schema_version": "1.1",
        "background_data":  background_data,
        "hash":             None,  # filled after first write
    }

    joblib.dump(model_data, output_path)

    # Compute SHA-256 and embed it (IsolationForestDetector stores it too)
    digest = hashlib.sha256()
    with open(output_path, "rb") as fh:
        for chunk in iter(lambda: fh.read(65536), b""):
            digest.update(chunk)
    file_hash = digest.hexdigest()
    model_data["hash"] = file_hash
    joblib.dump(model_data, output_path)

    log.info("Saved  %s  (SHA-256: %s...)", output_path, file_hash[:16])


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

DATASET_CHOICES = ["unsw", "cic", "cert", "adfa_ld", "adfa_wd", "dapt"]


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Train EdgePulse Isolation Forest from real security datasets",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    p.add_argument(
        "--datasets-dir", type=Path, required=True,
        help="Root directory containing all dataset folders",
    )
    p.add_argument(
        "--output-dir", type=Path, default=Path("edge-agent/src/models"),
        help="Directory to write the trained model (default: edge-agent/src/models/)",
    )
    p.add_argument(
        "--model-id", default="edgepulse_primary",
        help="Model ID prefix (default: edgepulse_primary)",
    )
    p.add_argument(
        "--datasets", nargs="+", choices=DATASET_CHOICES, default=DATASET_CHOICES,
        help="Which datasets to include (default: all)",
    )
    p.add_argument(
        "--max-rows", type=int, default=None,
        help="Cap rows per dataset (useful for smoke tests, e.g. --max-rows 5000)",
    )
    p.add_argument(
        "--n-estimators", type=int, default=200,
        help="IsolationForest n_estimators (default: 200)",
    )
    p.add_argument(
        "--contamination", default="auto",
        help="IsolationForest contamination parameter (default: auto)",
    )
    p.add_argument(
        "--shap-background-size", type=int, default=200,
        help="Rows stored as SHAP background in the model file (default: 200)",
    )
    p.add_argument(
        "--seed", type=int, default=42,
        help="Random seed (default: 42)",
    )
    return p.parse_args()


def main() -> None:
    args = parse_args()

    datasets_dir = args.datasets_dir.expanduser().resolve()
    if not datasets_dir.exists():
        log.error("Datasets directory not found: %s", datasets_dir)
        sys.exit(1)

    log.info("=" * 60)
    log.info("EdgePulse Model Training")
    log.info("  datasets-dir : %s", datasets_dir)
    log.info("  output-dir   : %s", args.output_dir)
    log.info("  datasets     : %s", args.datasets)
    log.info("  max-rows     : %s", args.max_rows or "unlimited")
    log.info("=" * 60)

    loaders = {
        "unsw":    lambda: load_unsw_nb15(datasets_dir, args.max_rows),
        "cic":     lambda: load_cic_ids2018(datasets_dir, args.max_rows),
        "cert":    lambda: load_cert(datasets_dir, args.max_rows),
        "adfa_ld": lambda: load_adfa_ld(datasets_dir, args.max_rows),
        "adfa_wd": lambda: load_adfa_wd(datasets_dir, args.max_rows),
        "dapt":    lambda: load_dapt2020(datasets_dir, args.max_rows),
    }

    X_train_parts: List[np.ndarray] = []
    eval_sets: List[Tuple[np.ndarray, np.ndarray, str]] = []

    for name in args.datasets:
        log.info("Loading dataset: %s", name)
        try:
            X, y = loaders[name]()
        except (FileNotFoundError, ValueError) as exc:
            log.warning("  Skipping %s: %s", name, exc)
            continue

        # Split normal rows 80/20; keep all attack rows in eval only
        normal_mask = y == 0
        X_normal = X[normal_mask].copy()
        rng = np.random.default_rng(args.seed)
        rng.shuffle(X_normal)

        n_normal = len(X_normal)
        split = int(n_normal * 0.8)
        X_train_parts.append(X_normal[:split])

        X_eval = np.vstack([X_normal[split:], X[~normal_mask]]) if (~normal_mask).any() \
            else X_normal[split:]
        y_eval = np.hstack([
            np.zeros(n_normal - split, dtype=int),
            y[~normal_mask],
        ]) if (~normal_mask).any() else np.zeros(n_normal - split, dtype=int)
        eval_sets.append((X_eval, y_eval, name))

    if not X_train_parts:
        log.error("No training data could be loaded. Check your --datasets-dir path.")
        sys.exit(1)

    # Combine and shuffle
    X_train = np.vstack(X_train_parts)
    rng = np.random.default_rng(args.seed)
    X_train = X_train[rng.permutation(len(X_train))]
    X_train = _clean(X_train)
    log.info("Combined training set: %s (normal rows only)", X_train.shape)

    # Train
    contamination: str | float = args.contamination
    if contamination != "auto":
        contamination = float(contamination)

    model, scaler = train_isolation_forest(
        X_train,
        n_estimators=args.n_estimators,
        contamination=contamination,
        random_state=args.seed,
    )

    # Evaluate
    log.info("--- Evaluation ---")
    for X_e, y_e, ds_name in eval_sets:
        X_e = _clean(X_e)
        evaluate(model, scaler, X_e, y_e, ds_name)

    # Save
    bg_size = min(args.shap_background_size, len(X_train))
    background_data = scaler.transform(X_train[:bg_size])

    output_path = args.output_dir / f"{args.model_id}_isolation_forest.joblib"
    save_model(
        model=model,
        scaler=scaler,
        feature_names=PADDED_NAMES,
        training_samples=len(X_train),
        background_data=background_data,
        output_path=output_path,
    )

    log.info("=" * 60)
    log.info("Done. Model written to: %s", output_path)
    log.info("The agent will load this automatically on next start.")
    log.info("=" * 60)


if __name__ == "__main__":
    main()