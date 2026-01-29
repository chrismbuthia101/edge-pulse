#!/usr/bin/env python3
"""
Training script for EdgePulse anomaly detection models
"""

import argparse
import json
import pickle
from pathlib import Path
import numpy as np
import pandas as pd

from edgepulse_win.core.trainer import Trainer
from edgepulse_win.detectors.isolation_forest import IsolationForestDetector
from edgepulse_win.detectors.autoencoder import AutoencoderDetector
from edgepulse_win.utils.paths import PathManager


def load_training_data(data_path: Path) -> np.ndarray:
    """Load training data from CSV file"""
    if data_path.suffix == '.csv':
        df = pd.read_csv(data_path)
        return df.select_dtypes(include=[np.number]).values
    elif data_path.suffix == '.pkl':
        with open(data_path, 'rb') as f:
            return pickle.load(f)
    else:
        raise ValueError(f"Unsupported file format: {data_path.suffix}")


def main():
    parser = argparse.ArgumentParser(description="Train EdgePulse models")
    parser.add_argument("--data", type=str, required=True, help="Path to training data file")
    parser.add_argument("--output", type=str, default="data/models", help="Output directory for models")
    parser.add_argument("--config", type=str, help="Training configuration file")
    
    args = parser.parse_args()
    
    # Setup paths
    path_manager = PathManager()
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Load training data
    print(f"Loading training data from {args.data}")
    training_data = load_training_data(Path(args.data))
    print(f"Training data shape: {training_data.shape}")
    
    # Load configuration
    config = {}
    if args.config:
        with open(args.config, 'r') as f:
            config = json.load(f)
    
    # Default training configuration
    default_config = {
        "isolation_forest": {
            "contamination": 0.1,
            "n_estimators": 100,
            "random_state": 42
        },
        "autoencoder": {
            "encoding_dim": 8,
            "epochs": 100,
            "batch_size": 32
        }
    }
    
    # Merge configurations
    for key, value in default_config.items():
        if key not in config:
            config[key] = value
    
    # Train Isolation Forest
    print("Training Isolation Forest detector...")
    iso_detector = IsolationForestDetector()
    iso_trainer = Trainer(iso_detector)
    iso_trainer.train(training_data, config["isolation_forest"])
    
    # Save Isolation Forest model
    iso_model_path = output_dir / "isolation_forest.pkl"
    with open(iso_model_path, 'wb') as f:
        pickle.dump(iso_detector, f)
    print(f"Isolation Forest model saved to {iso_model_path}")
    
    # Train Autoencoder
    print("Training Autoencoder detector...")
    auto_detector = AutoencoderDetector()
    auto_trainer = Trainer(auto_detector)
    auto_trainer.train(training_data, config["autoencoder"])
    
    # Save Autoencoder model
    auto_model_path = output_dir / "autoencoder.h5"
    auto_detector.model.save(auto_model_path)
    print(f"Autoencoder model saved to {auto_model_path}")
    
    # Save training configuration
    config_path = output_dir / "training_config.json"
    with open(config_path, 'w') as f:
        json.dump(config, f, indent=2)
    print(f"Training configuration saved to {config_path}")
    
    print("Training complete!")


if __name__ == "__main__":
    main()
