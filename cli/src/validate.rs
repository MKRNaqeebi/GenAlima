//! The offline mirror of the server's graph rules.
//!
//! The server is the authority (`PUT /workflows/{id}/graph` rejects the same
//! faults with the same 400 body). This module exists so `workflow validate`
//! works with no server, no token and no database, and so `push` can refuse a
//! graph it knows the server will reject. Messages are copied verbatim from
//! `app/services/workflow/graph.py`, `types.py` and `publish.py`; the shared
//! fixtures in `cli/tests/fixtures/parity/` fail the build if either side drifts
//! (`docs/cli-plan.md` §8.5).
//!
//! Spec-level semantics use the *resolved* `required` (`FieldSpec::is_required`)
//! because the server canonicalises every declared contract on the way in
//! (`WorkflowNodeBase._canonicalize_contract`), so the effective comparison
//! there is against an explicit boolean.

use crate::error::Problem;
use crate::model::{Edge, FieldSpec, Node, WorkflowFile, FIELD_TYPES};
use std::collections::{BTreeMap, BTreeSet, HashMap, VecDeque};
use uuid::Uuid;

/// Everything wrong with the file, in the order a reviewer wants to read it:
/// structure, then per-edge type faults, then per-node coverage, then the
/// publish boundary when asked for.
pub fn validate(workflow: &WorkflowFile, for_publish: bool) -> Vec<Problem> {
    let mut problems = Vec::new();

    // Contracts are validated first: a malformed spec cannot be reasoned about.
    for node in &workflow.nodes {
        problems.extend(spec_problems(node));
    }

    match structure_problems(&workflow.nodes, &workflow.edges) {
        Ok(()) => {
            problems.extend(edge_problems(&workflow.nodes, &workflow.edges));
            problems.extend(coverage_problems(&workflow.nodes, &workflow.edges));
        }
        // Unknown endpoints make every later check meaningless, exactly as
        // `validate_and_order` raising means `check_graph` never runs.
        Err(mut structural) => {
            problems.append(&mut structural);
            return problems;
        }
    }

    if for_publish {
        problems.extend(publish_problems(&workflow.nodes, &workflow.edges));
    }
    problems
}

// ------------------------------------------------------------ field specs

fn allowed_types_repr() -> String {
    let quoted = FIELD_TYPES
        .iter()
        .map(|name| format!("'{name}'"))
        .collect::<Vec<_>>()
        .join(", ");
    format!("[{quoted}]")
}

/// Mirror of `WorkflowFieldSpec`'s validators (`app/models.py:314`, `:327`).
pub fn validate_spec(spec: &FieldSpec) -> Option<String> {
    if !FIELD_TYPES.contains(&spec.field_type.as_str()) {
        return Some(format!(
            "unknown field type '{}'; allowed: {}",
            spec.field_type,
            allowed_types_repr()
        ));
    }
    if let Some(items) = &spec.items {
        if !FIELD_TYPES.contains(&items.as_str()) {
            return Some(format!(
                "unknown field type '{items}'; allowed: {}",
                allowed_types_repr()
            ));
        }
    }
    if spec.required == Some(true) && !spec.default.is_null() {
        return Some(format!(
            "field of type '{}' has a default and cannot be required",
            spec.field_type
        ));
    }
    None
}

fn spec_problems(node: &Node) -> Vec<Problem> {
    let mut problems = Vec::new();
    for (side, contract) in [("input", &node.input), ("output", &node.output)] {
        for (field, spec) in contract {
            if let Some(reason) = validate_spec(spec) {
                problems.push(Problem::new(
                    "node",
                    node_display_id(node),
                    format!("{side} field '{field}': {reason}"),
                ));
            }
        }
    }
    problems
}

// ------------------------------------------------------------- structure

fn node_display_id(node: &Node) -> String {
    let id = node.id_string();
    if id.is_empty() {
        node.key.clone()
    } else {
        id
    }
}

fn key_of(nodes: &[Node], id: Uuid) -> Option<&str> {
    nodes
        .iter()
        .find(|node| node.id == Some(id))
        .map(|node| node.key.as_str())
}

/// Mirror of `validate_and_order`: duplicate ids, duplicate keys, edges to
/// unknown nodes, self-connections and cycles, with the server's messages.
pub fn structure_problems(nodes: &[Node], edges: &[Edge]) -> Result<(), Vec<Problem>> {
    let mut seen_ids: BTreeSet<Uuid> = BTreeSet::new();
    let mut key_owner: HashMap<&str, Uuid> = HashMap::new();
    let mut synthetic = 0usize;
    let mut ids: Vec<Uuid> = Vec::with_capacity(nodes.len());

    for node in nodes {
        let id = node.id.unwrap_or_else(|| {
            synthetic += 1;
            // A node without an id is legal on its own (the server fills one in),
            // so it is never a fault here.
            Uuid::from_u128(synthetic as u128)
        });
        if !seen_ids.insert(id) {
            return Err(vec![Problem::new(
                "graph",
                id.to_string(),
                "duplicate node id",
            )]);
        }
        if let Some(existing) = key_owner.get(node.key.as_str()) {
            return Err(vec![Problem::with_ids(
                "graph",
                vec![existing.to_string(), id.to_string()],
                format!("duplicate node key '{}'", node.key),
            )]);
        }
        key_owner.insert(node.key.as_str(), id);
        ids.push(id);
    }

    for edge in edges {
        let known = |id: Uuid| ids.contains(&id);
        if !known(edge.source_node_id) || !known(edge.target_node_id) {
            return Err(vec![Problem::new(
                "graph",
                edge.id_string(),
                "edge references a node that is not part of the graph",
            )]);
        }
        if edge.source_node_id == edge.target_node_id {
            return Err(vec![Problem::with_ids(
                "graph",
                vec![edge.source_node_id.to_string(), edge.id_string()],
                "a node cannot be connected to itself",
            )]);
        }
    }

    if let Err(cycle) = order(nodes, edges) {
        return Err(vec![Problem::with_ids(
            "graph",
            cycle.iter().map(Uuid::to_string).collect(),
            "the graph contains a cycle",
        )]);
    }
    Ok(())
}

/// Mirror of `_topological_order`: Kahn, seeded in node order, neighbours
/// visited in edge order — so the CLI and the engine agree on execution order.
pub fn order(nodes: &[Node], edges: &[Edge]) -> Result<Vec<Uuid>, Vec<Uuid>> {
    let mut ids: Vec<Uuid> = Vec::with_capacity(nodes.len());
    let mut synthetic = 0usize;
    for node in nodes {
        ids.push(node.id.unwrap_or_else(|| {
            synthetic += 1;
            Uuid::from_u128(synthetic as u128)
        }));
    }

    let mut indegree: BTreeMap<Uuid, usize> = ids.iter().map(|id| (*id, 0)).collect();
    let mut adjacency: BTreeMap<Uuid, Vec<Uuid>> = ids.iter().map(|id| (*id, Vec::new())).collect();
    for edge in edges {
        if !indegree.contains_key(&edge.source_node_id)
            || !indegree.contains_key(&edge.target_node_id)
        {
            continue;
        }
        adjacency
            .entry(edge.source_node_id)
            .or_default()
            .push(edge.target_node_id);
        *indegree.entry(edge.target_node_id).or_insert(0) += 1;
    }

    let mut ready: VecDeque<Uuid> = ids.iter().copied().filter(|id| indegree[id] == 0).collect();
    let mut ordered = Vec::with_capacity(ids.len());
    while let Some(id) = ready.pop_front() {
        ordered.push(id);
        for neighbour in adjacency.get(&id).cloned().unwrap_or_default() {
            let remaining = indegree.get_mut(&neighbour).expect("known node");
            *remaining -= 1;
            if *remaining == 0 {
                ready.push_back(neighbour);
            }
        }
    }

    if ordered.len() != ids.len() {
        let placed: BTreeSet<Uuid> = ordered.iter().copied().collect();
        return Err(ids.into_iter().filter(|id| !placed.contains(id)).collect());
    }
    Ok(ordered)
}

// -------------------------------------------------------- type checking

/// Mirror of `_field_problems` (`app/services/workflow/types.py:146`).
pub fn field_problems(field: &str, source: &FieldSpec, target: &FieldSpec) -> Vec<String> {
    let mut problems = Vec::new();
    let source_type = source.field_type.as_str();
    let target_type = target.field_type.as_str();

    if target_type != "Any" {
        if source_type == "Any" {
            problems.push(format!(
                "field '{field}': source type is 'Any' (undeclared) and cannot be proven to \
                 satisfy '{target_type}'"
            ));
            return problems;
        }
        if source_type != target_type && !(source_type == "int" && target_type == "float") {
            problems.push(format!(
                "field '{field}': source declares '{source_type}', target expects '{target_type}'"
            ));
            return problems;
        }
    }

    if target_type == "list" {
        let source_items = source.items.clone();
        let target_items = target.items.clone();
        if let Some(target_items) = target_items {
            if source_items.as_deref() != Some(target_items.as_str()) {
                problems.push(format!(
                    "field '{field}': source list items are {} but target expects \
                     '{target_items}'",
                    source_items.unwrap_or_else(|| "unset".to_string())
                ));
            }
        }
    }

    if target.is_required() && !source.is_required() {
        problems.push(format!(
            "field '{field}' is required by the target but optional in the source"
        ));
    }
    problems
}

/// Mirror of `check_edge`: only the pairs the mapping names are judged.
pub fn edge_mapping_problems(
    source: &Node,
    target: &Node,
    mapping: &BTreeMap<String, String>,
) -> Vec<String> {
    let mut problems = Vec::new();
    for (target_field, source_field) in mapping {
        let Some(target_spec) = target.input.get(target_field) else {
            problems.push(format!(
                "mapping names input field '{target_field}', which the target does not declare"
            ));
            continue;
        };
        let Some(source_spec) = source.output.get(source_field) else {
            problems.push(format!(
                "maps input '{target_field}' from '{source_field}', which the source does not \
                 declare"
            ));
            continue;
        };
        problems.extend(field_problems(target_field, source_spec, target_spec));
    }
    problems
}

fn edge_problems(nodes: &[Node], edges: &[Edge]) -> Vec<Problem> {
    let by_id: HashMap<Uuid, &Node> = nodes
        .iter()
        .filter_map(|node| node.id.map(|id| (id, node)))
        .collect();
    let mut problems = Vec::new();
    for edge in edges {
        let (Some(source), Some(target)) = (
            by_id.get(&edge.source_node_id),
            by_id.get(&edge.target_node_id),
        ) else {
            // structure_problems already reported unknown endpoints.
            continue;
        };
        if target.skips_contract_checks() {
            continue;
        }
        let reasons = edge_mapping_problems(source, target, &edge.mapping);
        if !reasons.is_empty() {
            problems.push(Problem::new("edge", edge.id_string(), reasons.join("; ")));
        }
    }
    problems
}

/// Mirror of `_coverage_problems`: a field two edges provide, or a required
/// field no inbound edge provides.
fn coverage_problems(nodes: &[Node], edges: &[Edge]) -> Vec<Problem> {
    let by_id: HashMap<Uuid, &Node> = nodes
        .iter()
        .filter_map(|node| node.id.map(|id| (id, node)))
        .collect();

    let mut inbound: Vec<Uuid> = Vec::new();
    let mut grouped: HashMap<Uuid, Vec<&Edge>> = HashMap::new();
    for edge in edges {
        if !grouped.contains_key(&edge.target_node_id) {
            inbound.push(edge.target_node_id);
        }
        grouped.entry(edge.target_node_id).or_default().push(edge);
    }

    let mut problems = Vec::new();
    for target_id in inbound {
        let Some(target) = by_id.get(&target_id) else {
            continue;
        };
        if target.skips_contract_checks() || target.input.is_empty() {
            continue;
        }

        let mut providers: BTreeMap<String, Vec<String>> = BTreeMap::new();
        for edge in grouped.get(&target_id).cloned().unwrap_or_default() {
            let Some(source) = by_id.get(&edge.source_node_id) else {
                continue;
            };
            for (target_field, source_field) in &edge.mapping {
                if target.input.contains_key(target_field)
                    && source.output.contains_key(source_field)
                {
                    providers
                        .entry(target_field.clone())
                        .or_default()
                        .push(edge.id_string());
                }
            }
        }

        // Field order follows the contract map (sorted), matching the canonical
        // server-side spec order.
        for (field, spec) in &target.input {
            let owners = providers.get(field).cloned().unwrap_or_default();
            if owners.len() > 1 {
                problems.push(Problem::new(
                    "node",
                    target_id.to_string(),
                    format!("input field '{field}' is provided by more than one incoming edge"),
                ));
            } else if owners.is_empty() && spec.is_required() {
                problems.push(Problem::new(
                    "node",
                    target_id.to_string(),
                    format!("required input field '{field}' is not mapped from any upstream node"),
                ));
            }
        }
    }
    problems
}

// ---------------------------------------------------------------- publish

/// Mirror of `publish_shape` (`app/services/workflow/publish.py:55`).
pub fn publish_problems(nodes: &[Node], edges: &[Edge]) -> Vec<Problem> {
    if nodes.is_empty() {
        return vec![Problem::new(
            "publish",
            "",
            "a workflow needs at least one node before it can be published",
        )];
    }
    let ids: Vec<Uuid> = nodes.iter().filter_map(|node| node.id).collect();
    let entries: Vec<Uuid> = ids
        .iter()
        .copied()
        .filter(|id| !edges.iter().any(|edge| edge.target_node_id == *id))
        .collect();
    let exits: Vec<Uuid> = ids
        .iter()
        .copied()
        .filter(|id| !edges.iter().any(|edge| edge.source_node_id == *id))
        .collect();

    let mut problems = Vec::new();
    if entries.len() != 1 {
        problems.push(Problem::with_ids(
            "publish",
            entries.iter().map(Uuid::to_string).collect(),
            format!(
                "a workflow must have exactly one entry node (nothing flows into it), found {}",
                entries.len()
            ),
        ));
    }
    if exits.len() != 1 {
        problems.push(Problem::with_ids(
            "publish",
            exits.iter().map(Uuid::to_string).collect(),
            format!(
                "a workflow must have exactly one exit node (nothing flows out of it), found {}",
                exits.len()
            ),
        ));
    }
    problems
}

/// Human hint for a problem id: the node key when the id is a node, else the id.
pub fn describe_id(workflow: &WorkflowFile, id: &str) -> String {
    if let Ok(uuid) = Uuid::parse_str(id) {
        if let Some(node) = workflow.node_by_id(uuid) {
            return format!("{} ({})", node.key, node.name);
        }
        if let Some(edge) = workflow.edges.iter().find(|edge| edge.id == Some(uuid)) {
            let from = key_of(&workflow.nodes, edge.source_node_id).unwrap_or("?");
            let to = key_of(&workflow.nodes, edge.target_node_id).unwrap_or("?");
            return format!("{from} → {to}");
        }
    }
    if id.is_empty() {
        "workflow".to_string()
    } else {
        id.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{FieldSpec, Parameters};
    use serde_json::json;

    fn node(key: &str, input: &[(&str, &str)], output: &[(&str, &str)]) -> Node {
        let mut node = Node::new(key, key, (0.0, 0.0));
        for (name, field_type) in input {
            node.input
                .insert((*name).to_string(), FieldSpec::typed(*field_type));
        }
        for (name, field_type) in output {
            node.output
                .insert((*name).to_string(), FieldSpec::typed(*field_type));
        }
        node
    }

    fn edge(source: &Node, target: &Node, mapping: &[(&str, &str)]) -> Edge {
        let mut edge = Edge::new(source.id.unwrap(), target.id.unwrap());
        for (target_field, source_field) in mapping {
            edge.mapping
                .insert((*target_field).to_string(), (*source_field).to_string());
        }
        edge
    }

    #[test]
    fn a_clean_graph_has_no_problems() {
        let source = node("code_1", &[], &[("rows", "int")]);
        let mut target = node("code_2", &[("rows", "int")], &[]);
        target.input.get_mut("rows").unwrap().required = Some(true);
        let mut workflow = WorkflowFile::blank("Demo");
        workflow
            .edges
            .push(edge(&source, &target, &[("rows", "rows")]));
        workflow.nodes.push(source);
        workflow.nodes.push(target);
        assert!(validate(&workflow, true).is_empty());
    }

    #[test]
    fn an_undeclared_source_type_is_reported_against_the_edge() {
        let source = node("code_1", &[], &[("rows", "Any")]);
        let mut target = node("code_2", &[("rows", "int")], &[]);
        target.input.get_mut("rows").unwrap().required = Some(true);
        let mut workflow = WorkflowFile::blank("Demo");
        let edge = edge(&source, &target, &[("rows", "rows")]);
        let edge_id = edge.id_string();
        workflow.edges.push(edge);
        workflow.nodes.push(source);
        workflow.nodes.push(target);

        let problems = validate(&workflow, false);
        assert_eq!(problems.len(), 1);
        assert_eq!(problems[0].scope, "edge");
        assert_eq!(problems[0].id, edge_id);
        assert!(problems[0]
            .reason
            .contains("cannot be proven to satisfy 'int'"));
    }

    #[test]
    fn int_to_float_is_the_one_allowed_widening() {
        let source = node("code_1", &[], &[("n", "int")]);
        let target = node("code_2", &[("n", "float")], &[]);
        let mut workflow = WorkflowFile::blank("Demo");
        workflow.edges.push(edge(&source, &target, &[("n", "n")]));
        workflow.nodes.push(source);
        workflow.nodes.push(target);
        assert!(validate(&workflow, false).is_empty());
    }

    #[test]
    fn a_required_input_with_no_edge_is_a_coverage_problem() {
        let source = node("code_1", &[], &[("rows", "int")]);
        let mut target = node("code_2", &[("rows", "int")], &[]);
        target.input.get_mut("rows").unwrap().required = Some(true);
        let mut workflow = WorkflowFile::blank("Demo");
        workflow.edges.push(edge(&source, &target, &[]));
        workflow.nodes.push(source);
        workflow.nodes.push(target);

        let problems = validate(&workflow, false);
        assert_eq!(problems.len(), 1);
        assert_eq!(problems[0].scope, "node");
        assert_eq!(
            problems[0].reason,
            "required input field 'rows' is not mapped from any upstream node"
        );
    }

    #[test]
    fn a_cycle_is_reported_as_a_graph_problem() {
        let a = node("code_1", &[], &[("x", "int")]);
        let b = node("code_2", &[("x", "int")], &[("x", "int")]);
        let mut workflow = WorkflowFile::blank("Demo");
        workflow.edges.push(edge(&a, &b, &[("x", "x")]));
        workflow.edges.push(edge(&b, &a, &[("x", "x")]));
        workflow.nodes.push(a);
        workflow.nodes.push(b);
        let problems = validate(&workflow, false);
        // The cycle subsumes the coverage fault, as on the server: structure
        // fails first, so exactly one problem comes back.
        assert_eq!(problems.len(), 1);
        assert_eq!(problems[0].reason, "the graph contains a cycle");
        assert_eq!(problems[0].ids.len(), 2);
    }

    #[test]
    fn duplicate_keys_are_reported_with_both_ids() {
        let mut workflow = WorkflowFile::blank("Demo");
        workflow.nodes.push(Node::new("code_1", "A", (0.0, 0.0)));
        workflow.nodes.push(Node::new("code_1", "B", (0.0, 0.0)));
        let problems = validate(&workflow, false);
        assert_eq!(problems[0].reason, "duplicate node key 'code_1'");
        assert_eq!(problems[0].ids.len(), 2);
    }

    #[test]
    fn a_self_connection_is_rejected() {
        let a = node("code_1", &[("x", "int")], &[("x", "int")]);
        let mut workflow = WorkflowFile::blank("Demo");
        workflow.edges.push(Edge::new(a.id.unwrap(), a.id.unwrap()));
        workflow.nodes.push(a);
        let problems = validate(&workflow, false);
        assert_eq!(problems[0].reason, "a node cannot be connected to itself");
    }

    #[test]
    fn a_disabled_or_opted_out_target_skips_type_checks() {
        let source = node("code_1", &[], &[("rows", "Any")]);
        let mut target = node("code_2", &[("rows", "int")], &[]);
        target.type_enforcement = "off".to_string();
        let mut workflow = WorkflowFile::blank("Demo");
        workflow
            .edges
            .push(edge(&source, &target, &[("rows", "rows")]));
        workflow.nodes.push(source);
        workflow.nodes.push(target);
        assert!(validate(&workflow, false).is_empty());

        workflow.nodes[1].type_enforcement = "strict".to_string();
        workflow.nodes[1].disabled = true;
        assert!(validate(&workflow, false).is_empty());
    }

    #[test]
    fn publish_needs_exactly_one_entry_and_one_exit() {
        let a = node("code_1", &[], &[]);
        let b = node("code_2", &[], &[]);
        let mut workflow = WorkflowFile::blank("Demo");
        workflow.nodes.push(a);
        workflow.nodes.push(b);
        let problems = validate(&workflow, true);
        let publish: Vec<&Problem> = problems
            .iter()
            .filter(|problem| problem.scope == "publish")
            .collect();
        // `publish_shape` raises on the first fault, so the server answers with
        // one message; the mirror reports every boundary fault, because an
        // author fixing two entry nodes wants to see both before the next push.
        // The verdict is identical, which is what the parity suite pins.
        assert_eq!(publish.len(), 2);
        assert!(publish[0].reason.contains("exactly one entry node"));
        assert!(publish[1].reason.contains("exactly one exit node"));
    }

    #[test]
    fn an_empty_workflow_cannot_be_published() {
        let workflow = WorkflowFile::blank("Demo");
        let problems = validate(&workflow, true);
        assert_eq!(
            problems[0].reason,
            "a workflow needs at least one node before it can be published"
        );
    }

    #[test]
    fn a_one_node_graph_is_a_legal_component() {
        let mut workflow = WorkflowFile::blank("Demo");
        workflow.nodes.push(node("code_1", &[], &[]));
        assert!(validate(&workflow, true).is_empty());
    }

    #[test]
    fn a_bad_field_type_is_caught_before_anything_else() {
        let mut node = node("code_1", &[("q", "string")], &[]);
        node.parameters = Parameters::default();
        let mut workflow = WorkflowFile::blank("Demo");
        workflow.nodes.push(node);
        let problems = validate(&workflow, false);
        assert!(problems[0].reason.contains("unknown field type 'string'"));
        assert!(problems[0].reason.contains("input field 'q'"));
    }

    #[test]
    fn a_default_together_with_required_is_contradictory() {
        let mut spec = FieldSpec::typed("int");
        spec.required = Some(true);
        spec.default = json!(3);
        let problem = validate_spec(&spec).unwrap();
        assert_eq!(
            problem,
            "field of type 'int' has a default and cannot be required"
        );
    }

    #[test]
    fn execution_order_matches_kahn_seeded_by_node_order() {
        // Node order is b, c, a; the only edge is a -> b. Kahn seeds its queue
        // from the node list, so c and a are ready first and b follows.
        let a = node("code_1", &[], &[("x", "int")]);
        let b = node("code_2", &[("x", "int")], &[]);
        let c = node("code_3", &[], &[]);
        let workflow_nodes = vec![b.clone(), c.clone(), a.clone()];
        let edges = vec![edge(&a, &b, &[("x", "x")])];
        let ordered = order(&workflow_nodes, &edges).unwrap();
        assert_eq!(
            ordered,
            vec![c.id.unwrap(), a.id.unwrap(), b.id.unwrap()],
            "the order must match app/services/workflow/graph.py:_topological_order"
        );
    }
}
