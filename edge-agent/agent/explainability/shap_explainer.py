"""
SHAP Explainer

Generates feature-level explanations using SHAP values.
"""

import logging
from typing import Dict, List, Tuple, Optional
import numpy as np
import shap

logger = logging.getLogger(__name__)


class SHAPExplainer:
    """
    Generates feature-level explanations using SHAP.
    
    Identifies which features triggered anomaly detection.
    """

    def __init__(self, model, feature_names: Optional[List[str]] = None):
        """
        Initialize the SHAP explainer.
        
        Args:
            model: Trained model (Isolation Forest or compatible)
            feature_names: List of feature names (default: feature_0, feature_1, ...)
        """
        self.model = model
        self.feature_names = feature_names
        
        # Initialize SHAP explainer based on model type
        self.explainer = None
        self._initialize_explainer()

    def _initialize_explainer(self) -> None:
        """Initialize the appropriate SHAP explainer for the model."""
        try:
            # Check if model is tree-based (Isolation Forest)
            if hasattr(self.model, 'estimators_'):
                # Tree-based model
                self.explainer = shap.TreeExplainer(self.model)
            else:
                # Generic explainer (slower but more general)
                # Note: This requires background data, which we'll need to provide
                logger.warning("Using generic SHAP explainer - background data may be needed")
                self.explainer = None
        except Exception as e:
            logger.error(f"Error initializing SHAP explainer: {e}")
            self.explainer = None

    def explain_prediction(
        self,
        features: np.ndarray,
        feature_names: Optional[List[str]] = None,
        background_data: Optional[np.ndarray] = None,
    ) -> Dict:
        """
        Explain a prediction by computing SHAP values.
        
        Args:
            features: Feature array (can be 1D or 2D)
            feature_names: Feature names (overrides default)
            background_data: Background data for model-agnostic explainers
            
        Returns:
            Dictionary with explanation data
        """
        if features.ndim == 1:
            features = features.reshape(1, -1)
        
        feature_names = feature_names or self.feature_names
        if feature_names is None:
            feature_names = [f"feature_{i}" for i in range(features.shape[1])]
        
        try:
            # Get SHAP values
            if self.explainer is None:
                # Fallback: use model-agnostic explainer
                if background_data is None:
                    logger.warning("No explainer available and no background data provided")
                    return self._fallback_explanation(features, feature_names)
                
                explainer = shap.KernelExplainer(
                    lambda x: self.model.predict(x),
                    background_data
                )
                shap_values = explainer.shap_values(features)
            else:
                shap_values = self.explainer.shap_values(features)
            
            # Handle different SHAP output formats
            if isinstance(shap_values, list):
                shap_values = shap_values[0]  # Take first output
            
            if shap_values.ndim > 2:
                shap_values = shap_values[0]  # Take first sample
            
            # Get top contributors
            top_features = self.get_top_contributors(shap_values, feature_names)
            
            # Generate explanation text
            explanation_text = self.generate_explanation_text(shap_values, feature_names)
            
            return {
                "shap_values": shap_values.tolist() if isinstance(shap_values, np.ndarray) else shap_values,
                "top_features": top_features,
                "explanation_text": explanation_text,
                "feature_names": feature_names,
            }
        except Exception as e:
            logger.error(f"Error explaining prediction: {e}")
            return self._fallback_explanation(features, feature_names)

    def get_top_contributors(
        self,
        shap_values: np.ndarray,
        feature_names: List[str],
        n: int = 5,
    ) -> List[Dict]:
        """
        Get top N contributing features.
        
        Args:
            shap_values: SHAP values array
            feature_names: List of feature names
            n: Number of top features to return (default: 5)
            
        Returns:
            List of dictionaries with feature information
        """
        if shap_values.ndim > 1:
            shap_values = shap_values[0]  # Take first sample
        
        # Get absolute values for ranking
        abs_values = np.abs(shap_values)
        
        # Get top N indices
        top_indices = np.argsort(abs_values)[-n:][::-1]
        
        top_features = []
        for idx in top_indices:
            value = float(shap_values[idx])
            abs_value = abs_values[idx]
            
            # Determine direction
            if value > 0:
                direction = "increase"
            elif value < 0:
                direction = "decrease"
            else:
                direction = "neutral"
            
            top_features.append({
                "feature": feature_names[idx] if idx < len(feature_names) else f"feature_{idx}",
                "contribution": float(value),
                "absolute_contribution": float(abs_value),
                "direction": direction,
                "index": int(idx),
            })
        
        return top_features

    def generate_explanation_text(
        self,
        shap_values: np.ndarray,
        feature_names: List[str],
    ) -> str:
        """
        Generate human-readable explanation text.
        
        Args:
            shap_values: SHAP values array
            feature_names: List of feature names
            
        Returns:
            Natural language explanation string
        """
        if shap_values.ndim > 1:
            shap_values = shap_values[0]
        
        top_features = self.get_top_contributors(shap_values, feature_names, n=3)
        
        if not top_features:
            return "Anomaly detected, but no specific features could be identified."
        
        explanations = []
        for feat in top_features:
            feat_name = feat["feature"]
            direction = feat["direction"]
            contribution = abs(feat["contribution"])
            
            if direction == "increase":
                explanations.append(f"{feat_name} increased significantly (contribution: {contribution:.3f})")
            elif direction == "decrease":
                explanations.append(f"{feat_name} decreased significantly (contribution: {contribution:.3f})")
            else:
                explanations.append(f"{feat_name} showed unusual pattern (contribution: {contribution:.3f})")
        
        explanation = "Anomaly detected due to: " + ", ".join(explanations)
        return explanation

    def _fallback_explanation(
        self,
        features: np.ndarray,
        feature_names: List[str],
    ) -> Dict:
        """
        Fallback explanation when SHAP is unavailable.
        
        Args:
            features: Feature array
            feature_names: Feature names
            
        Returns:
            Dictionary with basic explanation
        """
        if features.ndim == 1:
            features = features.reshape(1, -1)
        
        # Simple feature magnitude-based explanation
        feature_magnitudes = np.abs(features[0])
        top_indices = np.argsort(feature_magnitudes)[-5:][::-1]
        
        top_features = []
        for idx in top_indices:
            value = float(features[0, idx])
            top_features.append({
                "feature": feature_names[idx] if idx < len(feature_names) else f"feature_{idx}",
                "contribution": value,
                "absolute_contribution": abs(value),
                "direction": "increase" if value > 0 else "decrease",
                "index": int(idx),
            })
        
        return {
            "top_features": top_features,
            "explanation_text": "Anomaly detected based on feature magnitudes (SHAP unavailable).",
            "feature_names": feature_names,
        }

    def visualize_explanation(
        self,
        shap_values: np.ndarray,
        features: np.ndarray,
        feature_names: List[str],
        save_path: Optional[str] = None,
    ) -> None:
        """
        Visualize SHAP explanation (optional).
        
        Args:
            shap_values: SHAP values array
            features: Original feature array
            feature_names: Feature names
            save_path: Path to save visualization (optional)
        """
        try:
            import matplotlib.pyplot as plt
            
            if shap_values.ndim > 1:
                shap_values = shap_values[0]
                features = features[0]
            
            # Create bar plot
            plt.figure(figsize=(10, 6))
            indices = np.argsort(np.abs(shap_values))[-10:][::-1]
            
            plt.barh(range(len(indices)), shap_values[indices])
            plt.yticks(range(len(indices)), [feature_names[i] for i in indices])
            plt.xlabel("SHAP Value")
            plt.title("Top Contributing Features")
            plt.tight_layout()
            
            if save_path:
                plt.savefig(save_path)
                logger.info(f"Saved SHAP visualization to {save_path}")
            else:
                plt.show()
            
            plt.close()
        except ImportError:
            logger.warning("Matplotlib not available for visualization")
        except Exception as e:
            logger.error(f"Error creating visualization: {e}")
