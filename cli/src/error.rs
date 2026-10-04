//! Errors, their stable machine codes and their exit codes.
//!
//! The table in `docs/cli-plan.md` §7.2 is the specification: codes 3..=8 are
//! public API for agents, so a change here is a breaking change.

use serde_json::{json, Value};
use std::fmt;

pub const EXIT_OK: i32 = 0;
pub const EXIT_INTERNAL: i32 = 1;
pub const EXIT_USAGE: i32 = 2;
pub const EXIT_INVALID_LOCAL: i32 = 3;
pub const EXIT_UNAUTHORIZED: i32 = 4;
pub const EXIT_NOT_FOUND: i32 = 5;
pub const EXIT_CONFLICT: i32 = 6;
pub const EXIT_REMOTE_VALIDATION: i32 = 7;
pub const EXIT_RUN_FAILED: i32 = 8;

pub type Result<T> = std::result::Result<T, CliError>;

/// One fault in the local file, in the shape the server's 400 body uses.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Problem {
    /// `graph`, `edge`, `node` or `publish`.
    pub scope: String,
    /// The primary id for display: an edge id, node id or node key.
    pub id: String,
    /// Every id the fault covers. The server's `GraphError` carries lists
    /// (`node_ids`, `edge_ids`) because a cycle or a duplicate key implicates
    /// more than one node.
    pub ids: Vec<String>,
    pub reason: String,
}

impl Problem {
    pub fn new(scope: &str, id: impl Into<String>, reason: impl Into<String>) -> Self {
        let id = id.into();
        let ids = if id.is_empty() {
            Vec::new()
        } else {
            vec![id.clone()]
        };
        Self {
            scope: scope.to_string(),
            id,
            ids,
            reason: reason.into(),
        }
    }

    pub fn with_ids(scope: &str, ids: Vec<String>, reason: impl Into<String>) -> Self {
        Self {
            scope: scope.to_string(),
            id: ids.join(", "),
            ids,
            reason: reason.into(),
        }
    }

    pub fn as_json(&self) -> Value {
        json!({
            "scope": self.scope,
            "id": self.id,
            "ids": self.ids,
            "reason": self.reason,
        })
    }
}

impl fmt::Display for Problem {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        if self.id.is_empty() {
            write!(f, "{}", self.reason)
        } else {
            write!(f, "{}: {}", self.id, self.reason)
        }
    }
}

#[derive(Debug)]
pub struct CliError {
    code: &'static str,
    exit: i32,
    message: String,
    detail: Option<Value>,
    hint: Option<String>,
}

impl CliError {
    pub fn new(code: &'static str, exit: i32, message: impl Into<String>) -> Self {
        Self {
            code,
            exit,
            message: message.into(),
            detail: None,
            hint: None,
        }
    }

    pub fn usage(message: impl Into<String>) -> Self {
        Self::new("usage", EXIT_USAGE, message)
    }

    pub fn internal(message: impl Into<String>) -> Self {
        Self::new("internal", EXIT_INTERNAL, message)
    }

    pub fn unauthorized(message: impl Into<String>) -> Self {
        Self::new("unauthorized", EXIT_UNAUTHORIZED, message)
    }

    pub fn not_found(message: impl Into<String>) -> Self {
        Self::new("not_found", EXIT_NOT_FOUND, message)
    }

    pub fn unsupported(message: impl Into<String>) -> Self {
        Self::new("not_found", EXIT_NOT_FOUND, message)
    }

    pub fn remote_validation(message: impl Into<String>, detail: Option<Value>) -> Self {
        Self {
            code: "remote_validation",
            exit: EXIT_REMOTE_VALIDATION,
            message: message.into(),
            detail,
            hint: None,
        }
    }

    pub fn run_failed(message: impl Into<String>, detail: Option<Value>) -> Self {
        Self {
            code: "run_failed",
            exit: EXIT_RUN_FAILED,
            message: message.into(),
            detail,
            hint: None,
        }
    }

    /// The offline mirror (`validate`) and the pre-flight before a write.
    pub fn invalid_local(message: impl Into<String>, problems: Vec<Problem>) -> Self {
        let message = message.into();
        let detail = json!({
            "message": message,
            "problems": problems.iter().map(Problem::as_json).collect::<Vec<_>>(),
        });
        Self {
            code: "invalid_local",
            exit: EXIT_INVALID_LOCAL,
            message,
            detail: Some(detail),
            hint: None,
        }
    }

    pub fn with_detail(mut self, detail: Value) -> Self {
        self.detail = Some(detail);
        self
    }

    pub fn with_hint(mut self, hint: impl Into<String>) -> Self {
        self.hint = Some(hint.into());
        self
    }

    pub fn code(&self) -> &'static str {
        self.code
    }

    pub fn exit_code(&self) -> i32 {
        self.exit
    }

    pub fn message(&self) -> &str {
        &self.message
    }

    pub fn detail(&self) -> Option<&Value> {
        self.detail.as_ref()
    }

    pub fn hint(&self) -> Option<&str> {
        self.hint.as_deref()
    }

    /// The `error` object of the `--json` envelope.
    pub fn as_json(&self) -> Value {
        let mut object = serde_json::Map::new();
        object.insert("code".into(), json!(self.code));
        object.insert("message".into(), json!(self.message));
        if let Some(detail) = &self.detail {
            object.insert("detail".into(), detail.clone());
        }
        if let Some(hint) = &self.hint {
            object.insert("hint".into(), json!(hint));
        }
        Value::Object(object)
    }

    /// Translate an HTTP response into the documented exit code.
    ///
    /// The body shapes are the ones the routes actually produce: a bare string,
    /// a `GraphError` dict, the type checker's `{message, edges, nodes}` dict,
    /// and the publish 409 `{message, existing_versions, suggested_version}`.
    pub fn from_http(status: u16, body: &str) -> Self {
        let parsed: Option<Value> = serde_json::from_str(body).ok();
        let detail = parsed
            .as_ref()
            .and_then(|value| value.get("detail").cloned())
            .or_else(|| parsed.clone());

        match status {
            401 => Self::unauthorized("the server rejected the token")
                .with_hint("run `genalima login`, or set GENALIMA_TOKEN"),
            403 => {
                let message = detail
                    .as_ref()
                    .and_then(Value::as_str)
                    .unwrap_or("not enough permissions")
                    .to_string();
                let mut error = Self::unauthorized(message);
                if error.message.contains("read-only") {
                    error = error.with_hint(
                        "this is a published component snapshot; publish a new version from the \
                         source workflow instead",
                    );
                } else {
                    error = error.with_hint("the token's user may not read or write this entity");
                }
                error
            }
            404 => {
                let message = detail
                    .as_ref()
                    .and_then(Value::as_str)
                    .map(str::to_string)
                    .unwrap_or_else(|| format!("HTTP {status}"));
                Self::not_found(message)
            }
            409 => {
                let message = object_message(&detail).unwrap_or_else(|| "version conflict".into());
                let mut error = Self::new("conflict", EXIT_CONFLICT, message);
                if let Some(detail) = detail {
                    error = error.with_detail(detail);
                } else {
                    error = error.with_detail(json!({ "raw": body }));
                }
                error.with_hint("pass --version <n> to publish a different version")
            }
            422 => {
                // A rejected request body: a real authoring error, so it shares
                // the local-validation exit code rather than "usage".
                let messages = validation_messages(&detail);
                let message = if messages.is_empty() {
                    "the server rejected the request body".to_string()
                } else {
                    messages.join("; ")
                };
                let mut error = Self::new("invalid_local", EXIT_INVALID_LOCAL, message);
                error.detail = Some(detail.unwrap_or_else(|| json!(body)));
                error
            }
            400 => {
                let message = object_message(&detail)
                    .or_else(|| detail.as_ref().and_then(Value::as_str).map(str::to_string))
                    .unwrap_or_else(|| format!("the server rejected the request (HTTP {status})"));
                let mut error = Self::remote_validation(message, detail.clone());
                if error
                    .detail
                    .as_ref()
                    .map(|d| d.get("edges").is_some() || d.get("nodes").is_some())
                    .unwrap_or(false)
                {
                    error = error.with_hint("run `genalima workflow validate` to see every fault");
                }
                error
            }
            _ => {
                let excerpt = body.trim();
                let excerpt = if excerpt.len() > 400 {
                    format!("{}…", &excerpt[..400])
                } else {
                    excerpt.to_string()
                };
                let error = Self::internal(if excerpt.is_empty() {
                    format!("HTTP {status}")
                } else {
                    format!("HTTP {status}: {excerpt}")
                });
                if status >= 500 {
                    return error.with_hint(
                        "the server failed unexpectedly; check its logs, and apply pending \
                         migrations with `alembic upgrade head` if the schema is behind",
                    );
                }
                error
            }
        }
    }
}

fn object_message(detail: &Option<Value>) -> Option<String> {
    match detail {
        Some(Value::Object(map)) => map
            .get("message")
            .and_then(Value::as_str)
            .map(str::to_string)
            .or_else(|| Some("the server rejected the request".to_string())),
        Some(Value::String(text)) => Some(text.clone()),
        _ => None,
    }
}

/// FastAPI's 422 body is a list of `{loc, msg, type}`; render it as text.
fn validation_messages(detail: &Option<Value>) -> Vec<String> {
    let Some(Value::Array(items)) = detail else {
        return Vec::new();
    };
    items
        .iter()
        .map(|item| {
            let location = item
                .get("loc")
                .and_then(Value::as_array)
                .map(|parts| {
                    parts
                        .iter()
                        .map(|part| match part {
                            Value::String(text) => text.clone(),
                            other => other.to_string(),
                        })
                        .collect::<Vec<_>>()
                        .join(".")
                })
                .unwrap_or_default();
            let message = item
                .get("msg")
                .and_then(Value::as_str)
                .unwrap_or("invalid value");
            if location.is_empty() {
                message.to_string()
            } else {
                format!("{location}: {message}")
            }
        })
        .collect()
}

impl fmt::Display for CliError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl std::error::Error for CliError {}

impl From<ureq::Error> for CliError {
    fn from(error: ureq::Error) -> Self {
        match error {
            ureq::Error::Status(status, response) => {
                let body = response.into_string().unwrap_or_default();
                CliError::from_http(status, &body)
            }
            ureq::Error::Transport(transport) => {
                CliError::internal(format!("could not reach the server: {transport}"))
                    .with_hint("check --server / GENALIMA_SERVER_URL and that the API is running")
            }
        }
    }
}

impl From<std::io::Error> for CliError {
    fn from(error: std::io::Error) -> Self {
        CliError::internal(format!("io error: {error}"))
    }
}

impl From<serde_json::Error> for CliError {
    fn from(error: serde_json::Error) -> Self {
        CliError::internal(format!("malformed JSON: {error}"))
    }
}

impl From<uuid::Error> for CliError {
    fn from(error: uuid::Error) -> Self {
        CliError::usage(format!("not a valid uuid: {error}"))
    }
}

impl From<time::error::Parse> for CliError {
    fn from(error: time::error::Parse) -> Self {
        CliError::internal(format!("could not parse a timestamp: {error}"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exit_codes_are_the_documented_table() {
        assert_eq!(EXIT_OK, 0);
        assert_eq!(EXIT_INTERNAL, 1);
        assert_eq!(EXIT_USAGE, 2);
        assert_eq!(EXIT_INVALID_LOCAL, 3);
        assert_eq!(EXIT_UNAUTHORIZED, 4);
        assert_eq!(EXIT_NOT_FOUND, 5);
        assert_eq!(EXIT_CONFLICT, 6);
        assert_eq!(EXIT_REMOTE_VALIDATION, 7);
        assert_eq!(EXIT_RUN_FAILED, 8);

        // The machine tokens are public API too, so pin them.
        assert_eq!(CliError::usage("x").code(), "usage");
        assert_eq!(CliError::internal("x").code(), "internal");
        assert_eq!(CliError::not_found("x").code(), "not_found");
        assert_eq!(
            CliError::invalid_local("x", Vec::new()).exit_code(),
            EXIT_INVALID_LOCAL
        );
        assert_eq!(CliError::run_failed("x", None).exit_code(), EXIT_RUN_FAILED);
    }

    #[test]
    fn bare_string_400_is_remote_validation() {
        let error = CliError::from_http(400, r#"{"detail":"Add a node before running"}"#);
        assert_eq!(error.exit_code(), EXIT_REMOTE_VALIDATION);
        assert_eq!(error.message(), "Add a node before running");
    }

    #[test]
    fn type_checker_400_keeps_the_per_edge_detail() {
        let body = r#"{"detail":{"message":"incompatible connections","edges":[{"edge_id":"e1","reason":"boom"}],"nodes":[]}}"#;
        let error = CliError::from_http(400, body);
        assert_eq!(error.message(), "incompatible connections");
        assert!(error.hint().is_some());
        let detail = error.detail().unwrap();
        assert_eq!(detail["edges"][0]["edge_id"], "e1");
    }

    #[test]
    fn publish_conflict_is_exit_six() {
        let body = r#"{"detail":{"message":"version 1 of 'x' already exists","existing_versions":[1],"suggested_version":2}}"#;
        let error = CliError::from_http(409, body);
        assert_eq!(error.exit_code(), EXIT_CONFLICT);
        assert_eq!(error.code(), "conflict");
        assert_eq!(error.detail().unwrap()["suggested_version"], 2);
    }

    #[test]
    fn frozen_snapshot_403_explains_itself() {
        let error = CliError::from_http(403, r#"{"detail":"Published snapshots are read-only"}"#);
        assert_eq!(error.exit_code(), EXIT_UNAUTHORIZED);
        assert!(error.hint().unwrap().contains("snapshot"));
    }

    #[test]
    fn validation_array_becomes_a_single_message() {
        let body = r#"{"detail":[{"loc":["body","nodes",0,"key"],"msg":"field required","type":"missing"}]}"#;
        let error = CliError::from_http(422, body);
        assert_eq!(error.exit_code(), EXIT_INVALID_LOCAL);
        assert!(error.message().contains("body.nodes.0.key: field required"));
    }
}
