"""
Workflow routes.

CRUD over workflows plus the graph save endpoint. The graph save is where the
strict typing pays off: a structurally invalid graph and an edge whose source
output cannot satisfy its target input are both rejected with enough detail for
the editor to point at the offending node or connection.
"""
# Standard library imports
from datetime import datetime
from typing import Any
import uuid

# Third-party imports
from fastapi import APIRouter, HTTPException
from sqlmodel import Session, func, select

# Local application imports
from app.api.deps import CurrentUser, SessionDep
from app.models import (
    Message,
    Workflow,
    WorkflowCreate,
    WorkflowDetailPublic,
    WorkflowEdge,
    WorkflowEdgePublic,
    WorkflowGraphIn,
    WorkflowGraphPublic,
    WorkflowNode,
    WorkflowNodePublic,
    WorkflowsPublic,
    WorkflowPublic,
    WorkflowUpdate,
)
from app.services.workflow.graph import GraphError, validate_and_order
from app.services.workflow.types import check_graph

router = APIRouter(prefix="/workflows", tags=["workflows"])


def _get_workflow(
    session: Session, current_user: CurrentUser, workflow_id: uuid.UUID
) -> Workflow:
    """
    Fetch a workflow the current user is allowed to touch.
    """
    workflow = session.get(Workflow, workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    if not current_user.is_superuser and workflow.owner_id != current_user.id:
        raise HTTPException(status_code=400, detail="Not enough permissions")
    return workflow


def _load_graph(
    session: Session, workflow_id: uuid.UUID
) -> tuple[list[WorkflowNode], list[WorkflowEdge]]:
    """
    Load a workflow's nodes and edges in a stable order.
    """
    nodes = session.exec(
        select(WorkflowNode)
        .where(WorkflowNode.workflow_id == workflow_id)
        .order_by(WorkflowNode.key)
    ).all()
    edges = session.exec(
        select(WorkflowEdge)
        .where(WorkflowEdge.workflow_id == workflow_id)
        .order_by(WorkflowEdge.source_node_id, WorkflowEdge.target_node_id)
    ).all()
    return list(nodes), list(edges)


def _graph_public(
    workflow: Workflow,
    nodes: list[WorkflowNode],
    edges: list[WorkflowEdge],
) -> WorkflowGraphPublic:
    """
    Build the canonical graph response.
    """
    return WorkflowGraphPublic(
        id=workflow.id,
        version=workflow.version,
        nodes=[WorkflowNodePublic.model_validate(node) for node in nodes],
        edges=[WorkflowEdgePublic.model_validate(edge) for edge in edges],
    )


@router.get("/", response_model=WorkflowsPublic)
def read_workflows(
    session: SessionDep, current_user: CurrentUser, skip: int = 0, limit: int = 100
) -> Any:
    """
    Retrieve workflows.
    """
    if current_user.is_superuser:
        count_statement = select(func.count()).select_from(Workflow)
        statement = select(Workflow).offset(skip).limit(limit)
    else:
        count_statement = (
            select(func.count())
            .select_from(Workflow)
            .where(Workflow.owner_id == current_user.id)
        )
        statement = (
            select(Workflow)
            .where(Workflow.owner_id == current_user.id)
            .offset(skip)
            .limit(limit)
        )
    count = session.exec(count_statement).one()
    workflows = session.exec(statement).all()
    return WorkflowsPublic(data=workflows, count=count)


@router.post("/", response_model=WorkflowPublic)
def create_workflow(
    *, session: SessionDep, current_user: CurrentUser, workflow_in: WorkflowCreate
) -> Any:
    """
    Create a workflow. It starts with an empty graph.
    """
    workflow = Workflow.model_validate(
        workflow_in, update={"owner_id": current_user.id})
    session.add(workflow)
    session.commit()
    session.refresh(workflow)
    return workflow


@router.get("/{id}", response_model=WorkflowDetailPublic)
def read_workflow(
    session: SessionDep,
    current_user: CurrentUser,
    # pylint: disable=redefined-builtin
    id: uuid.UUID,
) -> Any:
    """
    Get a workflow together with its full graph.
    """
    workflow = _get_workflow(session, current_user, id)
    nodes, edges = _load_graph(session, id)
    return WorkflowDetailPublic(
        **workflow.model_dump(),
        nodes=[WorkflowNodePublic.model_validate(node) for node in nodes],
        edges=[WorkflowEdgePublic.model_validate(edge) for edge in edges],
    )


@router.put("/{id}", response_model=WorkflowPublic)
def update_workflow(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    # pylint: disable=redefined-builtin
    id: uuid.UUID,
    workflow_in: WorkflowUpdate,
) -> Any:
    """
    Update a workflow's metadata (not its graph).
    """
    workflow = _get_workflow(session, current_user, id)
    update_dict = workflow_in.model_dump(exclude_unset=True)
    if update_dict:
        workflow.sqlmodel_update(update_dict)
        workflow.updated_at = datetime.utcnow()
        session.add(workflow)
        session.commit()
        session.refresh(workflow)
    return workflow


@router.delete("/{id}")
def delete_workflow(
    session: SessionDep,
    current_user: CurrentUser,
    # pylint: disable=redefined-builtin
    id: uuid.UUID,
) -> Message:
    """
    Delete a workflow and, by cascade, its nodes, edges and runs.
    """
    workflow = _get_workflow(session, current_user, id)
    session.delete(workflow)
    session.commit()
    return Message(message="Workflow deleted successfully")


def _prepare_graph_payloads(
    graph_in: WorkflowGraphIn,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """
    Dump an incoming graph to plain dicts, filling in missing ids.

    Nodes need ids before edges can be resolved against them: the client
    generates them, but a node without one is still valid on its own.
    """
    node_payloads: list[dict[str, Any]] = []
    for node_in in graph_in.nodes:
        payload = node_in.model_dump()
        payload["id"] = payload.get("id") or uuid.uuid4()
        node_payloads.append(payload)

    edge_payloads: list[dict[str, Any]] = []
    for edge_in in graph_in.edges:
        payload = edge_in.model_dump()
        payload["id"] = payload.get("id") or uuid.uuid4()
        edge_payloads.append(payload)

    return node_payloads, edge_payloads


def _validate_graph_payloads(
    node_payloads: list[dict[str, Any]],
    edge_payloads: list[dict[str, Any]],
) -> dict[uuid.UUID, dict[str, Any]]:
    """
    Run structural and type validation, raising 400 on the first failure.
    """
    try:
        validate_and_order(node_payloads, edge_payloads)
    except GraphError as exc:
        raise HTTPException(status_code=400, detail=exc.as_detail()) from exc

    nodes_by_id = {node["id"]: node for node in node_payloads}
    edge_problems = check_graph(nodes_by_id, edge_payloads)
    if edge_problems:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "incompatible connections",
                "edges": edge_problems,
            },
        )
    return nodes_by_id


def _replace_graph(
    session: Session,
    workflow_id: uuid.UUID,
    node_payloads: list[dict[str, Any]],
    edge_payloads: list[dict[str, Any]],
    nodes_by_id: dict[uuid.UUID, dict[str, Any]],
) -> None:
    """
    Replace a workflow's nodes and edges in the caller's transaction.
    """
    existing_nodes = {
        row.id: row
        for row in session.exec(
            select(WorkflowNode).where(WorkflowNode.workflow_id == workflow_id)
        ).all()
    }

    for node_id, row in existing_nodes.items():
        if node_id not in nodes_by_id:
            session.delete(row)

    for payload in node_payloads:
        row = existing_nodes.get(payload["id"])
        if row is None:
            if session.get(WorkflowNode, payload["id"]) is not None:
                raise HTTPException(
                    status_code=400,
                    detail=f"node id {payload['id']} belongs to another workflow",
                )
            session.add(
                WorkflowNode.model_validate(
                    payload, update={"workflow_id": workflow_id}
                )
            )
        else:
            row.sqlmodel_update(
                {key: value for key, value in payload.items() if key != "id"}
            )

    # Edges are cheap and have no dependents yet, so replace them wholesale.
    for row in session.exec(
        select(WorkflowEdge).where(WorkflowEdge.workflow_id == workflow_id)
    ).all():
        session.delete(row)
    session.flush()

    for payload in edge_payloads:
        session.add(
            WorkflowEdge.model_validate(
                payload, update={"workflow_id": workflow_id}
            )
        )


@router.put("/{id}/graph", response_model=WorkflowGraphPublic)
def update_workflow_graph(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    # pylint: disable=redefined-builtin
    id: uuid.UUID,
    graph_in: WorkflowGraphIn,
) -> Any:
    """
    Replace a workflow's graph in one transaction.

    Rejects the save with 400 when the graph is not a DAG, when an edge points at
    a node outside the graph, or when an edge is type-incompatible.
    """
    workflow = _get_workflow(session, current_user, id)
    node_payloads, edge_payloads = _prepare_graph_payloads(graph_in)
    nodes_by_id = _validate_graph_payloads(node_payloads, edge_payloads)
    _replace_graph(session, id, node_payloads, edge_payloads, nodes_by_id)

    workflow.version += 1
    workflow.updated_at = datetime.utcnow()
    session.add(workflow)
    session.commit()
    session.refresh(workflow)

    nodes, edges = _load_graph(session, id)
    return _graph_public(workflow, nodes, edges)
