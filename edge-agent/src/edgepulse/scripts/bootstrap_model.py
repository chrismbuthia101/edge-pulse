"""
bootstrap_model.py
==================
Generates a bootstrapped Isolation Forest model that matches the canonical
feature schema defined in feature_extractor.py (FEATURE_SCHEMA).

Run once after installation to produce a model file the agent can load
immediately, without needing to collect live training data first.

Usage:
    python bootstrap_model.py [--output-dir models/] [--n-samples 2000]
"""

import argparse
import hashlib
import json
import sys
from pathlib import Path

import joblib
import numpy as np
from sklearn.ensemble import IsolationForest

# ---------------------------------------------------------------------------
# Feature schema — must be kept in sync with feature_extractor.FEATURE_SCHEMA
# ---------------------------------------------------------------------------

FEATURE_NAMES = [
    # CPU 1-min (5)
    "cpu_mean_1min",
    "cpu_std_1min",
    "cpu_max_1min",
    "cpu_rate_change_1min",
    "cpu_core_imbalance_1min",
    # CPU 5-min (5)
    "cpu_mean_5min",
    "cpu_std_5min",
    "cpu_max_5min",
    "cpu_rate_change_5min",
    "cpu_core_imbalance_5min",
    # Memory 1-min (4)
    "memory_growth_rate_1min",
    "memory_variance_1min",
    "memory_spike_1min",
    "memory_cpu_ratio_1min",
    # Memory 5-min (3)
    "memory_growth_rate_5min",
    "memory_variance_5min",
    "memory_cpu_ratio_5min",
    # Disk 1-min (3)
    "disk_write_burst_1min",
    "disk_io_spike_1min",
    "disk_write_read_ratio_1min",
    # Network 1-min (6)
    "network_entropy_1min",
    "network_unusual_ports_1min",
    "network_burst_pattern_1min",
    "network_error_rate_1min",
    "network_drop_rate_1min",
    "network_send_recv_ratio_1min",
    # Process 1-min (7)
    "process_spawn_frequency_1min",
    "process_unique_count_1min",
    "process_rare_executions_1min",
    "process_cpu_gini_1min",
    "process_admin_ratio_1min",
    "process_no_exe_path_ratio_1min",
    "process_long_cmdline_ratio_1min",
    # Temporal (3)
    "temporal_hour_sin",
    "temporal_hour_cos",
    "temporal_is_weekend",
]

# Index map — used to generate synthetic data with realistic distributions
IDX = {name: i for i, name in enumerate(FEATURE_NAMES)}

N_FEATURES = len(FEATURE_NAMES)
FEATURE_DIMENSION = 50   # must match AgentSettings.features.feature_dimension


def _verify_schema() -> None:
    """Sanity-check: every name in IDX must resolve to a unique valid index."""
    assert len(IDX) == N_FEATURES, (
        f"Duplicate feature names detected: expected {N_FEATURES} unique, "
        f"got {len(IDX)}"
    )
    indices = list(IDX.values())
    assert sorted(indices) == list(range(N_FEATURES)), (
        f"IDX indices are not 0..{N_FEATURES-1}: {sorted(indices)}"
    )
    print(f"✓ Schema verified: {N_FEATURES} unique features, padded to {FEATURE_DIMENSION}")


def generate_synthetic_normal(n_samples: int, rng: np.random.Generator) -> np.ndarray:
    """
    Generate synthetic 'normal-behaviour' training samples.

    Each column is sampled from a distribution chosen to match realistic
    baseline behaviour on a typical Windows workstation.
    """
    data = np.zeros((n_samples, FEATURE_DIMENSION), dtype=np.float32)

    # --- CPU (percent, 0-100) ---
    for col in ("cpu_mean_1min", "cpu_mean_5min"):
        data[:, IDX[col]] = rng.normal(25, 10, n_samples).clip(0, 100)

    for col in ("cpu_std_1min", "cpu_std_5min"):
        data[:, IDX[col]] = rng.exponential(5, n_samples).clip(0, 30)

    for col in ("cpu_max_1min", "cpu_max_5min"):
        data[:, IDX[col]] = rng.normal(40, 15, n_samples).clip(0, 100)

    for col in ("cpu_rate_change_1min", "cpu_rate_change_5min"):
        data[:, IDX[col]] = rng.normal(0, 2, n_samples)

    for col in ("cpu_core_imbalance_1min", "cpu_core_imbalance_5min"):
        data[:, IDX[col]] = rng.exponential(3, n_samples).clip(0, 30)

    # --- Memory (percent, 0-100 / ratios) ---
    for col in ("memory_growth_rate_1min", "memory_growth_rate_5min"):
        data[:, IDX[col]] = rng.normal(0, 0.05, n_samples)

    for col in ("memory_variance_1min", "memory_variance_5min"):
        data[:, IDX[col]] = rng.exponential(2, n_samples).clip(0, 50)

    data[:, IDX["memory_spike_1min"]] = rng.exponential(1, n_samples).clip(0, 20)

    for col in ("memory_cpu_ratio_1min", "memory_cpu_ratio_5min"):
        data[:, IDX[col]] = rng.lognormal(1.5, 0.5, n_samples).clip(0, 20)

    # --- Disk (bytes/s rates, ratios) ---
    data[:, IDX["disk_write_burst_1min"]] = rng.exponential(5000, n_samples).clip(0, 1e7)
    data[:, IDX["disk_io_spike_1min"]] = rng.exponential(1.5, n_samples).clip(0, 20)
    data[:, IDX["disk_write_read_ratio_1min"]] = rng.lognormal(0, 0.5, n_samples).clip(0, 10)

    # --- Network ---
    data[:, IDX["network_entropy_1min"]] = rng.normal(2.5, 0.8, n_samples).clip(0, 8)
    data[:, IDX["network_unusual_ports_1min"]] = rng.poisson(2, n_samples).astype(float)
    data[:, IDX["network_burst_pattern_1min"]] = rng.exponential(0.3, n_samples).clip(0, 5)
    data[:, IDX["network_error_rate_1min"]] = rng.exponential(0.001, n_samples).clip(0, 0.1)
    data[:, IDX["network_drop_rate_1min"]] = rng.exponential(0.001, n_samples).clip(0, 0.1)
    data[:, IDX["network_send_recv_ratio_1min"]] = rng.lognormal(0, 0.4, n_samples).clip(0, 10)

    # --- Process ---
    data[:, IDX["process_spawn_frequency_1min"]] = rng.exponential(0.05, n_samples).clip(0, 2)
    data[:, IDX["process_unique_count_1min"]] = rng.normal(80, 20, n_samples).clip(1, 300)
    data[:, IDX["process_rare_executions_1min"]] = rng.poisson(3, n_samples).astype(float)
    data[:, IDX["process_cpu_gini_1min"]] = rng.beta(1.5, 5, n_samples)  # usually low
    data[:, IDX["process_admin_ratio_1min"]] = rng.beta(1, 9, n_samples)  # usually low
    data[:, IDX["process_no_exe_path_ratio_1min"]] = rng.beta(1, 19, n_samples)  # very low
    data[:, IDX["process_long_cmdline_ratio_1min"]] = rng.beta(1, 19, n_samples)  # very low

    # --- Temporal (sin/cos of hour, is_weekend) ---
    hours = rng.integers(0, 24, n_samples).astype(float)
    hour_rad = (hours / 24.0) * 2 * np.pi
    data[:, IDX["temporal_hour_sin"]] = np.sin(hour_rad)
    data[:, IDX["temporal_hour_cos"]] = np.cos(hour_rad)
    data[:, IDX["temporal_is_weekend"]] = (rng.integers(0, 7, n_samples) >= 5).astype(float)

    # Columns beyond N_FEATURES stay at zero (padding)
    return data


def build_model(n_samples: int, seed: int = 42) -> IsolationForest:
    rng = np.random.default_rng(seed)
    training_data = generate_synthetic_normal(n_samples, rng)

    model = IsolationForest(
        n_estimators=200,
        contamination=0.05,
        max_samples="auto",
        random_state=seed,
        n_jobs=-1,
    )
    model.fit(training_data)
    return model


def save_model(model: IsolationForest, output_dir: Path, n_samples: int) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    model_path = output_dir / "edgepulse_primary_isolation_forest.joblib"

    model_data = {
        "model": model,
        "is_trained": True,
        "training_samples": n_samples,
        "n_estimators": model.n_estimators,
        "contamination": model.contamination,
        "feature_names": FEATURE_NAMES,
        "feature_dimension": FEATURE_DIMENSION,
        "feature_schema_version": "1.1",
        "hash": None,  # filled below after save
    }

    joblib.dump(model_data, model_path)

    # Compute and store file hash for integrity checking
    sha256 = hashlib.sha256()
    with open(model_path, "rb") as fh:
        for chunk in iter(lambda: fh.read(65536), b""):
            sha256.update(chunk)
    file_hash = sha256.hexdigest()

    model_data["hash"] = file_hash
    joblib.dump(model_data, model_path)

    return model_path


def save_metadata(model_path: Path, model: IsolationForest, n_samples: int) -> Path:
    meta_path = model_path.with_suffix(".json")
    meta = {
        "model_file": model_path.name,
        "feature_schema_version": "1.1",
        "feature_names": FEATURE_NAMES,
        "feature_dimension": FEATURE_DIMENSION,
        "n_features_named": N_FEATURES,
        "n_estimators": model.n_estimators,
        "contamination": model.contamination,
        "training_samples": n_samples,
        "sklearn_params": model.get_params(),
    }
    with open(meta_path, "w") as fh:
        json.dump(meta, fh, indent=2)
    return meta_path


def main() -> None:
    parser = argparse.ArgumentParser(description="Bootstrap EdgePulse Isolation Forest model")
    parser.add_argument(
        "--output-dir",
        default="src/models",
        help="Directory to write model files (default: src/models/)",
    )
    parser.add_argument(
        "--n-samples",
        type=int,
        default=2000,
        help="Number of synthetic training samples (default: 2000)",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="Random seed for reproducibility (default: 42)",
    )
    args = parser.parse_args()

    print("EdgePulse Bootstrap Model Generator")
    print("=" * 50)

    # 1. Verify schema consistency
    _verify_schema()

    # 2. Train
    print(f"\nGenerating {args.n_samples} synthetic normal-behaviour samples …")
    model = build_model(args.n_samples, seed=args.seed)
    print(f"✓ Model trained  ({model.n_estimators} trees, contamination={model.contamination})")

    # 3. Quick sanity — score a few synthetic normal and anomalous samples
    rng = np.random.default_rng(args.seed + 1)
    normal_sample = generate_synthetic_normal(10, rng)
    normal_scores = model.decision_function(normal_sample)

    anomaly = np.zeros((1, FEATURE_DIMENSION), dtype=np.float32)
    anomaly[0, IDX["cpu_mean_1min"]] = 99.0
    anomaly[0, IDX["process_admin_ratio_1min"]] = 1.0
    anomaly[0, IDX["network_send_recv_ratio_1min"]] = 50.0
    anomaly_score = model.decision_function(anomaly)

    print(f"  Normal sample decision scores (mean): {normal_scores.mean():.4f}")
    print(f"  Anomalous sample decision score:      {anomaly_score[0]:.4f}")
    assert anomaly_score[0] < normal_scores.mean(), (
        "Anomaly score should be lower (more negative) than normal scores"
    )
    print("✓ Sanity check passed")

    # 4. Save
    output_dir = Path(args.output_dir)
    model_path = save_model(model, output_dir, args.n_samples)
    meta_path = save_metadata(model_path, model, args.n_samples)

    print(f"\n✓ Model saved  → {model_path}")
    print(f"✓ Metadata     → {meta_path}")
    print(f"\nFeature dimension : {FEATURE_DIMENSION}")
    print(f"Named features    : {N_FEATURES}")
    print(f"Padding features  : {FEATURE_DIMENSION - N_FEATURES}")
    print("\nDone. The agent will load this model automatically on next start.")


if __name__ == "__main__":
    main()