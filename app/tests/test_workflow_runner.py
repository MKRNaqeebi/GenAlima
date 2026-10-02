"""
The Python runner's subprocess protocol (plan §5.3, §5.4).

These start real subprocesses, so they exercise the sentinel parsing, both
modes, error reporting and the timeout exactly as the engine will.
"""
# Standard library imports
import time

# Local application imports
from app.services.workflow.runners.python_runner import SENTINEL_PREFIX, parse_output, run


def test_all_items_mode_returns_items_and_logs() -> None:
    code = 'print("hello")\nresult = [{"json": {**i["json"], "ok": True}} for i in items]'
    outcome = run(code, "runOnceForAllItems", [{"json": {"a": 1}}, {"json": {"a": 2}}])
    assert outcome.error is None
    assert outcome.output == [{"json": {"a": 1, "ok": True}}, {"json": {"a": 2, "ok": True}}]
    assert "hello" in outcome.logs


def test_plain_dicts_are_wrapped_as_items() -> None:
    outcome = run('result = [{"x": 1}]', "runOnceForAllItems", [{"json": {}}])
    assert outcome.output == [{"json": {"x": 1}}]


def test_each_item_mode_adds_paired_item_and_skips_none() -> None:
    code = 'result = None if item["json"]["n"] == 2 else {"json": {"n": item["json"]["n"] * 10}}'
    items = [{"json": {"n": 1}}, {"json": {"n": 2}}, {"json": {"n": 3}}]
    outcome = run(code, "runOnceForEachItem", items)
    assert outcome.error is None
    assert outcome.output == [
        {"json": {"n": 10}, "pairedItem": {"item": 0}},
        {"json": {"n": 30}, "pairedItem": {"item": 2}},
    ]


def test_each_item_mode_rejects_a_list() -> None:
    outcome = run("result = [item]", "runOnceForEachItem", [{"json": {}}])
    assert outcome.error is not None
    assert "must be one item" in outcome.error


def test_exception_reports_a_user_traceback() -> None:
    outcome = run("x = 1\nraise ValueError('boom')", "runOnceForAllItems", [])
    assert outcome.error is not None
    assert "ValueError: boom" in outcome.error
    assert 'File "<node>", line 2' in outcome.error
    # Only frames from the node itself may show; the runner's own file must not.
    assert "python_runner" not in outcome.error


def test_syntax_error_is_reported() -> None:
    outcome = run("def (:", "runOnceForAllItems", [])
    assert outcome.error is not None
    assert "SyntaxError" in outcome.error


def test_non_list_result_is_an_error() -> None:
    outcome = run("result = {'json': {}}", "runOnceForAllItems", [])
    assert outcome.error == "'result' must be a list of items, got dict"


def test_printing_the_sentinel_cannot_inject_a_result() -> None:
    code = f'print("{SENTINEL_PREFIX}" + \'{{"output": [{{"json": {{"fake": 1}}}}]}}\')\nresult = []'
    outcome = run(code, "runOnceForAllItems", [])
    assert outcome.error is None
    assert outcome.output == []


def test_timeout_kills_the_node() -> None:
    started = time.monotonic()
    outcome = run("import time\ntime.sleep(30)", "runOnceForAllItems", [], timeout=1)
    assert outcome.error == "node timed out after 1s"
    assert time.monotonic() - started < 10


def test_missing_sentinel_is_a_crash() -> None:
    outcome = parse_output("partial output", "Fatal", 1, SENTINEL_PREFIX + "abc")
    assert outcome.error == "runner crashed: Fatal"
