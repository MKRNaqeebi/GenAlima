"""
Workflow routes.

CRUD over workflows, the graph save, manual runs and run history. The graph
save is where the strict typing pays off: a structurally invalid graph and an
edge whose source output cannot satisfy its target input are both rejected with
enough detail for the editor to point at the offending node or connection.
"""
# Standard library imports
from datetime import datetime
from typing import Any
import uuid

# Third-party imports
from fastapi import APIRouter, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, col, func, select

# Local application imports
from app.api.deps import CurrentUser, SessionDep
from app.models import (
    Message,
    User,
    Workflow,
    WorkflowComponent,
    WorkflowComponentPublishIn,
    WorkflowComponentPublic,
    WorkflowCreate,
    WorkflowDetailPublic,
    WorkflowEdge,
    WorkflowEdgePublic,
    WorkflowGraphIn,
    WorkflowGraphPublic,
    WorkflowNode,
    WorkflowNodePublic,
    WorkflowRun,
    WorkflowRunIn,
    WorkflowRunNode,
    WorkflowRunNodePublic,
    WorkflowRunPublic,
    WorkflowRunsPublic,
    WorkflowsPublic,
    WorkflowPublic,
    WorkflowSummaryPublic,
    WorkflowUpdate,
)
from app.services.workflow.engine import NodeResult, RunResult, execute_graph, execute_node
from app.services.workflow.graph import GraphError, validate_and_order
from app.services.workflow.publish import PublishShape, plan_snapshot, publish_shape
from app.services.workflow.types import check_graph

router = APIRouter(prefix="/workflows", tags=["workflows"])


def _is_published_snapshot_visible(
    session: Session, current_user: CurrentUser, workflow_id: uuid.UUID
) -> bool:
    """
    Whether the workflow is a snapshot published by someone in the user's org.

    A component stores its publisher, not an organization, so visibility is
    resolved by joining the publisher and comparing organizations.
    """
    if current_user.organization_id is None:
        return False
    statement = (
        select(WorkflowComponent.id)
        .join(User, col(User.id) == col(WorkflowComponent.owner_id))
        .where(col(WorkflowComponent.snapshot_workflow_id) == workflow_id)
        .where(col(User.organization_id) == current_user.organization_id)
    )
    return session.exec(statement).first() is not None


def _load_workflow(
    session: Session, current_user: CurrentUser, workflow_id: uuid.UUID
) -> tuple[Workflow, bool]:
    """
    Fetch a workflow together with whether the user may change it.

    Owners and superusers can write, but a published snapshot is read-only even
    for its author: a change means publishing another version. Organization
    members may read a colleague's snapshot. Anything else is a 404 rather than a
    403 so cross-tenant ids stay indistinguishable from missing ones.
    """
    workflow = session.get(Workflow, workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")

    is_owner = current_user.is_superuser or workflow.owner_id == current_user.id
    if is_owner:
        return workflow, not workflow.is_frozen
    if workflow.is_frozen and _is_published_snapshot_visible(session, current_user, workflow_id):
        return workflow, False
    raise HTTPException(status_code=404, detail="Workflow not found")


def _get_workflow(
    session: Session, current_user: CurrentUser, workflow_id: uuid.UUID
) -> Workflow:
    """
    Fetch a workflow the current user may read.
    """
    workflow, _ = _load_workflow(session, current_user, workflow_id)
    return workflow


def _get_writable_workflow(
    session: Session, current_user: CurrentUser, workflow_id: uuid.UUID
) -> Workflow:
    """
    Fetch a workflow the current user may change, rejecting snapshots.
    """
    workflow, can_write = _load_workflow(session, current_user, workflow_id)
    if not can_write:
        raise HTTPException(status_code=403, detail="Published snapshots are read-only")
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

    Published snapshots are excluded: they are immutable copies reached through
    the components API, not editable workflows, so listing them here would offer
    an editor that cannot save.
    """
    if current_user.is_superuser:
        count_statement = (
            select(func.count()).select_from(Workflow).where(col(Workflow.is_frozen).is_(False))
        )
        statement = (
            select(Workflow).where(col(Workflow.is_frozen).is_(False)).offset(skip).limit(limit)
        )
    else:
        count_statement = (
            select(func.count())
            .select_from(Workflow)
            .where(col(Workflow.owner_id) == current_user.id)
            .where(col(Workflow.is_frozen).is_(False))
        )
        statement = (
            select(Workflow)
            .where(col(Workflow.owner_id) == current_user.id)
            .where(col(Workflow.is_frozen).is_(False))
            .offset(skip)
            .limit(limit)
        )
    count = session.exec(count_statement).one()
    workflows = session.exec(statement).all()
    return WorkflowsPublic(data=_summaries(session, list(workflows)), count=count)


def _summaries(
    session: Session, workflows: list[Workflow]
) -> list[WorkflowSummaryPublic]:
    """
    Attach each workflow's latest full run and newest published version.

    Single-node test runs are ignored: they say nothing about whether the
    workflow as a whole works.

    Two grouped queries for the whole page rather than two per workflow.
    """
    ids = [workflow.id for workflow in workflows]
    if not ids:
        return []

    latest_started = (
        select(WorkflowRun.workflow_id, func.max(WorkflowRun.started_at).label("started_at"))
        .where(col(WorkflowRun.workflow_id).in_(ids))
        .where(col(WorkflowRun.mode) == "manual")
        .group_by(WorkflowRun.workflow_id)
        .subquery()
    )
    latest_runs = session.exec(
        select(WorkflowRun.workflow_id, WorkflowRun.status, WorkflowRun.started_at).join(
            latest_started,
            (col(WorkflowRun.workflow_id) == latest_started.c.workflow_id)
            & (col(WorkflowRun.started_at) == latest_started.c.started_at),
        )
    ).all()
    runs = {workflow_id: (status, started) for workflow_id, status, started in latest_runs}

    published = dict(
        session.exec(
            select(WorkflowComponent.source_workflow_id, func.max(WorkflowComponent.version))
            .where(col(WorkflowComponent.source_workflow_id).in_(ids))
            .group_by(WorkflowComponent.source_workflow_id)
        ).all()
    )

    summaries = []
    for workflow in workflows:
        status, started = runs.get(workflow.id, (None, None))
        summaries.append(
            WorkflowSummaryPublic(
                **workflow.model_dump(),
                last_run_status=status,
                last_run_at=started,
                published_version=published.get(workflow.id),
            )
        )
    return summaries


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
    workflow = _get_writable_workflow(session, current_user, id)
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
    workflow = _get_writable_workflow(session, current_user, id)
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
    problems = check_graph(nodes_by_id, edge_payloads)
    if problems["edges"] or problems["nodes"]:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "incompatible connections",
                "edges": problems["edges"],
                "nodes": problems["nodes"],
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
    workflow = _get_writable_workflow(session, current_user, id)
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


def _existing_versions(
    session: Session, current_user: CurrentUser, name: str
) -> list[int]:
    """
    Version numbers already used for a component name across the user's org.

    The component row stores its publisher rather than an organization, so the
    organization-wide view is built by joining the publishers.
    """
    statement = (
        select(WorkflowComponent.version)
        .join(User, col(User.id) == col(WorkflowComponent.owner_id))
        .where(func.lower(col(WorkflowComponent.name)) == name.lower())
        .where(col(User.organization_id) == current_user.organization_id)
    )
    return sorted(session.exec(statement).all())


def _version_conflict(name: str, version: int, existing: list[int]) -> HTTPException:
    """
    The 409 body a client needs to offer a different version.
    """
    return HTTPException(
        status_code=409,
        detail={
            "message": f"version {version} of '{name}' already exists",
            "existing_versions": existing,
            "suggested_version": max(existing) + 1,
        },
    )


def _save_publish_graph(
    session: Session, workflow: Workflow, graph_in: WorkflowGraphIn
) -> None:
    """
    Persist the canvas sent along with a publish, exactly as a graph save would.

    Publishing with unsaved changes is allowed; doing it here means the snapshot
    always matches what the author was looking at.
    """
    node_payloads, edge_payloads = _prepare_graph_payloads(graph_in)
    nodes_by_id = _validate_graph_payloads(node_payloads, edge_payloads)
    _replace_graph(session, workflow.id, node_payloads, edge_payloads, nodes_by_id)

    workflow.version += 1
    workflow.updated_at = datetime.utcnow()
    session.add(workflow)
    session.flush()


def _copy_graph_into_snapshot(
    session: Session,
    workflow: Workflow,
    node_dicts: list[dict[str, Any]],
    edge_dicts: list[dict[str, Any]],
    description: str | None,
) -> Workflow:
    """
    Deep-copy a graph into a frozen workflow that nothing may edit.

    The snapshot keeps the source's author, so a component's provenance survives
    an organization owner publishing on someone else's behalf.
    """
    snapshot = Workflow(
        name=workflow.name,
        description=description or workflow.description,
        active=workflow.active,
        settings=workflow.settings,
        owner_id=workflow.owner_id,
        version=workflow.version,
        is_frozen=True,
    )
    session.add(snapshot)
    session.flush()

    plan = plan_snapshot(node_dicts, edge_dicts, snapshot.id)
    for row in plan.nodes:
        session.add(WorkflowNode.model_validate(row))
    for row in plan.edges:
        session.add(WorkflowEdge.model_validate(row))
    return snapshot


def _graph_as_dicts(
    session: Session, workflow_id: uuid.UUID
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """
    Load a graph as plain dicts, the shape the publish helpers work on.
    """
    nodes, edges = _load_graph(session, workflow_id)
    return [node.model_dump() for node in nodes], [edge.model_dump() for edge in edges]


def _boundary_contracts(
    node_dicts: list[dict[str, Any]], shape: PublishShape
) -> tuple[dict[str, Any], dict[str, Any]]:
    """
    The entry node's input contract and the exit node's output contract.
    """
    by_id = {node["id"]: node for node in node_dicts}
    return (
        by_id[shape.entry_id].get("input") or {},
        by_id[shape.exit_id].get("output") or {},
    )


@router.post("/{id}/publish", response_model=WorkflowComponentPublic)
def publish_workflow(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    # pylint: disable=redefined-builtin
    id: uuid.UUID,
    component_in: WorkflowComponentPublishIn,
) -> Any:
    """
    Publish a workflow as a component version.

    Optionally saves the supplied graph first, so the published snapshot is
    exactly the canvas the author was looking at. Then deep-copies the graph
    into a frozen workflow and records the version. Rejects a graph without
    exactly one entry and one exit node, and a version that already exists for
    the same name in the organization.
    """
    workflow = _get_writable_workflow(session, current_user, id)
    if current_user.organization_id is None:
        raise HTTPException(status_code=400, detail="Join an organization before publishing a component")

    if component_in.graph is not None:
        _save_publish_graph(session, workflow, component_in.graph)

    node_dicts, edge_dicts = _graph_as_dicts(session, id)
    try:
        shape = publish_shape(node_dicts, edge_dicts)
    except GraphError as exc:
        raise HTTPException(status_code=400, detail=exc.as_detail()) from exc

    component_input, component_output = _boundary_contracts(node_dicts, shape)
    name = component_in.name.strip()
    existing = _existing_versions(session, current_user, name)
    if component_in.version in existing:
        raise _version_conflict(name, component_in.version, existing)

    snapshot = _copy_graph_into_snapshot(
        session, workflow, node_dicts, edge_dicts, component_in.description
    )
    component = WorkflowComponent(
        name=name,
        description=component_in.description,
        owner_id=current_user.id,
        version=component_in.version,
        snapshot_workflow_id=snapshot.id,
        source_workflow_id=workflow.id,
        input=component_input,
        output=component_output,
        release_notes=component_in.release_notes,
    )
    session.add(component)

    try:
        session.commit()
    except IntegrityError as exc:
        # The unique constraint is the authority; two publishes racing on the
        # same version both land here and the loser gets the same 409.
        session.rollback()
        raise _version_conflict(name, component_in.version, existing) from exc

    session.refresh(component)
    return component


# ---------------------------------------------------------------------------
# Runs
# ---------------------------------------------------------------------------
def _run_public(run: WorkflowRun, node_rows: list[WorkflowRunNode]) -> WorkflowRunPublic:
    """
    Build a run response, with node results when they were loaded.
    """
    return WorkflowRunPublic(
        **run.model_dump(),
        nodes=[WorkflowRunNodePublic.model_validate(row) for row in node_rows],
    )


def _start_run(
    session: Session, workflow_id: uuid.UUID, mode: str, items: list[dict]
) -> WorkflowRun:
    """
    Record a run as running before executing, so a crash leaves a trace.
    """
    run = WorkflowRun(workflow_id=workflow_id, mode=mode, trigger_items=items)
    session.add(run)
    session.commit()
    session.refresh(run)
    return run


def _node_row(run_id: uuid.UUID, outcome: NodeResult) -> WorkflowRunNode:
    return WorkflowRunNode(
        run_id=run_id,
        node_id=outcome.node_id,
        status=outcome.status,
        input_items=outcome.input_items,
        output_items=outcome.output_items,
        logs=outcome.logs or None,
        error=outcome.error,
        duration_ms=outcome.duration_ms,
    )


def _finish_run(session: Session, run: WorkflowRun, result: RunResult) -> WorkflowRunPublic:
    """
    Persist the per-node results and close the run.
    """
    rows = [_node_row(run.id, outcome) for outcome in result.nodes]
    session.add_all(rows)
    run.status = result.status
    run.error = result.error
    run.finished_at = datetime.utcnow()
    session.add(run)
    session.commit()
    session.refresh(run)
    for row in rows:
        session.refresh(row)
    return _run_public(run, rows)


@router.post("/{id}/run", response_model=WorkflowRunPublic)
def run_workflow(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    # pylint: disable=redefined-builtin
    id: uuid.UUID,
    run_in: WorkflowRunIn,
) -> Any:
    """
    Execute the saved graph synchronously and return every node's result.

    The run uses the graph as last saved; the editor saves unsaved changes
    first. Anyone who can read the workflow can run it, including an
    organization member trying out a published snapshot.
    """
    _get_workflow(session, current_user, id)
    node_dicts, edge_dicts = _graph_as_dicts(session, id)
    if not node_dicts:
        raise HTTPException(status_code=400, detail="Add a node before running the workflow")
    try:
        validate_and_order(node_dicts, edge_dicts)
    except GraphError as exc:
        raise HTTPException(status_code=400, detail=exc.as_detail()) from exc

    run = _start_run(session, id, "manual", run_in.items)
    result = execute_graph(node_dicts, edge_dicts, run_in.items)
    return _finish_run(session, run, result)


@router.post("/{id}/nodes/{node_id}/run", response_model=WorkflowRunPublic)
def run_workflow_node(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    # pylint: disable=redefined-builtin
    id: uuid.UUID,
    node_id: uuid.UUID,
    run_in: WorkflowRunIn,
) -> Any:
    """
    Run one saved node against caller-supplied items, ignoring its edges.

    Recorded as a ``single_node`` run so the editor reads it like any other.
    """
    _get_workflow(session, current_user, id)
    node = session.get(WorkflowNode, node_id)
    if node is None or node.workflow_id != id:
        raise HTTPException(status_code=404, detail="Node not found")

    # Dump before _start_run commits: the commit expires the loaded row.
    node_dict = node.model_dump()
    run = _start_run(session, id, "single_node", run_in.items)
    outcome = execute_node(node_dict, None, run_in.items)
    result = RunResult(
        status="error" if outcome.status == "error" else "success",
        error=outcome.error,
        nodes=[outcome],
    )
    return _finish_run(session, run, result)


@router.get("/{id}/runs", response_model=WorkflowRunsPublic)
def read_workflow_runs(
    session: SessionDep,
    current_user: CurrentUser,
    # pylint: disable=redefined-builtin
    id: uuid.UUID,
    skip: int = 0,
    limit: int = 20,
) -> Any:
    """
    Run history, newest first. Node results are omitted; fetch one run for them.
    """
    _get_workflow(session, current_user, id)
    count = session.exec(
        select(func.count()).select_from(WorkflowRun).where(WorkflowRun.workflow_id == id)
    ).one()
    runs = session.exec(
        select(WorkflowRun)
        .where(WorkflowRun.workflow_id == id)
        .order_by(col(WorkflowRun.started_at).desc())
        .offset(skip)
        .limit(limit)
    ).all()
    return WorkflowRunsPublic(data=[_run_public(run, []) for run in runs], count=count)


@router.get("/{id}/runs/{run_id}", response_model=WorkflowRunPublic)
def read_workflow_run(
    session: SessionDep,
    current_user: CurrentUser,
    # pylint: disable=redefined-builtin
    id: uuid.UUID,
    run_id: uuid.UUID,
) -> Any:
    """
    One run with every node's input, output, logs and error.
    """
    _get_workflow(session, current_user, id)
    run = session.get(WorkflowRun, run_id)
    if run is None or run.workflow_id != id:
        raise HTTPException(status_code=404, detail="Run not found")
    rows = session.exec(select(WorkflowRunNode).where(WorkflowRunNode.run_id == run_id)).all()
    return _run_public(run, list(rows))
