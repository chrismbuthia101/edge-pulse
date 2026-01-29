# EdgePulse Deployment Guide

## Prerequisites

- Python 3.9 or higher
- 2GB RAM minimum (4GB recommended)
- 1GB disk space for logs and models
- Administrative privileges for system monitoring

## Installation

### Option 1: Development Setup

```bash
# Clone the repository
git clone <repository-url>
cd edge-pulse/edge-agent

# Run setup script
./scripts/setup.sh

# Activate environment
source venv/bin/activate
```

### Option 2: Production Installation

```bash
# Install system dependencies
sudo apt-get update
sudo apt-get install python3.9 python3.9-venv python3-pip

# Create system user
sudo useradd -r -s /bin/false edgepulse

# Install application
sudo pip install edge-pulse-agent

# Create directories
sudo mkdir -p /opt/edgepulse/{data,logs,config}
sudo chown -R edgepulse:edgepulse /opt/edgepulse
```

## Configuration

### Basic Configuration

Create a configuration file `config.yaml`:

```yaml
# Device identification
device_id: "production-server-01"

# Data collection settings
collection:
  interval: 60  # seconds
  window_1min: 60
  window_5min: 300
  
# Privacy settings
privacy:
  data_retention_days: 30
  anonymization_level: "medium"
  collect_command_lines: false

# Detection settings
detection:
  isolation_forest:
    contamination: 0.1
    n_estimators: 100
  autoencoder:
    encoding_dim: 8
    threshold: 0.05

# Storage settings
storage:
  database_path: "/opt/edgepulse/data/edgepulse.db"
  log_retention_days: 30

# Alert settings
alerts:
  enabled: true
  severity_threshold: "medium"
  channels: ["local", "email"]
  
# Cloud sync (optional)
sync:
  enabled: false
  supabase_url: ""
  supabase_key: ""
```

### Environment Variables

Create `.env` file:

```bash
DEVICE_ID=production-server-01
COLLECTION_INTERVAL=60
DATA_RETENTION_DAYS=30
ANONYMIZATION_LEVEL=medium
DATABASE_PATH=/opt/edgepulse/data/edgepulse.db
LOG_LEVEL=INFO
```

## System Service Setup

### Systemd Service (Linux)

Create `/etc/systemd/system/edgepulse.service`:

```ini
[Unit]
Description=EdgePulse Security Monitor
After=network.target

[Service]
Type=simple
User=edgepulse
Group=edgepulse
WorkingDirectory=/opt/edgepulse
Environment=PATH=/opt/edgepulse/venv/bin
ExecStart=/opt/edgepulse/venv/bin/python -m edgepulse --config /opt/edgepulse/config/config.yaml
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable edgepulse
sudo systemctl start edgepulse
sudo systemctl status edgepulse
```

### Docker Deployment

Create `Dockerfile`:

```dockerfile
FROM python:3.9-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY src/ ./src/
COPY scripts/ ./scripts/

# Create data directory
RUN mkdir -p /app/data

# Run as non-root user
RUN useradd -r -s /bin/false edgepulse
RUN chown -R edgepulse:edgepulse /app
USER edgepulse

# Expose metrics port
EXPOSE 8080

# Start the application
CMD ["python", "-m", "edgepulse", "--config", "/app/config/config.yaml"]
```

Build and run:

```bash
docker build -t edgepulse-agent .
docker run -d \
  --name edgepulse \
  --restart unless-stopped \
  -v $(pwd)/config:/app/config \
  -v $(pwd)/data:/app/data \
  edgepulse-agent
```

### Kubernetes Deployment

Create `edgepulse-deployment.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: edgepulse-agent
spec:
  replicas: 1
  selector:
    matchLabels:
      app: edgepulse-agent
  template:
    metadata:
      labels:
        app: edgepulse-agent
    spec:
      containers:
      - name: edgepulse
        image: edgepulse-agent:latest
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "1Gi"
            cpu: "500m"
        volumeMounts:
        - name: config
          mountPath: /app/config
        - name: data
          mountPath: /app/data
        env:
        - name: DEVICE_ID
          valueFrom:
            fieldRef:
              fieldPath: metadata.name
      volumes:
      - name: config
        configMap:
          name: edgepulse-config
      - name: data
        persistentVolumeClaim:
          claimName: edgepulse-data
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: edgepulse-config
data:
  config.yaml: |
    device_id: "k8s-pod"
    collection:
      interval: 30
    privacy:
      anonymization_level: "high"
    storage:
      database_path: "/app/data/edgepulse.db"
```

## Monitoring and Maintenance

### Log Management

```bash
# View logs
sudo journalctl -u edgepulse -f

# Rotate logs
logrotate /etc/logrotate.d/edgepulse

# Check disk usage
du -sh /opt/edgepulse/data/
```

### Performance Monitoring

```bash
# Check resource usage
top -p $(pgrep -f edgepulse)

# Monitor database size
sqlite3 /opt/edgepulse/data/edgepulse.db ".tables"
sqlite3 /opt/edgepulse/data/edgepulse.db "SELECT COUNT(*) FROM telemetry;"

# Check alert history
sqlite3 /opt/edgepulse/data/edgepulse.db "SELECT severity, COUNT(*) FROM alerts GROUP BY severity;"
```

### Updates and Maintenance

```bash
# Update application
sudo systemctl stop edgepulse
sudo pip install --upgrade edge-pulse-agent
sudo systemctl start edgepulse

# Retrain models
python scripts/train_models.py --data /opt/edgepulse/data/training_data.csv

# Backup data
sqlite3 /opt/edgepulse/data/edgepulse.db ".backup /backup/edgepulse-$(date +%Y%m%d).db"
```

## Troubleshooting

### Common Issues

1. **High Memory Usage**
   - Reduce collection interval
   - Increase data retention cleanup
   - Optimize feature extraction window sizes

2. **Missing Dependencies**
   - Ensure all system packages are installed
   - Check Python version compatibility
   - Verify virtual environment activation

3. **Permission Errors**
   - Check file permissions on data directory
   - Verify user has system monitoring access
   - Ensure service runs with correct user

4. **Database Corruption**
   - Check disk space availability
   - Verify database file permissions
   - Use SQLite integrity check

### Debug Mode

Enable debug logging:

```yaml
logging:
  level: DEBUG
  file: "/opt/edgepulse/logs/debug.log"
```

Run with verbose output:

```bash
python -m edgepulse --config config.yaml --verbose
```

### Health Checks

Create health check endpoint:

```python
# health_check.py
import requests
import sqlite3
from pathlib import Path

def health_check():
    try:
        # Check database connectivity
        db_path = Path("/opt/edgepulse/data/edgepulse.db")
        conn = sqlite3.connect(db_path)
        conn.close()
        
        # Check recent data collection
        # Add more checks as needed
        
        return {"status": "healthy", "timestamp": time.time()}
    except Exception as e:
        return {"status": "unhealthy", "error": str(e)}

if __name__ == "__main__":
    print(health_check())
```

## Security Considerations

### File Permissions

```bash
# Secure configuration files
sudo chmod 600 /opt/edgepulse/config/*.yaml
sudo chown edgepulse:edgepulse /opt/edgepulse/config/*.yaml

# Secure data directory
sudo chmod 700 /opt/edgepulse/data
sudo chown edgepulse:edgepulse /opt/edgepulse/data
```

### Network Security

- Use firewall rules to restrict access
- Enable TLS for cloud synchronization
- Implement API authentication
- Regular security updates

### Data Protection

- Encrypt sensitive configuration values
- Use secure key management
- Implement access logging
- Regular security audits
