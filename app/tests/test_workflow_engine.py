"""
Graph execution semantics in ``app.services.workflow.engine``.

The runner is stubbed with a small interpreter of the node's ``code`` so these
tests cover ordering, mapping, contracts and ``onError`` without subprocesses;
``test_workflow_runner.py`` covers the real runner.
"""
# Standard library imports
from typing import Any
import uuid

# Third-party imports
import pytest

# Local application imports
from app.services.workflow.engine import execute_graph, execute_node
from app.services.workflow.graph import GraphError
from app.services.workflow.runners.python_runner import RunnerResult


def fake_runner(code: str, mode: str, items: list[dict[str, Any]], timeout: float) -> RunnerResult:
    """
    ``code`` is a tiny instruction: "fail", or a Python expression over
    ``items`` evaluated to the output list.
    """
    del mode, timeout
    if code == "fail":
        return RunnerResult(error="boom", logs="about to fail")
    return RunnerResult(output=eval(code, {"items": items}))  # pylint: disable=eval-used


def node(name: str, code: str = "items", **extra: Any) -> dict[str, Any]:
    return {
        "id": uuid.uuid4(),
        "key": name,
        "name": name,
        "code": code,
        "input": extra.pop("input", {}),
        "output": extra.pop("output", {}),
        "type_enforcement": extra.pop("type_enforcement", "strict"),
        "disabled": extra.pop("disabled", False),
        "parameters": {"mode": "runOnceForAllItems", **extra.pop("parameters", {})},
    }


def edge(source: dict, target: dict, mapping: dict[str, str] | None = None) -> dict[str, Any]:
    return {
        "id": uuid.uuid4(),
        "source_node_id": source["id"],
        "target_node_id": target["id"],
        "mapping": mapping or {},
    }


def by_name(result, nodes):
    names = {n["id"]: n["name"] for n in nodes}
    return {names[r.node_id]: r for r in result.nodes}


STR = {"type": "str", "required": True}
INT = {"type": "int", "required": True}


def test_runs_in_order_and_projects_through_mappings() -> None:
    a = node("a", '[{"json": {"q": "hi", "extra": 1}}]', output={"q": STR, "extra": INT})
    b = node("b", '[{"json": {"seen": i["json"]} } for i in items]', input={"query": STR})
    nodes = [b, a]
    result = execute_graph(nodes, [edge(a, b, {"query": "q"})], run_node=fake_runner)

    assert result.status == "success"
    assert [r.node_id for r in result.nodes] == [a["id"], b["id"]]
    assert by_name(result, nodes)["b"].output_items == [{"json": {"seen": {"query": "hi"}}}]


def test_entry_nodes_receive_trigger_items() -> None:
    a = node("a")
    result = execute_graph([a], [], [{"json": {"x": 1}}], run_node=fake_runner)
    assert result.nodes[0].input_items == [{"json": {"x": 1}}]


def test_default_trigger_is_one_empty_item() -> None:
    result = execute_graph([node("a")], [], run_node=fake_runner)
    assert result.nodes[0].input_items == [{"json": {}}]


def test_inbound_edges_are_concatenated() -> None:
    a = node("a", '[{"json": {"v": 1}}]', output={"v": INT})
    b = node("b", '[{"json": {"v": 2}}]', output={"v": INT})
    c = node("c", input={"v": {"type": "int", "required": False}})
    nodes = [a, b, c]
    edges = [edge(a, c, {"v": "v"}), edge(b, c, {"v": "v"})]
    result = execute_graph(nodes, edges, run_node=fake_runner)
    assert by_name(result, nodes)["c"].input_items == [{"json": {"v": 1}}, {"json": {"v": 2}}]


def test_strict_input_violation_names_the_upstream_node() -> None:
    a = node("Fetch", '[{"json": {"n": "10"}}]', output={"n": {"type": "Any"}})
    b = node("Score", input={"n": INT})
    nodes = [a, b]
    result = execute_graph(nodes, [edge(a, b, {"n": "n"})], run_node=fake_runner)
    score = by_name(result, nodes)["Score"]
    assert result.status == "error"
    assert score.status == "error"
    assert "from 'Fetch'" in score.error
    assert "expected int, got str" in score.error


def test_warn_enforcement_logs_and_continues() -> None:
    a = node("a", '[{"json": {"n": "10"}}]', output={"n": INT}, type_enforcement="warn")
    result = execute_graph([a], [], run_node=fake_runner)
    assert result.status == "success"
    assert "[type warning] output" in result.nodes[0].logs


def test_off_enforcement_skips_validation() -> None:
    a = node("a", '[{"json": {"n": "10"}}]', output={"n": INT}, type_enforcement="off")
    assert execute_graph([a], [], run_node=fake_runner).status == "success"


def test_stop_workflow_skips_the_rest() -> None:
    a = node("a", "fail")
    b = node("b")
    nodes = [a, b]
    result = execute_graph(nodes, [edge(a, b)], run_node=fake_runner)
    assert result.status == "error"
    assert result.error == "'a' failed: boom"
    assert [r.status for r in result.nodes] == ["error", "skipped"]
    assert result.nodes[0].logs == "about to fail"


def test_continue_regular_output_passes_the_error_downstream() -> None:
    a = node("a", "fail", parameters={"onError": "continueRegularOutput"})
    b = node("b")
    nodes = [a, b]
    edges = [{**edge(a, b), "mapping": {"error": "error"}}]
    result = execute_graph(nodes, edges, run_node=fake_runner)
    assert result.status == "success"
    assert by_name(result, nodes)["b"].input_items == [{"json": {"error": "boom"}}]


def test_continue_error_output_emits_nothing() -> None:
    a = node("a", "fail", parameters={"onError": "continueErrorOutput"})
    b = node("b")
    nodes = [a, b]
    result = execute_graph(nodes, [edge(a, b)], run_node=fake_runner)
    assert by_name(result, nodes)["b"].input_items == []


def test_disabled_node_passes_items_through_without_running() -> None:
    a = node("a", "fail", disabled=True)
    outcome = execute_node(a, None, [{"json": {"x": 1}}], fake_runner)
    assert outcome.status == "success"
    assert outcome.output_items == [{"json": {"x": 1}}]


def test_cycles_are_rejected_before_running() -> None:
    a, b = node("a"), node("b")
    with pytest.raises(GraphError):
        execute_graph([a, b], [edge(a, b), edge(b, a)], run_node=fake_runner)
