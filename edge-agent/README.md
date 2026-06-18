# EdgePulse Agent

Edge security anomaly detection agent: collects system telemetry, extracts behavioral features, and detects anomalies using Isolation Forest (and optionally an Autoencoder). Alerts are generated locally and synced to a Supabase backend.

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

- Python 3.11–3.13
- [Poetry](https://python-poetry.org/docs/#installation)
- [Make](https://www.gnu.org/software/make/) (optional, for convenience commands)

### Install

```bash
git clone https://github.com/chrismbuthia101/edge-pulse
cd edge-agent

# Using make (recommended if available)
make install                            # core deps + api-full
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
# Edit .env — REQUIRED: Set SYNC__SUPABASE_URL and SYNC__API_KEY
```

### Run

```bash
# Using make (recommended if available)
make run                                # INFO logging
make dev                                # debug logging

# Or using poetry directly
poetry run edge-agent run
poetry run edge-agent run --verbose     # debug logging
```

The REST API is available at `http://localhost:8080`.

---

## Project Structure

```
edge-agent/
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

## Package Installation (Debian/Ubuntu)

Download the `.deb` package and install it:

```bash
sudo dpkg -i edgepulse-agent_0.1.0_amd64.deb
```

The package installer will:
1. Create an isolated Python virtual environment at `/opt/edgepulse/venv`
2. Install the EdgePulse Agent and all dependencies
3. Set up the systemd service (`edgepulse-agent.service`)

### Post-Installation

```bash
# Start the service
sudo systemctl start edgepulse-agent

# Check status
sudo systemctl status edgepulse-agent
```

### Check the API

```bash
# Health check
curl http://localhost:8080/health

# Agent status
curl http://localhost:8080/status

# Prometheus metrics
curl http://localhost:8080/metrics
```

### Configuration

**Cloud sync is required.** You must provide Supabase credentials:

Configuration files are located at:
- `/etc/edgepulse/agent_config.json` - Main configuration (JSON)
- `/opt/edgepulse/.env` - Environment variables

```bash
# Edit configuration (REQUIRED: Set Supabase credentials)
sudo nano /etc/edgepulse/agent_config.json

# Or use environment variables
sudo nano /opt/edgepulse/.env
```

Required settings:
```json
{
  "sync": {
    "supabase_url": "https://your-project.supabase.co",
    "api_key": "your-api-key"
  }
}
```

Or in `.env`:
```
SYNC__SUPABASE_URL=https://your-project.supabase.co
SYNC__API_KEY=your-api-key
```

### View logs

```bash
sudo journalctl -u edgepulse-agent -f
```

### Upgrading

```bash
sudo dpkg -i edgepulse-agent_new_version_amd64.deb
sudo systemctl restart edgepulse-agent
```

### Uninstalling

```bash
sudo systemctl stop edgepulse-agent
sudo dpkg -r edgepulse-agent
# Remove data (optional)
sudo rm -rf /etc/edgepulse /opt/edgepulse /var/lib/edgepulse
```

---

## Service Installation (Development)

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
| `ml-inference`  | TFLite runtime, SHAP       | Running Autoencoder on constrained devices |
| `ml-explain`    | SHAP, LIME                 | ML explainability (SHAP + LIME)            |
| `linux`         | keyring                    | Linux keyring integration                  |
| `windows`       | pywin32, keyring           | Windows Service + credential storage       |

```bash
poetry install --extras "api-full ml-inference"
```

---

## Development

```bash
# Using make (recommended if available)
make lint                               # black (check) + ruff + mypy
make fmt                                # auto-format with black + ruff
make typecheck                          # mypy only
make clean                              # remove cache files

# Or using poetry directly
poetry run black src/                   # Format
poetry run ruff check src/              # Lint
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
