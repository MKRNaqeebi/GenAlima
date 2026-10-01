"""
Edge mapping and the strict coverage rules in ``app.services.workflow.types``.

These are pure functions over plain mappings, so the whole edge contract is
covered without a database.
"""
# Standard library imports
from typing import Any

# Local application imports
from app.services.workflow.types import (
    apply_edge_mapping,
    check_edge,
    check_graph,
)


def spec(
    type_: str = "str",
    required: bool | None = None,
    default: Any = None,
    items: str | None = None,
) -> dict[str, Any]:
    """
    Build a canonical field spec the way ``WorkflowFieldSpec`` would.

    ``required`` follows Pydantic: unset means "false when a default is given,
    true otherwise".
    """
    resolved = required if required is not None else default is None
    built: dict[str, Any] = {"type": type_, "required": resolved}
    if default is not None:
        built["default"] = default
    if items is not None:
        built["items"] = items
    return built


def node(
    node_id: str,
    input_: dict[str, Any] | None = None,
    output: dict[str, Any] | None = None,
    *,
    disabled: bool = False,
    enforcement: str = "strict",
) -> dict[str, Any]:
    """
    A node payload as the checker sees it after ``model_dump``.
    """
    return {
        "id": node_id,
        "input": input_ or {},
        "output": output or {},
        "disabled": disabled,
        "type_enforcement": enforcement,
    }


def edge(
    edge_id: str,
    source: str,
    target: str,
    mapping: dict[str, str] | None = None,
) -> dict[str, Any]:
    """
    An edge payload with its field mapping.
    """
    return {
        "id": edge_id,
        "source_node_id": source,
        "target_node_id": target,
        "mapping": mapping or {},
    }


def graph(nodes: list[dict[str, Any]], edges: list[dict[str, Any]]):
    """
    Run ``check_graph`` with nodes keyed by id, as the route does.
    """
    return check_graph({n["id"]: n for n in nodes}, edges)


def test_mapping_renames_a_field():
    """b <- a is compatible even though the names differ."""
    problems = graph(
        [node("a", output={"a": spec("str")}), node("b", input_={"b": spec("str")})],
        [edge("e1", "a", "b", {"b": "a"})],
    )
    assert problems == {"edges": [], "nodes": []}


def test_strict_empty_mapping_leaves_a_required_input_uncovered():
    """An empty mapping carries nothing, so a required input is a node fault."""
    problems = graph(
        [node("a", output={"a": spec("str")}), node("b", input_={"b": spec("str")})],
        [edge("e1", "a", "b", {})],
    )
    assert problems["edges"] == []
    assert len(problems["nodes"]) == 1
    assert "required input field 'b' is not mapped" in problems["nodes"][0]["reason"]
    assert problems["nodes"][0]["node_id"] == "b"


def test_optional_and_defaulted_inputs_may_stay_unmapped():
    """A field with a default or marked optional is fine without a provider."""
    problems = graph(
        [
            node("a", output={"a": spec("str")}),
            node(
                "b",
                input_={
                    "may": spec("str", required=False),
                    "filled": spec("str", default="x"),
                },
            ),
        ],
        [edge("e1", "a", "b", {})],
    )
    assert problems == {"edges": [], "nodes": []}


def test_entry_node_is_exempt_from_coverage():
    """In-degree zero means trigger items, so nothing needs to map its inputs."""
    problems = graph([node("entry", input_={"q": spec("str")})], [])
    assert problems == {"edges": [], "nodes": []}


def test_mapping_naming_an_undeclared_input_is_an_edge_fault():
    problems = graph(
        [node("a", output={"a": spec("str")}), node("b", input_={"b": spec("str")})],
        [edge("e1", "a", "b", {"nope": "a"})],
    )
    assert len(problems["edges"]) == 1
    assert problems["edges"][0]["edge_id"] == "e1"
    assert "target does not declare" in problems["edges"][0]["reason"]


def test_mapping_from_an_undeclared_output_is_an_edge_fault():
    problems = graph(
        [node("a", output={"a": spec("str")}), node("b", input_={"b": spec("str")})],
        [edge("e1", "a", "b", {"b": "nope"})],
    )
    assert len(problems["edges"]) == 1
    assert "source does not declare" in problems["edges"][0]["reason"]


def test_mapped_pair_type_mismatch_is_an_edge_fault():
    problems = graph(
        [node("a", output={"a": spec("int")}), node("b", input_={"b": spec("str")})],
        [edge("e1", "a", "b", {"b": "a"})],
    )
    assert len(problems["edges"]) == 1
    assert "source declares 'int', target expects 'str'" in problems["edges"][0]["reason"]


def test_int_to_float_widening_is_allowed():
    problems = graph(
        [
            node("a", output={"a": spec("int")}),
            node("b", input_={"b": spec("float")}),
        ],
        [edge("e1", "a", "b", {"b": "a"})],
    )
    assert problems == {"edges": [], "nodes": []}


def test_any_is_asymmetric():
    """A source 'Any' cannot satisfy a typed target; a target 'Any' accepts all."""
    undeclared = graph(
        [
            node("a", output={"a": spec("Any")}),
            node("b", input_={"b": spec("float")}),
        ],
        [edge("e1", "a", "b", {"b": "a"})],
    )
    assert len(undeclared["edges"]) == 1
    assert "cannot be proven" in undeclared["edges"][0]["reason"]

    permissive = graph(
        [
            node("a", output={"a": spec("str")}),
            node("b", input_={"b": spec("Any")}),
        ],
        [edge("e1", "a", "b", {"b": "a"})],
    )
    assert permissive == {"edges": [], "nodes": []}


def test_list_element_types_must_match():
    problems = graph(
        [
            node("a", output={"a": spec("list", items="int")}),
            node("b", input_={"b": spec("list", items="str")}),
        ],
        [edge("e1", "a", "b", {"b": "a"})],
    )
    assert len(problems["edges"]) == 1
    assert "source list items are int" in problems["edges"][0]["reason"]


def test_one_input_can_be_fed_by_several_upstream_nodes():
    """x comes from A and y comes from C; neither edge covers the whole input."""
    problems = graph(
        [
            node("a", output={"a": spec("str")}),
            node("c", output={"c": spec("int")}),
            node("b", input_={"x": spec("str"), "y": spec("int")}),
        ],
        [
            edge("e1", "a", "b", {"x": "a"}),
            edge("e2", "c", "b", {"y": "c"}),
        ],
    )
    assert problems == {"edges": [], "nodes": []}


def test_one_output_can_feed_several_targets():
    problems = graph(
        [
            node("a", output={"a": spec("str")}),
            node("b", input_={"b": spec("str")}),
            node("c", input_={"c": spec("str")}),
        ],
        [
            edge("e1", "a", "b", {"b": "a"}),
            edge("e2", "a", "c", {"c": "a"}),
        ],
    )
    assert problems == {"edges": [], "nodes": []}


def test_two_edges_providing_the_same_input_is_a_node_fault():
    problems = graph(
        [
            node("a", output={"a": spec("str")}),
            node("c", output={"c": spec("str")}),
            node("b", input_={"x": spec("str")}),
        ],
        [
            edge("e1", "a", "b", {"x": "a"}),
            edge("e2", "c", "b", {"x": "c"}),
        ],
    )
    assert problems["edges"] == []
    assert len(problems["nodes"]) == 1
    assert "provided by more than one incoming edge" in problems["nodes"][0]["reason"]


def test_disabled_and_opted_out_targets_are_skipped():
    disabled = graph(
        [node("a", output={"a": spec("str")}), node("b", input_={"b": spec("str")}, disabled=True)],
        [edge("e1", "a", "b", {})],
    )
    opted_out = graph(
        [node("a", output={"a": spec("str")}), node("b", input_={"b": spec("str")}, enforcement="off")],
        [edge("e1", "a", "b", {})],
    )
    assert disabled == {"edges": [], "nodes": []}
    assert opted_out == {"edges": [], "nodes": []}


def test_check_edge_reports_the_same_faults_standalone():
    reasons = check_edge(
        {"a": spec("int")}, {"b": spec("str")}, {"b": "a"}
    )
    assert len(reasons) == 1
    assert "source declares 'int'" in reasons[0]


def test_apply_edge_mapping_projects_and_renames():
    items = [
        {"json": {"a": 1, "extra": True}, "binary": {}},
        {"json": {"a": 2}},
    ]
    projected = apply_edge_mapping(items, {"b": "a"})
    assert projected == [
        {"json": {"b": 1}, "binary": {}},
        {"json": {"b": 2}},
    ]


def test_apply_edge_mapping_omits_missing_sources_and_handles_junk():
    """A missing source key is omitted (so a default can apply); junk survives."""
    assert apply_edge_mapping([{"json": {}}], {"b": "a"}) == [{"json": {}}]
    assert apply_edge_mapping([{"json": None}], {"b": "a"}) == [{"json": {}}]
    assert apply_edge_mapping([{"json": {"a": 1}}], None) == [{"json": {}}]


def test_apply_edge_mapping_keeps_an_empty_mapping_empty():
    """Strict: an unmapped edge carries no fields, even ones named alike."""
    assert apply_edge_mapping([{"json": {"a": 1}}], {}) == [{"json": {}}]
