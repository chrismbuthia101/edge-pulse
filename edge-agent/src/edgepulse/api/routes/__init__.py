from fastapi import FastAPI

from edgepulse.api.routes.health import router as health_router
from edgepulse.api.routes.alerts import router as alerts_router
from edgepulse.api.routes.sync import router as sync_router


def register_routes(app: FastAPI) -> None:
    app.include_router(health_router)
    app.include_router(alerts_router)
    app.include_router(sync_router)
