//! Canonical formatting and atomic writes for `workflow.json`.
//!
//! Everything written to disk goes through this module, so the file is
//! byte-stable: two-space indent, sorted object keys (serde_json's default map
//! is a `BTreeMap`), nodes sorted by key, edges by endpoint pair, one trailing
//! newline. See `docs/cli-plan.md` §5.2.

use crate::error::Result;
use crate::model::WorkflowFile;
use serde_json::Value;
use std::path::{Path, PathBuf};

/// Order a workflow's graph the way the server returns it: nodes by key, edges
/// by `(source, target)`. Metadata and node internals are left as they are.
pub fn canonicalize(workflow: &mut WorkflowFile) {
    workflow.nodes.sort_by(|a, b| a.key.cmp(&b.key));
    workflow.edges.sort_by(|a, b| {
        (a.source_node_id, a.target_node_id).cmp(&(b.source_node_id, b.target_node_id))
    });
}

/// The canonical serialisation of any JSON value: pretty, sorted, newline-ended.
pub fn to_json_string(value: &Value) -> String {
    let mut text = serde_json::to_string_pretty(value).unwrap_or_else(|_| "null".to_string());
    text.push('\n');
    text
}

pub fn workflow_string(workflow: &WorkflowFile) -> Result<String> {
    let mut workflow = workflow.clone();
    canonicalize(&mut workflow);
    let value = serde_json::to_value(&workflow)?;
    Ok(to_json_string(&value))
}

/// Write `contents` to `path` atomically: temp file in the same directory, then
/// rename. A half-written `workflow.json` must never be possible.
pub fn write_atomic(path: &Path, contents: &str) -> Result<()> {
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() && !parent.exists() {
            std::fs::create_dir_all(parent)?;
        }
    }
    let temp = temp_path(path);
    std::fs::write(&temp, contents)?;
    std::fs::rename(&temp, path)?;
    Ok(())
}

fn temp_path(path: &Path) -> PathBuf {
    let file_name = path
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| "workflow.json".to_string());
    let temp_name = format!(".{}.tmp-{}", file_name, std::process::id());
    match path.parent() {
        Some(parent) if !parent.as_os_str().is_empty() => parent.join(temp_name),
        _ => PathBuf::from(temp_name),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{Edge, Node};
    use uuid::Uuid;

    #[test]
    fn keys_are_sorted_and_named_fields_are_not_lost() {
        let mut workflow = WorkflowFile::blank("Demo");
        workflow
            .nodes
            .push(Node::new("code_2", "Second", (0.0, 0.0)));
        workflow
            .nodes
            .push(Node::new("code_1", "First", (0.0, 0.0)));
        canonicalize(&mut workflow);
        assert_eq!(workflow.nodes[0].key, "code_1");

        let text = workflow_string(&workflow).unwrap();
        assert!(text.ends_with("}\n"));
        // "active" sorts before "description", "edges", "id", "name", "nodes", "version".
        let active = text.find("\"active\"").unwrap();
        let name = text.find("\"name\"").unwrap();
        assert!(active < name, "object keys must be sorted");
    }

    #[test]
    fn edges_are_sorted_by_endpoint_pair() {
        // Deterministic ids: a sort assertion needs a known order, not whatever
        // random v4 uuids happen to compare as.
        let a = Uuid::from_u128(1);
        let b = Uuid::from_u128(2);
        let c = Uuid::from_u128(3);
        let mut workflow = WorkflowFile::blank("Demo");
        workflow.nodes.push(Node::new("code_1", "A", (0.0, 0.0)));
        workflow.edges.push(Edge::new(b, c));
        workflow.edges.push(Edge::new(a, c));
        canonicalize(&mut workflow);
        assert_eq!(workflow.edges[0].source_node_id, a);
        assert_eq!(workflow.edges[1].source_node_id, b);
    }

    #[test]
    fn a_re_serialisation_is_a_fixed_point() {
        let mut workflow = WorkflowFile::blank("Demo");
        let node = Node::new("code_1", "Fetch", (80.0, 80.0));
        workflow.nodes.push(node);
        let once = workflow_string(&workflow).unwrap();
        let parsed: WorkflowFile = serde_json::from_str(&once).unwrap();
        let twice = workflow_string(&parsed).unwrap();
        assert_eq!(once, twice);
    }

    #[test]
    fn write_atomic_replaces_in_place_and_leaves_no_temp_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("nested/workflow.json");
        write_atomic(&path, "{\"a\":1}\n").unwrap();
        write_atomic(&path, "{\"a\":2}\n").unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "{\"a\":2}\n");
        let leftovers = std::fs::read_dir(path.parent().unwrap())
            .unwrap()
            .filter_map(|entry| entry.ok())
            .filter(|entry| entry.file_name().to_string_lossy().contains(".tmp-"))
            .count();
        assert_eq!(leftovers, 0);
    }
}
