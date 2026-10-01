"""Private API routes for internal use only."""
# Standard library imports
from typing import Any

# Third-party imports
from fastapi import APIRouter
from pydantic import BaseModel

# Local application imports
from app import crud
from app.api.deps import SessionDep
from app.models import (
    UserCreate,
    UserPublic,
)

router = APIRouter(tags=["private"], prefix="/private")


class PrivateUserCreate(BaseModel):
    """Model for creating a new user via private API."""
    email: str
    password: str
    full_name: str
    is_verified: bool = False


@router.post("/users/", response_model=UserPublic)
def create_user(user_in: PrivateUserCreate, session: SessionDep) -> Any:
    """
    Create a new user.

    Goes through `crud.create_user` so the user gets the mandatory personal
    organization that `user.organization_id` requires.
    """
    user_create = UserCreate(email=user_in.email, password=user_in.password, full_name=user_in.full_name)
    return crud.create_user(session=session, user_create=user_create)
