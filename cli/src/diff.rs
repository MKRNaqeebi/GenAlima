//! Local-versus-server diff, so `--dry-run` and `push` can say what will change.

use crate::model::{Edge, Node, WorkflowFile};
use uuid::Uuid;

fn node_label(workflow: &WorkflowFile, id: Uuid) -> &str {
    workflow
        .nodes
        .iter()
        .find(|node| node.id == Some(id))
        .map(|node| node.key.as_str())
        .unwrap_or("?")
}

fn edge_label(workflow: &WorkflowFile, edge: &Edge) -> String {
    format!(
        "{} → {}",
        node_label(workflow, edge.source_node_id),
        node_label(workflow, edge.target_node_id)
    )
}

fn same_node(left: &Node, right: &Node) -> bool {
    left.name == right.name
        && left.code == right.code
        && left.input == right.input
        && left.output == right.output
        && left.type_enforcement == right.type_enforcement
        && left.disabled == right.disabled
        && left.parameters == right.parameters
        && left.notes == right.notes
}

fn node_field_changes(left: &Node, right: &Node) -> Vec<&'static str> {
    let mut changed = Vec::new();
    if left.name != right.name {
        changed.push("name");
    }
    if left.code != right.code {
        changed.push("code");
    }
    if left.input != right.input {
        changed.push("input");
    }
    if left.output != right.output {
        changed.push("output");
    }
    if left.type_enforcement != right.type_enforcement {
        changed.push("type_enforcement");
    }
    if left.disabled != right.disabled {
        changed.push("disabled");
    }
    if left.parameters != right.parameters {
        changed.push("parameters");
    }
    if left.notes != right.notes {
        changed.push("notes");
    }
    changed
}

/// A human-readable change list. Empty means the graphs are identical.
pub fn diff(local: &WorkflowFile, remote: &WorkflowFile) -> Vec<String> {
    let mut lines = Vec::new();

    if local.name != remote.name {
        lines.push(format!("name: {:?} → {:?}", remote.name, local.name));
    }
    if local.description != remote.description {
        lines.push(format!(
            "description: {:?} → {:?}",
            remote.description, local.description
        ));
    }
    if local.active != remote.active {
        lines.push(format!("active: {} → {}", remote.active, local.active));
    }
    if local.settings != remote.settings {
        lines.push("settings: changed".to_string());
    }

    for node in &local.nodes {
        match remote.node_by_key(&node.key) {
            None => lines.push(format!("+ node {} ({})", node.key, node.name)),
            Some(existing) => {
                let changed = node_field_changes(node, existing);
                if !changed.is_empty() {
                    lines.push(format!(
                        "~ node {} ({}): {} changed",
                        node.key,
                        node.name,
                        changed.join(", ")
                    ));
                } else if !same_node(node, existing) {
                    lines.push(format!("~ node {} ({})", node.key, node.name));
                }
            }
        }
    }
    for node in &remote.nodes {
        if local.node_by_key(&node.key).is_none() {
            lines.push(format!("- node {} ({})", node.key, node.name));
        }
    }

    let local_edges: Vec<String> = local
        .edges
        .iter()
        .map(|edge| edge_label(local, edge))
        .collect();
    let remote_edges: Vec<String> = remote
        .edges
        .iter()
        .map(|edge| edge_label(remote, edge))
        .collect();
    for label in &local_edges {
        if !remote_edges.contains(label) {
            lines.push(format!("+ edge {label}"));
        }
    }
    for label in &remote_edges {
        if !local_edges.contains(label) {
            lines.push(format!("- edge {label}"));
        }
    }
    for edge in &local.edges {
        let label = edge_label(local, edge);
        if let Some(existing) = remote
            .edges
            .iter()
            .find(|candidate| edge_label(remote, candidate) == label)
        {
            if edge.mapping != existing.mapping {
                lines.push(format!(
                    "~ edge {label}: mapping {} → {}",
                    serde_json::to_string(&existing.mapping).unwrap_or_default(),
                    serde_json::to_string(&edge.mapping).unwrap_or_default()
                ));
            }
        }
    }

    lines
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::FieldSpec;

    fn pair() -> (WorkflowFile, WorkflowFile) {
        let mut workflow = WorkflowFile::blank("Demo");
        let mut source = Node::new("code_1", "Fetch", (0.0, 0.0));
        source.output.insert("rows".into(), FieldSpec::typed("int"));
        workflow.nodes.push(source);
        (workflow.clone(), workflow)
    }

    #[test]
    fn an_identical_graph_has_no_diff() {
        let (local, remote) = pair();
        assert!(diff(&local, &remote).is_empty());
    }

    #[test]
    fn code_and_mapping_changes_are_named() {
        let (mut local, remote) = pair();
        local.nodes[0].code = "result = [1]\n".to_string();
        let lines = diff(&local, &remote);
        assert!(lines.iter().any(|line| line.contains("code changed")));
    }

    #[test]
    fn added_and_removed_nodes_are_listed() {
        let (mut local, remote) = pair();
        local.nodes.push(Node::new("code_2", "Report", (0.0, 0.0)));
        let lines = diff(&local, &remote);
        assert!(lines.iter().any(|line| line.starts_with("+ node code_2")));

        let (local, mut remote) = pair();
        remote.nodes.push(Node::new("code_9", "Gone", (0.0, 0.0)));
        let lines = diff(&local, &remote);
        assert!(lines.iter().any(|line| line.starts_with("- node code_9")));
    }
}
