# EdgePulse Model Training Guide

This document covers everything needed to train the Isolation Forest model
for this specific codebase, from your six datasets to a running agent.

---

## Files delivered

| File                 | Purpose                                                                     |
| -------------------- | --------------------------------------------------------------------------- |
| `train_models.py`    | Replacement training script — drop into `edge-agent/src/edgepulse/scripts/` |
| `verify_datasets.py` | Run this first to catch path problems before training                       |
| `TRAINING.md`        | This document                                                               |

---

## How the trained model connects to the agent

The agent loads models via `IsolationForestDetector.load_model()` in
`src/edgepulse/detectors/isolation_forest_detector.py`. That method checks
two candidate paths in order:

1. The path built from `PathManager.models_dir` + the device-ID-specific name
2. **`src/models/edgepulse_primary_isolation_forest.joblib`** ← this is the fallback
   that always fires for a fresh install

`train_models.py` writes to `--output-dir` with the filename
`edgepulse_primary_isolation_forest.joblib`. So as long as you pass
`--output-dir edge-agent/src/models`, the agent picks it up automatically on
next start — no config change needed.

---

## Step 0 — Install dependencies

```bash
cd edge-agent

# If using Poetry (recommended — matches pyproject.toml)
poetry install --extras "all"

# Or plain pip (for the training script only, no agent needed)
pip install scikit-learn pandas numpy joblib pyarrow shap
```

---

## Step 1 — Verify your dataset layout

Place the two scripts next to each other (or anywhere convenient) and run:

```bash
python verify_datasets.py --datasets-dir /path/to/your/Datasets
```

Expected output — all green:

```
1. UNSW-NB15
  ✓  UNSW_NB15/ found
  ✓  2 parquet file(s) found

2. CSE-CIC-IDS2018
  ✓  CSV found: CSE-CIC-IDS2018/CSE-CIC-IDS2018.csv

3. CERT Insider Threat r4.2
  ✓  CERT directory found
  ✓  logon.csv  ✓  file.csv  ✓  http.csv  ✓  email.csv

4. ADFA-LD  (Linux syscall traces)
  ✓  ADFA-LD/ found
  ✓  833 .txt trace files in Training_Data_Master/
  ✓  Attack_Data_Master/ ...

5. ADFA-WD / Full_Process_Traces
  ✓  Full_Process_Traces/ found at root level
  ✓  Full_Trace_Training_Data/  N .GHC files
  ✓  Full_Trace_Attack_Data/  242 subdirs  N .GHC files

6. DAPT2020
  ✓  DAPT2020/ found
  ✓  10 CSV files found
  ✓  Normal files: 5   Attack files ('pvt'): 5
```

Fix any red ✗ errors before proceeding.

---

## Step 2 — Smoke test (fast, catches format errors)

Always run a limited smoke test before the full training run.
This processes only 5 000 rows per dataset and uses 50 trees,
completing in under two minutes:

```bash
python train_models.py \
    --datasets-dir /path/to/your/Datasets \
    --output-dir   edge-agent/src/models \
    --max-rows     5000 \
    --datasets     unsw cert dapt \
    --n-estimators 50
```

Expected output ends with:

```
Done. Model written to: edge-agent/src/models/edgepulse_primary_isolation_forest.joblib
```

If the smoke test passes, proceed. If a dataset fails, use
`--datasets` to include only the working ones for the full run.

---

## Step 3 — Full training run

```bash
python train_models.py \
    --datasets-dir /path/to/your/Datasets \
    --output-dir   edge-agent/src/models \
    --datasets     unsw cic cert adfa_ld adfa_wd dapt \
    --n-estimators 200 \
    --shap-background-size 200
```

Typical runtime (on a laptop, no GPU needed):

| Step                           | Time                        |
| ------------------------------ | --------------------------- |
| Loading all datasets           | 5–15 min (CIC CSV is large) |
| Training (200 trees, all data) | 3–8 min                     |
| Evaluation                     | < 1 min                     |
| Total                          | ~20 min                     |

You will see ROC-AUC and average precision scores for each labelled dataset.
CERT will show "no attack labels — skipping evaluation" — that is expected.

---

## Step 4 — Verify the agent loads it

```bash
cd edge-agent
poetry run edge-agent run
```

In the logs, look for:

```
isolation_forest_model_loaded  path=src/models/edgepulse_primary_isolation_forest.joblib
```

If you see the big warning box instead:

```
╔══════════════════════════════════════════════════════════════════╗
║  EdgePulse — NO MODEL FILE FOUND                                ║
```

the file is not in the expected location. Check:

```bash
ls -lh edge-agent/src/models/edgepulse_primary_isolation_forest.joblib
```

---

## Dataset details and known issues

### UNSW-NB15

- **Files**: `UNSW_NB15/UNSW_NB15_training-set.parquet`, `UNSW_NB15_testing-set.parquet`
- **Labels**: `label` column (0=normal, 1=attack) or `attack_cat` (non-empty = attack)
- **Features used**: network flow metrics (bytes, packets, jitter, ports, duration)
- **Status**: ready, no changes needed

### CSE-CIC-IDS2018

- **Files**: `CSE-CIC-IDS2018/CSE-CIC-IDS2018.csv` (inside a subfolder)
- **Labels**: `label` column — "Benign" = normal, everything else = attack
- **Features used**: flow duration, packet counts/sizes, port numbers, IAT stats
- **Status**: ready — script handles both `CSE-CIC-IDS2018/CSE-CIC-IDS2018.csv`
  and `CSE-CIC-IDS2018.csv` at root level
- **Warning**: this CSV is large (~1–3 GB). Use `--max-rows 200000` if memory
  is constrained

### CERT Insider Threat r4.2

- **Files**: `logon.csv`, `file.csv`, `http.csv`, `email.csv`
- **Labels**: none — all data treated as normal baseline behaviour
- **Features used**: login frequency, after-hours logins, file access patterns,
  URL diversity, email attachment sizes
- **Note**: `device.csv` and `psychometric.csv` are not used. `LDAP/` subfolder
  is not used.

### ADFA-LD

- **Files**: `ADFA-LD/Training_Data_Master/*.txt` (833 files, normal)
  `ADFA-LD/Attack_Data_Master/**/*.txt` (attack, in subdirs)
- **Labels**: training dir = normal (y=0), attack dir = attack (y=1)
- **Features used**: syscall frequency, diversity (entropy, Gini), transition
  rate, suspicious-syscall ratio
- **Status**: ready — `.txt` extension confirmed

### ADFA-WD / Full_Process_Traces

- **Files**: `Full_Process_Traces/Full_Trace_Training_Data/*.GHC` (normal)
  `Full_Process_Traces/Full_Trace_Attack_Data/**/*.GHC` (attack)
- **Labels**: training/validation dirs = normal, attack dir = attack
- **Format**: same space-separated integer format as ADFA-LD, `.GHC` extension
- **Status**: the script handles both the root-level `Full_Process_Traces/`
  layout (your primary data) and the `ADFA-WD-SAA_Master/` scaffold layout

### DAPT2020

- **Files**: `DAPT2020/*.pcap_Flow.csv` (10 files)
- **Labels**: filename contains `pvt` = attack (APT C2 traffic)
  - Normal: `enp0s3-monday.pcap_Flow.csv`, `enp0s3-public-*.pcap_Flow.csv`,
    `enp0s3-tcpdump-friday.pcap_Flow.csv`
  - Attack: `enp0s3-monday-pvt.pcap_Flow.csv`, `enp0s3-pvt-*.pcap_Flow.csv`,
    `enp0s3-tcpdump-pvt-friday.pcap_Flow.csv`
- **Features used**: flow duration, packet counts, port numbers, IAT std dev,
  packet size (APT low-and-slow detection)
- **Status**: ready — `pvt` matching uses case-insensitive substring search

---

## Troubleshooting

**"No training data could be loaded"**  
Run `verify_datasets.py` first. At least one dataset must load successfully.

**CIC: memory error or very slow**  
Add `--max-rows 100000` — the CIC CSV can exceed 2 GB uncompressed.

**ADFA-WD: "no trace files found"**  
The script checks two layouts. Run `verify_datasets.py` and look at the ADFA-WD
section — it will list what files it actually finds.

**Low ROC-AUC scores**  
The feature schema maps network/process telemetry to security dataset fields.
Some columns are absent in some datasets and default to zero — this is expected
and normal. Scores above 0.60 are healthy for an unsupervised model.

**Agent shows "degraded" / no model after training**  
Check the exact filename: it must be `edgepulse_primary_isolation_forest.joblib`
inside `edge-agent/src/models/`. The `bootstrap_model.py` and `train_models.py`
both target this same filename when you use `--output-dir src/models`.

---

## Placing the files in the project

```
edge-agent/
├── src/
│   ├── edgepulse/
│   │   └── scripts/
│   │       └── train_models.py        ← replace the existing file here
│   └── models/                        ← model output goes here
│       └── edgepulse_primary_isolation_forest.joblib
├── verify_datasets.py                 ← keep at repo root for convenience
└── TRAINING.md                        ← keep at repo root
```
