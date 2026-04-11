#!/usr/bin/env python3
"""
EdgePulse Model Training Script
================================
Trains the Isolation Forest anomaly detection model using all five
downloaded datasets.  Each dataset is mapped to EdgePulse's canonical
36-feature schema (padded to 50 dimensions) so the saved model is
immediately loadable by SklearnAnomalyDetector.load_model_with_integrity().

Usage
-----
  # Full training run (all datasets)
  python train_models.py --datasets-dir ~/Downloads/Datasets --output-dir edge-agent/models

  # Pick specific datasets
  python train_models.py --datasets-dir ~/Downloads/Datasets --output-dir edge-agent/models \
      --datasets unsw cert adfa_wd dapt cic

  # Quick smoke-test with 10 k rows per dataset
  python train_models.py --datasets-dir ~/Downloads/Datasets --output-dir edge-agent/models \
      --max-rows 10000

Requirements
------------
  pip install scikit-learn pandas numpy joblib pyarrow shap
"""

from __future__ import annotations

import argparse
import hashlib
import logging
import math
import os
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
# Canonical feature schema (must match feature_extractor.py)
# ---------------------------------------------------------------------------

FEATURE_SCHEMA: List[str] = [
    # CPU — 10 features
    "cpu_mean_1min", "cpu_std_1min", "cpu_max_1min",
    "cpu_rate_change_1min", "cpu_core_imbalance_1min",
    "cpu_mean_5min", "cpu_std_5min", "cpu_max_5min",
    "cpu_rate_change_5min", "cpu_core_imbalance_5min",
    # Memory — 7 features
    "memory_growth_rate_1min", "memory_variance_1min",
    "memory_spike_1min", "memory_cpu_ratio_1min",
    "memory_growth_rate_5min", "memory_variance_5min",
    "memory_cpu_ratio_5min",
    # Disk — 3 features
    "disk_write_burst_1min", "disk_io_spike_1min",
    "disk_write_read_ratio_1min",
    # Network — 6 features
    "network_entropy_1min", "network_unusual_ports_1min",
    "network_burst_pattern_1min", "network_error_rate_1min",
    "network_drop_rate_1min", "network_send_recv_ratio_1min",
    # Process — 7 features
    "process_spawn_frequency_1min", "process_unique_count_1min",
    "process_rare_executions_1min", "process_cpu_gini_1min",
    "process_admin_ratio_1min", "process_no_exe_path_ratio_1min",
    "process_long_cmdline_ratio_1min",
    # Temporal — 3 features
    "temporal_hour_sin", "temporal_hour_cos", "temporal_is_weekend",
]
SCHEMA_LEN = len(FEATURE_SCHEMA)   # 36
FEATURE_DIM = 50                   # padded dimension expected by the model

PADDED_NAMES: List[str] = FEATURE_SCHEMA + [
    f"padding_{i}" for i in range(FEATURE_DIM - SCHEMA_LEN)
]

# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def _empty_row() -> Dict[str, float]:
    return {f: 0.0 for f in FEATURE_SCHEMA}


def _shannon_entropy(series: pd.Series) -> float:
    """Shannon entropy in bits for a discrete value series."""
    counts = series.value_counts(normalize=True)
    if len(counts) <= 1:
        return 0.0
    return float(-(counts * np.log2(counts + 1e-12)).sum())


def _gini(values: np.ndarray) -> float:
    """Gini coefficient of an array of non-negative values."""
    if len(values) < 2:
        return 0.0
    v = np.sort(values)
    n = len(v)
    cumsum = np.cumsum(v)
    total = cumsum[-1]
    if total == 0:
        return 0.0
    return float((2 * np.sum((np.arange(1, n + 1)) * v) / (n * total)) - (n + 1) / n)


def _temporal(timestamp_series: pd.Series) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Return (hour_sin, hour_cos, is_weekend) arrays from a datetime series."""
    dt = pd.to_datetime(timestamp_series, errors="coerce")
    hour_rad = (dt.dt.hour.fillna(0) / 24.0) * 2 * math.pi
    sin_h = np.sin(hour_rad).values.astype(float)
    cos_h = np.cos(hour_rad).values.astype(float)
    weekend = (dt.dt.dayofweek >= 5).fillna(False).astype(float).values
    return sin_h, cos_h, weekend


def _pad_to_50(arr: np.ndarray) -> np.ndarray:
    """Zero-pad or truncate to exactly FEATURE_DIM columns."""
    n, c = arr.shape
    if c == FEATURE_DIM:
        return arr
    if c < FEATURE_DIM:
        return np.hstack([arr, np.zeros((n, FEATURE_DIM - c), dtype=arr.dtype)])
    return arr[:, :FEATURE_DIM]


def _to_feature_matrix(rows: List[Dict[str, float]]) -> np.ndarray:
    """Convert a list of feature dicts to an (N, 36) float32 matrix."""
    mat = np.zeros((len(rows), SCHEMA_LEN), dtype=np.float32)
    for i, row in enumerate(rows):
        for j, name in enumerate(FEATURE_SCHEMA):
            mat[i, j] = float(row.get(name, 0.0))
    return mat


# ---------------------------------------------------------------------------
# 1.  UNSW-NB15
# ---------------------------------------------------------------------------

UNSW_NET_COLS = {
    "sbytes": "sbytes", "dbytes": "dbytes",
    "sloss":  "sloss",  "dloss":  "dloss",
    "spkts":  "spkts",  "dpkts":  "dpkts",
    "sload":  "sload",  "dload":  "dload",
    "sjit":   "sjit",   "djit":   "djit",
    "dur":    "dur",
}

# Columns that may exist in both training and testing parquet
UNSW_LABEL_COLS = ["label", "Label", "attack_cat"]


def load_unsw_nb15(data_dir: Path, max_rows: Optional[int]) -> Tuple[np.ndarray, np.ndarray]:
    """Load UNSW-NB15 parquet files → (X, y) where y=0 normal, y=1 attack."""
    parquets = sorted(data_dir.glob("UNSW_NB15*.parquet"))
    if not parquets:
        raise FileNotFoundError(f"No UNSW-NB15 parquet files in {data_dir}")

    frames = []
    for p in parquets:
        df = pd.read_parquet(p)
        if max_rows:
            df = df.sample(min(max_rows, len(df)), random_state=42)
        frames.append(df)
        log.info("  UNSW  %s  rows=%d  cols=%d", p.name, len(df), df.shape[1])

    df = pd.concat(frames, ignore_index=True)
    df.columns = df.columns.str.lower().str.strip()

    # --- label ---
    label_col = next((c for c in ["label", "attack_cat"] if c in df.columns), None)
    y = (df[label_col].notna() & (df[label_col].astype(str) != "0") & (df[label_col].astype(str).str.lower() != "normal")).astype(int).values if label_col else np.zeros(len(df), dtype=int)

    # --- feature mapping ---
    def _col(df, *names, default=0.0):
        for n in names:
            if n in df.columns:
                return pd.to_numeric(df[n], errors="coerce").fillna(0.0)
        return pd.Series(default, index=df.index)

    sbytes = _col(df, "sbytes")
    dbytes = _col(df, "dbytes")
    spkts  = _col(df, "spkts")
    dpkts  = _col(df, "dpkts")
    sloss  = _col(df, "sloss")
    dloss  = _col(df, "dloss")
    dur    = _col(df, "dur").replace(0, 1e-6)
    sjit   = _col(df, "sjit")
    djit   = _col(df, "djit")
    sport  = _col(df, "sport", "src_port")
    dport  = _col(df, "dport", "dst_port", "dsport")

    total_pkts  = spkts + dpkts + 1e-9
    total_bytes = sbytes + dbytes + 1e-9

    rows = []
    # Compute per-row entropy proxy (jitter variation as diversity signal)
    # Unusual port heuristic: ports outside well-known range (>1024)
    unusual_ports = ((sport > 1024) | (dport > 1024)).astype(float)

    for i in range(len(df)):
        r = _empty_row()
        # Network
        r["network_entropy_1min"]       = float(sjit.iloc[i] / (sjit.mean() + 1e-9))
        r["network_unusual_ports_1min"] = float(unusual_ports.iloc[i])
        r["network_burst_pattern_1min"] = float(spkts.iloc[i] / float(dur.iloc[i]))
        r["network_error_rate_1min"]    = float(sloss.iloc[i] / max(spkts.iloc[i], 1))
        r["network_drop_rate_1min"]     = float(dloss.iloc[i] / max(dpkts.iloc[i], 1))
        r["network_send_recv_ratio_1min"] = float(sbytes.iloc[i] / max(dbytes.iloc[i], 1))
        # Temporal approximation: assume uniform distribution (no timestamp)
        r["temporal_hour_sin"] = 0.0
        r["temporal_hour_cos"] = 1.0
        r["temporal_is_weekend"] = 0.0
        rows.append(r)

    X = _pad_to_50(_to_feature_matrix(rows))
    log.info("  UNSW  final X=%s  anomaly_rate=%.1f%%", X.shape, 100 * y.mean())
    return X, y


# ---------------------------------------------------------------------------
# 2.  CSE-CIC-IDS2018
# ---------------------------------------------------------------------------

def load_cic_ids2018(csv_path: Path, max_rows: Optional[int]) -> Tuple[np.ndarray, np.ndarray]:
    """Load the single merged CSV → (X, y)."""
    log.info("  CIC-IDS2018  reading %s …", csv_path.name)
    df = pd.read_csv(csv_path, low_memory=False, nrows=max_rows)
    df.columns = df.columns.str.strip().str.lower().str.replace(" ", "_")
    log.info("  CIC-IDS2018  rows=%d  cols=%d", len(df), df.shape[1])

    label_col = next((c for c in ["label", "class"] if c in df.columns), None)
    if label_col:
        y = (df[label_col].astype(str).str.lower() != "benign").astype(int).values
    else:
        y = np.zeros(len(df), dtype=int)

    def _col(df, *names, default=0.0):
        for n in names:
            if n in df.columns:
                return pd.to_numeric(df[n], errors="coerce").fillna(0.0)
        return pd.Series(default, index=df.index)

    fwd_pkts  = _col(df, "total_fwd_packets", "fwd_packets")
    bwd_pkts  = _col(df, "total_backward_packets", "bwd_packets")
    fwd_bytes = _col(df, "total_length_of_fwd_packets", "fwd_bytes")
    bwd_bytes = _col(df, "total_length_of_bwd_packets", "bwd_bytes")
    duration  = _col(df, "flow_duration", "duration").replace(0, 1e-6)
    fwd_iat   = _col(df, "fwd_iat_mean", "fwd_iat_total")
    bwd_iat   = _col(df, "bwd_iat_mean", "bwd_iat_total")
    src_port  = _col(df, "source_port", "src_port")
    dst_port  = _col(df, "destination_port", "dst_port")
    pkt_len_std = _col(df, "packet_length_std", "fwd_packet_length_std")

    unusual = ((src_port > 1024) | (dst_port > 1024)).astype(float)

    rows = []
    for i in range(len(df)):
        r = _empty_row()
        total_p = fwd_pkts.iloc[i] + bwd_pkts.iloc[i] + 1e-9
        r["network_entropy_1min"]         = float(pkt_len_std.iloc[i] / (pkt_len_std.mean() + 1e-9))
        r["network_unusual_ports_1min"]   = float(unusual.iloc[i])
        r["network_burst_pattern_1min"]   = float(total_p / float(duration.iloc[i]))
        r["network_error_rate_1min"]      = float(fwd_iat.iloc[i] / (fwd_iat.mean() + 1e-9))
        r["network_drop_rate_1min"]       = float(bwd_iat.iloc[i] / (bwd_iat.mean() + 1e-9))
        r["network_send_recv_ratio_1min"] = float((fwd_bytes.iloc[i] + 1) / (bwd_bytes.iloc[i] + 1))
        rows.append(r)

    X = _pad_to_50(_to_feature_matrix(rows))
    log.info("  CIC-IDS2018  final X=%s  anomaly_rate=%.1f%%", X.shape, 100 * y.mean())
    return X, y


# ---------------------------------------------------------------------------
# 3.  CERT Insider Threat r4.2
# ---------------------------------------------------------------------------

def load_cert(data_dir: Path, max_rows: Optional[int]) -> Tuple[np.ndarray, np.ndarray]:
    """Load CERT r4.2 CSVs and aggregate per user-day into feature rows."""
    log.info("  CERT  loading from %s …", data_dir)

    def _read(fname: str) -> Optional[pd.DataFrame]:
        p = data_dir / fname
        if not p.exists():
            log.warning("    CERT  %s not found, skipping", fname)
            return None
        df = pd.read_csv(p, low_memory=False, nrows=max_rows)
        df.columns = df.columns.str.strip().str.lower()
        if "date" in df.columns:
            df["date"] = pd.to_datetime(df["date"], errors="coerce")
        return df

    logon  = _read("logon.csv")
    file_  = _read("file.csv")
    http   = _read("http.csv")
    device = _read("device.csv")
    email  = _read("email.csv")

    records = []

    # Aggregate logon events per (user, day)
    if logon is not None and "user" in logon.columns and "date" in logon.columns:
        logon["day"] = logon["date"].dt.date
        grp = logon.groupby(["user", "day"])
        for (user, day), g in grp:
            r = _empty_row()
            # logon = proxy for process spawn
            r["process_spawn_frequency_1min"] = len(g) / 1440.0  # events per minute of day
            # After-hours heuristic: logons outside 08–18 = admin-like behaviour
            if "date" in g.columns:
                hours = g["date"].dt.hour
                r["process_admin_ratio_1min"] = float((hours < 8).sum() + (hours > 18).sum()) / max(len(g), 1)
            # Temporal
            dt = pd.Timestamp(str(day))
            hr = 12.0  # unknown hour, use midday
            r["temporal_hour_sin"] = math.sin(hr / 24.0 * 2 * math.pi)
            r["temporal_hour_cos"] = math.cos(hr / 24.0 * 2 * math.pi)
            r["temporal_is_weekend"] = float(dt.dayofweek >= 5)
            records.append(r)

    # File events → disk features
    if file_ is not None and "user" in file_.columns and "date" in file_.columns:
        file_["day"] = file_["date"].dt.date
        grp = file_.groupby(["user", "day"])
        for idx, ((user, day), g) in enumerate(grp):
            r = _empty_row()
            # Use unique filename count as a proxy for disk activity rate
            unique_files = g["filename"].nunique() if "filename" in g.columns else len(g)
            r["disk_write_burst_1min"] = unique_files / 1440.0
            r["disk_io_spike_1min"]    = float(len(g)) / max(1.0, unique_files)
            # .exe/.dll accesses = suspicious → long cmdline proxy
            if "filename" in g.columns:
                exe_ratio = g["filename"].str.lower().str.endswith((".exe", ".bat", ".ps1")).mean()
                r["process_long_cmdline_ratio_1min"] = float(exe_ratio)
            records.append(r)

    # HTTP events → network features
    if http is not None and "user" in http.columns and "date" in http.columns:
        http["day"] = http["date"].dt.date
        grp = http.groupby(["user", "day"])
        for (user, day), g in grp:
            r = _empty_row()
            if "url" in g.columns:
                domains = g["url"].str.extract(r"(?:https?://)?([^/]+)", expand=False)
                r["network_entropy_1min"]       = _shannon_entropy(domains.fillna("unknown"))
                unique_domains = domains.nunique()
                r["network_unusual_ports_1min"] = float(min(unique_domains, 100)) / 100.0
            r["network_burst_pattern_1min"] = len(g) / 1440.0
            records.append(r)

    # Email events → exfil proxy
    if email is not None and "user" in email.columns and "date" in email.columns:
        email["day"] = email["date"].dt.date
        grp = email.groupby(["user", "day"])
        for (user, day), g in grp:
            r = _empty_row()
            if "size" in g.columns:
                sizes = pd.to_numeric(g["size"], errors="coerce").fillna(0)
                r["network_send_recv_ratio_1min"] = float(sizes.sum()) / 1e6  # MB
                r["disk_write_read_ratio_1min"]   = float((sizes > 1e5).mean())  # large attachments
            records.append(r)

    if not records:
        raise ValueError("CERT: no records produced — check CSV paths")

    X = _pad_to_50(_to_feature_matrix(records))
    # CERT r4.2 has no ground-truth labels exposed; treat as all-normal
    y = np.zeros(len(X), dtype=int)
    log.info("  CERT  final X=%s  (all treated as normal)", X.shape)
    return X, y


# ---------------------------------------------------------------------------
# 4.  ADFA-WD (Windows syscall traces)
# ---------------------------------------------------------------------------

# Windows NT syscall IDs associated with privilege escalation / suspicious behaviour
ADFA_SUSPICIOUS_SYSCALLS = {
    # CreateProcess family
    0x0078, 0x0079, 0x007A,
    # Token manipulation
    0x0029, 0x002A, 0x002B,
    # Registry writes
    0x0014, 0x0015,
    # File creation / write
    0x0055, 0x0008,
    # Network
    0x0082, 0x0083, 0x0084,
}

ADFA_PROCESS_SYSCALLS = {0x0078, 0x0079, 0x007A, 0x0070, 0x0071}


def _parse_adfa_trace(path: Path) -> Optional[np.ndarray]:
    """Read one ADFA trace file → numpy array of integer syscall IDs."""
    try:
        text = path.read_text(errors="replace").strip()
        ids = np.array([int(x) for x in text.split() if x.strip().isdigit()], dtype=np.int32)
        return ids if len(ids) > 0 else None
    except Exception:
        return None


def _adfa_trace_to_features(syscalls: np.ndarray) -> Dict[str, float]:
    """Convert a syscall sequence to an EdgePulse feature row."""
    r = _empty_row()
    if len(syscalls) == 0:
        return r

    n = len(syscalls)
    counts = Counter(syscalls.tolist())
    unique  = len(counts)
    total   = n

    # Process features
    proc_calls = sum(counts[s] for s in ADFA_PROCESS_SYSCALLS if s in counts)
    susp_calls = sum(counts[s] for s in ADFA_SUSPICIOUS_SYSCALLS if s in counts)

    r["process_spawn_frequency_1min"] = proc_calls / total
    r["process_unique_count_1min"]    = unique
    r["process_rare_executions_1min"] = sum(1 for c in counts.values() if c == 1) / max(unique, 1)
    r["process_admin_ratio_1min"]     = susp_calls / total
    r["process_no_exe_path_ratio_1min"] = susp_calls / total  # privilege-elevation proxy

    # Gini on syscall frequencies
    freq_arr = np.array(list(counts.values()), dtype=float)
    r["process_cpu_gini_1min"] = _gini(freq_arr)

    # Entropy of syscall distribution → network entropy proxy
    probs = freq_arr / total
    r["network_entropy_1min"] = float(-(probs * np.log2(probs + 1e-12)).sum())

    # Burst pattern proxy: transition rate between distinct syscalls
    transitions = np.sum(syscalls[1:] != syscalls[:-1])
    r["network_burst_pattern_1min"] = transitions / max(n, 1)

    return r


def load_adfa_wd(data_dir: Path, max_rows: Optional[int]) -> Tuple[np.ndarray, np.ndarray]:
    """Load ADFA-WD-SAA_Master syscall traces → (X, y)."""
    # Try multiple possible sub-paths
    candidates = [
        data_dir / "ADFA-WD-SAA_Master" / "Full_Process_Traces",
        data_dir / "Full_Process_Traces",
        data_dir / "ADFA-LD",           # fallback to Linux version
    ]
    base = next((p for p in candidates if p.exists()), None)
    if base is None:
        raise FileNotFoundError(f"ADFA trace directory not found under {data_dir}")

    # Normal traces
    train_dirs = list(base.glob("*raining*")) + list(base.glob("*ormal*"))
    attack_dirs = list(base.glob("*ttack*")) + list(base.glob("*tack*"))

    rows_normal: List[Dict[str, float]] = []
    rows_attack: List[Dict[str, float]] = []

    limit_normal = max_rows or 50_000
    limit_attack = max_rows or 50_000

    for td in train_dirs:
        for f in list(td.rglob("*.txt")) + list(td.rglob("*.trace")):
            if len(rows_normal) >= limit_normal:
                break
            sc = _parse_adfa_trace(f)
            if sc is not None:
                rows_normal.append(_adfa_trace_to_features(sc))

    for ad in attack_dirs:
        for f in list(ad.rglob("*.txt")) + list(ad.rglob("*.trace")):
            if len(rows_attack) >= limit_attack:
                break
            sc = _parse_adfa_trace(f)
            if sc is not None:
                rows_attack.append(_adfa_trace_to_features(sc))

    log.info("  ADFA-WD  normal=%d  attack=%d", len(rows_normal), len(rows_attack))

    if not rows_normal and not rows_attack:
        raise ValueError("ADFA: no trace files found")

    all_rows = rows_normal + rows_attack
    y_list   = [0] * len(rows_normal) + [1] * len(rows_attack)

    X = _pad_to_50(_to_feature_matrix(all_rows))
    y = np.array(y_list, dtype=int)
    log.info("  ADFA-WD  final X=%s  anomaly_rate=%.1f%%", X.shape, 100 * y.mean())
    return X, y


# ---------------------------------------------------------------------------
# 5.  DAPT2020 (APT network flows)
# ---------------------------------------------------------------------------

def load_dapt2020(data_dir: Path, max_rows: Optional[int]) -> Tuple[np.ndarray, np.ndarray]:
    """Load DAPT2020 CIC-Flow CSV files → (X, y)."""
    dapt_dir = data_dir / "DAPT2020"
    if not dapt_dir.exists():
        raise FileNotFoundError(f"DAPT2020 directory not found: {dapt_dir}")

    csvs = sorted(dapt_dir.glob("*.csv"))
    if not csvs:
        raise FileNotFoundError(f"No CSV files in {dapt_dir}")

    frames = []
    for csv_path in csvs:
        rows_left = (max_rows // len(csvs)) if max_rows else None
        df = pd.read_csv(csv_path, low_memory=False, nrows=rows_left)
        df["_source_file"] = csv_path.stem
        frames.append(df)
        log.info("  DAPT  %s  rows=%d", csv_path.name, len(df))

    df = pd.concat(frames, ignore_index=True)
    df.columns = df.columns.str.strip().str.lower().str.replace(" ", "_")

    # DAPT label heuristic: 'pvt' files contain private-network C2 traffic (attack)
    y = df["_source_file"].str.contains("-pvt-", case=False).astype(int).values

    def _col(df, *names, default=0.0):
        for n in names:
            if n in df.columns:
                return pd.to_numeric(df[n], errors="coerce").fillna(0.0)
        return pd.Series(default, index=df.index)

    fwd_pkts   = _col(df, "total_fwd_packets", "fwd_packets")
    bwd_pkts   = _col(df, "total_backward_packets", "bwd_packets")
    fwd_bytes  = _col(df, "total_length_of_fwd_packets", "fwd_bytes")
    bwd_bytes  = _col(df, "total_length_of_bwd_packets", "bwd_bytes")
    duration   = _col(df, "flow_duration", "duration").replace(0, 1e-6)
    dst_port   = _col(df, "destination_port", "dst_port")
    src_port   = _col(df, "source_port", "src_port")
    pkt_size   = _col(df, "average_packet_size", "packet_length_mean")
    fwd_iat_std = _col(df, "fwd_iat_std", "flow_iat_std")

    unusual = ((src_port > 1024) | (dst_port > 1024)).astype(float)

    # APT characteristic: low-and-slow = very low packet rate
    total_pkts = fwd_pkts + bwd_pkts + 1e-9

    rows = []
    for i in range(len(df)):
        r = _empty_row()
        r["network_entropy_1min"]         = float(fwd_iat_std.iloc[i] / (fwd_iat_std.mean() + 1e-9))
        r["network_unusual_ports_1min"]   = float(unusual.iloc[i])
        r["network_burst_pattern_1min"]   = float(total_pkts.iloc[i] / float(duration.iloc[i]))
        r["network_error_rate_1min"]      = float(fwd_pkts.iloc[i] / max(total_pkts.iloc[i], 1))
        r["network_drop_rate_1min"]       = float(bwd_pkts.iloc[i] / max(total_pkts.iloc[i], 1))
        r["network_send_recv_ratio_1min"] = float((fwd_bytes.iloc[i] + 1) / (bwd_bytes.iloc[i] + 1))
        # APT lateral movement proxy: small packets over long duration
        r["process_rare_executions_1min"] = float(pkt_size.iloc[i] < 200)
        rows.append(r)

    X = _pad_to_50(_to_feature_matrix(rows))
    log.info("  DAPT2020  final X=%s  anomaly_rate=%.1f%%", X.shape, 100 * y.mean())
    return X, y


# ---------------------------------------------------------------------------
# Training
# ---------------------------------------------------------------------------

def train_isolation_forest(
    X_train: np.ndarray,
    feature_names: List[str],
    n_estimators: int = 200,
    contamination: str = "auto",
    random_state: int = 42,
) -> Tuple[IsolationForest, StandardScaler]:
    """Fit IsolationForest on scaled normal data."""
    log.info("Scaling %d training samples …", len(X_train))
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X_train)

    log.info("Training Isolation Forest  n_estimators=%d …", n_estimators)
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
    """Log ROC-AUC and AP on the test set."""
    if y_test.sum() == 0:
        log.info("  %s  (no attack labels — skipping evaluation)", dataset_name)
        return
    X_s = scaler.transform(X_test)
    # score_samples: lower = more anomalous → negate for ROC
    scores = -model.score_samples(X_s)
    try:
        roc = roc_auc_score(y_test, scores)
        ap  = average_precision_score(y_test, scores)
        log.info("  %-15s  ROC-AUC=%.3f  AP=%.3f", dataset_name, roc, ap)
    except Exception as exc:
        log.warning("  %s  evaluation error: %s", dataset_name, exc)


# ---------------------------------------------------------------------------
# Save in SklearnAnomalyDetector format
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
    Save in the exact format expected by
    SklearnAnomalyDetector.load_model_with_integrity():

        {
            "model":            IsolationForest,
            "scaler":           StandardScaler,
            "feature_names":    [50 names],
            "hash":             sha256_of_file,
            "version":          "1.0",
            "training_samples": int,
            "background_data":  np.ndarray | None,
        }
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # First pass — save with hash=None (needed to compute the real hash)
    model_data = {
        "model":            model,
        "scaler":           scaler,
        "feature_names":    feature_names,
        "hash":             None,
        "version":          "1.0",
        "training_samples": training_samples,
        "background_data":  background_data,
    }
    joblib.dump(model_data, output_path)

    # Second pass — embed the real SHA-256 of the file
    digest = hashlib.sha256()
    with open(output_path, "rb") as fh:
        for chunk in iter(lambda: fh.read(65536), b""):
            digest.update(chunk)
    file_hash = digest.hexdigest()

    model_data["hash"] = file_hash
    joblib.dump(model_data, output_path)

    log.info("Saved  %s  hash=%s…", output_path, file_hash[:16])


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

DATASET_CHOICES = ["unsw", "cic", "cert", "adfa_wd", "dapt"]


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Train EdgePulse Isolation Forest")
    p.add_argument(
        "--datasets-dir",
        type=Path,
        default=Path.home() / "Downloads" / "Datasets",
        help="Root directory containing all downloaded dataset folders",
    )
    p.add_argument(
        "--output-dir",
        type=Path,
        default=Path("edge-agent/models"),
        help="Directory to write the trained model file",
    )
    p.add_argument(
        "--model-id",
        default="edgepulse_primary",
        help="Model ID prefix (default: edgepulse_primary)",
    )
    p.add_argument(
        "--datasets",
        nargs="+",
        choices=DATASET_CHOICES,
        default=DATASET_CHOICES,
        help="Which datasets to include",
    )
    p.add_argument(
        "--max-rows",
        type=int,
        default=None,
        help="Cap rows per dataset for quick runs (e.g. --max-rows 50000)",
    )
    p.add_argument(
        "--n-estimators",
        type=int,
        default=200,
        help="IsolationForest n_estimators (default 200)",
    )
    p.add_argument(
        "--contamination",
        default="auto",
        help="IsolationForest contamination (default 'auto')",
    )
    p.add_argument(
        "--shap-background-size",
        type=int,
        default=200,
        help="Rows to store as SHAP background (default 200)",
    )
    return p.parse_args()


def main() -> None:
    args = parse_args()

    datasets_dir = args.datasets_dir
    if not datasets_dir.exists():
        log.error("Datasets directory not found: %s", datasets_dir)
        sys.exit(1)

    log.info("=== EdgePulse Model Training ===")
    log.info("Datasets dir : %s", datasets_dir)
    log.info("Output dir   : %s", args.output_dir)
    log.info("Datasets     : %s", args.datasets)

    # ── Load each dataset ──────────────────────────────────────────────────
    X_train_parts: List[np.ndarray] = []   # normal rows only
    X_eval_parts:  List[Tuple[np.ndarray, np.ndarray, str]] = []  # (X, y, name)

    loaders = {
        "unsw":    lambda: load_unsw_nb15(datasets_dir / "UNSW_NB15", args.max_rows),
        "cic":     lambda: load_cic_ids2018(datasets_dir / "CSE-CIC-IDS2018.csv", args.max_rows),
        "cert":    lambda: load_cert(datasets_dir / "CERT Insider Threat r4.2", args.max_rows),
        "adfa_wd": lambda: load_adfa_wd(datasets_dir, args.max_rows),
        "dapt":    lambda: load_dapt2020(datasets_dir, args.max_rows),
    }

    for name in args.datasets:
        if name not in loaders:
            continue
        log.info("Loading dataset: %s", name)
        try:
            X, y = loaders[name]()
        except (FileNotFoundError, ValueError) as exc:
            log.warning("  Skipping %s: %s", name, exc)
            continue

        # Normal rows go into training; keep a held-out eval set (last 20%)
        normal_mask = y == 0
        n_normal    = normal_mask.sum()
        split_idx   = int(n_normal * 0.8)

        X_normal = X[normal_mask]
        np.random.shuffle(X_normal)          # in-place shuffle

        X_train_parts.append(X_normal[:split_idx])
        # Eval set: last 20% normal + ALL attack rows
        X_eval  = np.vstack([X_normal[split_idx:], X[~normal_mask]])
        y_eval  = np.hstack([
            np.zeros(n_normal - split_idx, dtype=int),
            y[~normal_mask],
        ])
        X_eval_parts.append((X_eval, y_eval, name))

    if not X_train_parts:
        log.error("No training data could be loaded. Exiting.")
        sys.exit(1)

    # ── Combine training data ──────────────────────────────────────────────
    X_train = np.vstack(X_train_parts)
    np.random.seed(42)
    idx = np.random.permutation(len(X_train))
    X_train = X_train[idx]

    log.info("Combined training set: %s  (normal rows only)", X_train.shape)

    # ── Replace NaN / Inf ─────────────────────────────────────────────────
    X_train = np.nan_to_num(X_train, nan=0.0, posinf=1e6, neginf=-1e6)

    # ── Train ─────────────────────────────────────────────────────────────
    contamination = args.contamination
    if contamination != "auto":
        contamination = float(contamination)

    model, scaler = train_isolation_forest(
        X_train,
        feature_names=PADDED_NAMES,
        n_estimators=args.n_estimators,
        contamination=contamination,
    )

    # ── Evaluate on held-out attack data ──────────────────────────────────
    log.info("--- Evaluation ---")
    for X_e, y_e, ds_name in X_eval_parts:
        X_e = np.nan_to_num(X_e, nan=0.0, posinf=1e6, neginf=-1e6)
        evaluate(model, scaler, X_e, y_e, ds_name)

    # ── Save ──────────────────────────────────────────────────────────────
    background_size = min(args.shap_background_size, len(X_train))
    background_data = scaler.transform(X_train[:background_size])

    output_path = args.output_dir / f"{args.model_id}_isolation_forest.joblib"
    save_model(
        model=model,
        scaler=scaler,
        feature_names=PADDED_NAMES,
        training_samples=len(X_train),
        background_data=background_data,
        output_path=output_path,
    )

    log.info("=== Done. Model saved to %s ===", output_path)
    log.info(
        "Load with: SklearnAnomalyDetector('%s').load_model_with_integrity('%s')",
        args.model_id,
        output_path,
    )


if __name__ == "__main__":
    main()