"""
Re-export shim for EdgePulse Async Pipeline

This module re-exports AsyncPipeline components from the core module
to maintain backward compatibility while keeping the implementation
in a single location.
"""

from edgepulse.core.async_pipeline import AsyncPipeline
from edgepulse.core.async_pipeline import PipelineStage
from edgepulse.core.async_pipeline import PipelineConfig

__all__ = ["AsyncPipeline", "PipelineStage", "PipelineConfig"]
