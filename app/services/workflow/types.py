"""
Strict input/output contract checking for code nodes.

The type vocabulary is closed (see ``ALLOWED_FIELD_TYPES`` in ``app.models``), so
validation is hand-written rather than compiled into a Pydantic model per node.
That keeps the messages exact ("expected float, got str"), avoids dynamic model
construction, and makes "strict" unambiguous: values are never coerced, and a
bool is not accepted where an int is declared.
"""
# Standard library imports
from datetime import datetime
from typing import Any, Mapping, Sequence

# Local application imports
from app.models import ALLOWED_FIELD_TYPES


def declared_types() -> tuple[str, ...]:
    """
    The closed vocabulary of field types this module knows how to validate.
    """
    return ALLOWED_FIELD_TYPES


def type_name(value: Any) -> str:
    """
    Human-readable name of a JSON value's type, for error messages.
    """
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "bool"
    if isinstance(value, int):
        return "int"
    if isinstance(value, float):
        return "float"
    if isinstance(value, str):
        return "str"
    if isinstance(value, list):
        return "list"
    if isinstance(value, dict):
        return "dict"
    return type(value).__name__


def _scalar_ok(value: Any, expected: str) -> bool:
    """
    Whether a value matches a single declared type.

    `float` accepts an int (the one widening we allow); `int` rejects bool even
    though `bool` subclasses `int` in Python. `datetime` accepts either a real
    datetime or a string, because item values arrive through JSON.
    """
    if expected == "Any":
        return True
    if expected == "bool":
        return isinstance(value, bool)
    if expected == "int":
        return isinstance(value, int) and not isinstance(value, bool)
    if expected == "float":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if expected == "str":
        return isinstance(value, str)
    if expected == "list":
        return isinstance(value, list)
    if expected == "dict":
        return isinstance(value, dict)
    if expected == "datetime":
        return isinstance(value, (str, datetime))
    return False


def _expectation(spec: Mapping[str, Any]) -> str:
    """
    How a declared type should be described in an error message.
    """
    if spec.get("type") == "list" and spec.get("items"):
        return f"list of {spec['items']}"
    return spec.get("type", "Any")


def _value_problem(value: Any, spec: Mapping[str, Any]) -> str | None:
    """
    Why a value fails its field spec, or None when it satisfies it.

    Returning a reason rather than a bool lets a bad list element say
    "expected list of str, got list containing int" instead of the useless
    "expected list, got list".
    """
    declared = spec.get("type", "Any")
    if not _scalar_ok(value, declared):
        return f"expected {_expectation(spec)}, got {type_name(value)}"

    enum = spec.get("enum")
    if enum is not None and value not in enum:
        return f"expected one of {enum}, got {value!r}"

    if declared == "list" and spec.get("items"):
        for element in value:
            if not _scalar_ok(element, spec["items"]):
                return (
                    f"expected {_expectation(spec)}, got list containing "
                    f"{type_name(element)}"
                )
    return None


def validate_items(
    items: Sequence[Mapping[str, Any]],
    contract: Mapping[str, Mapping[str, Any]],
    *,
    label: str = "item",
) -> list[str]:
    """
    Validate a list of n8n-style items against a declared contract.

    Returns a list of human-readable problems, empty when everything matches.
    An empty contract means "no declared contract" and always passes.
    """
    if not contract:
        return []

    problems: list[str] = []
    for index, item in enumerate(items):
        data = item.get("json") if isinstance(item, Mapping) else None
        if not isinstance(data, dict):
            problems.append(
                f"{label} {index}: 'json' must be an object, got {type_name(data)}"
            )
            continue
        for field, spec in contract.items():
            if field not in data:
                if spec.get("required"):
                    problems.append(
                        f"{label} {index}: required field '{field}' is missing"
                    )
                continue
            problem = _value_problem(data[field], spec)
            if problem:
                problems.append(
                    f"{label} {index}: field '{field}' {problem}"
                )
    return problems


def _field_problems(
    field: str, source: Mapping[str, Any], target: Mapping[str, Any]
) -> list[str]:
    """
    Compatibility problems for one field declared by both endpoints.
    """
    problems: list[str] = []
    source_type = source.get("type", "Any")
    target_type = target.get("type", "Any")

    if target_type == "Any":
        pass
    elif source_type == "Any":
        problems.append(
            f"field '{field}': source type is 'Any' (undeclared) and cannot be "
            f"proven to satisfy '{target_type}'"
        )
        return problems
    elif source_type != target_type:
        if not (source_type == "int" and target_type == "float"):
            problems.append(
                f"field '{field}': source declares '{source_type}', target "
                f"expects '{target_type}'"
            )
            return problems

    if target_type == "list":
        source_items = source.get("items")
        target_items = target.get("items")
        if target_items and source_items != target_items:
            problems.append(
                f"field '{field}': source list items are "
                f"{source_items or 'unset'} but target expects '{target_items}'"
            )

    if target.get("required") and not source.get("required"):
        problems.append(
            f"field '{field}' is required by the target but optional in the source"
        )

    return problems


def check_edge(
    source_output: Mapping[str, Mapping[str, Any]],
    target_input: Mapping[str, Mapping[str, Any]],
    mapping: Mapping[str, str] | None = None,
) -> list[str]:
    """
    Whether one node's output can satisfy another's input through an edge.

    ``mapping`` is ``{target_field: source_field}`` and is strict: an edge
    carries exactly the pairs it names, so an empty mapping carries nothing.
    Only those pairs can be judged here. Whether every required target input is
    covered is a property of the target node and lives in ``check_graph``,
    because one input field may be supplied by a different inbound edge.
    """
    problems: list[str] = []
    for target_field, source_field in (mapping or {}).items():
        target_spec = target_input.get(target_field)
        if target_spec is None:
            problems.append(
                f"mapping names input field '{target_field}', which the target "
                "does not declare"
            )
            continue
        source_spec = source_output.get(source_field)
        if source_spec is None:
            problems.append(
                f"maps input '{target_field}' from '{source_field}', which the "
                "source does not declare"
            )
            continue
        problems.extend(_field_problems(target_field, source_spec, target_spec))
    return problems


def _skips_contract_checks(node: Mapping[str, Any]) -> bool:
    """
    Whether a node opted out of type checking or is disabled (pass-through).
    """
    return node.get("type_enforcement") == "off" or bool(node.get("disabled"))


def _edge_problems(
    nodes_by_id: Mapping[Any, Mapping[str, Any]],
    edges: Sequence[Mapping[str, Any]],
) -> list[dict[str, str]]:
    """
    Check each edge on its own, independent of the rest of the graph.
    """
    problems: list[dict[str, str]] = []
    for edge in edges:
        source = nodes_by_id.get(edge.get("source_node_id"))
        target = nodes_by_id.get(edge.get("target_node_id"))
        if source is None or target is None:
            # validate_and_order already reports unknown endpoints.
            continue
        if _skips_contract_checks(target):
            continue
        reasons = check_edge(
            source.get("output") or {},
            target.get("input") or {},
            edge.get("mapping"),
        )
        if reasons:
            problems.append(
                {"edge_id": str(edge.get("id")), "reason": "; ".join(reasons)}
            )
    return problems


def _edge_providers(
    edge: Mapping[str, Any],
    nodes_by_id: Mapping[Any, Mapping[str, Any]],
    target_input: Mapping[str, Any],
) -> list[str]:
    """
    The target fields this one edge validly provides.

    A dangling reference is skipped here because ``_edge_problems`` already
    reports it as a fault of the edge.
    """
    source = nodes_by_id.get(edge.get("source_node_id"))
    if source is None:
        return []
    source_output = source.get("output") or {}
    return [
        target_field
        for target_field, source_field in (edge.get("mapping") or {}).items()
        if target_field in target_input and source_field in source_output
    ]


def _coverage_problems(
    target_id: Any,
    target_input: Mapping[str, Any],
    providers: Mapping[str, Sequence[str]],
) -> list[dict[str, str]]:
    """
    Faults in one target's coverage: unmapped required fields and conflicts.
    """
    problems: list[dict[str, str]] = []
    for field, spec in target_input.items():
        owners = providers.get(field, [])
        if len(owners) > 1:
            problems.append(
                {
                    "node_id": str(target_id),
                    "reason": (
                        f"input field '{field}' is provided by more than one "
                        "incoming edge"
                    ),
                }
            )
        elif not owners and spec.get("required"):
            problems.append(
                {
                    "node_id": str(target_id),
                    "reason": (
                        f"required input field '{field}' is not mapped from any "
                        "upstream node"
                    ),
                }
            )
    return problems


def _node_coverage_problems(
    nodes_by_id: Mapping[Any, Mapping[str, Any]],
    inbound: Mapping[Any, Sequence[Mapping[str, Any]]],
) -> list[dict[str, str]]:
    """
    Aggregate inbound mappings per target node and check what they cover.

    Coverage is a node-level property: one input field may be supplied by a
    different inbound edge than another, so no single edge can be judged alone.
    """
    problems: list[dict[str, str]] = []
    for target_id, target_edges in inbound.items():
        target = nodes_by_id.get(target_id)
        if target is None or _skips_contract_checks(target):
            continue
        target_input = target.get("input") or {}
        if not target_input:
            continue

        providers: dict[str, list[str]] = {}
        for edge in target_edges:
            for field in _edge_providers(edge, nodes_by_id, target_input):
                providers.setdefault(field, []).append(str(edge.get("id")))
        problems.extend(_coverage_problems(target_id, target_input, providers))
    return problems


def check_graph(
    nodes_by_id: Mapping[Any, Mapping[str, Any]],
    edges: Sequence[Mapping[str, Any]],
) -> dict[str, list[dict[str, str]]]:
    """
    Check every edge of a graph, per edge and per target node.

    Returns ``{"edges": [...], "nodes": [...]}``, each entry shaped for an HTTP
    400 body. Edge entries are faults the edge itself caused (a dangling mapping
    reference or an incompatible pair). Node entries are faults of the target's
    coverage as a whole: a required input no inbound edge maps, or an input two
    inbound edges both map. Nodes that opted out (`type_enforcement == "off"`)
    or are disabled are skipped.
    """
    inbound: dict[Any, list[Mapping[str, Any]]] = {}
    for edge in edges:
        inbound.setdefault(edge.get("target_node_id"), []).append(edge)

    return {
        "edges": _edge_problems(nodes_by_id, edges),
        "nodes": _node_coverage_problems(nodes_by_id, inbound),
    }


def apply_edge_mapping(
    items: Sequence[Mapping[str, Any]],
    mapping: Mapping[str, str] | None,
) -> list[dict[str, Any]]:
    """
    Project each item's ``json`` through an edge's mapping.

    The result holds exactly the mapped pairs, renamed to the target's field
    names. A pair is omitted when its source field is absent, so a target
    default can still apply. Unmapped source fields are dropped: strict mapping
    means the edge carries only what it declares.
    """
    projection = dict(mapping or {})
    projected: list[dict[str, Any]] = []
    for item in items:
        copied = dict(item) if isinstance(item, Mapping) else {}
        data = copied.get("json")
        if not isinstance(data, dict):
            data = {}
        copied["json"] = {
            target: data[source]
            for target, source in projection.items()
            if source in data
        }
        projected.append(copied)
    return projected
