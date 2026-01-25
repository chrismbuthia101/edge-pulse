# EdgePulse

**ML-Powered Edge Device Anomaly Detection System**

EdgePulse is a comprehensive anomaly detection system designed for enterprise Windows 10+ laptops and desktops. It operates edge-first with full offline capability, integrating machine learning-based detection, explainable AI, tamper-evident logging, and privacy-preserving design.

## Features

- **Real-time Anomaly Detection**: ML-powered detection using Isolation Forest and Autoencoder models
- **Explainable AI**: SHAP-based explanations for all anomaly detections
- **Tamper-Evident Logging**: Cryptographic hash chains ensure log integrity
- **Privacy-by-Design**: Data minimization, anonymization, and local-first processing
- **Offline-First**: Full functionality without network connectivity
- **Optional Cloud Sync**: Minimal bandwidth sync to Supabase for centralized monitoring
- **Windows Integration**: Native Windows notifications and system integration

## Architecture

EdgePulse follows a modular, edge-first architecture:

```
EdgePulse/
├── edge-agent/         # Backend - Python monitoring agent
│   ├── agent/          # Core agent modules
│   │   ├── collectors/     # Data collection (system, process, network)
│   │   ├── features/       # Feature engineering
│   │   ├── detection/      # ML anomaly detection
│   │   ├── explainability/ # XAI explanations
│   │   ├── logging/        # Secure logging
│   │   ├── alerting/       # Alert management
│   │   ├── sync/           # Cloud sync (optional)
│   │   └── config/         # Configuration
│   ├── scripts/        # Utility scripts
│   ├── data/           # Local data storage
│   ├── models/         # Trained ML models
│   ├── tests/          # Test suite
│   └── requirements.txt # Python dependencies
├── frontend/           # Frontend - Next.js analyst dashboard
│   ├── src/
│   │   ├── app/        # Next.js app router pages
│   │   ├── components/ # React components
│   │   ├── lib/        # Utilities (Supabase client, etc.)
│   │   └── types/      # TypeScript types
│   └── package.json    # Node.js dependencies
└── docs/               # Documentation
```

## Installation

### Prerequisites

- Python 3.9+
- Node.js 18+ (for dashboard)
- Windows 10+

### Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd edge-pulse
```

2. Install Python dependencies (backend):
```bash
cd edge-agent
pip install -r requirements.txt
```

3. Configure environment:
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. (Optional) Setup frontend dashboard:
```bash
cd frontend
npm install
```

## Usage

### Running the Agent (Backend)

```bash
cd edge-agent
python -m agent.main
```

Or:

```bash
cd edge-agent
python agent/main.py
```

The agent will:
1. Initialize all modules
2. Begin collecting system telemetry
3. Extract features and detect anomalies
4. Generate alerts and notifications
5. Log all events securely

### Running the Dashboard (Frontend)

```bash
cd frontend
npm run dev
```

Access the dashboard at `http://localhost:3000`

## Configuration

Configuration is managed through:
- Environment variables (`.env` file)
- YAML config file (`~/.edge-pulse/config.yaml`)

See `.env.example` for available configuration options.

## Privacy & Security

- **Data Minimization**: Only necessary metrics are collected
- **Local Processing**: All analysis happens on-device
- **Anonymization**: PII is hashed before storage
- **Tamper-Evident**: Cryptographic hash chains prevent log tampering
- **GDPR Compliant**: Privacy-by-design principles throughout

## Development

### Project Structure

See `docs/architecture.md` for detailed architecture documentation.

### Testing

```bash
cd edge-agent
pytest tests/
```

### Code Style

This project follows PEP 8 Python style guidelines and uses:
- Type hints throughout
- Comprehensive docstrings
- Black for code formatting

## License

[Your License Here]

## Contributing

[Contributing Guidelines]

## Support

[Support Information]
