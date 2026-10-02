"""
Execute a code-node workflow.

Pure functions over the same node/edge dicts the graph save validates, so the
whole run semantics are testable without a database: the route persists what
``execute_graph`` and ``execute_node`` return.

Semantics (plan §5.5, §6.3):

- Nodes run in topological order. Entry nodes receive the trigger items; any
  other node receives the concatenation of its inbound edges' outputs, each
  projected through that edge's strict mapping.
- Inputs are validated per inbound edge so a violation names the upstream node
  to fix; outputs are validated against the node's output contract.
  ``type_enforcement`` decides the consequence: ``strict`` fails the node,
  ``warn`` records the problem in the logs, ``off`` skips validation.
- A disabled node passes its input through unchanged.
- A failed node follows its ``onError`` policy: ``stopWorkflow`` (default)
  stops the run and skips the rest, ``continueRegularOutput`` emits one item
  carrying the error, ``continueErrorOutput`` emits nothing and lets the run go
  on (there is no separate error output handle yet).
"""
# Standard library imports
from dataclasses import dataclass, field
import time
from typing import Any, Callable, Mapping, Sequence

# Local application imports
from app.services.workflow.graph import validate_and_order
from app.services.workflow.runners import python_runner
from app.services.workflow.runners.python_runner import RunnerResult
from app.services.workflow.types import apply_edge_mapping, validate_items

RunNode = Callable[[str, str, list[dict[str, Any]], float], RunnerResult]

DEFAULT_TRIGGER_ITEMS: list[dict[str, Any]] = [{"json": {}}]


@dataclass
class NodeResult:
    """
    One node's outcome, shaped like a ``WorkflowRunNode`` row.
    """

    node_id: Any
    status: str
    input_items: list[dict[str, Any]] = field(default_factory=list)
    output_items: list[dict[str, Any]] = field(default_factory=list)
    logs: str = ""
    error: str | None = None
    duration_ms: int | None = None


@dataclass
class RunResult:
    """
    A whole run's outcome. ``nodes`` is in execution order.
    """

    status: str
    error: str | None = None
    nodes: list[NodeResult] = field(default_factory=list)


def _parameters(node: Mapping[str, Any]) -> Mapping[str, Any]:
    return node.get("parameters") or {}


def _enforcement(node: Mapping[str, Any]) -> str:
    return node.get("type_enforcement") or "strict"


def _join_logs(*parts: str) -> str:
    return "\n".join(part for part in parts if part)


def _contract_check(
    node: Mapping[str, Any], problems: list[str], what: str
) -> tuple[str | None, str]:
    """
    Turn contract problems into (error, warning log) per the node's enforcement.
    """
    if not problems:
        return None, ""
    message = f"{what} does not match the contract: " + "; ".join(problems)
    if _enforcement(node) == "warn":
        return None, f"[type warning] {message}"
    return message, ""


def execute_node(
    node: Mapping[str, Any],
    inbound: Sequence[tuple[str, list[dict[str, Any]], Mapping[str, str]]] | None,
    trigger_items: list[dict[str, Any]],
    run_node: RunNode = python_runner.run,
) -> NodeResult:
    """
    Run one node.

    ``inbound`` is ``[(source_name, source_output, mapping), ...]`` for a node
    with incoming edges, or None for an entry node, which receives
    ``trigger_items`` directly.
    """
    contract = node.get("input") or {}
    checking = _enforcement(node) != "off" and not node.get("disabled")
    problems: list[str] = []

    if inbound is None:
        items = [dict(item) for item in trigger_items]
        if checking:
            problems.extend(validate_items(items, contract, label="trigger item"))
    else:
        items = []
        for source_name, source_output, mapping in inbound:
            projected = apply_edge_mapping(source_output, mapping)
            if checking:
                mapped_contract = {
                    name: spec for name, spec in contract.items() if name in mapping
                }
                problems.extend(
                    f"from '{source_name}': {problem}"
                    for problem in validate_items(projected, mapped_contract)
                )
            items.extend(projected)

    if node.get("disabled"):
        return NodeResult(
            node_id=node["id"],
            status="success",
            input_items=items,
            output_items=items,
            logs="node is disabled; items passed through",
            duration_ms=0,
        )

    input_error, input_warning = _contract_check(node, problems, "input")
    if input_error:
        return NodeResult(
            node_id=node["id"],
            status="error",
            input_items=items,
            error=input_error,
            duration_ms=0,
        )

    params = _parameters(node)
    started = time.monotonic()
    result = run_node(
        node.get("code") or "",
        params.get("mode") or "runOnceForAllItems",
        items,
        float(params.get("timeout") or python_runner.DEFAULT_TIMEOUT),
    )
    duration_ms = int((time.monotonic() - started) * 1000)
    logs = _join_logs(input_warning, result.logs)

    if result.error:
        return NodeResult(
            node_id=node["id"],
            status="error",
            input_items=items,
            logs=logs,
            error=result.error,
            duration_ms=duration_ms,
        )

    output_problems = (
        validate_items(result.output, node.get("output") or {}) if checking else []
    )
    output_error, output_warning = _contract_check(node, output_problems, "output")
    return NodeResult(
        node_id=node["id"],
        status="error" if output_error else "success",
        input_items=items,
        output_items=result.output,
        logs=_join_logs(logs, output_warning),
        error=output_error,
        duration_ms=duration_ms,
    )


def _continued_output(node: Mapping[str, Any], outcome: NodeResult) -> list[dict[str, Any]] | None:
    """
    What a failed node hands downstream, or None when the run must stop.
    """
    policy = _parameters(node).get("onError") or "stopWorkflow"
    if policy == "continueRegularOutput":
        return [{"json": {"error": outcome.error}}]
    if policy == "continueErrorOutput":
        return []
    return None


def execute_graph(
    nodes: Sequence[Mapping[str, Any]],
    edges: Sequence[Mapping[str, Any]],
    trigger_items: list[dict[str, Any]] | None = None,
    run_node: RunNode = python_runner.run,
) -> RunResult:
    """
    Run every node in topological order and collect the results.

    Raises ``GraphError`` when the graph is not a valid DAG, exactly as a save
    would, so a run never starts on a graph the editor could not have saved.
    """
    order = validate_and_order(nodes, edges)
    by_id = {node["id"]: node for node in nodes}
    trigger = list(trigger_items) if trigger_items else list(DEFAULT_TRIGGER_ITEMS)

    inbound_edges: dict[Any, list[Mapping[str, Any]]] = {}
    for edge in edges:
        inbound_edges.setdefault(edge["target_node_id"], []).append(edge)

    outputs: dict[Any, list[dict[str, Any]]] = {}
    results: list[NodeResult] = []
    stopped_by: NodeResult | None = None

    for node_id in order:
        node = by_id[node_id]
        if stopped_by is not None:
            results.append(NodeResult(node_id=node_id, status="skipped"))
            continue

        incoming = inbound_edges.get(node_id)
        inbound = (
            [
                (
                    by_id[edge["source_node_id"]].get("name") or "upstream node",
                    outputs.get(edge["source_node_id"], []),
                    edge.get("mapping") or {},
                )
                for edge in incoming
            ]
            if incoming
            else None
        )
        outcome = execute_node(node, inbound, trigger, run_node)
        results.append(outcome)

        if outcome.status == "error":
            continued = _continued_output(node, outcome)
            if continued is None:
                stopped_by = outcome
                continue
            outputs[node_id] = continued
        else:
            outputs[node_id] = outcome.output_items

    if stopped_by is not None:
        name = by_id[stopped_by.node_id].get("name") or "a node"
        return RunResult(status="error", error=f"'{name}' failed: {stopped_by.error}", nodes=results)
    return RunResult(status="success", nodes=results)
