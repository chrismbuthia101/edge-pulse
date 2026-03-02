import asyncio
import json
import psutil
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Dict, Optional, Any, List, Union
from datetime import datetime

from edgepulse_win.utils.log_handler import get_logger
from edgepulse_win.shared import SeverityLevel, DeviceStatus, create_standard_response
from edgepulse_win.shared.constants import (
    DEFAULT_API_PORT, DEFAULT_API_HOST, DEFAULT_API_MODE,
    DEFAULT_MIN_MEMORY_MB, DEFAULT_MIN_CPU_CORES, DEFAULT_SOCKET_PATH,
    API_MODES, API_ENDPOINTS
)

logger = get_logger(__name__)

class BaseAPIServer(ABC):
    """Base class for API servers"""
    
    def __init__(self, port: int = DEFAULT_API_PORT):
        self.port = port
        self._running = False
        self.server: Optional[asyncio.Server] = None
    
    @abstractmethod
    async def start(self) -> None: pass
    
    @abstractmethod
    async def stop(self) -> None: pass
    
    def is_healthy(self) -> bool:
        return self._running and self.server is not None

class MinimalAPIServer(BaseAPIServer):
    """Minimal HTTP server using only standard library"""
    
    async def start(self) -> None:
        self.server = await asyncio.start_server(self._handle_request, DEFAULT_API_HOST, self.port)
        self._running = True
        logger.info("minimal_api_server_started", port=self.port)
    
    async def stop(self) -> None:
        if self.server:
            self.server.close()
            await self.server.wait_closed()
        self._running = False
        logger.info("minimal_api_server_stopped")
    
    async def _handle_request(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        try:
            request = await reader.read(1024)
            request_str = request.decode('utf-8')
            response = self._generate_response(request_str)
            writer.write(response.encode('utf-8'))
            await writer.drain()
        except Exception as e:
            logger.error("minimal_api_request_error", error=str(e))
        finally:
            writer.close()
            await writer.wait_closed()
    
    def _generate_response(self, request: str) -> str:
        if f"GET {API_ENDPOINTS['health']}" in request:
            data = {"status": "healthy", "server": "minimal"}
        elif f"GET {API_ENDPOINTS['metrics']}" in request:
            data = {"metrics": "basic_metrics_placeholder"}
        else:
            data = {"message": "EdgePulse Agent API", "server": "minimal"}
        
        body = json.dumps(data)
        return f"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {len(body)}\r\n\r\n{body}"

class SocketAPIServer(BaseAPIServer):
    """Unix socket API server for low-resource environments"""
    
    def __init__(self, socket_path: Optional[Path] = None):
        super().__init__(0)  # Port not used for socket
        self.socket_path = socket_path or Path(DEFAULT_SOCKET_PATH)
    
    async def start(self) -> None:
        if self.socket_path.exists():
            self.socket_path.unlink()
        
        self.server = await asyncio.start_unix_server(self._handle_socket_request, str(self.socket_path))
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
    
    async def _handle_socket_request(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        try:
            request = await reader.read(1024)
            command = request.decode('utf-8').strip()
            response = self._process_command(command)
            writer.write(response.encode('utf-8'))
            await writer.drain()
        except Exception as e:
            logger.error("socket_api_request_error", error=str(e))
        finally:
            writer.close()
            await writer.wait_closed()
    
    def _process_command(self, command: str) -> str:
        responses = {
            "status": "OK: EdgePulse Agent Running",
            "health": "healthy",
            "metrics": "cpu: 45.2, memory: 67.8, queue_size: 12"
        }
        return responses.get(command, "ERROR: Unknown command")

class FastAPIServer(BaseAPIServer):
    """Full FastAPI server for capable devices"""
    
    def __init__(self, port: int = DEFAULT_API_PORT):
        super().__init__(port)
        self.app: Optional[Any] = None
        self.uvicorn_server: Optional[Any] = None

    def is_healthy(self) -> bool:
        if not self._running or self.uvicorn_server is None:
            return False
        should_exit = getattr(self.uvicorn_server, "should_exit", False)
        return not bool(should_exit)
    
    async def start(self) -> None:
        try:
            from fastapi import FastAPI
            import uvicorn
            
            self.app = FastAPI(title="EdgePulse Agent API", version="1.0.0")
            self._setup_routes()
            
            config = uvicorn.Config(app=self.app, host=DEFAULT_API_HOST, port=self.port, log_level="info")
            self.uvicorn_server = uvicorn.Server(config)
            loop = asyncio.get_running_loop()
            loop.create_task(self.uvicorn_server.serve())
            
            self._running = True
            logger.info("fastapi_server_started", port=self.port)
        except ImportError:
            logger.error("fastapi_not_available")
            raise
    
    async def stop(self) -> None:
        if self.uvicorn_server:
            self.uvicorn_server.should_exit = True
            # Handle different uvicorn versions
            if hasattr(self.uvicorn_server, 'shutdown'):
                await self.uvicorn_server.shutdown()
            elif hasattr(self.uvicorn_server, 'handle_exit'):
                await self.uvicorn_server.handle_exit(sig=15, frame=None)
        self._running = False
        logger.info("fastapi_server_stopped")
    
    def _setup_routes(self) -> None:
        @self.app.get(API_ENDPOINTS["health"])
        async def health():
            return {"status": "healthy", "server": "fastapi"}
        
        @self.app.get(API_ENDPOINTS["metrics"])
        async def metrics():
            return {
                "cpu_usage": psutil.cpu_percent(),
                "memory_usage": psutil.virtual_memory().percent,
                "server": "fastapi"
            }
        
        @self.app.get(API_ENDPOINTS["status"])
        async def status():
            return {"status": "running", "server": "fastapi", "version": "1.0.0"}

class AdaptiveAPIServer:
    """Adaptive API server that selects the best implementation based on resources"""
    
    def __init__(self, mode: str = DEFAULT_API_MODE, port: int = DEFAULT_API_PORT, 
                 socket_path: Optional[Path] = None, min_memory_mb: int = DEFAULT_MIN_MEMORY_MB, 
                 min_cpu_cores: int = DEFAULT_MIN_CPU_CORES):
        self.mode = mode
        self.port = port
        self.socket_path = socket_path
        self.min_memory_mb = min_memory_mb
        self.min_cpu_cores = min_cpu_cores
        self.server: Optional[BaseAPIServer] = None
        self._selected_mode: Optional[str] = None
        
        logger.info("adaptive_api_server_initialized", mode=mode, port=port, 
                   min_memory_mb=min_memory_mb, min_cpu_cores=min_cpu_cores)
    
    async def start(self) -> None:
        self._selected_mode = self.mode if self.mode != "auto" else self._detect_best_mode()
        logger.info("selected_api_mode", mode=self._selected_mode)
        
        server_classes = {
            API_MODES["FASTAPI"]: lambda: FastAPIServer(self.port),
            API_MODES["SOCKET"]: lambda: SocketAPIServer(self.socket_path),
            API_MODES["MINIMAL"]: lambda: MinimalAPIServer(self.port)
        }
        
        if self._selected_mode not in server_classes:
            raise ValueError(f"Unknown API mode: {self._selected_mode}")
        
        try:
            self.server = server_classes[self._selected_mode]()
            await self.server.start()
            logger.info("adaptive_api_server_started", mode=self._selected_mode)
        except Exception as e:
            logger.error("api_server_start_failed", mode=self._selected_mode, error=str(e))
            if self._selected_mode != API_MODES["MINIMAL"]:
                logger.info("falling_back_to_minimal_server")
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
            memory = psutil.virtual_memory()
            available_memory_mb = memory.available // (1024 * 1024)
            
            try:
                import fastapi, uvicorn
                fastapi_available = True
            except ImportError:
                fastapi_available = False
            
            logger.debug("system_resources", cpu_count=cpu_count, 
                        available_memory_mb=available_memory_mb, fastapi_available=fastapi_available)
            
            if (fastapi_available and cpu_count >= self.min_cpu_cores and 
                available_memory_mb >= self.min_memory_mb):
                return API_MODES["FASTAPI"]
            elif available_memory_mb >= 256:
                return API_MODES["SOCKET"]
            else:
                return API_MODES["MINIMAL"]
        except Exception as e:
            logger.error("resource_detection_failed", error=str(e))
            return API_MODES["MINIMAL"]
    
    def get_mode(self) -> Optional[str]:
        return self._selected_mode
    
    def get_server_info(self) -> Dict[str, Any]:
        if not self.server:
            return {"status": "not_started"}
        
        info = {
            "mode": self._selected_mode,
            "status": "running" if self.server.is_healthy() else "error",
            "server_type": self.server.__class__.__name__
        }
        
        if hasattr(self.server, 'port') and self.server.port > 0:
            info["port"] = self.server.port
        if hasattr(self.server, 'socket_path'):
            info["socket_path"] = str(self.server.socket_path)
        
        return info
