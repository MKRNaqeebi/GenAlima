"""
Unit tests for the publish planning helpers.

These cover the two things that are easy to get wrong without a database: which
node defines a component's boundary, and whether a deep copy really is
independent of its source. No session or app is needed.
"""
# Standard library imports
import uuid

# Third-party imports
import pytest

# Local application imports
from app.services.workflow.graph import GraphError
from app.services.workflow.publish import plan_snapshot, publish_shape


def _node(key: str, **overrides: object) -> dict:
    """
    A minimal node mapping, with the fields the helpers care about.
    """
    node = {
        "id": uuid.uuid4(),
        "key": key,
        "name": key,
        "type": "code",
        "type_version": 1,
        "position_x": 0.0,
        "position_y": 0.0,
        "disabled": False,
        "code": f"# {key}",
        "input": {},
        "output": {},
        "type_enforcement": "strict",
        "parameters": {"language": "python", "mode": "runOnceForAllItems", "timeout": 30},
        "notes": None,
    }
    node.update(overrides)
    return node


def _edge(source: dict, target: dict, mapping: dict | None = None) -> dict:
    """
    An edge between two node mappings.
    """
    return {
        "id": uuid.uuid4(),
        "source_node_id": source["id"],
        "target_node_id": target["id"],
        "source_handle": "main",
        "target_handle": "main",
        "mapping": mapping or {},
    }


def test_empty_graph_has_no_boundary():
    with pytest.raises(GraphError) as caught:
        publish_shape([], [])
    assert "at least one node" in caught.value.message


def test_single_node_is_both_entry_and_exit():
    node = _node("only")
    shape = publish_shape([node], [])
    assert shape.entry_id == node["id"]
    assert shape.exit_id == node["id"]


def test_chain_boundary_is_first_and_last():
    first, middle, last = _node("a"), _node("b"), _node("c")
    edges = [_edge(first, middle), _edge(middle, last)]

    shape = publish_shape([middle, first, last], edges)

    assert shape.entry_id == first["id"]
    assert shape.exit_id == last["id"]


def test_diamond_boundary_is_the_join():
    source, left, right, sink = _node("s"), _node("l"), _node("r"), _node("t")
    edges = [_edge(source, left), _edge(source, right), _edge(left, sink), _edge(right, sink)]

    shape = publish_shape([source, left, right, sink], edges)

    assert shape.entry_id == source["id"]
    assert shape.exit_id == sink["id"]


def test_disconnected_nodes_are_rejected_as_multiple_entries():
    first, second = _node("a"), _node("b")
    with pytest.raises(GraphError) as caught:
        publish_shape([first, second], [])
    assert "exactly one entry node" in caught.value.message
    assert set(caught.value.node_ids) == {first["id"], second["id"]}


def test_fan_out_is_rejected_as_multiple_exits():
    source, left, right = _node("s"), _node("l"), _node("r")
    edges = [_edge(source, left), _edge(source, right)]

    with pytest.raises(GraphError) as caught:
        publish_shape([source, left, right], edges)

    assert "exactly one exit node" in caught.value.message
    assert set(caught.value.node_ids) == {left["id"], right["id"]}


def test_snapshot_gets_fresh_ids_and_rewired_edges():
    first, last = _node("a"), _node("b")
    edges = [_edge(first, last, {"topic": "subject"})]
    workflow_id = uuid.uuid4()

    plan = plan_snapshot([first, last], edges, workflow_id)

    snapshot_node_ids = {row["id"] for row in plan.nodes}
    assert snapshot_node_ids.isdisjoint({first["id"], last["id"]})
    assert {row["workflow_id"] for row in plan.nodes} == {workflow_id}

    snapshot_edge = plan.edges[0]
    assert snapshot_edge["workflow_id"] == workflow_id
    assert snapshot_edge["source_node_id"] in snapshot_node_ids
    assert snapshot_edge["target_node_id"] in snapshot_node_ids
    assert snapshot_edge["source_node_id"] != first["id"]
    # The new source must still be the copy of the old source, not just any node.
    source_row = next(row for row in plan.nodes if row["id"] == snapshot_edge["source_node_id"])
    assert source_row["key"] == first["key"]


def test_snapshot_carries_every_field_verbatim():
    node = _node(
        "a",
        code="result = items",
        input={"topic": {"type": "str", "required": True, "default": None, "description": None, "enum": None, "items": None}},
        output={"rows": {"type": "list", "required": True, "default": None, "description": None, "enum": None, "items": "dict"}},
        type_enforcement="warn",
        disabled=True,
        position_x=12.5,
        parameters={"language": "python", "mode": "runOnceForEachItem", "timeout": 5, "onError": "stopWorkflow"},
        notes="keep me",
    )
    plan = plan_snapshot([node], [], uuid.uuid4())
    copied = plan.nodes[0]

    for field, value in node.items():
        if field == "id":
            continue
        assert copied[field] == value, field
    assert copied["id"] != node["id"]


def test_snapshot_edge_keeps_its_field_mapping():
    first, last = _node("a"), _node("b")
    edges = [_edge(first, last, {"target_topic": "source_subject"})]

    plan = plan_snapshot([first, last], edges, uuid.uuid4())

    assert plan.edges[0]["mapping"] == {"target_topic": "source_subject"}
