# EdgePulse Agent Architecture & Data Flow

## Overview

The EdgePulse agent is a sophisticated edge security monitoring system that processes telemetry data through multiple stages: **Collection → Feature Extraction → Detection → Analysis → Alerting**.

## System Architecture Diagram

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Data Sources  │    │   Event Bus     │    │   Storage       │
│                 │    │                 │    │                 │
│ • System Metrics │◄──►│ • Async Events  │◄──►│ • SQLite DB     │
│ • Process Data  │    │ • Pub/Sub       │    │ • HashChain     │
│ • Network I/O   │    │ • Correlation   │    │ • Time Series   │
│ • Logs          │    │                 │    │ • Models         │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                    EDGE PULSE AGENT                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐           │
│  │ Collectors  │→ │ Features    │→ │ Detectors   │           │
│  │             │  │ Extractor   │  │             │           │
│  │ • System    │  │             │  │ • Isolation │           │
│  │ • Process   │  │ • CPU       │  │ • Autoenc.  │           │
│  │ • Network   │  │ • Memory    │  │ • Ensemble  │           │
│  │ • Custom    │  │ • Disk      │  │             │           │
│  └─────────────┘  │ • Network   │  └─────────────┘           │
│                   │ • Process   │           │                   │
│                   │ • Temporal  │           ▼                   │
│                   │ • Windows   │  ┌─────────────┐           │
│                   └─────────────┘  │ Alert Engine│           │
│                                      │             │           │
│                                      │ • Correlate │           │
│                                      │ • Dedupe    │           │
│                                      │ • Rate Limit│           │
│                                      └─────────────┘           │
└─────────────────────────────────────────────────────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Security      │    │   Sync Layer     │    │   API Layer      │
│                 │    │                 │    │                 │
│ • HashChain     │◄──►│ • Supabase       │◄──►│ • Adaptive API  │
│ • Tamper Log    │    │ • Offline Queue  │    │ • REST/WebSocket│
│ • Privacy Ctrl  │    │ • Retry Logic    │    │ • Health Check  │
│ • Metrics       │    │                 │    │ • Prometheus     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Core System Components

### **EdgePulseAgent** (`src/edgepulse_win/core/agent.py`)

**Purpose**: Main async orchestrator with dependency injection and lifecycle management

**Key Features**:

- Async/await architecture with graceful shutdown
- Dependency injection for all components
- Background task management (health checks, metrics, cleanup)
- Event-driven communication via EventBus
- Tamper-evident logging via HashChain

**Initialization Flow**:

```python
agent = EdgePulseAgent(settings=settings)
await agent.initialize()  # Setup all components
await agent.start()       # Start processing
await agent.run_forever() # Main loop
```

### **Security & Integrity Layer**

#### **HashChain** (`src/edgepulse_win/storage/chain.py`)

**Purpose**: Tamper-evident logging for security-relevant events

**Features**:

- Cryptographic hash chaining (SHA-256)
- Immutable audit trail for anomalies, alerts, sync events
- Device-specific chain isolation
- Integrity verification on load

**Event Types Logged**:

- `agent_started/stopped`: Agent lifecycle events
- `anomaly_detected`: ML detection results
- `alert_generated`: Processed alerts
- `sync_completed`: Cloud sync operations

#### **PrivacyController** (`src/edgepulse_win/config/privacy.py`)

**Purpose**: Data privacy and anonymization controls

**Features**:

- Configurable anonymization levels (none/basic/medium/full)
- Sensitive data hashing
- Command line collection control
- Data retention enforcement

### **Adaptive API Server** (`src/edgepulse_win/api/api_server.py`)

**Purpose**: Resource-aware API server with mode switching

**Modes**:

- **Auto**: Automatically selects based on available resources
- **FastAPI**: Full-featured REST + WebSocket (requires ≥512MB RAM, ≥2 cores)
- **Minimal**: Lightweight HTTP server for constrained environments
- **Socket**: Unix socket for local communication

**Features**:

- Health check endpoints
- Metrics exposure (Prometheus compatible)
- Resource monitoring and mode adaptation
- Graceful degradation under load

## Detailed Component Interactions

### 1. DATA COLLECTION STAGE

#### **Collectors** (`src/edgepulse_win/collectors/`)

**Purpose**: Gather raw telemetry data from various system sources

**Key Components**:

- **SystemMetricsCollector**: CPU, memory, disk, network metrics
- **ProcessMonitor**: Process creation, execution, resource usage
- **NetworkMonitor**: Network connections, traffic patterns
- **CustomCollectors**: Extensible for specific data sources

**Inputs**:

- System calls (psutil)
- Windows Performance Counters
- Network interfaces
- Process tables

**Outputs**:

```python
{
    "timestamp": "2024-01-01T12:00:00Z",
    "cpu": {
        "cpu_percent": 75.5,
        "cpu_percent_per_core": [80.2, 70.8, 75.1, 76.9],
        "cpu_count": 4,
        "cpu_frequency_mhz": 2400.0
    },
    "memory": {
        "memory_percent": 68.2,
        "memory_used_bytes": 5463549952,
        "memory_available_bytes": 2549663744,
        "swap_percent": 12.5
    },
    "disk": {
        "disk_read_bytes_delta": 1048576,
        "disk_write_bytes_delta": 2097152,
        "disk_usage": {
            "/": {"percent": 85.2, "used_bytes": 500000000000}
        }
    },
    "network": {
        "network_bytes_sent_delta": 524288,
        "network_bytes_recv_delta": 1048576,
        "network_errin": 0,
        "network_errout": 0
    }
}
```

### 2. FEATURE EXTRACTION STAGE

#### **FeatureExtractor** (`src/edgepulse_win/features/feature_extractor.py`)

**Purpose**: Transform raw telemetry into ML-ready feature vectors

**Process Flow**:

1. **Validate telemetry structure**
2. **Update historical buffer** (24-hour retention)
3. **Extract feature groups**:
   - CPU features (6 dims): usage, per-core stats, frequency
   - Memory features (6 dims): usage, swap, totals in GB
   - Disk features (8 dims): I/O rates, counts, totals
   - Network features (8 dims): throughput, errors, drops
   - Process features (6 dims): count, unique names, resource usage
   - Connection features (6 dims): active connections, unique destinations
   - Temporal features (6 dims): hour, weekday, normalized values
   - Window features (12 dims): 1min, 5min, 15min aggregations

**Inputs**: Raw telemetry from collectors
**Outputs**: Normalized feature vector (64-dimensional float array)

```python
# Example feature vector output
[
    75.5,  # cpu_percent_total
    75.75, # mean_cpu_per_core
    80.2,  # max_cpu_per_core
    3.41,  # std_cpu_per_core
    4.0,   # cpu_count
    2400.0, # cpu_frequency_mhz
    68.2,  # memory_percent
    5.09,  # memory_used_gb
    2.37,  # memory_available_gb
    12.5,  # swap_percent
    0.5,   # swap_used_gb
    8.0,   # memory_total_gb
    # ... 52 more features
]
```

### 3. ANOMALY DETECTION STAGE

#### **Detectors** (`src/edgepulse_win/detectors/`)

**Purpose**: Identify anomalous patterns in feature vectors

#### **IsolationForestDetector** (`isolation_forest_detector.py`)

- **Algorithm**: Unsupervised isolation forest
- **Input**: Feature vector (64 dims)
- **Output**:
  ```python
  {
      "label": 1,  # 1 = anomaly, 0 = normal
      "anomaly_score": 0.85,
      "detector": "IsolationForestDetector",
      "confidence": 0.92,
      "severity": "high"
  }
  ```

#### **AutoencoderDetector** (`autoencoder_reconstruction_detector.py`)

- **Algorithm**: Neural network autoencoder
- **Input**: Feature vector
- **Output**: Reconstruction error-based anomaly score

#### **EnsembleDetector** (`ensemble_detector.py`)

- **Algorithm**: Weighted voting from multiple detectors
- **Input**: Results from individual detectors
- **Output**: Combined anomaly prediction with confidence

### 4. ANALYSIS STAGE

#### **SHAPExplainer** (`src/edgepulse_win/analysis/shap_explainer.py`)

**Purpose**: Explain why anomalies were detected

**Input**: Detection result + feature vector
**Output**: Feature importance explanation

```python
{
    "explanation": {
        "method": "shap",
        "contributing_factors": [
            {"feature": "cpu_percent_total", "contribution": 0.35, "value": 95.2},
            {"feature": "network_bytes_sent_delta", "contribution": 0.28, "value": 104857600},
            {"feature": "process_count", "contribution": 0.22, "value": 250}
        ],
        "base_value": 0.1,
        "prediction": 0.85
    }
}
```

#### **ReportGenerator** (`src/edgepulse_win/analysis/report_generator.py`)

**Purpose**: Generate detailed incident reports

**Input**: Detection + explanation + context
**Output**: Structured report for security analysts

### 5. ALERTING STAGE

#### **AlertEngine** (`src/edgepulse_win/alerts/alert_engine.py`)

**Purpose**: Intelligent alert generation and management

**Process Flow**:

1. **Severity Filtering**: Only alerts above threshold
2. **Rate Limiting**: Prevent alert fatigue (max 10/hour)
3. **Deduplication**: Suppress similar alerts (80% similarity)
4. **Correlation**: Group related alerts within time window
5. **Attack Pattern Detection**: Identify multi-stage attacks

**Input**: Detection result + explanation
**Output**: Processed alert or suppression

```python
{
    "alert_id": "alert_20240101_120000_001",
    "timestamp": "2024-01-01T12:00:00Z",
    "severity": "high",
    "anomaly_score": 0.85,
    "anomaly": {
        "detector": "IsolationForestDetector",
        "label": 1,
        "confidence": 0.92
    },
    "explanation": {
        "contributing_factors": [...]
    },
    "correlated_alerts": ["alert_20240101_115500_001"],
    "correlation_count": 2
}
```

## Event Bus Communication

The **EventBus** (`src/edgepulse_win/core/events_bus.py`) coordinates all components:

**Event Types**:

- `TELEMETRY_COLLECTED`: Raw data available
- `FEATURES_EXTRACTED`: Features ready for detection
- `ANOMALY_DETECTED`: Anomaly found by detector
- `ALERT_GENERATED`: Alert created by engine
- `SYNC_COMPLETED`: Data synced to cloud
- `PIPELINE_ERROR`: Processing error occurred

**Event Flow Example**:

```python
# Collector publishes telemetry
await event_bus.publish(Event(
    type=EventType.TELEMETRY_COLLECTED,
    data={"telemetry": raw_data},
    timestamp=datetime.utcnow(),
    source="system_collector"
))

# Pipeline processes and publishes anomaly
await event_bus.publish(Event(
    type=EventType.ANOMALY_DETECTED,
    data={"detection": anomaly_result, "features": features},
    timestamp=datetime.utcnow(),
    source="async_pipeline"
))
```

## Pipeline Processing Loop

The **AsyncPipeline** (`src/edgepulse_win/core/async_pipeline.py`) orchestrates the entire flow with metrics tracking:

```python
async def process_cycle(self):
    with PipelineMetrics(self.metrics):
        # 1. Collect telemetry (parallel from all collectors)
        telemetry = await self._collect_telemetry()

        # 2. Extract features with normalization
        features = await self._extract_features(telemetry)

        # 3. Run detectors (parallel)
        detections = await self._run_detectors(features)

        # 4. Process detections and generate alerts
        alerts_generated = await self._process_detections(detections, features)

        return {
            "telemetry_points": len(telemetry),
            "features_extracted": len(features),
            "detections": len(detections),
            "alerts_generated": alerts_generated
        }
```

**Key Features**:

- Parallel collector execution
- Metrics tracking for each cycle
- Event-driven notifications
- Graceful error handling

## Data Persistence & Sync

### **Storage Layer** (`src/edgepulse_win/storage/`)

- **DatabaseManager**: SQLite operations for telemetry, alerts, models
- **HashChain**: Tamper-evident audit log with SHA-256 integrity
- **LogManager**: Structured logging with rotation and compression
- **LogWriter**: High-performance async log writing
- **Sanitizer**: Data sanitization for privacy compliance
- **TimeSeriesStorage**: Efficient time-series data storage
- **ModelStorage**: Persist trained ML models

### **Sync Layer** (`src/edgepulse_win/sync/`)

- **SupabaseSync**: Cloud synchronization with retry logic
- **AsyncSyncQueue**: Offline queue for failed syncs (max 10,000 items)
- **Conflict Resolution**: Handle concurrent updates

## Configuration & Management

### **Settings** (`src/edgepulse_win/config/`)

- **AgentSettings**: Main configuration with Pydantic validation
- **APIConfig**: Adaptive API server configuration (mode, port, resource thresholds)
- **SyncConfig**: Cloud sync settings (Supabase, batch size, retry logic)
- **CollectionConfig**: Data collection parameters (intervals, monitoring toggles)
- **FeatureConfig**: Feature extraction settings (dimensions, normalization)
- **DetectionConfig**: ML detector configuration (thresholds, model parameters)
- **PrivacyConfig**: Data retention and anonymization settings
- **AlertingConfig**: Alert engine parameters (rate limiting, correlation)
- **LoggingConfig**: Structured logging configuration

### **Metrics** (`src/edgepulse_win/shared/metrics.py`)

- **StandardMetrics**: Prometheus-compatible metric definitions
- **InMemoryMetricsCollector**: Real-time metrics collection
- **MetricsRegistry**: Global metrics management

**Key Metrics Tracked**:

- `CPU_USAGE`, `MEMORY_USAGE`: System resource utilization
- `PIPELINE_CYCLE_DURATION`: End-to-end processing time
- `ANOMALIES_DETECTED_TOTAL`: Detection count by severity
- `ALERT_ANOMALY_SCORE`: Anomaly score distribution
- `SYNC_ATTEMPTS_TOTAL`, `SYNC_SUCCESS_RATE`: Cloud sync performance
- `SYNC_QUEUE_SIZE`: Offline queue depth

## Input/Output Summary

| Stage                  | Input                            | Output                         |
| ---------------------- | -------------------------------- | ------------------------------ |
| **Collection**         | System calls, network interfaces | Raw telemetry dict             |
| **Feature Extraction** | Raw telemetry dict               | 64-dim feature vector          |
| **Detection**          | Feature vector                   | Anomaly score + label          |
| **Analysis**           | Detection + features             | Explanation + report           |
| **Alerting**           | Detection + explanation          | Processed alert or suppression |

## Deployment & Operations

### **Entry Points**

**CLI** (`src/edgepulse_win/cli.py`):

```bash
edge-agent --daemon --verbose --config /path/to/config.yaml
```

**Python API**:

```python
from edgepulse_win.core.agent import EdgePulseAgent
from edgepulse_win.config.settings import AgentSettings

settings = AgentSettings()
agent = EdgePulseAgent(settings=settings)
await agent.run_forever()
```

### **API Server Modes**

**Auto Mode** (Recommended):

- Automatically selects FastAPI or Minimal based on resources
- FastAPI: ≥512MB RAM, ≥2 CPU cores
- Minimal: Constrained environments

**Manual Mode Selection**:

- `API_MODE=fastapi`: Full REST + WebSocket
- `API_MODE=minimal`: Lightweight HTTP only
- `API_MODE=socket`: Unix socket for local communication

### **Background Services**

**Health Monitoring**:

- Component health checks every 30 seconds
- Pipeline status monitoring
- API server health endpoints

**Data Management**:

- Automatic data cleanup every 24 hours
- Configurable retention periods (1-365 days)
- Model state persistence on shutdown

**Metrics Collection**:

- Real-time system metrics (CPU, memory)
- Pipeline performance metrics
- Prometheus-compatible endpoint

## Performance Characteristics

### **Resource Requirements**

**Minimum Requirements**:

- **CPU**: 1 core (2+ cores for FastAPI mode)
- **Memory**: 256MB (512MB+ for FastAPI mode)
- **Storage**: 1GB (varies with retention)
- **Network**: Optional (for cloud sync)

### **Operational Metrics**

- **Collection Interval**: 60 seconds (5-3600s configurable)
- **Feature Dimension**: 64 features (8-512 configurable)
- **Detection Latency**: <100ms per feature vector
- **Pipeline Cycle Duration**: <500ms typical
- **Alert Rate Limiting**: 5 alerts/hour (1-100 configurable)
- **Data Retention**: 30 days (1-365 days configurable)
- **Sync Batch Size**: 50 records (1-1000 configurable)
- **Offline Queue**: 10,000 items max
- **Health Check Interval**: 30 seconds

### **Scalability Features**

- **Parallel collector execution**
- **Async pipeline processing**
- **Adaptive API server mode**
- **Background task management**
- **Resource-aware component loading**

This architecture enables real-time edge security monitoring with intelligent anomaly detection, explainable AI, tamper-evident logging, and comprehensive alert management while maintaining low resource overhead suitable for edge deployment.
