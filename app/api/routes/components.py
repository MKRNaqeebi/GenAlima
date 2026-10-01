"""
Published workflow component routes.

A component row is one immutable, published version of a workflow. Reads are
scoped to the viewer's organization, which is derived from the publisher rather
than stored on the row, so visibility is always resolved by joining the owner.
Only the publisher, the owner of their organization, or a superuser may delete a
version, and deleting it also removes the frozen snapshot it points at.
"""
# Standard library imports
from typing import Any
import uuid

# Third-party imports
from fastapi import APIRouter, HTTPException
from sqlmodel import Session, col, func, select

# Local application imports
from app.api.deps import CurrentUser, SessionDep
from app.models import (
    Message,
    Organization,
    User,
    Workflow,
    WorkflowComponent,
    WorkflowComponentPublic,
    WorkflowComponentsPublic,
)

router = APIRouter(prefix="/components", tags=["components"])


def _organization_members(
    session: Session, current_user: CurrentUser
) -> list[uuid.UUID]:
    """
    Ids of the users whose components the viewer may see.

    A superuser sees every publisher; everyone else sees their own organization,
    and a user without an organization sees nobody (not even themselves).
    """
    if current_user.is_superuser:
        return list(session.exec(select(User.id)).all())
    if current_user.organization_id is None:
        return []
    statement = select(User.id).where(col(User.organization_id) == current_user.organization_id)
    return list(session.exec(statement).all())


def _get_component(
    session: Session, current_user: CurrentUser, component_id: uuid.UUID
) -> WorkflowComponent:
    """
    Fetch a component the viewer is allowed to see.

    A missing component and one belonging to another organization both answer
    404, so the ids of other organizations cannot be probed.
    """
    component = session.get(WorkflowComponent, component_id)
    if component is None:
        raise HTTPException(status_code=404, detail="Component not found")

    publisher = session.get(User, component.owner_id)
    same_organization = (
        publisher is not None
        and current_user.organization_id is not None
        and publisher.organization_id == current_user.organization_id
    )
    if current_user.is_superuser or same_organization:
        return component
    raise HTTPException(status_code=404, detail="Component not found")


def _can_delete(
    session: Session, current_user: CurrentUser, component: WorkflowComponent
) -> bool:
    """
    Whether the viewer may delete this component.

    The publisher and the owner of the publisher's organization qualify, so an
    organization can clean up after a member who has left.
    """
    if current_user.is_superuser or component.owner_id == current_user.id:
        return True
    publisher = session.get(User, component.owner_id)
    if publisher is None or publisher.organization_id is None:
        return False
    organization = session.get(Organization, publisher.organization_id)
    return organization is not None and organization.owner_id == current_user.id


@router.get("/", response_model=WorkflowComponentsPublic)
def read_components(
    session: SessionDep, current_user: CurrentUser, skip: int = 0, limit: int = 100
) -> Any:
    """
    List published component versions, newest version first per name.

    Every version is returned rather than only the latest, so a client can show
    the version history; grouping by name is left to the caller.
    """
    member_ids = _organization_members(session, current_user)
    if not member_ids:
        return WorkflowComponentsPublic(data=[], count=0)

    count_statement = (
        select(func.count())
        .select_from(WorkflowComponent)
        .where(col(WorkflowComponent.owner_id).in_(member_ids))
    )
    count = session.exec(count_statement).one()

    statement = (
        select(WorkflowComponent)
        .where(col(WorkflowComponent.owner_id).in_(member_ids))
        .order_by(func.lower(col(WorkflowComponent.name)), col(WorkflowComponent.version).desc())
        .offset(skip)
        .limit(limit)
    )
    components = session.exec(statement).all()
    return WorkflowComponentsPublic(data=components, count=count)


@router.get("/{id}", response_model=WorkflowComponentPublic)
def read_component(
    session: SessionDep,
    current_user: CurrentUser,
    # pylint: disable=redefined-builtin
    id: uuid.UUID,
) -> Any:
    """
    Get one published component version, including its public contract.
    """
    return _get_component(session, current_user, id)


@router.delete("/{id}")
def delete_component(
    session: SessionDep,
    current_user: CurrentUser,
    # pylint: disable=redefined-builtin
    id: uuid.UUID,
) -> Message:
    """
    Delete a component version and its frozen snapshot.

    The row goes first so the snapshot has nothing pointing at it; the snapshot
    foreign key cascades, which also means a snapshot removed by a user-deletion
    cascade takes its component with it rather than blocking the delete.
    """
    component = _get_component(session, current_user, id)
    if not _can_delete(session, current_user, component):
        raise HTTPException(status_code=403, detail="Not enough permissions")

    snapshot_id = component.snapshot_workflow_id
    session.delete(component)
    session.flush()

    snapshot = session.get(Workflow, snapshot_id)
    if snapshot is not None:
        session.delete(snapshot)

    session.commit()
    return Message(message="Component deleted successfully")
