//! Copying a published component's graph into a local workflow.
//!
//! Mirror of `insertComponentGraph` in
//! `frontend/src/components/Workflows/types.ts`: components are inserted
//! inline (there is no component node type), so the copy is ordinary code nodes
//! the engine already runs. Ids are regenerated, keys de-duplicated, positions
//! offset, and edges whose endpoints vanished are dropped.

use crate::error::{CliError, Result};
use crate::model::{Edge, Node, WorkflowFile};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};
use uuid::Uuid;

#[derive(Debug)]
pub struct Insertion {
    pub nodes: usize,
    pub edges: usize,
    pub keys: Vec<String>,
}

/// Insert the nodes and edges of a snapshot graph, with the copy's top-left
/// corner at `origin` (or to the right of the existing graph).
pub fn insert_component(
    workflow: &mut WorkflowFile,
    snapshot_nodes: &[Value],
    snapshot_edges: &[Value],
    label: &str,
    origin: Option<(f64, f64)>,
) -> Result<Insertion> {
    if snapshot_nodes.is_empty() {
        return Err(CliError::usage(
            "nothing to insert: the component has no nodes",
        ));
    }

    let mut parsed_nodes: Vec<Node> = Vec::with_capacity(snapshot_nodes.len());
    for value in snapshot_nodes {
        parsed_nodes.push(serde_json::from_value(value.clone()).map_err(|error| {
            CliError::internal(format!(
                "the component snapshot has an unreadable node: {error}"
            ))
        })?);
    }
    let mut parsed_edges: Vec<Edge> = Vec::with_capacity(snapshot_edges.len());
    for value in snapshot_edges {
        parsed_edges.push(serde_json::from_value(value.clone()).map_err(|error| {
            CliError::internal(format!(
                "the component snapshot has an unreadable edge: {error}"
            ))
        })?);
    }

    let min_x = parsed_nodes
        .iter()
        .map(|node| node.position_x)
        .fold(f64::INFINITY, f64::min);
    let min_y = parsed_nodes
        .iter()
        .map(|node| node.position_y)
        .fold(f64::INFINITY, f64::min);
    let (origin_x, origin_y) = origin.unwrap_or_else(|| next_origin(workflow));

    let mut used_keys: BTreeSet<String> =
        workflow.nodes.iter().map(|node| node.key.clone()).collect();
    let mut id_map: BTreeMap<Uuid, Uuid> = BTreeMap::new();
    let mut keys = Vec::with_capacity(parsed_nodes.len());

    for snapshot in &parsed_nodes {
        let new_id = Uuid::new_v4();
        id_map.insert(snapshot.id.unwrap_or_default(), new_id);

        let mut key = snapshot.key.clone();
        let mut suffix = 2;
        while used_keys.contains(&key) {
            key = format!("{}_{}", snapshot.key, suffix);
            suffix += 1;
        }
        used_keys.insert(key.clone());
        keys.push(key.clone());

        let name = if parsed_nodes.len() == 1 {
            label.to_string()
        } else {
            format!("{} · {}", label, snapshot.name)
        };

        let mut node = snapshot.clone();
        node.id = Some(new_id);
        node.workflow_id = None;
        node.key = key;
        node.name = name;
        node.position_x = origin_x + (snapshot.position_x - min_x);
        node.position_y = origin_y + (snapshot.position_y - min_y);
        workflow.nodes.push(node);
    }

    let mut inserted_edges = 0usize;
    for snapshot in &parsed_edges {
        let (Some(source), Some(target)) = (
            id_map.get(&snapshot.source_node_id),
            id_map.get(&snapshot.target_node_id),
        ) else {
            // The UI drops edges whose endpoints are missing from the copy.
            continue;
        };
        let mut edge = snapshot.clone();
        edge.id = Some(Uuid::new_v4());
        edge.workflow_id = None;
        edge.source_node_id = *source;
        edge.target_node_id = *target;
        workflow.edges.push(edge);
        inserted_edges += 1;
    }

    Ok(Insertion {
        nodes: parsed_nodes.len(),
        edges: inserted_edges,
        keys,
    })
}

/// Where an insertion lands when `--at` is not given: to the right of whatever
/// is already on the canvas, on the same top row.
fn next_origin(workflow: &WorkflowFile) -> (f64, f64) {
    if workflow.nodes.is_empty() {
        return (80.0, 80.0);
    }
    let max_x = workflow
        .nodes
        .iter()
        .map(|node| node.position_x)
        .fold(f64::NEG_INFINITY, f64::max);
    let min_y = workflow
        .nodes
        .iter()
        .map(|node| node.position_y)
        .fold(f64::INFINITY, f64::min);
    (max_x + 340.0, min_y)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn snapshot() -> (Vec<Value>, Vec<Value>) {
        let nodes = vec![
            json!({
                "id": "3f2c0000-0000-4000-8000-000000000001",
                "key": "code_1",
                "name": "Fetch",
                "type": "code",
                "position_x": 100.0,
                "position_y": 50.0,
                "code": "result = []\n",
                "input": {},
                "output": {"rows": {"type": "int", "required": true, "default": null}},
                "parameters": {"language": "python", "mode": "runOnceForAllItems", "timeout": 30, "onError": "stopWorkflow"}
            }),
            json!({
                "id": "3f2c0000-0000-4000-8000-000000000002",
                "key": "code_2",
                "name": "Report",
                "type": "code",
                "position_x": 440.0,
                "position_y": 50.0,
                "code": "result = items\n",
                "input": {"rows": {"type": "int", "required": true, "default": null}},
                "output": {},
                "parameters": {"language": "python", "mode": "runOnceForAllItems", "timeout": 30, "onError": "stopWorkflow"}
            }),
        ];
        let edges = vec![json!({
            "id": "b0a10000-0000-4000-8000-000000000003",
            "source_node_id": "3f2c0000-0000-4000-8000-000000000001",
            "target_node_id": "3f2c0000-0000-4000-8000-000000000002",
            "source_handle": "main",
            "target_handle": "main",
            "mapping": {"rows": "rows"}
        })];
        (nodes, edges)
    }

    #[test]
    fn inserted_ids_are_fresh_and_edges_stay_wired() {
        let mut workflow = WorkflowFile::blank("Demo");
        let (nodes, edges) = snapshot();
        let insertion = insert_component(&mut workflow, &nodes, &edges, "Report", None).unwrap();
        assert_eq!(insertion.nodes, 2);
        assert_eq!(insertion.edges, 1);

        let source = workflow.node_by_key("code_1").unwrap();
        let target = workflow.node_by_key("code_2").unwrap();
        assert_ne!(
            source.id.unwrap().to_string(),
            "3f2c0000-0000-4000-8000-000000000001"
        );
        assert_eq!(workflow.edges[0].source_node_id, source.id.unwrap());
        assert_eq!(workflow.edges[0].target_node_id, target.id.unwrap());
    }

    #[test]
    fn duplicate_keys_are_suffixed() {
        let mut workflow = WorkflowFile::blank("Demo");
        workflow
            .nodes
            .push(Node::new("code_1", "Existing", (0.0, 0.0)));
        let (nodes, edges) = snapshot();
        let insertion = insert_component(&mut workflow, &nodes, &edges, "Report", None).unwrap();
        assert_eq!(insertion.keys, vec!["code_1_2", "code_2"]);
    }

    #[test]
    fn a_single_node_copy_takes_the_component_name() {
        let mut workflow = WorkflowFile::blank("Demo");
        let (nodes, _) = snapshot();
        let single = vec![nodes[0].clone()];
        insert_component(
            &mut workflow,
            &single,
            &[],
            "Daily report",
            Some((10.0, 20.0)),
        )
        .unwrap();
        assert_eq!(workflow.nodes[0].name, "Daily report");
        let multi = snapshot().0;
        let mut workflow = WorkflowFile::blank("Demo");
        insert_component(
            &mut workflow,
            &multi,
            &[],
            "Daily report",
            Some((10.0, 20.0)),
        )
        .unwrap();
        assert_eq!(workflow.nodes[0].name, "Daily report · Fetch");
    }

    #[test]
    fn positions_are_offset_so_the_corner_lands_at_the_origin() {
        let mut workflow = WorkflowFile::blank("Demo");
        let (nodes, edges) = snapshot();
        insert_component(
            &mut workflow,
            &nodes,
            &edges,
            "Report",
            Some((1000.0, 500.0)),
        )
        .unwrap();
        assert_eq!(workflow.nodes[0].position_x, 1000.0);
        assert_eq!(workflow.nodes[0].position_y, 500.0);
        assert_eq!(workflow.nodes[1].position_x, 1340.0);
    }

    #[test]
    fn an_empty_snapshot_is_a_usage_error() {
        let mut workflow = WorkflowFile::blank("Demo");
        let error = insert_component(&mut workflow, &[], &[], "Report", None).unwrap_err();
        assert!(error.message().contains("no nodes"));
    }
}
