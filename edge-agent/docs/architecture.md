# EdgePulse Agent Architecture & Data Flow

## Overview
The EdgePulse agent is a sophisticated edge security monitoring system that processes telemetry data through multiple stages: **Collection → Feature Extraction → Detection → Analysis → Alerting**.

## System Architecture Diagram

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Data Sources  │    │   Event Bus     │    │   Storage       │
│                 │    │                 │    │                 │
│ • System Metrics │◄──►│ • Async Events  │◄──►│ • SQLite DB     │
│ • Process Data  │    │ • Pub/Sub       │    │ • Time Series   │
│ • Network I/O   │    │ • Correlation   │    │ • Models         │
│ • Logs          │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                    ASYNC PIPELINE                               │
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
│   Outputs       │    │   Sync Layer     │    │   API Layer      │
│                 │    │                 │    │                 │
│ • Alerts        │◄──►│ • Supabase       │◄──►│ • REST API      │
│ • Reports       │    │ • Offline Queue  │    │ • WebSocket     │
│ • Metrics       │    │ • Retry Logic    │    │ • Health Check  │
│ • Logs          │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

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

The **AsyncPipeline** (`src/edgepulse_win/core/async_pipeline.py`) orchestrates the entire flow:

```python
async def process_cycle(self):
    # 1. Collect telemetry (parallel from all collectors)
    telemetry = await self._collect_telemetry()
    
    # 2. Extract features
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

## Data Persistence & Sync

### **Storage Layer** (`src/edgepulse_win/storage/`)
- **DatabaseManager**: SQLite operations for telemetry, alerts, models
- **TimeSeriesStorage**: Efficient time-series data storage
- **ModelStorage**: Persist trained ML models

### **Sync Layer** (`src/edgepulse_win/sync/`)
- **SupabaseSync**: Cloud synchronization with retry logic
- **AsyncSyncQueue**: Offline queue for failed syncs
- **Conflict Resolution**: Handle concurrent updates

## Configuration & Management

### **Settings** (`src/edgepulse_win/config/`)
- **AgentSettings**: Main configuration with Pydantic validation
- **PrivacyConfig**: Data retention and anonymization settings
- **APIConfig**: REST API server configuration

### **Metrics** (`src/edgepulse_win/shared/metrics.py`)
- **StandardMetrics**: Standardized metric definitions
- **InMemoryMetricsCollector**: Real-time metrics collection
- **MetricsRegistry**: Global metrics management

## Input/Output Summary

| Stage | Input | Output |
|-------|-------|--------|
| **Collection** | System calls, network interfaces | Raw telemetry dict |
| **Feature Extraction** | Raw telemetry dict | 64-dim feature vector |
| **Detection** | Feature vector | Anomaly score + label |
| **Analysis** | Detection + features | Explanation + report |
| **Alerting** | Detection + explanation | Processed alert or suppression |

## Performance Characteristics

- **Collection Interval**: 60 seconds (configurable)
- **Feature Dimension**: 64 features (configurable)
- **Detection Latency**: <100ms per feature vector
- **Alert Rate Limiting**: 10 alerts/hour
- **Data Retention**: 30 days (configurable)
- **Sync Batch Size**: 50 records (configurable)

This architecture enables real-time edge security monitoring with intelligent anomaly detection, explainable AI, and comprehensive alert management while maintaining low resource overhead suitable for edge deployment.
