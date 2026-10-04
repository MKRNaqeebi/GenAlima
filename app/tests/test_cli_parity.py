"""
The Python half of the CLI parity suite.

`cli/src/validate.rs` mirrors the graph rules in `app/services/workflow/` so the
`genalima` CLI can validate a `workflow.json` with no server, no token and no
database. A mirror can drift, so both suites read the *same* fixture files:
`cli/tests/parity.rs` runs them through the Rust mirror, and this module runs
them through the real server rules — `validate_and_order`, `check_graph` and
`publish_shape`, the same functions `PUT /workflows/{id}/graph` and
`POST /workflows/{id}/publish` call.

A rule change that only one side follows fails a test on the other. See
`docs/cli-plan.md` §8.5 and `cli/tests/fixtures/parity/README.md`.

The fixtures are skipped when the Rust crate is not present, so the Python suite
never depends on a Rust toolchain — only on the fixtures, which are committed.
"""
# Standard library imports
import json
from pathlib import Path

# Third-party imports
import pytest

# Local application imports
from app.models import WorkflowEdgeCreate, WorkflowNodeCreate
from app.services.workflow.graph import GraphError, validate_and_order
from app.services.workflow.publish import publish_shape
from app.services.workflow.types import check_graph

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURE_DIR = REPO_ROOT / "cli" / "tests" / "fixtures" / "parity"

pytestmark = pytest.mark.skipif(
    not FIXTURE_DIR.is_dir(),
    reason=f"the shared parity fixtures are absent ({FIXTURE_DIR})",
)


def _fixtures() -> list[tuple[str, dict]]:
    """
    Every fixture, keyed by file name, in a stable order.
    """
    files = sorted(FIXTURE_DIR.glob("*.json"))
    return [(path.name, json.loads(path.read_text())) for path in files]


FIXTURES = _fixtures()
FIXTURE_IDS = [name for name, _ in FIXTURES]


def _canonicalise(fixture: dict) -> tuple[list[dict], list[dict]]:
    """
    Build the payloads the route would see.

    The routes validate the body into `WorkflowNodeCreate` / `WorkflowEdgeCreate`
    before checking anything, and that is where a contract is canonicalised and
    `required` is resolved from the default. Mirroring that here is what makes
    the comparison fair: `check_graph` never sees an unresolved spec in
    production either.
    """
    nodes = [
        WorkflowNodeCreate.model_validate(node).model_dump()
        for node in fixture["nodes"]
    ]
    edges = [
        WorkflowEdgeCreate.model_validate(edge).model_dump()
        for edge in fixture["edges"]
    ]
    return nodes, edges


def _problem_set(items: list[dict], key: str) -> set[tuple[str, str]]:
    """
    A set of `(id, reason)` pairs: the two implementations may report problems in
    a different order, but never a different problem.
    """
    return {(str(item[key]), item["reason"]) for item in items}


def test_the_fixture_set_is_present_and_complete() -> None:
    """
    A silently empty fixture directory would make this whole module vacuous.
    """
    assert len(FIXTURES) >= 20, f"expected the whole fixture set, found {len(FIXTURES)}"
    names = {name for name, _ in FIXTURES}
    for expected in (
        "valid-passthrough.json",
        "cycle.json",
        "required-not-mapped.json",
        "publish-two-entries.json",
        "field-spec-unknown-type.json",
    ):
        assert expected in names, f"{expected} is missing from the parity fixtures"


@pytest.mark.parametrize("file_name,fixture", FIXTURES, ids=FIXTURE_IDS)
def test_the_server_rules_agree_with_the_fixture(file_name: str, fixture: dict) -> None:
    """
    One fixture, through the real rules, exactly as the CLI's mirror expects.
    """
    expect = fixture["expect"]

    # 1. Model-level validation: the 422 path. The Rust suite stops here too.
    if expect["node_validation_error"] is not None:
        with pytest.raises(Exception) as raised:
            _canonicalise(fixture)
        assert expect["node_validation_error"] in str(raised.value), (
            f"{file_name}: expected the model to reject this with "
            f"{expect['node_validation_error']!r}, got {raised.value}"
        )
        return

    nodes, edges = _canonicalise(fixture)

    # 2. Structure, exactly as the graph save route does it.
    graph_error: GraphError | None = None
    try:
        validate_and_order(nodes, edges)
    except GraphError as exc:
        graph_error = exc

    if expect["graph_error"] is None:
        assert graph_error is None, (
            f"{file_name}: expected a valid graph, got {graph_error.message!r}"
        )
    else:
        assert graph_error is not None, (
            f"{file_name}: expected {expect['graph_error']!r}, but the graph validated"
        )
        assert graph_error.message == expect["graph_error"], (
            f"{file_name}: the mirror must use the server's exact message"
        )
        reported = {str(node_id) for node_id in graph_error.node_ids} | {
            str(edge_id) for edge_id in graph_error.edge_ids
        }
        for expected_id in expect["graph_error_node_ids"] + expect["graph_error_edge_ids"]:
            assert expected_id in reported, (
                f"{file_name}: {expected_id} is missing from {sorted(reported)}"
            )

    # A graph that does not validate never reaches check_graph in the route
    # either: `validate_and_order` raises first.
    if graph_error is None:
        nodes_by_id = {node["id"]: node for node in nodes}
        problems = check_graph(nodes_by_id, edges)
        assert _problem_set(problems["edges"], "edge_id") == _problem_set(
            expect["edges"], "edge_id"
        ), f"{file_name}: per-edge faults differ from the fixture"
        assert _problem_set(problems["nodes"], "node_id") == _problem_set(
            expect["nodes"], "node_id"
        ), f"{file_name}: coverage faults differ from the fixture"

    # 3. The publish boundary, again skipped when the graph does not validate.
    if graph_error is None:
        publish_error: GraphError | None = None
        try:
            publish_shape(nodes, edges)
        except GraphError as exc:
            publish_error = exc
        if expect["publish_error"] is None:
            assert publish_error is None, (
                f"{file_name}: expected a publishable graph, got {publish_error.message!r}"
            )
        else:
            assert publish_error is not None, (
                f"{file_name}: expected {expect['publish_error']!r}, but the graph published"
            )
            assert publish_error.message == expect["publish_error"], (
                f"{file_name}: the mirror must use the server's exact message"
            )
