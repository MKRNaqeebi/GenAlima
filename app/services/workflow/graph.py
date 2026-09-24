"""
Graph validation for code-node workflows.

Pure functions over plain mappings so the same checks run over an API payload
(``PUT /workflows/{id}/graph``) and, later, over persisted rows in the run
engine. A graph is valid when it is a DAG, every edge connects declared nodes,
and node keys and ids are unique.
"""
# Standard library imports
from collections import deque
from typing import Any, Mapping, Sequence
import uuid


class GraphError(ValueError):
    """
    Raised when a graph is not a usable DAG. Carries the offending ids so the
    API can return something an editor can highlight instead of a bare string.
    """

    def __init__(
        self,
        message: str,
        *,
        node_ids: Sequence[Any] | None = None,
        edge_ids: Sequence[Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.node_ids = list(node_ids or [])
        self.edge_ids = list(edge_ids or [])

    def as_detail(self) -> dict[str, Any]:
        """
        Shape the error for an HTTP 400 body.
        """
        detail: dict[str, Any] = {"message": self.message}
        if self.node_ids:
            detail["node_ids"] = [str(node_id) for node_id in self.node_ids]
        if self.edge_ids:
            detail["edge_ids"] = [str(edge_id) for edge_id in self.edge_ids]
        return detail


def _index_nodes(
    nodes: Sequence[Mapping[str, Any]],
) -> list[uuid.UUID]:
    """
    Collect node ids in input order, rejecting duplicates.

    Callers are expected to have assigned ids already; generating one here keeps
    the function safe for ad-hoc callers.
    """
    ordered_ids: list[uuid.UUID] = []
    seen_ids: set[uuid.UUID] = set()
    key_owner: dict[Any, uuid.UUID] = {}

    for node in nodes:
        node_id = node.get("id") or uuid.uuid4()
        if node_id in seen_ids:
            raise GraphError("duplicate node id", node_ids=[node_id])
        seen_ids.add(node_id)
        ordered_ids.append(node_id)

        key = node.get("key")
        if key is not None:
            if key in key_owner:
                raise GraphError(
                    f"duplicate node key '{key}'",
                    node_ids=[key_owner[key], node_id],
                )
            key_owner[key] = node_id

    return ordered_ids


def _build_adjacency(
    ordered_ids: Sequence[uuid.UUID],
    edges: Sequence[Mapping[str, Any]],
) -> tuple[dict[uuid.UUID, list[uuid.UUID]], dict[uuid.UUID, int]]:
    """
    Build the adjacency list and in-degree map, rejecting bad edges.
    """
    adjacency: dict[uuid.UUID, list[uuid.UUID]] = {
        node_id: [] for node_id in ordered_ids
    }
    indegree: dict[uuid.UUID, int] = {node_id: 0 for node_id in ordered_ids}

    for edge in edges:
        source = edge.get("source_node_id")
        target = edge.get("target_node_id")
        edge_id = edge.get("id")
        if source not in indegree or target not in indegree:
            raise GraphError(
                "edge references a node that is not part of the graph",
                edge_ids=[edge_id],
            )
        if source == target:
            raise GraphError(
                "a node cannot be connected to itself",
                node_ids=[source],
                edge_ids=[edge_id],
            )
        adjacency[source].append(target)
        indegree[target] += 1

    return adjacency, indegree


def _topological_order(
    ordered_ids: Sequence[uuid.UUID],
    adjacency: Mapping[uuid.UUID, Sequence[uuid.UUID]],
    indegree: Mapping[uuid.UUID, int],
) -> list[uuid.UUID]:
    """
    Kahn's algorithm. The queue is seeded in node order and neighbours are
    visited in edge order, so the resulting order is deterministic.
    """
    remaining = dict(indegree)
    ready = deque(node_id for node_id in ordered_ids if remaining[node_id] == 0)
    order: list[uuid.UUID] = []

    while ready:
        node_id = ready.popleft()
        order.append(node_id)
        for neighbour in adjacency[node_id]:
            remaining[neighbour] -= 1
            if remaining[neighbour] == 0:
                ready.append(neighbour)

    if len(order) != len(ordered_ids):
        placed = set(order)
        raise GraphError(
            "the graph contains a cycle",
            node_ids=[node_id for node_id in ordered_ids if node_id not in placed],
        )

    return order


def validate_and_order(
    nodes: Sequence[Mapping[str, Any]],
    edges: Sequence[Mapping[str, Any]],
) -> list[uuid.UUID]:
    """
    Validate a graph and return its nodes in topological execution order.

    Raises GraphError on duplicate ids or keys, edges pointing at unknown nodes,
    self-loops, or a cycle. An empty graph is valid and orders to an empty list.
    """
    ordered_ids = _index_nodes(nodes)
    adjacency, indegree = _build_adjacency(ordered_ids, edges)
    return _topological_order(ordered_ids, adjacency, indegree)
