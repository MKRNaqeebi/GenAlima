"""
This file is used to include all the routers in the APIRouter.
"""
from fastapi import APIRouter

from app.api.routes import (
  items, login, private, users, utils, organizations, messages, chats)
from app.core.config import settings

api_router = APIRouter()
api_router.include_router(login.router)
api_router.include_router(users.router)
api_router.include_router(utils.router)
api_router.include_router(items.router)
api_router.include_router(organizations.router)
api_router.include_router(messages.router)
api_router.include_router(chats.router)


if settings.ENVIRONMENT == "local":
  api_router.include_router(private.router)
