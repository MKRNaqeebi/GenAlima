//! The parity suite: the shared fixtures in `tests/fixtures/parity/` through the
//! Rust mirror.
//!
//! `app/tests/test_cli_parity.py` feeds the *same files* to the server's real
//! rules (`validate_and_order`, `check_graph`, `publish_shape`). A rule change on
//! either side that the other does not follow fails one of the two suites —
//! which is the whole point, since the CLI cannot import Python
//! (`docs/cli-plan.md` §8.5).

use genalima_cli::model::{Edge, Node, WorkflowFile};
use genalima_cli::validate;
use serde::Deserialize;
use serde_json::Value;
use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

#[derive(Debug, Deserialize)]
struct Fixture {
    name: String,
    #[serde(default)]
    note: Option<String>,
    nodes: Vec<Node>,
    edges: Vec<Edge>,
    expect: Expect,
}

#[derive(Debug, Deserialize)]
struct Expect {
    graph_error: Option<String>,
    #[serde(default)]
    graph_error_node_ids: Vec<String>,
    #[serde(default)]
    graph_error_edge_ids: Vec<String>,
    #[serde(default)]
    edges: Vec<EdgeProblem>,
    #[serde(default)]
    nodes: Vec<NodeProblem>,
    publish_error: Option<String>,
    node_validation_error: Option<String>,
}

#[derive(Debug, Deserialize)]
struct EdgeProblem {
    edge_id: String,
    reason: String,
}

#[derive(Debug, Deserialize)]
struct NodeProblem {
    node_id: String,
    reason: String,
}

fn fixture_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/parity")
}

fn load_fixtures() -> Vec<(String, Fixture)> {
    let dir = fixture_dir();
    let mut files: Vec<PathBuf> = std::fs::read_dir(&dir)
        .unwrap_or_else(|error| panic!("cannot read {}: {error}", dir.display()))
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.extension().map(|ext| ext == "json").unwrap_or(false))
        .collect();
    files.sort();
    files
        .into_iter()
        .map(|path| {
            let text = std::fs::read_to_string(&path).unwrap();
            let fixture: Fixture = serde_json::from_str(&text).unwrap_or_else(|error| {
                panic!("{} is not a valid fixture: {error}", path.display())
            });
            (
                path.file_name().unwrap().to_string_lossy().to_string(),
                fixture,
            )
        })
        .collect()
}

fn workflow_of(fixture: &Fixture) -> WorkflowFile {
    WorkflowFile {
        name: fixture.name.clone(),
        nodes: fixture.nodes.clone(),
        edges: fixture.edges.clone(),
        ..WorkflowFile::default()
    }
}

#[test]
fn every_fixture_agrees_with_the_server_expectation() {
    let fixtures = load_fixtures();
    assert!(
        fixtures.len() >= 20,
        "expected the whole fixture set, found {}",
        fixtures.len()
    );

    for (file, fixture) in &fixtures {
        let workflow = workflow_of(fixture);
        let note = fixture.note.as_deref().unwrap_or(&fixture.name);

        // 1. Model-level validation (the server's 422 path). The Python suite
        //    stops here too, so nothing else is compared.
        if let Some(substring) = &fixture.expect.node_validation_error {
            let problems = validate::validate(&workflow, false);
            assert!(
                problems
                    .iter()
                    .any(|problem| problem.scope == "node" && problem.reason.contains(substring)),
                "{file} ({note}): expected a node spec problem containing {substring:?}, got {problems:?}"
            );
            continue;
        }

        // 2. Structure (validate_and_order).
        let structural = validate::structure_problems(&fixture.nodes, &fixture.edges);
        match (&structural, &fixture.expect.graph_error) {
            (Ok(()), None) => {}
            (Ok(()), Some(expected)) => {
                panic!("{file} ({note}): expected the graph error {expected:?}")
            }
            (Err(problems), None) => {
                panic!("{file} ({note}): unexpected graph error {problems:?}")
            }
            (Err(problems), Some(expected)) => {
                assert_eq!(
                    problems.len(),
                    1,
                    "{file} ({note}): the mirror reports one structural fault at a time"
                );
                assert_eq!(
                    &problems[0].reason, expected,
                    "{file} ({note}): the message must match the server's"
                );
                for id in fixture
                    .expect
                    .graph_error_node_ids
                    .iter()
                    .chain(fixture.expect.graph_error_edge_ids.iter())
                {
                    assert!(
                        problems[0].ids.contains(id),
                        "{file} ({note}): {id} is missing from {:?}",
                        problems[0].ids
                    );
                }
            }
        }

        // A graph that does not validate never reaches check_graph on the
        // server, so the type comparison is skipped for those cases.
        if fixture.expect.graph_error.is_none() {
            let problems = validate::validate(&workflow, false);
            let edge_set: BTreeSet<(String, String)> = problems
                .iter()
                .filter(|problem| problem.scope == "edge")
                .map(|problem| (problem.id.clone(), problem.reason.clone()))
                .collect();
            let expected_edges: BTreeSet<(String, String)> = fixture
                .expect
                .edges
                .iter()
                .map(|problem| (problem.edge_id.clone(), problem.reason.clone()))
                .collect();
            assert_eq!(
                edge_set, expected_edges,
                "{file} ({note}): per-edge faults differ from the server's"
            );

            let node_set: BTreeSet<(String, String)> = problems
                .iter()
                .filter(|problem| problem.scope == "node")
                .map(|problem| (problem.id.clone(), problem.reason.clone()))
                .collect();
            let expected_nodes: BTreeSet<(String, String)> = fixture
                .expect
                .nodes
                .iter()
                .map(|problem| (problem.node_id.clone(), problem.reason.clone()))
                .collect();
            assert_eq!(
                node_set, expected_nodes,
                "{file} ({note}): coverage faults differ from the server's"
            );
        }

        // 3. The publish boundary (publish_shape). Skipped for a graph that does
        //    not validate: the server never reaches publish_shape either, because
        //    `validate_and_order` raises first.
        if fixture.expect.graph_error.is_none() {
            let publish = validate::publish_problems(&fixture.nodes, &fixture.edges);
            match &fixture.expect.publish_error {
                Some(expected) => assert!(
                    publish.iter().any(|problem| &problem.reason == expected),
                    "{file} ({note}): expected the publish error {expected:?}, got {publish:?}"
                ),
                None => assert!(
                    publish.is_empty(),
                    "{file} ({note}): the graph should be publishable, got {publish:?}"
                ),
            }
        }
    }
}

/// The fixture files must stay in the documented shape, or the Python side
/// silently stops comparing anything.
#[test]
fn fixtures_declare_the_documented_expectation_keys() {
    for (file, _) in load_fixtures() {
        let text = std::fs::read_to_string(fixture_dir().join(&file)).unwrap();
        let value: Value = serde_json::from_str(&text).unwrap();
        for key in ["name", "nodes", "edges", "expect"] {
            assert!(value.get(key).is_some(), "{file} is missing {key:?}");
        }
        for key in [
            "graph_error",
            "edges",
            "nodes",
            "publish_error",
            "node_validation_error",
        ] {
            assert!(
                value["expect"].get(key).is_some(),
                "{file}: expect.{key} must be present (null when not applicable)"
            );
        }
    }
}
