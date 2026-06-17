from __future__ import annotations

import sys
from abc import ABC, abstractmethod
from typing import Optional


def is_windows() -> bool:
    return sys.platform == "win32"


def is_linux() -> bool:
    return sys.platform.startswith("linux")


def is_macos() -> bool:
    return sys.platform == "darwin"


class ServiceManager(ABC):
    @abstractmethod
    def install_service(self, python_exe: Optional[str] = None) -> bool: ...

    @abstractmethod
    def uninstall_service(self) -> bool: ...

    @abstractmethod
    def start_service(self) -> bool: ...

    @abstractmethod
    def stop_service(self) -> bool: ...

    @abstractmethod
    def get_service_status(self) -> Optional[str]: ...

    @abstractmethod
    def get_service_logs(self, lines: int = 50) -> str: ...

    @abstractmethod
    def cleanup_service_data(self) -> bool: ...


PLATFORM = sys.platform

__all__ = [
    "PLATFORM",
    "ServiceManager",
    "is_windows",
    "is_linux",
    "is_macos",
]
