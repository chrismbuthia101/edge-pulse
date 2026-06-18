# Edge Pulse

Edge Pulse is a lightweight edge device anomaly detection system with a Python agent and a web frontend. It collects system signals, extracts features, runs anomaly detection, and logs alerts locally for review.

## Structure

- `edge-agent/`: Python edge agent (collection, detection, alerting, logging)
- `client/`: Web UI
- `docs/`: Architecture and design resources

## Prerequisites

### System Requirements

- **Python**: 3.11 - 3.13
- **Node.js**: 16.0+ (for frontend)
- **Operating System**: Linux, macOS, or Windows
- **Memory**: Minimum 1GB RAM (2GB+ recommended)
- **Storage**: 500MB+ free space

### Dependencies

- **Poetry** (Python package manager)
- **npm/yarn** (Node.js package manager)

## Setup

### 1. Clone the Repository

```bash
git clone <repository-url>
cd edge-pulse
```

### 2. Backend Setup (Edge Agent)

#### Install Poetry (if not installed)

```bash
curl -sSL https://install.python-poetry.org | python3 -
# Or: pip install poetry
```

#### Install Dependencies

```bash
cd edge-agent
poetry install
```

#### Optional: Install ML Extras

```bash
# For full ML capabilities (training + inference)
poetry install --extras all

# Or install specific extras:
poetry install --extras ml-inference  # For inference only
poetry install --extras api-full       # For API server
```

#### Configure Environment

```bash
# Copy environment template
cp .env.example .env

# Edit configuration
nano .env  # or your preferred editor
```

Key settings in `.env`:

- `DEVICE_ID`: Unique identifier for this device
- `API_PORT`: Port for the API server (default: 8080)
- `COLLECTION_INTERVAL`: Data collection interval in seconds
- `DETECTION_THRESHOLD`: Anomaly detection sensitivity (0.0-1.0)

### 3. Frontend Setup

#### Install Dependencies

```bash
cd client
npm install
# or: yarn install
```

#### Configure Environment (if needed)

```bash
# Create environment file if connecting to backend
echo "NEXT_PUBLIC_API_URL=http://localhost:8080" > .env.local
```

## Running the System

### Option 1: Run Backend Only

```bash
cd edge-agent

# Using Poetry
poetry run edge-agent

# With verbose logging
poetry run edge-agent --verbose

# With custom config
poetry run edge-agent --config /path/to/config.json
```

### Option 2: Run Frontend Only

```bash
cd client

# Development mode
npm run dev

# Production mode
npm run build
npm start
```

### Option 3: Run Both (Recommended)

#### Terminal 1 - Backend

```bash
cd edge-agent
poetry run edge-agent
```

#### Terminal 2 - Frontend

```bash
cd client
npm run dev
```

#### Access Points

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8080
- **API Documentation**: http://localhost:8080/docs

## Configuration

### Environment Variables

Key configuration options in `edge-agent/.env`:

| Variable              | Default          | Description                                 |
| --------------------- | ---------------- | ------------------------------------------- |
| `DEVICE_ID`           | `default-device` | Unique device identifier                    |
| `API_PORT`            | `8080`           | API server port                             |
| `COLLECTION_INTERVAL` | `60`             | Data collection interval (seconds)          |
| `DETECTION_THRESHOLD` | `0.5`            | Anomaly detection threshold                 |
| `LOG_LEVEL`           | `INFO`           | Logging level (DEBUG, INFO, WARNING, ERROR) |
| `SYNC_ENABLED`        | `false`          | Enable cloud sync                           |
| `ALERT_ENABLED`       | `true`           | Enable alerting                             |

## Usage

### Monitoring

1. Start the agent as described above
2. Open the frontend at http://localhost:3000
3. View real-time metrics and alerts
4. Check system health and performance

### API Access

```bash
# Get system status
curl http://localhost:8080/status

# Get metrics
curl http://localhost:8080/metrics

# Get recent alerts
curl http://localhost:8080/alerts
```

### Logs

Logs are stored in `src/data/logs/` by default (dev) or `/var/log/edgepulse/` (system install).

## Troubleshooting

### Common Issues

#### 1. Port Already in Use

```bash
# Check what's using the port
lsof -i :8080  # macOS/Linux
netstat -ano | findstr :8080  # Windows

# Change port in .env
API_PORT=8081
```

#### 3. ML Models Not Loading

- Ensure ML extras are installed: `poetry install --extras ml-inference`
- Check model files in `edge-agent/src/models/`

#### 4. High Memory Usage

- Reduce `COLLECTION_INTERVAL` in `.env`
- Set `ENABLE_ML_FEATURES=false` if ML is not needed
- Adjust `MAX_MEMORY_USAGE_MB` limit

### Debug Mode

```bash
# Enable debug logging
poetry run edge-agent --verbose

# Or set in .env
LOG_LEVEL=DEBUG
```

### Clean Installation

```bash
# Reset everything
cd edge-agent
poetry cache clear --all pypi
rm -rf ~/.local/share/edgepulse
poetry install
```

## Development

### Backend Development

```bash
cd edge-agent

# Install dev dependencies
poetry install --with dev

# Code formatting & linting
poetry run black .
poetry run ruff check --fix src/
poetry run mypy src/
```

### Frontend Development

```bash
cd client

# Run tests
npm test

# Build for production
npm run build

# Lint code
npm run lint
```

## Production Deployment

### Systemd Service

```bash
# Create service file
sudo nano /etc/systemd/system/edgepulse.service

# Enable and start
sudo systemctl enable edgepulse
sudo systemctl start edgepulse
```

## Support

- **Documentation**: Check `docs/` directory for detailed architecture
- **Issues**: Report bugs and feature requests via GitHub Issues
- **Logs**: Check logs in `src/data/logs/` (dev) or `/var/log/edgepulse/` (system install) for troubleshooting
