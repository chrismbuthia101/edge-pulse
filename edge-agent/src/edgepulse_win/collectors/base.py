"""
Base collector interface
"""

from abc import ABC, abstractmethod
from typing import Any, List, Dict


class BaseCollector(ABC):
    """Base class for data collectors"""
    
    @abstractmethod
    def collect(self) -> List[Any]:
        """Collect data from the system"""
        pass
        
    @abstractmethod
    def start(self) -> None:
        """Start the collector"""
        pass
        
    @abstractmethod
    def stop(self) -> None:
        """Stop the collector"""
        pass
