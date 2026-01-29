"""
Alert data models
"""

from datetime import datetime
from typing import Any, Dict, Optional
from pydantic import BaseModel


class Alert(BaseModel):
    """Alert model for security events"""
    
    id: str
    timestamp: datetime
    severity: str  # low, medium, high, critical
    alert_type: str
    message: str
    source: str
    device_id: str
    metadata: Dict[str, Any] = {}
    resolved: bool = False
    resolved_at: Optional[datetime] = None


class AlertConfig(BaseModel):
    """Configuration for alert generation"""
    
    enabled_alerts: list[str] = []
    severity_thresholds: Dict[str, str] = {}
    notification_channels: list[str] = []
    cooldown_period: int = 300  # seconds
