# EdgePulse Architecture

## Overview

EdgePulse is designed as an edge-first anomaly detection system for Windows 10+ enterprise devices. The architecture emphasizes offline capability, privacy preservation, and forensic-grade logging.

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    EdgePulse Agent                        │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  Collectors  │  │   Features   │  │  Detection   │      │
│  │              │  │              │  │              │      │
│  │ - System     │→ │ - Extractor  │→ │ - Isolation  │      │
│  │ - Process    │  │ - Normalizer │  │   Forest     │      │
│  │ - Network    │  │              │  │ - Autoencoder│      │
│  └──────────────┘  └──────────────┘  │ - Ensemble   │      │
│                                       └──────────────┘      │
│                                              │               │
│  ┌──────────────┐  ┌──────────────┐        │               │
│  │ Explainable  │← │   Alerting   │←───────┘               │
│  │     AI       │  │              │                         │
│  │              │  │ - Engine     │                         │
│  │ - SHAP       │  │ - Notifier   │                         │
│  │ - Reports    │  └──────────────┘                         │
│  └──────────────┘         │                                 │
│                            │                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Logging    │← │   Config     │  │    Sync      │      │
│  │              │  │              │  │  (Optional)  │      │
│  │ - Hash Chain │  │ - Settings   │  │              │      │
│  │ - SQLite     │  │ - Privacy    │  │ - Supabase   │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                               │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ (Optional)
                            ▼
                    ┌──────────────┐
                    │   Supabase    │
                    │   (Cloud)    │
                    └──────────────┘
                            │
                            ▼
                    ┌──────────────┐
                    │  Dashboard   │
                    │  (Next.js)   │
                    └──────────────┘
```

## Data Flow

1. **Collection**: Collectors gather system metrics, process data, and network information
2. **Feature Engineering**: Raw data is transformed into ML-ready features with time windows
3. **Normalization**: Features are normalized per-device baseline
4. **Detection**: ML models detect anomalies
5. **Explanation**: SHAP generates feature-level explanations
6. **Alerting**: Alerts are correlated, deduplicated, and prioritized
7. **Notification**: Users are notified via Windows notifications
8. **Logging**: All events are logged with cryptographic integrity
9. **Sync**: (Optional) Processed alerts sync to cloud

## Component Details

### Collectors

- **SystemMetricsCollector**: CPU, memory, disk, network I/O
- **ProcessMonitor**: Process lifecycle, metadata, command line hashing
- **NetworkMonitor**: Connection patterns, entropy, rare ports

### Feature Engineering

- **FeatureExtractor**: Sliding windows, temporal aggregations, burst detection
- **DeviceNormalizer**: Per-device baseline learning, incremental updates

### Detection

- **IsolationForestDetector**: Primary unsupervised detector
- **AutoencoderDetector**: Secondary reconstruction-based detector
- **EnsembleDetector**: Combines multiple detectors with voting

### Explainability

- **SHAPExplainer**: Feature attribution using SHAP values
- **ReportGenerator**: Human-readable reports with severity

### Logging

- **HashChainLogger**: SHA-256 hash chains for tamper detection
- **LogManager**: SQLite database with integrity verification

### Alerting

- **AlertEngine**: Correlation, deduplication, rate limiting
- **LocalNotifier**: Windows notifications, console, log file

### Configuration

- **SettingsManager**: Centralized YAML/JSON configuration
- **PrivacyController**: GDPR-compliant privacy controls

## Privacy & Security

- **Data Minimization**: Only necessary metrics collected
- **Anonymization**: PII hashed before storage
- **Local Processing**: All analysis on-device
- **Tamper-Evident**: Cryptographic hash chains
- **Offline-First**: Full functionality without network

## Performance Considerations

- **Resource Efficiency**: Optimized for edge devices
- **Inference Speed**: <100ms per prediction
- **Memory Footprint**: Minimal overhead
- **Threading**: Concurrent collection, detection, and sync

## Deployment

- **Target**: Windows 10+ laptops/desktops
- **Privileges**: User/admin mode (no kernel drivers)
- **Storage**: Local SQLite, optional cloud sync
- **Updates**: Model retraining, baseline updates
