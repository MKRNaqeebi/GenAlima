"""
This file is used to include all the routers in the APIRouter.
"""
# Third-party imports
from fastapi import APIRouter

# Local application imports
from app.api.routes import (
    components,
    login,
    organizations,
    private,
    users,
    utils,
    workflows,
)
from app.core.config import settings

api_router = APIRouter()
api_router.include_router(login.router)
api_router.include_router(users.router)
api_router.include_router(utils.router)
api_router.include_router(organizations.router)
api_router.include_router(workflows.router)
api_router.include_router(components.router)


if settings.ENVIRONMENT == "local":
    api_router.include_router(private.router)
