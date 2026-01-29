# EdgePulse Agent

Edge security monitoring agent for anomaly detection and threat intelligence.

## Installation

```bash
pip install -e .
```

## Usage

```bash
python -m edgepulse --config config.yaml
```

## Development

```bash
# Install development dependencies
pip install -e ".[dev]"

# Run tests
pytest

# Format code
black src/
```

## Structure

- `src/edgepulse/` - Main package source code
- `tests/` - Test suite
- `scripts/` - Utility scripts
- `docs/` - Documentation
