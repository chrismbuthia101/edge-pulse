import asyncio
import json
import sys
import psutil
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any, Callable, Dict, Optional

from edgepulse.utils.log_handler import get_logger
from edgepulse.shared.constants import (
    DEFAULT_API_PORT, DEFAULT_API_HOST, DEFAULT_API_MODE,
    DEFAULT_MIN_MEMORY_MB, DEFAULT_MIN_CPU_CORES, DEFAULT_SOCKET_PATH,
    API_MODES, API_ENDPOINTS,
)

logger = get_logger(__name__)

_HTTP_READ_BUFFER = 8192

_detector_health_provider: Optional[Callable[[], Dict[str, Any]]] = None


def register_detector_health_provider(fn: Callable[[], Dict[str, Any]]) -> None:
    global _detector_health_provider
    _detector_health_provider = fn


def _get_detector_health() -> Dict[str, Any]:
    if _detector_health_provider is not None:
        try:
            return _detector_health_provider()
        except Exception as exc:
            logger.warning("detector_health_provider_error", error=str(exc))
    return {
        "status": "unknown",
        "detail": "No detector health provider registered",
        "action_required": "Run `python src/edgepulse/scripts/bootstrap_model.py` if the model has not been bootstrapped.",
    }


def _build_health_response(server_name: str) -> Dict[str, Any]:
    detector = _get_detector_health()
    overall = "healthy" if detector.get("status") == "ok" else "degraded"
    return {
        "status": overall,
        "server": server_name,
        "detector": detector,
    }


class BaseAPIServer(ABC):
    def __init__(self, port: int = DEFAULT_API_PORT):
        self.port = port
        self._running = False
        self.server: Optional[asyncio.Server] = None

    @abstractmethod
    async def start(self) -> None: ...

    @abstractmethod
    async def stop(self) -> None: ...

    def is_healthy(self) -> bool:
        return self._running and self.server is not None


class MinimalAPIServer(BaseAPIServer):

    async def start(self) -> None:
        self.server = await asyncio.start_server(
            self._handle_request, DEFAULT_API_HOST, self.port
        )
        self._running = True
        logger.info("minimal_api_server_started", port=self.port)

    async def stop(self) -> None:
        if self.server:
            self.server.close()
            await self.server.wait_closed()
        self._running = False
        logger.info("minimal_api_server_stopped")

    async def _handle_request(
        self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter
    ) -> None:
        try:
            request = (await reader.read(_HTTP_READ_BUFFER)).decode("utf-8", errors="replace")
            response = self._generate_response(request)
            writer.write(response.encode("utf-8"))
            await writer.drain()
        except Exception as exc:
            logger.error("minimal_api_request_error", error=str(exc))
        finally:
            writer.close()
            await writer.wait_closed()

    def _generate_response(self, request: str) -> str:
        if f"GET {API_ENDPOINTS['health']}" in request:
            data: Dict[str, Any] = _build_health_response("minimal")
        elif f"GET {API_ENDPOINTS['metrics']}" in request:
            data = {"metrics": "basic_metrics_placeholder"}
        else:
            data = {"message": "EdgePulse Agent API", "server": "minimal"}

        body = json.dumps(data)
        return (
            f"HTTP/1.1 200 OK\r\n"
            f"Content-Type: application/json\r\n"
            f"Content-Length: {len(body)}\r\n"
            f"\r\n{body}"
        )


class SocketAPIServer(BaseAPIServer):

    def __init__(self, socket_path: Optional[Path] = None):
        super().__init__(0)
        self.socket_path = socket_path or Path(DEFAULT_SOCKET_PATH)

    async def start(self) -> None:
        if self.socket_path.exists():
            self.socket_path.unlink()
        self.server = await asyncio.start_unix_server(
            self._handle_socket_request, str(self.socket_path)
        )
        self._running = True
        logger.info("socket_api_server_started", socket_path=str(self.socket_path))

    async def stop(self) -> None:
        if self.server:
            self.server.close()
            await self.server.wait_closed()
        if self.socket_path.exists():
            self.socket_path.unlink()
        self._running = False
        logger.info("socket_api_server_stopped")

    async def _handle_socket_request(
        self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter
    ) -> None:
        try:
            command = (await reader.read(_HTTP_READ_BUFFER)).decode("utf-8").strip()
            response = self._process_command(command)
            writer.write(response.encode("utf-8"))
            await writer.drain()
        except Exception as exc:
            logger.error("socket_api_request_error", error=str(exc))
        finally:
            writer.close()
            await writer.wait_closed()

    def _process_command(self, command: str) -> str:
        if command == "health":
            health = _build_health_response("socket")
            return json.dumps(health)
        responses = {
            "status": "OK: EdgePulse Agent Running",
            "metrics": "cpu: 45.2, memory: 67.8, queue_size: 12",
        }
        return responses.get(command, "ERROR: Unknown command")


class FastAPIServer(BaseAPIServer):

    def __init__(self, port: int = DEFAULT_API_PORT):
        super().__init__(port)
        self.app: Optional[Any] = None
        self.uvicorn_server: Optional[Any] = None
        self._serve_task: Optional[asyncio.Task] = None

    def is_healthy(self) -> bool:
        if not self._running or self.uvicorn_server is None:
            return False
        if self._serve_task is not None and self._serve_task.done():
            exc = self._serve_task.exception() if not self._serve_task.cancelled() else None
            if exc:
                logger.error("fastapi_serve_task_died", error=str(exc))
            return False
        return not bool(getattr(self.uvicorn_server, "should_exit", False))

    async def start(self) -> None:
        try:
            from fastapi import FastAPI
            import uvicorn

            self.app = FastAPI(title="EdgePulse Agent API", version="1.0.0")
            self._setup_routes()

            config = uvicorn.Config(
                app=self.app,
                host=DEFAULT_API_HOST,
                port=self.port,
                log_level="info",
            )
            self.uvicorn_server = uvicorn.Server(config)

            loop = asyncio.get_running_loop()
            self._serve_task = loop.create_task(
                self.uvicorn_server.serve(), name="fastapi_serve"
            )
            await asyncio.sleep(0.1)

            if self._serve_task.done():
                exc = (
                    self._serve_task.exception()
                    if not self._serve_task.cancelled()
                    else None
                )
                raise RuntimeError(f"FastAPI server exited during startup: {exc}")

            self._running = True
            logger.info("fastapi_server_started", port=self.port)

        except ImportError:
            logger.error("fastapi_not_available")
            raise

    async def stop(self) -> None:
        if self.uvicorn_server:
            self.uvicorn_server.should_exit = True
            try:
                if hasattr(self.uvicorn_server, "shutdown"):
                    await self.uvicorn_server.shutdown()
            except Exception as exc:
                logger.warning("uvicorn_shutdown_error", error=str(exc))

        if self._serve_task and not self._serve_task.done():
            self._serve_task.cancel()
            try:
                await self._serve_task
            except (asyncio.CancelledError, Exception):
                pass
            self._serve_task = None

        self._running = False
        logger.info("fastapi_server_stopped")

    def _setup_routes(self) -> None:
        @self.app.get(API_ENDPOINTS["health"])
        async def health():
            return _build_health_response("fastapi")

        @self.app.get(API_ENDPOINTS["metrics"])
        async def metrics():
            return {
                "cpu_usage": psutil.cpu_percent(),
                "memory_usage": psutil.virtual_memory().percent,
                "server": "fastapi",
            }

        @self.app.get(API_ENDPOINTS["status"])
        async def status():
            return {"status": "running", "server": "fastapi", "version": "1.0.0"}


class AdaptiveAPIServer:

    def __init__(
        self,
        mode: str = DEFAULT_API_MODE,
        port: int = DEFAULT_API_PORT,
        socket_path: Optional[Path] = None,
        min_memory_mb: int = DEFAULT_MIN_MEMORY_MB,
        min_cpu_cores: int = DEFAULT_MIN_CPU_CORES,
    ):
        self.mode = mode
        self.port = port
        self.socket_path = socket_path
        self.min_memory_mb = min_memory_mb
        self.min_cpu_cores = min_cpu_cores
        self.server: Optional[BaseAPIServer] = None
        self._selected_mode: Optional[str] = None

        logger.info(
            "adaptive_api_server_initialized",
            mode=mode,
            port=port,
            min_memory_mb=min_memory_mb,
            min_cpu_cores=min_cpu_cores,
        )

    async def start(self) -> None:
        self._selected_mode = (
            self.mode if self.mode != "auto" else self._detect_best_mode()
        )
        logger.info("selected_api_mode", mode=self._selected_mode)

        server_factories = {
            API_MODES["FASTAPI"]: lambda: FastAPIServer(self.port),
            API_MODES["SOCKET"]: lambda: SocketAPIServer(self.socket_path),
            API_MODES["MINIMAL"]: lambda: MinimalAPIServer(self.port),
        }

        if self._selected_mode not in server_factories:
            raise ValueError(f"Unknown API mode: {self._selected_mode}")

        try:
            self.server = server_factories[self._selected_mode]()
            await self.server.start()
            logger.info("adaptive_api_server_started", mode=self._selected_mode)
        except Exception as exc:
            logger.error("api_server_start_failed", mode=self._selected_mode, error=str(exc))
            if self._selected_mode != API_MODES["MINIMAL"]:
                logger.info("falling_back_to_minimal_server")
                if self.server is not None:
                    try:
                        await self.server.stop()
                    except Exception:
                        pass
                self.server = MinimalAPIServer(self.port)
                await self.server.start()
                self._selected_mode = API_MODES["MINIMAL"]
            else:
                raise

    async def stop(self) -> None:
        if self.server:
            await self.server.stop()
            logger.info("adaptive_api_server_stopped", mode=self._selected_mode)

    def is_healthy(self) -> bool:
        return self.server is not None and self.server.is_healthy()

    def _detect_best_mode(self) -> str:
        try:
            cpu_count = psutil.cpu_count()
            available_mb = psutil.virtual_memory().available // (1024 * 1024)

            try:
                import fastapi
                import uvicorn
                fastapi_available = True
            except ImportError:
                fastapi_available = False

            logger.debug(
                "system_resources",
                cpu_count=cpu_count,
                available_memory_mb=available_mb,
                fastapi_available=fastapi_available,
            )

            if fastapi_available and cpu_count >= self.min_cpu_cores and available_mb >= self.min_memory_mb:
                return API_MODES["FASTAPI"]
            elif available_mb >= 256:
                if sys.platform.startswith("linux"):
                    return API_MODES["SOCKET"]
                return API_MODES["MINIMAL"]
            else:
                return API_MODES["MINIMAL"]

        except Exception as exc:
            logger.error("resource_detection_failed", error=str(exc))
            return API_MODES["MINIMAL"]

    def get_mode(self) -> Optional[str]:
        return self._selected_mode

    def get_server_info(self) -> Dict[str, Any]:
        if not self.server:
            return {"status": "not_started"}

        info: Dict[str, Any] = {
            "mode": self._selected_mode,
            "status": "running" if self.server.is_healthy() else "error",
            "server_type": self.server.__class__.__name__,
        }
        if hasattr(self.server, "port") and self.server.port > 0:
            info["port"] = self.server.port
        if hasattr(self.server, "socket_path"):
            info["socket_path"] = str(self.server.socket_path)

        return info
