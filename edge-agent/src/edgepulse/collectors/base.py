# Base collector interface

from abc import ABC, abstractmethod
from typing import Any, List


class BaseCollector(ABC):
    @abstractmethod
    def collect(self) -> List[Any]:
        pass
        
    @abstractmethod
    def start(self) -> None:
        pass
        
    @abstractmethod
    def stop(self) -> None:
        pass
