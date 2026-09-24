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
) -> list[str]:
    """
    Whether one node's output contract can satisfy another's input contract.

    Only fields declared by the target are considered: undeclared incoming
    fields pass through. An empty source contract is only acceptable when the
    target declares nothing required.
    """
    if not target_input:
        return []

    if not source_output:
        required = sorted(
            name for name, spec in target_input.items() if spec.get("required")
        )
        if required:
            return [
                "source has no declared output contract but target requires: "
                + ", ".join(required)
            ]
        return []

    problems: list[str] = []
    for field, target_spec in target_input.items():
        source_spec = source_output.get(field)
        if source_spec is None:
            if target_spec.get("required"):
                problems.append(
                    f"field '{field}' is required by the target but not provided "
                    "by the source"
                )
            continue
        problems.extend(_field_problems(field, source_spec, target_spec))
    return problems


def check_graph(
    nodes_by_id: Mapping[Any, Mapping[str, Any]],
    edges: Sequence[Mapping[str, Any]],
) -> list[dict[str, str]]:
    """
    Type-check every edge of a graph.

    Returns one entry per incompatible edge, shaped for an HTTP 400 body:
    ``{"edge_id": ..., "reason": ...}``. Edges into a node that opted out
    (`type_enforcement == "off"`) or is disabled are skipped.
    """
    problems: list[dict[str, str]] = []
    for edge in edges:
        source = nodes_by_id.get(edge.get("source_node_id"))
        target = nodes_by_id.get(edge.get("target_node_id"))
        if source is None or target is None:
            # validate_and_order already reports unknown endpoints.
            continue
        if target.get("type_enforcement") == "off" or target.get("disabled"):
            continue
        reasons = check_edge(
            source.get("output") or {}, target.get("input") or {}
        )
        if reasons:
            problems.append(
                {"edge_id": str(edge.get("id")), "reason": "; ".join(reasons)}
            )
    return problems
