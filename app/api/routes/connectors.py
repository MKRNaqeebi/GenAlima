"""
Connectors routes
"""
# Standard library imports
from typing import Any
import uuid

# Third-party imports
from fastapi import APIRouter, HTTPException
from sqlmodel import func, select

# Local application imports
from app.api.deps import CurrentUser, SessionDep
from app.models import (
    Connector, ConnectorCreate, ConnectorPublic, ConnectorsPublic, ConnectorUpdate, Message,
)

router = APIRouter(prefix="/connectors", tags=["connectors"])


@router.get("/", response_model=ConnectorsPublic)
def read_connectors(
    session: SessionDep, current_user: CurrentUser, skip: int = 0, limit: int = 100
) -> Any:
    """
    Retrieve connectors for the current user.
    """
    # Regular users see only their connectors
    count_statement = select(func.count()).select_from(Connector).where(
        Connector.owner_id == current_user.id
    )
    count = session.exec(count_statement).one()
    statement = select(Connector).where(
        Connector.owner_id == current_user.id
    ).offset(skip).limit(limit)

    connectors = session.exec(statement).all()
    return ConnectorsPublic(data=connectors, count=count)


@router.get("/{id}", response_model=ConnectorPublic)
def read_connector(
    session: SessionDep, current_user: CurrentUser,
    # pylint: disable=redefined-builtin
    id: uuid.UUID) -> Any:
    """
    Get connector by ID.
    """
    connector = session.get(Connector, id)
    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")
    if not current_user.is_superuser and (connector.owner_id != current_user.id):
        raise HTTPException(status_code=400, detail="Not enough permissions")
    return connector


@router.post("/", response_model=ConnectorPublic)
def create_connector(
    *, session: SessionDep, current_user: CurrentUser, connector_in: ConnectorCreate
) -> Any:
    """
    Create new connector for the current user.
    """
    connector = Connector.model_validate(connector_in)
    connector.owner_id = current_user.id
    session.add(connector)
    session.commit()
    session.refresh(connector)
    return connector


@router.put("/{id}", response_model=ConnectorPublic)
def update_connector(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    # pylint: disable=redefined-builtin
    id: uuid.UUID,
    connector_in: ConnectorUpdate,
) -> Any:
    """
    Update a connector.
    """
    connector = session.get(Connector, id)
    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")
    if not current_user.is_superuser and (connector.owner_id != current_user.id):
        raise HTTPException(status_code=400, detail="Not enough permissions")
    update_dict = connector_in.model_dump(exclude_unset=True)
    connector.sqlmodel_update(update_dict)
    session.add(connector)
    session.commit()
    session.refresh(connector)
    return connector


@router.delete("/{id}")
def delete_connector(
    session: SessionDep, current_user: CurrentUser,
    # pylint: disable=redefined-builtin
    id: uuid.UUID
) -> Message:
    """
    Delete a connector.
    """
    connector = session.get(Connector, id)
    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")
    if not current_user.is_superuser and (connector.owner_id != current_user.id):
        raise HTTPException(status_code=400, detail="Not enough permissions")
    session.delete(connector)
    session.commit()
    return Message(message="Connector deleted successfully")
