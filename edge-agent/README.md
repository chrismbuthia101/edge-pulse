# EdgePulse Agent

Edge security monitoring agent: collects system telemetry, extracts behavioral features, and detects anomalies using Isolation Forest (and optionally an Autoencoder). Alerts are generated locally and optionally synced to a Supabase backend.

> **Note**: This project includes a `Makefile` for convenient commands. If you have `make` installed, use `make help` to see all available targets. Make commands are shown first in each section below.

---

## Architecture in One Line

```
Collectors → FeatureExtractor → IsolationForestDetector → AlertEngine → [SupabaseSync]
```

The pipeline runs on a configurable cycle (default 60 s) inside an async event loop. All components communicate through an in-process `EventBus`.

---

## Quick Start (Development)

### Prerequisites

- Python 3.9–3.12
- [Poetry](https://python-poetry.org/docs/#installation)
- [Make](https://www.gnu.org/software/make/) (optional, for convenience commands)

### Install

```bash
git clone <repo>
cd edge-agent

# Using make (recommended if available)
make install                            # core deps + api-full + notifications
make install-all                        # all optional extras
make env                                # copy .env.example → .env

# Or using poetry directly
poetry install                          # core deps only
poetry install --extras "api-full"      # + FastAPI/uvicorn
poetry install --extras "all"           # everything
```

### Configure

```bash
# Using make (recommended if available)
make env                                # copies .env.example → .env

# Or manually
cp .env.example .env
# Edit .env — minimum required: nothing (all defaults work out of the box)
```

### Bootstrap the ML model (first run only)

The agent needs a trained Isolation Forest before it can detect anomalies.

```bash
# Using make (recommended if available)
make bootstrap

# Or manually
python bootstrap_model.py
# Writes:  models/edgepulse_primary_isolation_forest.joblib
```

To train on real security datasets instead of synthetic data, see `src/edgepulse/scripts/train_models.py --help`.

### Run

```bash
# Using make (recommended if available)
make run                                # INFO logging
make dev                                # debug logging

# Or using poetry directly
poetry run edge-agent run
poetry run edge-agent run --verbose     # debug logging
```

The REST API is available at `http://localhost:8080` (auto-selected based on system resources).

---

## Project Structure

```
edge-agent/
├── bootstrap_model.py          # One-shot model bootstrapper
├── models/                     # Trained model files (git-ignored)
├── src/edgepulse/
│   ├── core/
│   │   ├── agent.py            # Main orchestrator (EdgePulseAgent)
│   │   ├── async_pipeline.py   # Collect → Extract → Detect → Alert loop
│   │   └── events_bus.py       # Internal pub/sub
│   ├── collectors/             # psutil-based system/process/network collectors
│   ├── features/               # Feature extraction (CPU, memory, disk, network, process)
│   ├── detectors/              # Isolation Forest, Autoencoder, Ensemble
│   ├── analysis/               # SHAP/LIME explainability, report generator
│   ├── alerts/                 # Alert engine (rate-limit, dedup, correlation)
│   ├── sync/                   # Supabase sync + offline queue FSM
│   ├── storage/                # SQLite, hash-chain audit log
│   ├── api/                    # Adaptive HTTP server (FastAPI / minimal / socket)
│   ├── auth/                   # Device enrollment + credential manager
│   ├── config/                 # Pydantic settings, privacy controller
│   ├── platform/
│   │   ├── linux/              # systemd service installer
│   │   └── windows/            # Windows Service installer (pywin32)
│   └── shared/                 # Schemas, metrics, exceptions
├── .env.example
└── pyproject.toml
```

---

## Service Installation

### Linux (systemd)

```bash
# Using make (recommended if available)
make service-install
sudo systemctl start edgepulse-agent
sudo systemctl status edgepulse-agent
make service-logs

# Or using poetry directly
sudo poetry run edge-agent service install
sudo systemctl start edgepulse-agent
sudo systemctl status edgepulse-agent
sudo journalctl -u edgepulse-agent -f
```

### Windows Service

```powershell
# Run as Administrator

# Using make (recommended if available)
make service-install
make service-start
make service-status

# Or using poetry directly
poetry run edge-agent service install
poetry run edge-agent service start
poetry run edge-agent service status
```

---

## Optional Extras

| Extra           | Installs                   | Use when                                   |
| --------------- | -------------------------- | ------------------------------------------ |
| `api-full`      | FastAPI, uvicorn           | You need the full REST/WebSocket API       |
| `ml-training`   | TensorFlow, SHAP           | Training the Autoencoder                   |
| `ml-inference`  | TFLite runtime             | Running Autoencoder on constrained devices |
| `cloud`         | supabase-py                | Syncing alerts to Supabase                 |
| `notifications` | notify-py                  | Desktop toast notifications                |
| `windows`       | pywin32, keyring, watchdog | Windows Service + filesystem monitoring    |

```bash
poetry install --extras "api-full cloud notifications"
```

---

## Development

```bash
# Using make (recommended if available)
make test                               # run test suite
make lint                               # black (check) + mypy
make fmt                                # auto-format with black
make typecheck                          # mypy only
make clean                              # remove cache files

# Or using poetry directly
poetry run pytest                       # Tests
poetry run black src/                   # Format
poetry run mypy src/                    # Type-check
```

---

## Environment Variables

All settings map to `.env` keys using double-underscore nesting:

```
API__PORT=9090            → settings.api.port
SYNC__ENABLED=true        → settings.sync.enabled
DETECTION__THRESHOLD=0.7  → settings.detection.threshold
```

See `.env.example` for the full reference.
