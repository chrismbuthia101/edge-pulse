import asyncio
from typing import Any, Dict, Optional

from edgepulse.api.deps import APIDependencies
from edgepulse.api.routes import register_routes
from edgepulse.utils.log_handler import get_logger
from edgepulse.utils.version import get_agent_version

logger = get_logger(__name__)


class FastAPIServer:

    def __init__(
        self, port: int = 8080, host: str = "0.0.0.0", deps: Optional[APIDependencies] = None
    ):
        self.port = port
        self.host = host
        self._deps = deps or APIDependencies(database=None)  # type: ignore[arg-type]
        self._running = False
        self.app: Optional[Any] = None
        self.uvicorn_server: Optional[Any] = None
        self._serve_task: Optional[asyncio.Task] = None
        self._auth_middleware_added = False

    def is_healthy(self) -> bool:
        if not self._running or self.uvicorn_server is None:
            return False
        if self._serve_task is not None and self._serve_task.done():
            exc = self._serve_task.exception() if not self._serve_task.cancelled() else None
            if exc:
                logger.error("fastapi_serve_task_died", error=str(exc))
            return False
        return not bool(getattr(self.uvicorn_server, "should_exit", False))

    async def start(self, deps: Optional[APIDependencies] = None) -> None:
        try:
            from fastapi import FastAPI
            import uvicorn

            if deps is not None:
                self._deps = deps
            self.app = FastAPI(title="EdgePulse Agent API", version=get_agent_version())
            self.app.state.deps = self._deps
            register_routes(self.app)

            if self._deps and self._deps.auth_token and not self._auth_middleware_added:
                from fastapi import Request
                from fastapi.responses import JSONResponse

                expected = self._deps.auth_token

                @self.app.middleware("http")
                async def require_token(request: Request, call_next):
                    if request.url.path in ("/health/live", "/metrics", "/status"):
                        return await call_next(request)
                    auth = request.headers.get("Authorization", "")
                    token = auth.removeprefix("Bearer ").strip()
                    if not token or token != expected:
                        return JSONResponse({"detail": "Unauthorized"}, status_code=401)
                    return await call_next(request)

                self._auth_middleware_added = True
                logger.info("api_auth_middleware_enabled")

            config = uvicorn.Config(
                app=self.app,
                host=self.host,
                port=self.port,
                log_level="info",
            )
            self.uvicorn_server = uvicorn.Server(config)

            loop = asyncio.get_running_loop()

            self._serve_task = loop.create_task(self.uvicorn_server.serve(), name="fastapi_serve")
            await asyncio.sleep(0.1)

            if self._serve_task.done():
                exc = self._serve_task.exception() if not self._serve_task.cancelled() else None
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

    def get_server_info(self) -> Dict[str, Any]:
        return {
            "mode": "fastapi",
            "status": "running" if self.is_healthy() else "error",
            "server_type": "FastAPIServer",
            "port": self.port,
        }
