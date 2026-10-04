# Parity fixtures

Each `*.json` file here is one case, consumed by **both** test suites:

* `cli/tests/parity.rs` runs it through `cli/src/validate.rs` (the Rust mirror);
* `app/tests/test_cli_parity.py` runs it through the real server rules —
  `app.services.workflow.graph.validate_and_order`,
  `app.services.workflow.types.check_graph` and
  `app.services.workflow.publish.publish_shape`.

That is the anti-drift mechanism described in `docs/cli-plan.md` §8.5: the CLI
cannot import the Python rules, so a rule change on either side has to fail a
test on the other.

## Shape

```jsonc
{
  "name": "human readable case name",
  "note": "optional: why this case exists",
  "nodes": [ /* WorkflowNodeCreate objects, as PUT /graph receives them */ ],
  "edges": [ /* WorkflowEdgeCreate objects */ ],
  "expect": {
    // null when validate_and_order accepts the graph, else the GraphError message
    "graph_error": null,
    // the GraphError's node_ids / edge_ids, compared as sets
    "graph_error_node_ids": [],
    "graph_error_edge_ids": [],
    // check_graph's per-edge faults: [{edge_id, reason}], compared as a set
    "edges": [],
    // check_graph's per-node coverage faults: [{node_id, reason}], as a set
    "nodes": [],
    // publish_shape's message, or null when the graph is publishable
    "publish_error": null,
    // a substring the node model's validators must reject, or null
    "node_validation_error": null
  }
}
```

Rules that keep the two implementations comparable:

* every declared field carries an explicit `required` boolean, which is what the
  server stores after canonicalising a contract;
* each case exercises at most one fault per group, so the two implementations
  cannot disagree about ordering — the tests compare *sets* of reasons anyway;
* node ids are deterministic, hand-written UUIDs.
