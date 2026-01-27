# Changelog - EdgePulse Agent Refactoring

## Version 2.0.0 - Complete Refactoring

### 🎯 Major Changes

#### Architecture Improvements
- **Modular Design**: Split monolithic `main.py` into focused modules:
  - `TrainingManager`: Thread-safe training data collection and model training
  - `DetectionPipeline`: Orchestrates detection workflow
- **Dependency Management**: Migrated to Poetry (`pyproject.toml`)
- **Type Safety**: Comprehensive Pydantic models for all data structures
- **Path Management**: Centralized `PathManager` for consistent file paths

#### Autoencoder Integration
- ✅ **Fully Integrated**: Autoencoder now part of ensemble detection
- ✅ **Configurable**: Can be enabled/disabled via configuration
- ✅ **Validated**: Feature dimension validated against model expectations
- ✅ **Training**: Trains alongside Isolation Forest during training period

#### Configuration System
- ✅ **Pydantic-Based**: Type-safe configuration with automatic validation
- ✅ **No Magic Numbers**: All hardcoded values moved to configuration:
  - `training_period_hours` → `config.training.training_period_hours`
  - `min_training_samples` → `config.training.min_training_samples`
  - `feature_dimension` → `config.features.feature_dimension`
  - `history_retention_hours` → `config.features.history_retention_hours`

### 🐛 Bug Fixes

1. **Model Path Inconsistency** - Fixed
   - All models now use consistent paths via `PathManager`
   - Paths are absolute and device-specific

2. **Thread Safety** - Fixed
   - Training data collection is now thread-safe with locks
   - No race conditions

3. **Hash Chain Persistence** - Fixed
   - Automatic persistence to disk after each append
   - Atomic writes for data integrity
   - Loads on startup

4. **Database Connections** - Fixed
   - All operations use context managers
   - No connection leaks

5. **Double Anonymization** - Fixed
   - IP addresses anonymized only once

6. **Alert Engine Compatibility** - Fixed
   - Handles both dict and Pydantic model structures

7. **Feature Dimension Mismatch** - Fixed
   - Configurable feature dimension
   - Validation against model expectations

8. **SHAP Explainer** - Fixed
   - Properly reinitialized after training

### ✨ New Features

- **FeatureConfig**: Configurable feature engineering
- **TrainingConfig**: Configurable training parameters
- **AutoencoderConfig**: Autoencoder configuration options
- **Validation**: Comprehensive input validation throughout

### 📝 Configuration Example

```yaml
detection:
  threshold: 0.5
  use_autoencoder: true
  isolation_forest:
    n_estimators: 100
    contamination: "auto"
  autoencoder:
    enabled: true
    input_dim: 50
    encoding_dim: 8
    hidden_layers: [64, 32, 16]
    learning_rate: 0.001

features:
  feature_dimension: 50
  history_retention_hours: 1

training:
  training_period_hours: 24
  min_training_samples: 100
  max_training_samples: 10000

collection:
  interval: 5
  window_1min: 60
  window_5min: 300
  window_15min: 900

privacy:
  data_retention_days: 30
  anonymization_level: "strict"
  collect_command_lines: false

sync:
  enabled: false
  interval: 3600
  sync_only_alerts: true

alerting:
  correlation_window: 300
  rate_limit: 10
  rate_window: 3600
  min_severity: "medium"
```

### 🔧 Breaking Changes

- **Configuration**: Now uses Pydantic models (backward compatible)
- **Model Paths**: May change location (use PathManager)
- **TrainingManager**: New API for training data collection

### 📦 Dependencies

- Added: `pydantic>=2.5.0`
- Added: `pydantic-settings>=2.1.0`
- Migrated to Poetry for dependency management

### 🚀 Migration Guide

1. Install Poetry: `pip install poetry`
2. Install dependencies: `poetry install`
3. Update configuration file (optional - defaults work)
4. Run agent: `poetry run python -m agent.main`

### 📊 Code Quality

- **Type Hints**: Complete type annotations
- **Error Handling**: Consistent exception hierarchy
- **SOLID Principles**: Applied throughout
- **DRY**: Eliminated code duplication
- **Modularity**: Clear separation of concerns
