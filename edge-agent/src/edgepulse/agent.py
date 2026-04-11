"""
Re-export shim for EdgePulse Agent

This module re-exports the EdgePulseAgent class from the core module
to maintain backward compatibility while keeping the implementation
in a single location.
"""

# Re-export the main agent class and related components
from edgepulse.core.agent import EdgePulseAgent
from edgepulse.core.agent import AgentCore
from edgepulse.core.agent import AgentState

__all__ = ["EdgePulseAgent", "AgentCore", "AgentState"]
