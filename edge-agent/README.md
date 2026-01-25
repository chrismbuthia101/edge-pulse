# EdgePulse Agent (Backend)

The EdgePulse agent is the core Python backend that runs on edge devices to monitor system behavior and detect anomalies.

## Installation

```bash
pip install -r requirements.txt
```

## Configuration

Copy `.env.example` to `.env` in the project root and configure your settings.

## Usage

### Run the Agent

```bash
python -m agent.main
```

### Setup Script

```bash
python scripts/setup.py
```

### Export Logs

```bash
python scripts/export_logs.py --device-id <device-id> --output <output-dir>
```

### Simulate Attacks

```bash
python scripts/simulate_attack.py
```

## Project Structure

```
edge-agent/
├── agent/              # Core agent modules
│   ├── collectors/     # Data collection
│   ├── features/       # Feature engineering
│   ├── detection/      # ML detection
│   ├── explainability/ # XAI
│   ├── logging/        # Secure logging
│   ├── alerting/       # Alerting
│   ├── sync/           # Cloud sync
│   └── config/         # Configuration
├── scripts/            # Utility scripts
├── data/               # Data storage
└── models/             # ML models
```
