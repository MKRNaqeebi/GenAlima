"""
This file is used to include all the routers in the APIRouter.
"""
# Third-party imports
from fastapi import APIRouter

# Local application imports
from app.api.routes import (
    chats,
    connectors,
    items,
    knowledges,
    login,
    messages,
    organizations,
    private,
    templates,
    users,
    utils,
)
from app.api.routes import google, notion, github
from app.core.config import settings

api_router = APIRouter()
api_router.include_router(login.router)
api_router.include_router(users.router)
api_router.include_router(utils.router)
api_router.include_router(items.router)
api_router.include_router(organizations.router)
api_router.include_router(messages.router)
api_router.include_router(chats.router)
api_router.include_router(templates.router)
api_router.include_router(connectors.router)
api_router.include_router(google.router)
api_router.include_router(notion.router)
api_router.include_router(github.router)
api_router.include_router(knowledges.router)


if settings.ENVIRONMENT == "local":
    api_router.include_router(private.router)
