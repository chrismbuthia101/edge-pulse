#!/bin/bash

# EdgePulse Agent Setup Script

set -e

echo "Setting up EdgePulse Agent..."

# Create virtual environment
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
echo "Activating virtual environment..."
source venv/bin/activate

# Upgrade pip
echo "Upgrading pip..."
pip install --upgrade pip

# Install package in development mode
echo "Installing EdgePulse Agent..."
pip install -e .

# Install development dependencies
echo "Installing development dependencies..."
pip install -e ".[dev]"

# Create necessary directories
echo "Creating data directories..."
mkdir -p data/logs
mkdir -p data/cache
mkdir -p data/models

# Copy example environment file
if [ ! -f ".env" ]; then
    echo "Creating .env file from template..."
    cp .env.example .env
fi

echo "Setup complete!"
echo ""
echo "To activate the environment:"
echo "  source venv/bin/activate"
echo ""
echo "To run EdgePulse Agent:"
echo "  python -m edgepulse_win --config config.yaml"
echo ""
echo "To run tests:"
echo "  pytest"
