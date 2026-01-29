"""Feature extraction and normalization modules."""

from edgepulse_win.features.extractor import FeatureExtractor
from edgepulse_win.features.baseline import DeviceNormalizer

__all__ = ["FeatureExtractor", "DeviceNormalizer"]
