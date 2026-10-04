//! Local graph mutations: the canvas actions, minus the canvas.
//!
//! Every function here edits the in-memory `WorkflowFile` only. `push` is the
//! sole writer to the server, so a mutation cannot half-apply remotely
//! (`docs/cli-plan.md` §4, principle 1). The derived helpers the editor applies
//! client-side — auto-mapping on connect, following a contract rename through
//! edge mappings — are mirrored here and pinned by tests.

use crate::error::{CliError, Result};
use crate::model::{
    Contract, Edge, FieldSpec, Node, WorkflowFile, DEFAULT_CODE, ENFORCEMENT_MODES, FIELD_TYPES,
    NODE_MODES, ON_ERROR,
};
use serde_json::Value;
use std::collections::BTreeMap;
use uuid::Uuid;

// ------------------------------------------------------------------ lookups

pub fn find_node<'a>(workflow: &'a WorkflowFile, key: &str) -> Result<&'a Node> {
    workflow.node_by_key(key).ok_or_else(|| {
        CliError::usage(format!(
            "no node with key '{key}'; known keys: {}",
            known_keys(workflow)
        ))
    })
}

pub fn find_node_mut<'a>(workflow: &'a mut WorkflowFile, key: &str) -> Result<&'a mut Node> {
    if !workflow.nodes.iter().any(|node| node.key == key) {
        return Err(CliError::usage(format!(
            "no node with key '{key}'; known keys: {}",
            known_keys(workflow)
        )));
    }
    Ok(workflow
        .nodes
        .iter_mut()
        .find(|node| node.key == key)
        .expect("checked above"))
}

pub fn known_keys(workflow: &WorkflowFile) -> String {
    if workflow.nodes.is_empty() {
        return "(none)".to_string();
    }
    workflow
        .nodes
        .iter()
        .map(|node| node.key.clone())
        .collect::<Vec<_>>()
        .join(", ")
}

/// The editor's `nextNodeKey`: the highest `code_N` plus one.
pub fn next_node_key(workflow: &WorkflowFile) -> String {
    let highest = workflow
        .nodes
        .iter()
        .filter_map(|node| {
            node.key
                .strip_prefix("code_")
                .and_then(|suffix| suffix.parse::<u32>().ok())
        })
        .max()
        .unwrap_or(0);
    format!("code_{}", highest + 1)
}

/// The editor's default placement: a 4-wide grid.
pub fn next_position(workflow: &WorkflowFile) -> (f64, f64) {
    let index = workflow.nodes.len() as f64;
    (
        80.0 + (index % 4.0) * 340.0,
        80.0 + (index / 4.0).floor() * 240.0,
    )
}

// -------------------------------------------------------------------- nodes

pub struct NewNode {
    pub key: Option<String>,
    pub name: String,
    pub code: Option<String>,
    pub mode: Option<String>,
    pub timeout: Option<f64>,
    pub on_error: Option<String>,
    pub enforcement: Option<String>,
    pub input: Option<Contract>,
    pub output: Option<Contract>,
    pub position: Option<(f64, f64)>,
    pub notes: Option<String>,
    pub disabled: bool,
}

impl NewNode {
    /// Convenience for tests and future callers; the command layer builds the
    /// struct explicitly so every field is a visible decision.
    #[cfg(test)]
    pub fn named(name: impl Into<String>) -> Self {
        Self {
            key: None,
            name: name.into(),
            code: None,
            mode: None,
            timeout: None,
            on_error: None,
            enforcement: None,
            input: None,
            output: None,
            position: None,
            notes: None,
            disabled: false,
        }
    }
}

pub fn add_node(workflow: &mut WorkflowFile, options: NewNode) -> Result<String> {
    let key = options.key.unwrap_or_else(|| next_node_key(workflow));
    if workflow.nodes.iter().any(|node| node.key == key) {
        return Err(CliError::usage(format!("node key '{key}' already exists")));
    }
    let position = options.position.unwrap_or_else(|| next_position(workflow));
    let mut node = Node::new(key.clone(), options.name, position);
    node.code = options.code.unwrap_or_else(|| DEFAULT_CODE.to_string());
    node.disabled = options.disabled;
    if let Some(mode) = options.mode {
        check_member("--mode", &mode, &NODE_MODES)?;
        node.parameters.mode = mode;
    }
    if let Some(on_error) = options.on_error {
        check_member("--on-error", &on_error, &ON_ERROR)?;
        node.parameters.on_error = on_error;
    }
    if let Some(enforcement) = options.enforcement {
        check_member("--enforcement", &enforcement, &ENFORCEMENT_MODES)?;
        node.type_enforcement = enforcement;
    }
    if let Some(timeout) = options.timeout {
        node.parameters.timeout = timeout_number(timeout)?;
    }
    node.input = options.input.unwrap_or_default();
    node.output = options.output.unwrap_or_default();
    node.notes = options.notes;
    workflow.nodes.push(node);
    Ok(key)
}

pub struct SetNode {
    pub name: Option<String>,
    pub code: Option<String>,
    pub mode: Option<String>,
    pub timeout: Option<f64>,
    pub on_error: Option<String>,
    pub enforcement: Option<String>,
    pub notes: Option<String>,
    pub disabled: Option<bool>,
    pub position: Option<(f64, f64)>,
    pub new_key: Option<String>,
}

pub fn set_node(workflow: &mut WorkflowFile, key: &str, options: SetNode) -> Result<()> {
    if let Some(new_key) = &options.new_key {
        if new_key != key && workflow.nodes.iter().any(|node| node.key == *new_key) {
            return Err(CliError::usage(format!(
                "node key '{new_key}' already exists"
            )));
        }
    }
    let node = find_node_mut(workflow, key)?;
    if let Some(name) = options.name {
        node.name = name;
    }
    if let Some(new_key) = options.new_key {
        node.key = new_key;
    }
    if let Some(code) = options.code {
        node.code = code;
    }
    if let Some(mode) = options.mode {
        check_member("--mode", &mode, &NODE_MODES)?;
        node.parameters.mode = mode;
    }
    if let Some(on_error) = options.on_error {
        check_member("--on-error", &on_error, &ON_ERROR)?;
        node.parameters.on_error = on_error;
    }
    if let Some(enforcement) = options.enforcement {
        check_member("--enforcement", &enforcement, &ENFORCEMENT_MODES)?;
        node.type_enforcement = enforcement;
    }
    if let Some(timeout) = options.timeout {
        node.parameters.timeout = timeout_number(timeout)?;
    }
    if let Some(notes) = options.notes {
        node.notes = Some(notes);
    }
    if let Some(disabled) = options.disabled {
        node.disabled = disabled;
    }
    if let Some((x, y)) = options.position {
        node.position_x = x;
        node.position_y = y;
    }
    Ok(())
}

pub fn remove_node(workflow: &mut WorkflowFile, key: &str) -> Result<usize> {
    let node = find_node(workflow, key)?;
    let id = node.id;
    workflow.nodes.retain(|node| node.key != key);
    let before = workflow.edges.len();
    workflow
        .edges
        .retain(|edge| Some(edge.source_node_id) != id && Some(edge.target_node_id) != id);
    Ok(before - workflow.edges.len())
}

fn timeout_number(seconds: f64) -> Result<serde_json::Number> {
    if seconds < 1.0 {
        return Err(CliError::usage(
            "--timeout must be at least 1 second (the editor clamps to 30; the CLI is stricter)",
        ));
    }
    serde_json::Number::from_f64(seconds)
        .ok_or_else(|| CliError::usage("--timeout must be a finite number"))
}

fn check_member(flag: &str, value: &str, allowed: &[&str]) -> Result<()> {
    if allowed.contains(&value) {
        return Ok(());
    }
    Err(CliError::usage(format!(
        "{flag} must be one of {} (got '{value}')",
        allowed.join(", ")
    )))
}

// -------------------------------------------------------------------- edges

/// The editor's `autoMapFields`: every target input whose name also exists in
/// the source output, mapped to itself.
pub fn auto_map(source: &Node, target: &Node) -> BTreeMap<String, String> {
    let mut mapping = BTreeMap::new();
    for field in target.input.keys() {
        if source.output.contains_key(field) {
            mapping.insert(field.clone(), field.clone());
        }
    }
    mapping
}

pub fn add_edge(
    workflow: &mut WorkflowFile,
    source_key: &str,
    target_key: &str,
    mapping: Option<BTreeMap<String, String>>,
    do_auto_map: bool,
) -> Result<()> {
    let source = find_node(workflow, source_key)?.clone();
    let target = find_node(workflow, target_key)?.clone();
    if source.id == target.id {
        return Err(CliError::usage("a node cannot be connected to itself"));
    }
    if workflow.edges.iter().any(|edge| {
        edge.source_node_id == source.id.unwrap_or_default()
            && edge.target_node_id == target.id.unwrap_or_default()
    }) {
        return Err(CliError::usage(format!(
            "an edge from '{source_key}' to '{target_key}' already exists"
        )));
    }
    let mapping = match mapping {
        Some(mapping) => mapping,
        None if do_auto_map => auto_map(&source, &target),
        None => BTreeMap::new(),
    };
    let mut edge = Edge::new(source.id.unwrap_or_default(), target.id.unwrap_or_default());
    edge.mapping = mapping;
    workflow.edges.push(edge);
    Ok(())
}

pub fn find_edge<'a>(
    workflow: &'a WorkflowFile,
    source_key: &str,
    target_key: &str,
) -> Result<&'a Edge> {
    let source = find_node(workflow, source_key)?;
    let target = find_node(workflow, target_key)?;
    workflow
        .edges
        .iter()
        .find(|edge| {
            edge.source_node_id == source.id.unwrap_or_default()
                && edge.target_node_id == target.id.unwrap_or_default()
        })
        .ok_or_else(|| CliError::usage(format!("no edge from '{source_key}' to '{target_key}'")))
}

pub fn remove_edge(workflow: &mut WorkflowFile, source_key: &str, target_key: &str) -> Result<()> {
    let edge_id = find_edge(workflow, source_key, target_key)?.id;
    workflow.edges.retain(|edge| edge.id != edge_id);
    Ok(())
}

pub fn map_edge(
    workflow: &mut WorkflowFile,
    source_key: &str,
    target_key: &str,
    set: &[(String, String)],
    clear: &[String],
    clear_all: bool,
    do_auto_map: bool,
) -> Result<()> {
    let source = find_node(workflow, source_key)?.clone();
    let target = find_node(workflow, target_key)?.clone();
    let edge_id = find_edge(workflow, source_key, target_key)?.id;
    if clear_all {
        for edge in workflow.edges.iter_mut().filter(|edge| edge.id == edge_id) {
            edge.mapping.clear();
        }
    }
    if do_auto_map {
        let mapping = auto_map(&source, &target);
        for edge in workflow.edges.iter_mut().filter(|edge| edge.id == edge_id) {
            for (target_field, source_field) in &mapping {
                edge.mapping
                    .insert(target_field.clone(), source_field.clone());
            }
        }
    }
    for (target_field, source_field) in set {
        for edge in workflow.edges.iter_mut().filter(|edge| edge.id == edge_id) {
            edge.mapping
                .insert(target_field.clone(), source_field.clone());
        }
    }
    for target_field in clear {
        for edge in workflow.edges.iter_mut().filter(|edge| edge.id == edge_id) {
            edge.mapping.remove(target_field);
        }
    }
    Ok(())
}

// ---------------------------------------------------------------- contracts

/// Mirror of `diffContract`: a rename shows up as one removal plus one addition.
pub struct ContractChange {
    pub renamed: BTreeMap<String, String>,
    pub removed: Vec<String>,
}

pub fn diff_contract(before: &Contract, after: &Contract) -> ContractChange {
    let removed: Vec<String> = before
        .keys()
        .filter(|key| !after.contains_key(*key))
        .cloned()
        .collect();
    let added: Vec<String> = after
        .keys()
        .filter(|key| !before.contains_key(*key))
        .cloned()
        .collect();
    let mut renamed = BTreeMap::new();
    if removed.len() == added.len() {
        for (from, to) in removed.iter().zip(added.iter()) {
            renamed.insert(from.clone(), to.clone());
        }
    }
    let removed_only: Vec<String> = removed
        .into_iter()
        .filter(|key| !renamed.contains_key(key))
        .collect();
    ContractChange {
        renamed,
        removed: removed_only,
    }
}

/// Mirror of `remapEdgeAfterContractChange`: follow a rename, drop a removal,
/// and treat an ambiguous change as removals only.
pub fn remap_edges(workflow: &mut WorkflowFile, node_id: Uuid, change: &ContractChange) -> usize {
    let mut touched = 0;
    for edge in workflow.edges.iter_mut() {
        let mut next: BTreeMap<String, String> = BTreeMap::new();
        let mut changed = false;
        for (target_field, source_field) in &edge.mapping {
            if edge.target_node_id == node_id {
                if let Some(renamed) = change.renamed.get(target_field) {
                    next.insert(renamed.clone(), source_field.clone());
                    changed = true;
                    continue;
                }
                if change.removed.contains(target_field) {
                    changed = true;
                    continue;
                }
            }
            if edge.source_node_id == node_id {
                if let Some(renamed) = change.renamed.get(source_field) {
                    next.insert(target_field.clone(), renamed.clone());
                    changed = true;
                    continue;
                }
                if change.removed.contains(source_field) {
                    changed = true;
                    continue;
                }
            }
            next.insert(target_field.clone(), source_field.clone());
        }
        if changed {
            edge.mapping = next;
            touched += 1;
        }
    }
    touched
}

fn after_contract_change(
    workflow: &mut WorkflowFile,
    key: &str,
    before: &Contract,
    after: &Contract,
) -> usize {
    let node_id = workflow
        .node_by_key(key)
        .and_then(|node| node.id)
        .unwrap_or_default();
    let change = diff_contract(before, after);
    remap_edges(workflow, node_id, &change)
}

pub fn set_contract(
    workflow: &mut WorkflowFile,
    key: &str,
    side: &str,
    contract: Contract,
) -> Result<usize> {
    let before = contract_of(find_node(workflow, key)?, side)?.clone();
    for (field, spec) in &contract {
        if let Some(reason) = crate::validate::validate_spec(spec) {
            return Err(CliError::invalid_local(
                format!("{side} field '{field}': {reason}"),
                vec![crate::error::Problem::new("node", key, reason)],
            ));
        }
    }
    let touched = after_contract_change(workflow, key, &before, &contract);
    *contract_of_mut(find_node_mut(workflow, key)?, side)? = contract;
    Ok(touched)
}

pub struct FieldChange {
    pub field: String,
    pub spec: Option<FieldSpec>,
    pub remove: bool,
}

pub fn change_field(
    workflow: &mut WorkflowFile,
    key: &str,
    side: &str,
    change: FieldChange,
) -> Result<usize> {
    let before = contract_of(find_node(workflow, key)?, side)?.clone();
    let mut after = before.clone();
    if change.remove {
        after.remove(&change.field);
    } else {
        let spec = change
            .spec
            .ok_or_else(|| CliError::internal("a field change needs a spec or --remove"))?;
        if let Some(reason) = crate::validate::validate_spec(&spec) {
            return Err(CliError::invalid_local(
                format!("{side} field '{}': {reason}", change.field),
                vec![crate::error::Problem::new("node", key, reason)],
            ));
        }
        after.insert(change.field.clone(), spec);
    }
    let touched = after_contract_change(workflow, key, &before, &after);
    *contract_of_mut(find_node_mut(workflow, key)?, side)? = after;
    Ok(touched)
}

pub fn rename_field(
    workflow: &mut WorkflowFile,
    key: &str,
    side: &str,
    from: &str,
    to: &str,
) -> Result<usize> {
    let before = contract_of(find_node(workflow, key)?, side)?.clone();
    if !before.contains_key(from) {
        return Err(CliError::usage(format!(
            "no {side} field '{from}' on node '{key}'"
        )));
    }
    if before.contains_key(to) {
        return Err(CliError::usage(format!(
            "{side} field '{to}' already exists on node '{key}'"
        )));
    }
    let mut after = Contract::new();
    for (name, spec) in &before {
        if name == from {
            after.insert(to.to_string(), spec.clone());
        } else {
            after.insert(name.clone(), spec.clone());
        }
    }
    let mut rename = ContractChange {
        renamed: BTreeMap::new(),
        removed: Vec::new(),
    };
    rename.renamed.insert(from.to_string(), to.to_string());
    let node_id = workflow
        .node_by_key(key)
        .and_then(|node| node.id)
        .unwrap_or_default();
    let touched = remap_edges(workflow, node_id, &rename);
    *contract_of_mut(find_node_mut(workflow, key)?, side)? = after;
    Ok(touched)
}

pub fn contract_of<'a>(node: &'a Node, side: &str) -> Result<&'a Contract> {
    match side {
        "input" => Ok(&node.input),
        "output" => Ok(&node.output),
        other => Err(CliError::usage(format!(
            "side must be 'input' or 'output' (got '{other}')"
        ))),
    }
}

fn contract_of_mut<'a>(node: &'a mut Node, side: &str) -> Result<&'a mut Contract> {
    match side {
        "input" => Ok(&mut node.input),
        "output" => Ok(&mut node.output),
        other => Err(CliError::usage(format!(
            "side must be 'input' or 'output' (got '{other}')"
        ))),
    }
}

// -------------------------------------------------------------- identifiers

/// Fresh uuids for every node and edge, with edges rewired through the old→new
/// map. The same transform `plan_snapshot` applies server-side, and the escape
/// hatch for the "node id belongs to another workflow" 400.
pub fn regenerate_ids(workflow: &mut WorkflowFile) -> (usize, usize) {
    let mut map: BTreeMap<Uuid, Uuid> = BTreeMap::new();
    for node in workflow.nodes.iter_mut() {
        let old = node.id.unwrap_or_else(Uuid::new_v4);
        let new = Uuid::new_v4();
        map.insert(old, new);
        node.id = Some(new);
    }
    for edge in workflow.edges.iter_mut() {
        edge.id = Some(Uuid::new_v4());
        if let Some(new) = map.get(&edge.source_node_id) {
            edge.source_node_id = *new;
        }
        if let Some(new) = map.get(&edge.target_node_id) {
            edge.target_node_id = *new;
        }
    }
    (workflow.nodes.len(), workflow.edges.len())
}

// ------------------------------------------------------------- spec syntax

/// Parse the server's contract shorthand: `q:str,n:int=3,tags:list[str]`, with
/// a trailing `?` marking a field optional.
pub fn parse_contract(text: &str) -> Result<Contract> {
    let mut contract = Contract::new();
    for entry in text
        .split(',')
        .map(str::trim)
        .filter(|part| !part.is_empty())
    {
        let (name, spec) = parse_spec(entry)?;
        contract.insert(name, spec);
    }
    Ok(contract)
}

pub fn parse_spec(entry: &str) -> Result<(String, FieldSpec)> {
    let Some((name, rest)) = entry.split_once(':') else {
        return Err(CliError::usage(format!(
            "field '{entry}' must look like name:type (e.g. q:str or tags:list[str])"
        )));
    };
    let name = name.trim();
    if name.is_empty() {
        return Err(CliError::usage("a field needs a name before ':'"));
    }
    let mut rest = rest.trim();
    let mut optional = false;
    if let Some(stripped) = rest.strip_suffix('?') {
        optional = true;
        rest = stripped.trim();
    }
    let (type_part, default_part) = match rest.split_once('=') {
        Some((left, right)) => (left.trim(), Some(right.trim())),
        None => (rest, None),
    };

    let mut spec = FieldSpec::typed("str");
    if let Some(inner) = type_part.strip_prefix("list[") {
        let items = inner
            .strip_suffix(']')
            .ok_or_else(|| CliError::usage(format!("unbalanced '[' in field '{entry}'")))?;
        check_type(items)?;
        spec.field_type = "list".to_string();
        spec.items = Some(items.to_string());
    } else {
        check_type(type_part)?;
        spec.field_type = type_part.to_string();
    }

    if let Some(default) = default_part {
        let value: Value =
            serde_json::from_str(default).unwrap_or_else(|_| Value::String(default.to_string()));
        spec.default = value;
        spec.required = Some(false);
    } else if optional {
        spec.required = Some(false);
    } else {
        spec.required = Some(true);
    }

    if let Some(reason) = crate::validate::validate_spec(&spec) {
        return Err(CliError::usage(format!("field '{name}': {reason}")));
    }
    Ok((name.to_string(), spec))
}

fn check_type(field_type: &str) -> Result<()> {
    if FIELD_TYPES.contains(&field_type) {
        return Ok(());
    }
    Err(CliError::usage(format!(
        "unknown field type '{field_type}'; allowed: {}",
        FIELD_TYPES.join(", ")
    )))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn workflow_with_pair() -> (WorkflowFile, String, String) {
        let mut workflow = WorkflowFile::blank("Demo");
        let mut source = Node::new("code_1", "Fetch", (0.0, 0.0));
        source.output.insert("rows".into(), FieldSpec::typed("int"));
        let mut target = Node::new("code_2", "Report", (0.0, 0.0));
        let mut spec = FieldSpec::typed("int");
        spec.required = Some(true);
        target.input.insert("rows".into(), spec);
        workflow.nodes.push(source);
        workflow.nodes.push(target);
        (workflow, "code_1".to_string(), "code_2".to_string())
    }

    #[test]
    fn keys_and_positions_follow_the_editor() {
        let mut workflow = WorkflowFile::blank("Demo");
        assert_eq!(next_node_key(&workflow), "code_1");
        assert_eq!(next_position(&workflow), (80.0, 80.0));
        add_node(&mut workflow, NewNode::named("One")).unwrap();
        assert_eq!(next_node_key(&workflow), "code_2");
        assert_eq!(next_position(&workflow), (420.0, 80.0));

        let mut workflow = WorkflowFile::blank("Demo");
        add_node(&mut workflow, NewNode::named("First")).unwrap();
        workflow.nodes[0].key = "code_7".to_string();
        assert_eq!(next_node_key(&workflow), "code_8");
    }

    #[test]
    fn connecting_auto_maps_same_named_fields() {
        let (mut workflow, source, target) = workflow_with_pair();
        add_edge(&mut workflow, &source, &target, None, true).unwrap();
        assert_eq!(workflow.edges[0].mapping["rows"], "rows");
    }

    #[test]
    fn connecting_without_auto_map_carries_nothing() {
        let (mut workflow, source, target) = workflow_with_pair();
        add_edge(&mut workflow, &source, &target, None, false).unwrap();
        assert!(workflow.edges[0].mapping.is_empty());
    }

    #[test]
    fn a_self_connection_is_refused_locally() {
        let (mut workflow, source, _) = workflow_with_pair();
        let error = add_edge(&mut workflow, &source, &source, None, true).unwrap_err();
        assert!(error.message().contains("itself"));
    }

    #[test]
    fn removing_a_node_removes_its_edges() {
        let (mut workflow, source, target) = workflow_with_pair();
        add_edge(&mut workflow, &source, &target, None, true).unwrap();
        let removed = remove_node(&mut workflow, &source).unwrap();
        assert_eq!(removed, 1);
        assert!(workflow.edges.is_empty());
    }

    #[test]
    fn a_contract_rename_follows_into_edge_mappings() {
        let (mut workflow, source, target) = workflow_with_pair();
        add_edge(&mut workflow, &source, &target, None, true).unwrap();
        let touched = rename_field(&mut workflow, &target, "input", "rows", "row_count").unwrap();
        assert_eq!(touched, 1);
        assert_eq!(workflow.edges[0].mapping["row_count"], "rows");
        assert!(!workflow.edges[0].mapping.contains_key("rows"));
    }

    #[test]
    fn a_removed_field_drops_its_mapping() {
        let (mut workflow, source, target) = workflow_with_pair();
        add_edge(&mut workflow, &source, &target, None, true).unwrap();
        change_field(
            &mut workflow,
            &target,
            "input",
            FieldChange {
                field: "rows".into(),
                spec: None,
                remove: true,
            },
        )
        .unwrap();
        assert!(workflow.edges[0].mapping.is_empty());
    }

    #[test]
    fn an_ambiguous_contract_change_drops_rather_than_rewires() {
        let mut before = Contract::new();
        before.insert("a".into(), FieldSpec::typed("str"));
        before.insert("b".into(), FieldSpec::typed("str"));
        let mut after = Contract::new();
        after.insert("c".into(), FieldSpec::typed("str"));
        let change = diff_contract(&before, &after);
        assert!(change.renamed.is_empty());
        assert_eq!(change.removed, vec!["a".to_string(), "b".to_string()]);
    }

    #[test]
    fn regenerating_ids_keeps_edges_wired() {
        let (mut workflow, source, target) = workflow_with_pair();
        add_edge(&mut workflow, &source, &target, None, true).unwrap();
        let before_source = workflow.nodes[0].id.unwrap();
        regenerate_ids(&mut workflow);
        assert_ne!(workflow.nodes[0].id.unwrap(), before_source);
        let source_id = workflow.node_by_key(&source).unwrap().id.unwrap();
        assert_eq!(workflow.edges[0].source_node_id, source_id);
    }

    #[test]
    fn shorthand_specs_cover_the_useful_cases() {
        let contract = parse_contract("q:str,n:int=3,tags:list[str]?,flag:bool").unwrap();
        assert_eq!(contract["q"].field_type, "str");
        assert!(contract["q"].is_required());
        assert_eq!(contract["n"].default, serde_json::json!(3));
        assert!(!contract["n"].is_required());
        assert_eq!(contract["tags"].items.as_deref(), Some("str"));
        assert!(!contract["tags"].is_required());
        assert_eq!(contract["flag"].field_type, "bool");
    }

    #[test]
    fn a_default_makes_a_field_optional() {
        let (_, spec) = parse_spec("n:int=3").unwrap();
        assert!(!spec.is_required());
        assert_eq!(spec.default, serde_json::json!(3));
    }

    #[test]
    fn required_together_with_a_default_is_contradictory() {
        let mut spec = FieldSpec::typed("int");
        spec.required = Some(true);
        spec.default = serde_json::json!(3);
        assert!(crate::validate::validate_spec(&spec).is_some());
    }

    #[test]
    fn an_unknown_type_is_refused_with_the_vocabulary() {
        let error = parse_spec("q:string").unwrap_err();
        assert!(error.message().contains("unknown field type 'string'"));
    }
}
