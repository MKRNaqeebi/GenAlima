"""
This module contains the CRUD (Create, Read, Update, Delete) operations for the database.
"""
# Standard library imports
from typing import Any
import uuid

# Third-party imports
from sqlmodel import Session, select

# Local application imports
from app.core.security import get_password_hash, verify_password
from app.models import Organization, User, UserCreate, UserUpdate


def _personal_organization_title(user_create: UserCreate) -> str:
    """
    Name the organization a new user owns, within the column's length.
    """
    label = user_create.full_name or user_create.email
    return f"{label} (personal)"[:255]


def create_user(*, session: Session, user_create: UserCreate) -> User:
    """
    Create a user together with the personal organization they own.

    `user.organization_id` and `organization.owner_id` are both mandatory and
    reference each other, so the two rows are inserted in one transaction and the
    deferred foreign keys are checked at commit. Ids are generated up front
    because each row needs the other's id in the same statement batch.
    """
    user_id = uuid.uuid4()
    organization_id = uuid.uuid4()

    db_obj = User.model_validate(
        user_create,
        update={
            "id": user_id,
            "organization_id": organization_id,
            "hashed_password": get_password_hash(user_create.password),
        },
    )
    organization = Organization(
        id=organization_id, title=_personal_organization_title(user_create), owner_id=user_id
    )

    session.add(db_obj)
    session.add(organization)
    session.commit()
    session.refresh(db_obj)
    return db_obj


def update_user(*, session: Session, db_user: User, user_in: UserUpdate) -> Any:
    """
    Update a user in the database.
    """
    user_data = user_in.model_dump(exclude_unset=True)
    extra_data = {}
    if "password" in user_data:
        password = user_data["password"]
        hashed_password = get_password_hash(password)
        extra_data["hashed_password"] = hashed_password
    db_user.sqlmodel_update(user_data, update=extra_data)
    session.add(db_user)
    session.commit()
    session.refresh(db_user)
    return db_user


def get_user_by_email(*, session: Session, email: str) -> User | None:
    """
    Get a user from the database by email.
    """
    statement = select(User).where(User.email == email)
    session_user = session.exec(statement).first()
    return session_user


def authenticate(*, session: Session, email: str, password: str) -> User | None:
    """
    Authenticate a user by email and password.
    """
    db_user = get_user_by_email(session=session, email=email)
    if not db_user:
        return None
    if not verify_password(password, db_user.hashed_password):
        return None
    return db_user
