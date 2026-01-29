# EdgePulse Architecture

## Overview

EdgePulse is an edge-based security monitoring agent that detects anomalies in system behavior and provides real-time threat intelligence.

## System Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Collectors    │───▶│  Feature Engine │───▶│   Detectors     │
│                 │    │                 │    │                 │
│ • System Metrics│    │ • Extraction    │    │ • Isolation     │
│ • Process       │    │ • Normalization │    │   Forest        │
│ • Network       │    │ • Baseline      │    │ • Autoencoder   │
│ • Custom        │    │ • History       │    │ • Ensemble      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                                        │
                                                        ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│    Storage      │    │    Analysis     │    │     Alerts      │
│                 │    │                 │    │                 │
│ • SQLite DB     │    │ • SHAP          │    │ • Engine        │
│ • Hash Chains   │    │ • Reports       │    │ • Notifiers     │
│ • Sanitization  │    │ • Explanations  │    │ • Handlers      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                                               │
         └───────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │   Cloud Sync    │
                    │                 │
                    │ • Supabase      │
                    │ • Real-time     │
                    │ • Backup        │
                    └─────────────────┘
```

## Core Components

### 1. Data Collectors
Responsible for gathering system telemetry data:

- **SystemMetricsCollector**: CPU, memory, disk usage
- **ProcessMonitor**: Process creation, termination, resource usage
- **NetworkMonitor**: Network connections, bandwidth, protocols
- **BaseCollector**: Abstract interface for custom collectors

### 2. Feature Engineering
Transforms raw telemetry into features suitable for ML:

- **FeatureExtractor**: Window-based feature extraction
- **DeviceNormalizer**: Per-device baseline learning
- **Feature Modules**: CPU, memory, disk, network, process features
- **HistoryUtils**: Temporal feature engineering

### 3. Anomaly Detection
Machine learning models for detecting unusual behavior:

- **IsolationForestDetector**: Unsupervised tree-based detection
- **AutoencoderDetector**: Neural network reconstruction-based detection
- **EnsembleDetector**: Combines multiple detectors for robustness
- **BaseDetector**: Abstract interface for custom detectors

### 4. Analysis & Explanation
Provides insights into detected anomalies:

- **SHAPExplainer**: Model-agnostic explanations using SHAP
- **ReportGenerator**: Human-readable reports and summaries

### 5. Alert Management
Handles alert generation and notification:

- **AlertEngine**: Alert processing and deduplication
- **Notifiers**: Local notifications, email, webhook
- **Handlers**: Alert routing and escalation

### 6. Storage & Logging
Secure, tamper-evident data storage:

- **LogManager**: SQLite database management
- **HashChain**: Cryptographic integrity verification
- **LogWriter**: Structured log writing
- **Sanitizer**: Data privacy and PII removal

### 7. Cloud Synchronization
Optional cloud backup and sync:

- **SupabaseSync**: Real-time sync to Supabase
- **OfflineSupport**: Local-first with cloud backup

## Data Flow

1. **Collection**: Collectors gather telemetry at configured intervals
2. **Extraction**: Raw data is transformed into feature vectors
3. **Normalization**: Features are normalized based on device baselines
4. **Detection**: ML models score features for anomaly likelihood
5. **Analysis**: High-scoring anomalies are explained and contextualized
6. **Alerting**: Alerts are generated and sent to appropriate channels
7. **Storage**: All data is stored securely with integrity verification
8. **Sync**: Data is optionally synchronized to cloud storage

## Security Features

### Privacy Controls
- Configurable data retention policies
- PII detection and anonymization
- Command line collection controls
- Local-first data storage

### Integrity Protection
- SHA-256 hash chains for log tamper detection
- Cryptographic verification of stored data
- Secure key management
- Audit trail maintenance

### Access Control
- Role-based access to different data types
- Encrypted storage for sensitive data
- Secure cloud synchronization
- API authentication and authorization

## Performance Considerations

### Edge Optimization
- Minimal resource footprint
- Efficient ML models for edge devices
- Local processing to reduce latency
- Configurable collection intervals

### Scalability
- Modular architecture for easy extension
- Pluggable components for customization
- Efficient data structures and algorithms
- Memory-conscious design

## Deployment Options

### Standalone Agent
- Runs as a system service or daemon
- Local-only processing and storage
- Suitable for air-gapped environments

### Cloud-Connected Agent
- Local processing with cloud backup
- Real-time alert forwarding
- Centralized management and monitoring
- Remote configuration updates

### Distributed Deployment
- Multiple agents coordinated centrally
- Hierarchical alert aggregation
- Cross-device anomaly correlation
- Fleet management capabilities
