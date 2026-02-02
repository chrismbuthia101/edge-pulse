# Shared metrics system for EdgePulse components.

from abc import ABC, abstractmethod
from datetime import datetime
from typing import Dict, List, Optional, Any, Union
from enum import Enum
from dataclasses import dataclass


class MetricType(Enum):
    """Standard metric types"""
    COUNTER = "counter"
    GAUGE = "gauge"
    HISTOGRAM = "histogram"
    TIMER = "timer"


@dataclass
class MetricDefinition:
    """Standard metric definition"""
    name: str
    metric_type: MetricType
    description: str
    unit: Optional[str] = None


class MetricCollector(ABC):
    """Abstract base class for metric collectors"""
    
    @abstractmethod
    def increment_counter(self, metric_def: MetricDefinition, value: int = 1, labels: Optional[Dict[str, str]] = None) -> None:
        """Increment a counter metric"""
        pass
    
    @abstractmethod
    def set_gauge(self, metric_def: MetricDefinition, value: Union[int, float], labels: Optional[Dict[str, str]] = None) -> None:
        """Set a gauge metric value"""
        pass
    
    @abstractmethod
    def observe_histogram(self, metric_def: MetricDefinition, value: float, labels: Optional[Dict[str, str]] = None) -> None:
        """Observe a histogram metric value"""
        pass
    
    @abstractmethod
    def get_all_metrics(self) -> Dict[str, Any]:
        """Get all current metric values"""
        pass


class InMemoryMetricsCollector(MetricCollector):
    """In-memory implementation of metrics collector"""
    
    def __init__(self, device_id: str = "unknown", max_history_size: int = 1000):
        self.device_id = device_id
        self.counters: Dict[str, int] = {}
        self.gauges: Dict[str, float] = {}
        self.histograms: Dict[str, List[float]] = {}
        self.timers: Dict[str, float] = {}
        self._max_history_size = max_history_size
    
    def increment_counter(self, metric_def: MetricDefinition, value: int = 1, labels: Optional[Dict[str, str]] = None) -> None:
        """Increment a counter metric"""
        key = self._make_key(metric_def.name, labels)
        self.counters[key] = self.counters.get(key, 0) + value
    
    def set_gauge(self, metric_def: MetricDefinition, value: Union[int, float], labels: Optional[Dict[str, str]] = None) -> None:
        """Set a gauge metric value"""
        key = self._make_key(metric_def.name, labels)
        self.gauges[key] = float(value)
    
    def observe_histogram(self, metric_def: MetricDefinition, value: float, labels: Optional[Dict[str, str]] = None) -> None:
        """Observe a histogram metric value"""
        key = self._make_key(metric_def.name, labels)
        if key not in self.histograms:
            self.histograms[key] = []
        self.histograms[key].append(float(value))
        
        # Keep only last N values to prevent memory issues
        if len(self.histograms[key]) > self._max_history_size:
            self.histograms[key] = self.histograms[key][-self._max_history_size:]
    
    def get_all_metrics(self) -> Dict[str, Any]:
        """Get all current metric values"""
        return {
            'counters': self.counters.copy(),
            'gauges': self.gauges.copy(),
            'histograms': {k: v.copy() for k, v in self.histograms.items()},
            'timers': self.timers.copy(),
            'device_id': self.device_id,
            'timestamp': datetime.utcnow().isoformat()
        }
    
    def _make_key(self, name: str, labels: Optional[Dict[str, str]] = None) -> str:
        """Create a unique key for a metric with labels"""
        if not labels:
            return name
        
        label_str = ",".join(f"{k}={v}" for k, v in sorted(labels.items()))
        return f"{name}{{{label_str}}}"


class StandardMetrics:
    """Standard metric definitions for EdgePulse"""
    
    # System metrics
    CPU_USAGE = MetricDefinition(
        name="cpu_usage_percent",
        metric_type=MetricType.GAUGE,
        description="Current CPU usage percentage",
        unit="percent"
    )
    
    MEMORY_USAGE = MetricDefinition(
        name="memory_usage_percent",
        metric_type=MetricType.GAUGE,
        description="Current memory usage percentage",
        unit="percent"
    )
    
    DISK_USAGE = MetricDefinition(
        name="disk_usage_percent",
        metric_type=MetricType.GAUGE,
        description="Current disk usage percentage",
        unit="percent"
    )
    
    # Pipeline metrics
    PIPELINE_CYCLES_TOTAL = MetricDefinition(
        name="pipeline_cycles_total",
        metric_type=MetricType.COUNTER,
        description="Total pipeline processing cycles"
    )
    
    PIPELINE_CYCLE_DURATION = MetricDefinition(
        name="pipeline_cycle_duration_seconds",
        metric_type=MetricType.HISTOGRAM,
        description="Pipeline cycle processing time in seconds",
        unit="seconds"
    )
    
    COLLECTION_INTERVAL = MetricDefinition(
        name="collection_interval_seconds",
        metric_type=MetricType.GAUGE,
        description="Current collection interval",
        unit="seconds"
    )
    
    # Detection metrics
    ANOMALIES_DETECTED_TOTAL = MetricDefinition(
        name="anomalies_detected_total",
        metric_type=MetricType.COUNTER,
        description="Total anomalies detected"
    )
    
    DETECTION_CONFIDENCE = MetricDefinition(
        name="detection_confidence",
        metric_type=MetricType.HISTOGRAM,
        description="Detection confidence scores",
        unit="score"
    )
    
    # Alert metrics
    ALERTS_GENERATED_TOTAL = MetricDefinition(
        name="alerts_generated_total",
        metric_type=MetricType.COUNTER,
        description="Total alerts generated"
    )
    
    ALERT_ANOMALY_SCORE = MetricDefinition(
        name="alert_anomaly_score",
        metric_type=MetricType.HISTOGRAM,
        description="Alert anomaly scores",
        unit="score"
    )
    
    # Sync metrics
    SYNC_ATTEMPTS_TOTAL = MetricDefinition(
        name="sync_attempts_total",
        metric_type=MetricType.COUNTER,
        description="Total sync attempts"
    )
    
    SYNC_SUCCESS_RATE = MetricDefinition(
        name="sync_success_rate",
        metric_type=MetricType.GAUGE,
        description="Sync operation success rate",
        unit="ratio"
    )
    
    SYNC_DURATION = MetricDefinition(
        name="sync_duration_seconds",
        metric_type=MetricType.HISTOGRAM,
        description="Sync operation duration in seconds",
        unit="seconds"
    )
    
    SYNC_QUEUE_SIZE = MetricDefinition(
        name="sync_queue_size",
        metric_type=MetricType.GAUGE,
        description="Number of items in sync queue",
        unit="count"
    )
    
    SYNC_RETRY_COUNT = MetricDefinition(
        name="sync_retry_count",
        metric_type=MetricType.COUNTER,
        description="Total number of sync retries"
    )


class MetricsRegistry:
    """Registry for managing metrics collectors"""
    
    def __init__(self):
        self._collectors: Dict[str, MetricCollector] = {}
    
    def register(self, name: str, collector: MetricCollector) -> None:
        """Register a metrics collector"""
        self._collectors[name] = collector
    
    def get(self, name: str) -> Optional[MetricCollector]:
        """Get a registered metrics collector"""
        return self._collectors.get(name)
    
    def get_all(self) -> Dict[str, MetricCollector]:
        """Get all registered collectors"""
        return self._collectors.copy()


# Global metrics registry
_metrics_registry = MetricsRegistry()


def get_metrics_registry() -> MetricsRegistry:
    """Get the global metrics registry"""
    return _metrics_registry


def create_metrics_collector(name: str, device_id: str = "unknown") -> MetricCollector:
    """Create and register a new metrics collector"""
    collector = InMemoryMetricsCollector(device_id)
    _metrics_registry.register(name, collector)
    return collector


def get_metrics_collector(name: str) -> Optional[MetricCollector]:
    """Get a metrics collector by name"""
    return _metrics_registry.get(name)
