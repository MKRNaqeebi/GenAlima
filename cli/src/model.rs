//! Serde models for the API shapes the CLI reads, writes and renders.
//!
//! Two rules keep the file faithful to the server:
//!
//! * `#[serde(flatten)] extra` on every struct, so a field the server adds is
//!   round-tripped instead of silently dropped;
//! * `serde_json`'s default (sorted) object map, so key order is canonical
//!   without any explicit sorting pass (`docs/cli-plan.md` §5.2).
//!
//! `Number` is used for `timeout` because it lives inside the `parameters` JSON
//! blob and round-trips verbatim: an `f64` would turn the server's `30` into
//! `30.0` and dirty every diff.

use serde::{Deserialize, Serialize};
use serde_json::{Map, Number, Value};
use std::collections::BTreeMap;
use uuid::Uuid;

pub const FIELD_TYPES: [&str; 8] = [
    "str", "int", "float", "bool", "list", "dict", "datetime", "Any",
];
pub const ENFORCEMENT_MODES: [&str; 3] = ["strict", "warn", "off"];
pub const NODE_MODES: [&str; 2] = ["runOnceForAllItems", "runOnceForEachItem"];
pub const ON_ERROR: [&str; 3] = [
    "stopWorkflow",
    "continueRegularOutput",
    "continueErrorOutput",
];

/// The UI's default node body (`frontend/src/components/Workflows/types.ts`).
pub const DEFAULT_CODE: &str =
    "result = []\nfor item in items:\n    result.append({\"json\": {**item[\"json\"]}})\n";

// --------------------------------------------------------------- field specs

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct FieldSpec {
    #[serde(rename = "type", default = "default_field_type")]
    pub field_type: String,
    #[serde(default)]
    pub required: Option<bool>,
    #[serde(default)]
    pub default: Value,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(rename = "enum", default)]
    pub enum_values: Option<Vec<Value>>,
    #[serde(default)]
    pub items: Option<String>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

fn default_field_type() -> String {
    "str".to_string()
}

impl Default for FieldSpec {
    fn default() -> Self {
        Self {
            field_type: default_field_type(),
            required: None,
            default: Value::Null,
            description: None,
            enum_values: None,
            items: None,
            extra: Map::new(),
        }
    }
}

impl FieldSpec {
    pub fn typed(field_type: impl Into<String>) -> Self {
        Self {
            field_type: field_type.into(),
            ..Self::default()
        }
    }

    /// Pydantic semantics, mirrored from `WorkflowFieldSpec._resolve_required`:
    /// an unset `required` resolves against the default.
    pub fn is_required(&self) -> bool {
        match self.required {
            Some(value) => value,
            None => self.default.is_null(),
        }
    }

    /// The side of the contract shown in the UI: `name: type` or `name: list[x]`.
    pub fn describe(&self) -> String {
        if self.field_type == "list" {
            match &self.items {
                Some(items) => format!("list[{}]", items),
                None => "list".to_string(),
            }
        } else {
            self.field_type.clone()
        }
    }
}

pub type Contract = BTreeMap<String, FieldSpec>;

// -------------------------------------------------------------------- nodes

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Parameters {
    #[serde(default = "default_language")]
    pub language: String,
    #[serde(default = "default_mode")]
    pub mode: String,
    #[serde(default = "default_timeout")]
    pub timeout: Number,
    #[serde(rename = "onError", default = "default_on_error")]
    pub on_error: String,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

fn default_language() -> String {
    "python".to_string()
}
fn default_mode() -> String {
    "runOnceForAllItems".to_string()
}
fn default_timeout() -> Number {
    Number::from(30)
}
fn default_on_error() -> String {
    "stopWorkflow".to_string()
}

impl Default for Parameters {
    fn default() -> Self {
        Self {
            language: default_language(),
            mode: default_mode(),
            timeout: default_timeout(),
            on_error: default_on_error(),
            extra: Map::new(),
        }
    }
}

impl Parameters {
    pub fn timeout_seconds(&self) -> f64 {
        self.timeout.as_f64().unwrap_or(30.0)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Node {
    #[serde(default)]
    pub id: Option<Uuid>,
    #[serde(default)]
    pub workflow_id: Option<Uuid>,
    pub key: String,
    pub name: String,
    #[serde(rename = "type", default = "default_node_type")]
    pub node_type: String,
    #[serde(default = "default_type_version")]
    pub type_version: i64,
    #[serde(default)]
    pub position_x: f64,
    #[serde(default)]
    pub position_y: f64,
    #[serde(default)]
    pub disabled: bool,
    #[serde(default)]
    pub code: String,
    #[serde(default)]
    pub input: Contract,
    #[serde(default)]
    pub output: Contract,
    #[serde(default = "default_enforcement")]
    pub type_enforcement: String,
    #[serde(default)]
    pub parameters: Parameters,
    #[serde(default)]
    pub notes: Option<String>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

fn default_node_type() -> String {
    "code".to_string()
}
fn default_type_version() -> i64 {
    1
}
fn default_enforcement() -> String {
    "strict".to_string()
}

impl Node {
    /// A node with the same defaults the editor's `newCodeNode()` uses.
    pub fn new(key: impl Into<String>, name: impl Into<String>, position: (f64, f64)) -> Self {
        Self {
            id: Some(Uuid::new_v4()),
            workflow_id: None,
            key: key.into(),
            name: name.into(),
            node_type: default_node_type(),
            type_version: 1,
            position_x: position.0,
            position_y: position.1,
            disabled: false,
            code: DEFAULT_CODE.to_string(),
            input: Contract::new(),
            output: Contract::new(),
            type_enforcement: default_enforcement(),
            parameters: Parameters::default(),
            notes: None,
            extra: Map::new(),
        }
    }

    pub fn id_string(&self) -> String {
        self.id.map(|id| id.to_string()).unwrap_or_default()
    }

    /// Whether the server would skip contract checks for this node.
    pub fn skips_contract_checks(&self) -> bool {
        self.disabled || self.type_enforcement == "off"
    }

    /// The payload `PUT /{id}/graph` accepts: the API's create-shape, with the
    /// server-owned `workflow_id` stripped.
    pub fn payload(&self) -> Value {
        let mut value = serde_json::to_value(self).unwrap_or(Value::Null);
        if let Value::Object(map) = &mut value {
            map.remove("workflow_id");
        }
        value
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Edge {
    #[serde(default)]
    pub id: Option<Uuid>,
    #[serde(default)]
    pub workflow_id: Option<Uuid>,
    pub source_node_id: Uuid,
    pub target_node_id: Uuid,
    #[serde(default = "default_handle")]
    pub source_handle: String,
    #[serde(default = "default_handle")]
    pub target_handle: String,
    #[serde(default)]
    pub mapping: BTreeMap<String, String>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

fn default_handle() -> String {
    "main".to_string()
}

impl Edge {
    pub fn new(source_node_id: Uuid, target_node_id: Uuid) -> Self {
        Self {
            id: Some(Uuid::new_v4()),
            workflow_id: None,
            source_node_id,
            target_node_id,
            source_handle: default_handle(),
            target_handle: default_handle(),
            mapping: BTreeMap::new(),
            extra: Map::new(),
        }
    }

    pub fn id_string(&self) -> String {
        self.id.map(|id| id.to_string()).unwrap_or_default()
    }

    pub fn payload(&self) -> Value {
        let mut value = serde_json::to_value(self).unwrap_or(Value::Null);
        if let Value::Object(map) = &mut value {
            map.remove("workflow_id");
        }
        value
    }
}

// ---------------------------------------------------------------- workflow

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct WorkflowFile {
    #[serde(default)]
    pub id: Option<Uuid>,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default = "default_active")]
    pub active: bool,
    #[serde(default)]
    pub settings: Option<Value>,
    #[serde(default)]
    pub owner_id: Option<Uuid>,
    #[serde(default)]
    pub version: Option<i64>,
    #[serde(default)]
    pub is_frozen: bool,
    #[serde(default)]
    pub created_at: Option<String>,
    #[serde(default)]
    pub updated_at: Option<String>,
    #[serde(default)]
    pub nodes: Vec<Node>,
    #[serde(default)]
    pub edges: Vec<Edge>,
    #[serde(default)]
    pub variables: Vec<Value>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

fn default_active() -> bool {
    true
}

impl WorkflowFile {
    /// A blank, offline-scaffolded workflow with `id: null` (§6.2 `init`).
    pub fn blank(name: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            active: true,
            ..Self::default()
        }
    }

    pub fn from_value(value: Value) -> Result<Self, serde_json::Error> {
        serde_json::from_value(value)
    }

    pub fn graph_payload(&self) -> Value {
        serde_json::json!({
            "nodes": self.nodes.iter().map(Node::payload).collect::<Vec<_>>(),
            "edges": self.edges.iter().map(Edge::payload).collect::<Vec<_>>(),
        })
    }

    pub fn node_by_key(&self, key: &str) -> Option<&Node> {
        self.nodes.iter().find(|node| node.key == key)
    }

    pub fn node_by_id(&self, id: Uuid) -> Option<&Node> {
        self.nodes.iter().find(|node| node.id == Some(id))
    }

    /// The single node nothing flows into, as the publish rule defines it.
    pub fn entry_id(&self) -> Option<Uuid> {
        let entry = self
            .nodes
            .iter()
            .filter(|node| {
                !self
                    .edges
                    .iter()
                    .any(|edge| edge.target_node_id == node.id.unwrap_or_default())
            })
            .collect::<Vec<_>>();
        if entry.len() == 1 {
            entry[0].id
        } else {
            None
        }
    }

    /// The single node nothing flows out of.
    pub fn exit_id(&self) -> Option<Uuid> {
        let exit = self
            .nodes
            .iter()
            .filter(|node| {
                !self
                    .edges
                    .iter()
                    .any(|edge| edge.source_node_id == node.id.unwrap_or_default())
            })
            .collect::<Vec<_>>();
        if exit.len() == 1 {
            exit[0].id
        } else {
            None
        }
    }
}

// ------------------------------------------------------------------- runs

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct RunNode {
    #[serde(default)]
    pub id: Option<Uuid>,
    #[serde(default)]
    pub node_id: Option<Uuid>,
    #[serde(default)]
    pub status: String,
    #[serde(default)]
    pub input_items: Vec<Value>,
    #[serde(default)]
    pub output_items: Vec<Value>,
    #[serde(default)]
    pub logs: Option<String>,
    #[serde(default)]
    pub error: Option<String>,
    #[serde(default)]
    pub duration_ms: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Run {
    #[serde(default)]
    pub id: Option<Uuid>,
    #[serde(default)]
    pub workflow_id: Option<Uuid>,
    #[serde(default)]
    pub status: String,
    #[serde(default)]
    pub mode: String,
    #[serde(default)]
    pub trigger_items: Vec<Value>,
    #[serde(default)]
    pub error: Option<String>,
    #[serde(default)]
    pub started_at: Option<String>,
    #[serde(default)]
    pub finished_at: Option<String>,
    #[serde(default)]
    pub nodes: Vec<RunNode>,
}

impl Run {
    pub fn from_value(value: &Value) -> Result<Self, serde_json::Error> {
        serde_json::from_value(value.clone())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct RunList {
    #[serde(default)]
    pub data: Vec<Run>,
    #[serde(default)]
    pub count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct WorkflowSummary {
    #[serde(default)]
    pub id: Option<Uuid>,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub active: bool,
    #[serde(default)]
    pub version: Option<i64>,
    #[serde(default)]
    pub is_frozen: bool,
    #[serde(default)]
    pub last_run_status: Option<String>,
    #[serde(default)]
    pub last_run_at: Option<String>,
    #[serde(default)]
    pub published_version: Option<i64>,
    #[serde(default)]
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct WorkflowList {
    #[serde(default)]
    pub data: Vec<WorkflowSummary>,
    #[serde(default)]
    pub count: i64,
}

// ------------------------------------------------------------- components

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Component {
    #[serde(default)]
    pub id: Option<Uuid>,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub owner_id: Option<Uuid>,
    #[serde(default)]
    pub version: i64,
    #[serde(default)]
    pub snapshot_workflow_id: Option<Uuid>,
    #[serde(default)]
    pub source_workflow_id: Option<Uuid>,
    #[serde(default)]
    pub input: Contract,
    #[serde(default)]
    pub output: Contract,
    #[serde(default)]
    pub variables: Map<String, Value>,
    #[serde(default)]
    pub release_notes: Option<String>,
    #[serde(default)]
    pub created_at: Option<String>,
}

impl Component {
    pub fn from_value(value: &Value) -> Result<Self, serde_json::Error> {
        serde_json::from_value(value.clone())
    }

    pub fn label(&self) -> String {
        format!("{} v{}", self.name, self.version)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ComponentList {
    #[serde(default)]
    pub data: Vec<Component>,
    #[serde(default)]
    pub count: i64,
}

// ------------------------------------------------------------------ users

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct User {
    #[serde(default)]
    pub id: Option<Uuid>,
    #[serde(default)]
    pub email: String,
    #[serde(default)]
    pub full_name: Option<String>,
    #[serde(default)]
    pub is_active: bool,
    #[serde(default)]
    pub is_superuser: bool,
    #[serde(default)]
    pub organization_id: Option<Uuid>,
}

// ------------------------------------------------------------- variables

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Variable {
    #[serde(default)]
    pub key: String,
    #[serde(default)]
    pub is_secret: bool,
    #[serde(default)]
    pub required: bool,
    #[serde(default)]
    pub has_value: bool,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct VariableList {
    #[serde(default)]
    pub data: Vec<Variable>,
    #[serde(default)]
    pub count: i64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn field_spec_required_follows_the_default() {
        let plain = FieldSpec::typed("str");
        assert!(plain.is_required(), "no default means required");

        let mut with_default = FieldSpec::typed("int");
        with_default.default = serde_json::json!(3);
        assert!(!with_default.is_required());

        let mut explicit = FieldSpec::typed("int");
        explicit.required = Some(false);
        assert!(!explicit.is_required());
    }

    #[test]
    fn unknown_fields_survive_a_round_trip() {
        let raw = serde_json::json!({
            "key": "code_1",
            "name": "Fetch",
            "future_field": {"nested": true},
        });
        let node: Node = serde_json::from_value(raw).unwrap();
        let back = serde_json::to_value(&node).unwrap();
        assert_eq!(back["future_field"]["nested"], true);
        assert_eq!(back["parameters"]["onError"], "stopWorkflow");
    }

    #[test]
    fn payload_strips_the_server_owned_workflow_id() {
        let mut node = Node::new("code_1", "Fetch", (0.0, 0.0));
        node.workflow_id = Some(Uuid::new_v4());
        let payload = node.payload();
        assert!(payload.get("workflow_id").is_none());
        assert!(payload.get("id").is_some());
    }

    #[test]
    fn timeout_round_trips_as_an_integer() {
        let node: Node = serde_json::from_value(serde_json::json!({
            "key": "k", "name": "n", "parameters": {"timeout": 30}
        }))
        .unwrap();
        let back = serde_json::to_value(&node).unwrap();
        assert_eq!(back["parameters"]["timeout"], serde_json::json!(30));
        assert!(back["parameters"]["timeout"].is_i64());
    }
}
