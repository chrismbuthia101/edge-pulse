# EdgePulse API Documentation

## Overview

EdgePulse provides both programmatic APIs and CLI interfaces for configuration, monitoring, and data access.

## CLI Interface

### Basic Usage

```bash
# Run with default configuration
python -m edgepulse

# Run with custom configuration
python -m edgepulse --config /path/to/config.yaml

# Run as daemon
python -m edgepulse --daemon

# Enable verbose logging
python -m edgepulse --verbose

# Show help
python -m edgepulse --help
```

### Configuration Options

| Option | Description | Default |
|--------|-------------|---------|
| `--config` | Path to configuration file | `config.yaml` |
| `--daemon` | Run as background daemon | `False` |
| `--verbose` | Enable verbose logging | `False` |

## Python API

### Core Classes

#### EdgePulseAgent

Main agent class for system monitoring.

```python
from edgepulse import EdgePulseAgent
from edgepulse.config import Settings

# Initialize with settings
settings = Settings(config_path="config.yaml")
agent = EdgePulseAgent(settings)

# Run monitoring
agent.run()

# Run as daemon
agent.run_daemon()

# Stop monitoring
agent.stop()
```

#### Pipeline

Data processing pipeline for telemetry data.

```python
from edgepulse.core import Pipeline
from edgepulse.collectors import SystemMetricsCollector
from edgepulse.features import FeatureExtractor
from edgepulse.detectors import IsolationForestDetector
from edgepulse.alerts import AlertEngine

# Create pipeline
collectors = [SystemMetricsCollector()]
extractor = FeatureExtractor()
detectors = [IsolationForestDetector()]
alert_engine = AlertEngine()

pipeline = Pipeline(collectors, extractor, detectors, alert_engine)

# Process data
alerts = pipeline.process()
```

#### Configuration Management

```python
from edgepulse.config import SettingsManager, PrivacyController

# Load settings
settings = SettingsManager()
config = settings.get_config()

# Privacy controls
privacy = PrivacyController(
    data_retention_days=30,
    anonymization_level="medium"
)

# Check if data collection is allowed
if privacy.can_collect_data():
    # Collect data
    pass
```

### Data Collection API

#### Custom Collectors

```python
from edgepulse.collectors.base import BaseCollector

class CustomCollector(BaseCollector):
    def __init__(self, config):
        self.config = config
        self.running = False
    
    def collect(self):
        """Collect custom telemetry data"""
        data = []
        # Implement collection logic
        return data
    
    def start(self):
        """Start the collector"""
        self.running = True
    
    def stop(self):
        """Stop the collector"""
        self.running = False

# Register custom collector
collector = CustomCollector(config)
```

#### Feature Extraction

```python
from edgepulse.features import FeatureExtractor

extractor = FeatureExtractor(
    window_1min=60,
    window_5min=300
)

# Extract features from telemetry
telemetry_data = [
    {
        'timestamp': '2024-01-01T00:00:00Z',
        'cpu_percent': 50.0,
        'memory_percent': 60.0,
        'device_id': 'server-01'
    }
]

features = extractor.extract(telemetry_data)
```

### Detection API

#### Anomaly Detection

```python
from edgepulse.detectors import IsolationForestDetector

# Initialize detector
detector = IsolationForestDetector(
    contamination=0.1,
    n_estimators=100
)

# Train with normal data
training_data = np.random.rand(1000, 10)
detector.train(training_data, config)

# Detect anomalies
test_data = np.random.rand(100, 10)
alerts = detector.detect(test_data)

# Evaluate performance
metrics = detector.evaluate(test_data)
```

#### Custom Detectors

```python
from edgepulse.detectors.base import BaseDetector

class CustomDetector(BaseDetector):
    def train(self, training_data, config):
        """Train custom detection model"""
        # Implement training logic
        pass
    
    def detect(self, features):
        """Detect anomalies in features"""
        alerts = []
        # Implement detection logic
        return alerts
    
    def evaluate(self, test_data):
        """Evaluate detector performance"""
        metrics = {}
        # Implement evaluation logic
        return metrics
```

### Alert Management API

#### Alert Engine

```python
from edgepulse.alerts import AlertEngine, Alert

# Initialize alert engine
alert_engine = AlertEngine()

# Create custom alert
alert = Alert(
    id="alert-001",
    severity="high",
    alert_type="anomaly",
    message="CPU usage spike detected",
    source="isolation_forest",
    device_id="server-01",
    metadata={"cpu_percent": 95.0}
)

# Process alert
alert_engine.process([alert])
```

#### Custom Notifiers

```python
from edgepulse.alerts.base import BaseNotifier

class CustomNotifier(BaseNotifier):
    def __init__(self, config):
        self.config = config
    
    def send(self, alert):
        """Send alert notification"""
        # Implement notification logic
        pass

# Register custom notifier
notifier = CustomNotifier(config)
alert_engine.add_notifier(notifier)
```

### Storage API

#### Database Operations

```python
from edgepulse.storage import DatabaseManager

# Initialize database manager
db = DatabaseManager(Path("data/edgepulse.db"))

# Query telemetry data
telemetry = db.execute_query(
    "SELECT * FROM telemetry WHERE device_id = ? ORDER BY timestamp DESC LIMIT 100",
    ("server-01",)
)

# Query alerts
alerts = db.execute_query(
    "SELECT * FROM alerts WHERE severity = ? AND resolved = FALSE",
    ("high",)
)

# Insert custom data
db.execute_update(
    "INSERT INTO custom_events (timestamp, event_type, data) VALUES (?, ?, ?)",
    (datetime.utcnow().isoformat(), "custom", '{"key": "value"}')
)
```

#### Log Management

```python
from edgepulse.storage import LogManager

# Initialize log manager
log_manager = LogManager()

# Write custom log entry
log_manager.write_event("custom_event", {
    "source": "custom_module",
    "data": {"message": "Custom event occurred"}
})

# Query logs
logs = log_manager.get_logs(
    start_time=datetime(2024, 1, 1),
    end_time=datetime(2024, 1, 2),
    event_type="custom_event"
)
```

### Cloud Sync API

#### Supabase Integration

```python
from edgepulse.sync import SupabaseSync

# Initialize sync client
sync = SupabaseSync(
    url="https://your-project.supabase.co",
    key="your-anon-key"
)

# Sync telemetry data
telemetry_data = [
    {
        "device_id": "server-01",
        "cpu_percent": 50.0,
        "timestamp": "2024-01-01T00:00:00Z"
    }
]
sync.sync_telemetry(telemetry_data)

# Sync alerts
alerts = [
    {
        "id": "alert-001",
        "severity": "high",
        "message": "Anomaly detected"
    }
]
sync.sync_alerts(alerts)
```

## Configuration API

### Settings Schema

```python
# Complete configuration example
config = {
    "device_id": "server-01",
    
    "collection": {
        "interval": 60,
        "window_1min": 60,
        "window_5min": 300,
        "collectors": ["system", "process", "network"]
    },
    
    "privacy": {
        "data_retention_days": 30,
        "anonymization_level": "medium",
        "collect_command_lines": False
    },
    
    "detection": {
        "isolation_forest": {
            "contamination": 0.1,
            "n_estimators": 100
        },
        "autoencoder": {
            "encoding_dim": 8,
            "epochs": 100
        }
    },
    
    "alerts": {
        "enabled": True,
        "severity_threshold": "medium",
        "channels": ["local", "email"],
        "cooldown_period": 300
    },
    
    "storage": {
        "database_path": "data/edgepulse.db",
        "log_retention_days": 30
    },
    
    "sync": {
        "enabled": False,
        "supabase_url": "",
        "supabase_key": ""
    }
}
```

### Environment Variables

```python
import os
from edgepulse.config import Settings

# Load from environment
settings = Settings()
settings.load_from_env()

# Available environment variables
env_vars = {
    "DEVICE_ID": os.getenv("DEVICE_ID"),
    "COLLECTION_INTERVAL": int(os.getenv("COLLECTION_INTERVAL", "60")),
    "DATA_RETENTION_DAYS": int(os.getenv("DATA_RETENTION_DAYS", "30")),
    "ANONYMIZATION_LEVEL": os.getenv("ANONYMIZATION_LEVEL", "medium"),
    "DATABASE_PATH": os.getenv("DATABASE_PATH", "data/edgepulse.db"),
    "LOG_LEVEL": os.getenv("LOG_LEVEL", "INFO")
}
```

## Error Handling

### Exception Types

```python
from edgepulse.exceptions import (
    EdgePulseError,
    ConfigurationError,
    ModelError,
    DetectionError,
    LoggingError,
    SyncError,
    PrivacyError,
    ValidationError
)

try:
    agent = EdgePulseAgent(settings)
    agent.run()
except ConfigurationError as e:
    print(f"Configuration error: {e}")
except ModelError as e:
    print(f"Model error: {e}")
except EdgePulseError as e:
    print(f"EdgePulse error: {e}")
```

### Validation

```python
from edgepulse.utils import validate_device_id, validate_config

# Validate device ID
try:
    validate_device_id("server-01")
except ValidationError as e:
    print(f"Invalid device ID: {e}")

# Validate configuration
try:
    validate_config(config)
except ValidationError as e:
    print(f"Invalid configuration: {e}")
```

## Utilities

### Helper Functions

```python
from edgepulse.utils import generate_hash, format_timestamp, safe_get

# Generate hash
data_hash = generate_hash({"key": "value"})

# Format timestamp
timestamp = format_timestamp()

# Safe dictionary access
value = safe_get(data, "nested.key.path", default="fallback")
```

### Path Management

```python
from edgepulse.utils.paths import PathManager

paths = PathManager()

# Get data directory
data_dir = paths.get_data_dir()

# Get log directory
log_dir = paths.get_log_dir()

# Get model directory
model_dir = paths.get_model_dir()
```

## Testing API

### Test Utilities

```python
from edgepulse.testing import MockCollector, MockDetector

# Create mock collector
collector = MockCollector([
    {"cpu_percent": 50.0, "memory_percent": 60.0}
])

# Create mock detector
detector = MockDetector(anomaly_score=0.8)

# Use in tests
pipeline = Pipeline([collector], extractor, [detector], alert_engine)
alerts = pipeline.process()
```
