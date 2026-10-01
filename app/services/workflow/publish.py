"""
Planning helpers for publishing a workflow as a reusable component.

A component is identified by the workflow's two boundary nodes rather than by
new node types: the single node nothing flows into supplies the component's
input contract, and the single node nothing flows out of supplies its output.

Both functions work on plain mappings and never touch a session, so the parts
that are easy to get wrong — a graph with the wrong number of boundaries, and
rewriting a graph's ids without breaking its edges — are unit-testable on their
own.
"""
# Standard library imports
from typing import Any, Mapping, NamedTuple, Sequence
import uuid

# Local application imports
from app.services.workflow.graph import GraphError


class PublishShape(NamedTuple):
    """
    The two nodes that define a published component's public contract.
    """
    entry_id: uuid.UUID
    exit_id: uuid.UUID


def _degrees(
    nodes: Sequence[Mapping[str, Any]],
    edges: Sequence[Mapping[str, Any]],
) -> tuple[dict[uuid.UUID, int], dict[uuid.UUID, int]]:
    """
    Count inbound and outbound edges per node.

    Edges pointing outside the node set are ignored: `validate_and_order`
    already rejects those, so they cannot reach here from the API.
    """
    indegree: dict[uuid.UUID, int] = {node["id"]: 0 for node in nodes}
    outdegree: dict[uuid.UUID, int] = {node["id"]: 0 for node in nodes}

    for edge in edges:
        source = edge.get("source_node_id")
        target = edge.get("target_node_id")
        if source in outdegree:
            outdegree[source] += 1
        if target in indegree:
            indegree[target] += 1

    return indegree, outdegree


def publish_shape(
    nodes: Sequence[Mapping[str, Any]],
    edges: Sequence[Mapping[str, Any]],
) -> PublishShape:
    """
    Find the single entry and single exit node of a graph.

    Raises GraphError carrying the offending node ids when the graph is empty or
    has more than one node with no inbound (or no outbound) edge, because a
    component can only have one input and one output. A one-node graph is legal:
    that node is both the entry and the exit.
    """
    if not nodes:
        raise GraphError("a workflow needs at least one node before it can be published")

    indegree, outdegree = _degrees(nodes, edges)
    entries = [node_id for node_id, count in indegree.items() if count == 0]
    exits = [node_id for node_id, count in outdegree.items() if count == 0]

    if len(entries) != 1:
        raise GraphError(
            f"a workflow must have exactly one entry node (nothing flows into it), found {len(entries)}",
            node_ids=entries,
        )
    if len(exits) != 1:
        raise GraphError(
            f"a workflow must have exactly one exit node (nothing flows out of it), found {len(exits)}",
            node_ids=exits,
        )

    return PublishShape(entries[0], exits[0])


class SnapshotPlan(NamedTuple):
    """
    The rows of a deep-copied graph, ready to be validated into table models.
    """
    nodes: list[dict[str, Any]]
    edges: list[dict[str, Any]]


def plan_snapshot(
    nodes: Sequence[Mapping[str, Any]],
    edges: Sequence[Mapping[str, Any]],
    workflow_id: uuid.UUID,
) -> SnapshotPlan:
    """
    Lay out a deep copy of a graph under a new workflow id.

    Every node and edge gets a fresh id and the edges are rewired through the
    old-id to new-id map, so the snapshot shares nothing with its source. All
    other fields — code, contracts, parameters, the edge field mapping — are
    carried over verbatim.
    """
    id_map = {node["id"]: uuid.uuid4() for node in nodes}

    node_rows: list[dict[str, Any]] = []
    for node in nodes:
        row = {key: value for key, value in node.items() if key != "id"}
        row["id"] = id_map[node["id"]]
        row["workflow_id"] = workflow_id
        node_rows.append(row)

    edge_rows: list[dict[str, Any]] = []
    for edge in edges:
        row = {key: value for key, value in edge.items() if key != "id"}
        row["id"] = uuid.uuid4()
        row["workflow_id"] = workflow_id
        row["source_node_id"] = id_map[edge["source_node_id"]]
        row["target_node_id"] = id_map[edge["target_node_id"]]
        edge_rows.append(row)

    return SnapshotPlan(nodes=node_rows, edges=edge_rows)
