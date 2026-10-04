//! The HTTP layer: one request pipeline, then one wrapper per endpoint.
//!
//! Error mapping lives in [`crate::error::CliError::from_http`] so every command
//! gets the same exit code for the same server response. Retries are restricted
//! to idempotent GETs: a retried `POST /run` would execute the workflow twice.

use crate::error::{CliError, Result};
use crate::globals;
use serde_json::{json, Value};
use std::io::Read;
use std::time::Duration;

pub const API_PREFIX: &str = "/api/v1";

#[derive(Debug, Clone)]
enum Body {
    Json(Value),
    Form(Vec<(String, String)>),
}

#[derive(Debug, Clone)]
pub struct Client {
    base: String,
    token: Option<String>,
    timeout: u64,
}

impl Client {
    pub fn new(server: &str, token: Option<String>, timeout: u64) -> Self {
        Self {
            base: normalise_server(server),
            token,
            timeout,
        }
    }

    pub fn base(&self) -> &str {
        &self.base
    }

    pub fn with_timeout(&self, seconds: u64) -> Self {
        let mut client = self.clone();
        client.timeout = seconds;
        client
    }

    /// Commands that read or write user data require a token; say so clearly
    /// instead of sending a request that will 401. An expired token is caught
    /// here too, so the message names the real problem.
    pub fn require_token(&self) -> Result<()> {
        match &self.token {
            None => Err(CliError::unauthorized("not logged in").with_hint(format!(
                "run `genalima login --email you@example.com`, or set {}=<token>",
                crate::config::ENV_TOKEN
            ))),
            Some(token) => crate::auth::check_token_freshness(token),
        }
    }

    fn url(&self, path: &str) -> String {
        format!("{}{}{}", self.base, API_PREFIX, path)
    }

    fn agent(&self) -> ureq::Agent {
        let mut builder = ureq::AgentBuilder::new().timeout_connect(Duration::from_secs(10));
        if self.timeout > 0 {
            builder = builder
                .timeout_read(Duration::from_secs(self.timeout))
                .timeout_write(Duration::from_secs(self.timeout));
        }
        builder.build()
    }

    fn send(&self, method: &str, path: &str, body: Option<Body>, retry: bool) -> Result<Value> {
        let url = self.url(path);
        let attempts = if retry { 2 } else { 1 };
        for attempt in 1..=attempts {
            let agent = self.agent();
            let mut request = match method {
                "GET" => agent.get(&url),
                "POST" => agent.post(&url),
                "PUT" => agent.put(&url),
                "PATCH" => agent.patch(&url),
                "DELETE" => agent.delete(&url),
                other => {
                    return Err(CliError::internal(format!(
                        "unsupported HTTP method {other}"
                    )))
                }
            };
            request = request.set("Accept", "application/json");
            if let Some(token) = &self.token {
                // `-vv` shows that a token was sent without ever showing it.
                globals::trace(&format!(
                    "   Authorization: Bearer {}",
                    crate::auth::redact(token)
                ));
                request = request.set("Authorization", &format!("Bearer {token}"));
            }
            globals::debug(&format!("→ {method} {url}"));

            let outcome = match &body {
                Some(Body::Json(value)) => request.send_json(value.clone()),
                Some(Body::Form(fields)) => {
                    let pairs: Vec<(&str, &str)> = fields
                        .iter()
                        .map(|(key, value)| (key.as_str(), value.as_str()))
                        .collect();
                    request.send_form(&pairs)
                }
                None => request.call(),
            };

            match outcome {
                Ok(response) => {
                    globals::debug(&format!("← {} {method} {url}", response.status()));
                    return read_response(response);
                }
                Err(ureq::Error::Status(status, response)) => {
                    let text = read_body(response).unwrap_or_default();
                    globals::debug(&format!("← {status} {method} {url}"));
                    if retry && attempt < attempts && matches!(status, 502..=504) {
                        globals::debug("   retrying once after a transient server error");
                        std::thread::sleep(Duration::from_millis(250));
                        continue;
                    }
                    return Err(CliError::from_http(status, &text));
                }
                Err(ureq::Error::Transport(transport)) => {
                    if retry && attempt < attempts {
                        globals::debug(&format!("   transport error ({transport}); retrying once"));
                        std::thread::sleep(Duration::from_millis(250));
                        continue;
                    }
                    return Err(CliError::internal(format!(
                        "could not reach the server: {transport}"
                    ))
                    .with_hint(
                        "check --server / GENALIMA_SERVER_URL and that the API is running",
                    ));
                }
            }
        }
        Err(CliError::internal("request failed with no response"))
    }

    pub fn get(&self, path: &str) -> Result<Value> {
        self.send("GET", path, None, true)
    }

    pub fn post(&self, path: &str, body: Value) -> Result<Value> {
        self.send("POST", path, Some(Body::Json(body)), false)
    }

    pub fn put(&self, path: &str, body: Value) -> Result<Value> {
        self.send("PUT", path, Some(Body::Json(body)), false)
    }

    pub fn delete(&self, path: &str) -> Result<Value> {
        self.send("DELETE", path, None, false)
    }

    fn post_form(&self, path: &str, fields: Vec<(String, String)>) -> Result<Value> {
        self.send("POST", path, Some(Body::Form(fields)), false)
    }
}

fn normalise_server(server: &str) -> String {
    let trimmed = server.trim().trim_end_matches('/');
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        trimmed.to_string()
    } else {
        format!("http://{trimmed}")
    }
}

fn read_response(response: ureq::Response) -> Result<Value> {
    let text = read_body(response)?;
    if text.trim().is_empty() {
        return Ok(Value::Null);
    }
    Ok(serde_json::from_str(&text).unwrap_or(Value::String(text)))
}

fn read_body(response: ureq::Response) -> Result<String> {
    let mut text = String::new();
    response.into_reader().read_to_string(&mut text)?;
    Ok(text)
}

// ------------------------------------------------------------------- the API

#[derive(Debug, Clone)]
pub struct Api {
    pub client: Client,
}

impl Api {
    pub fn new(server: &str, token: Option<String>, timeout: u64) -> Self {
        Self {
            client: Client::new(server, token, timeout),
        }
    }

    /// Reads and metadata writes are quick; runs and publishes are not.
    pub fn slow(&self) -> Client {
        self.client.with_timeout(600)
    }

    pub fn require_token(&self) -> Result<()> {
        self.client.require_token()
    }

    // ------------------------------------------------------------- system

    pub fn health(&self) -> Result<Value> {
        self.client.get("/utils/health-check/")
    }

    pub fn openapi(&self) -> Result<Value> {
        self.client.get("/openapi.json")
    }

    /// Whether the live spec exposes a path fragment — the capability probe in
    /// `docs/cli-plan.md` §6.5.
    pub fn has_capability(&self, fragment: &str) -> Result<bool> {
        let spec = self.openapi()?;
        let found = spec
            .get("paths")
            .and_then(Value::as_object)
            .map(|paths| paths.keys().any(|path| path.contains(fragment)))
            .unwrap_or(false);
        Ok(found)
    }

    // --------------------------------------------------------------- auth

    pub fn login(&self, email: &str, password: &str) -> Result<Value> {
        self.client.post_form(
            "/login/access-token",
            vec![
                ("username".to_string(), email.to_string()),
                ("password".to_string(), password.to_string()),
            ],
        )
    }

    pub fn test_token(&self) -> Result<Value> {
        self.require_token()?;
        self.client.post("/login/test-token", json!({}))
    }

    // ---------------------------------------------------------- workflows

    pub fn list_workflows(&self, skip: i64, limit: i64) -> Result<Value> {
        self.require_token()?;
        self.client
            .get(&format!("/workflows/?skip={skip}&limit={limit}"))
    }

    pub fn create_workflow(&self, body: Value) -> Result<Value> {
        self.require_token()?;
        self.client.post("/workflows/", body)
    }

    pub fn get_workflow(&self, id: &str) -> Result<Value> {
        self.require_token()?;
        self.client.get(&format!("/workflows/{id}"))
    }

    pub fn update_workflow(&self, id: &str, body: Value) -> Result<Value> {
        self.require_token()?;
        self.client.put(&format!("/workflows/{id}"), body)
    }

    pub fn delete_workflow(&self, id: &str) -> Result<Value> {
        self.require_token()?;
        self.client.delete(&format!("/workflows/{id}"))
    }

    pub fn save_graph(&self, id: &str, graph: Value) -> Result<Value> {
        self.require_token()?;
        self.client.put(&format!("/workflows/{id}/graph"), graph)
    }

    pub fn run_workflow(&self, id: &str, items: Value) -> Result<Value> {
        self.require_token()?;
        self.slow()
            .post(&format!("/workflows/{id}/run"), json!({ "items": items }))
    }

    pub fn run_node(&self, id: &str, node_id: &str, items: Value) -> Result<Value> {
        self.require_token()?;
        self.slow().post(
            &format!("/workflows/{id}/nodes/{node_id}/run"),
            json!({ "items": items }),
        )
    }

    pub fn list_runs(&self, id: &str, skip: i64, limit: i64) -> Result<Value> {
        self.require_token()?;
        self.client
            .get(&format!("/workflows/{id}/runs?skip={skip}&limit={limit}"))
    }

    pub fn get_run(&self, id: &str, run_id: &str) -> Result<Value> {
        self.require_token()?;
        self.client.get(&format!("/workflows/{id}/runs/{run_id}"))
    }

    pub fn publish(&self, id: &str, body: Value) -> Result<Value> {
        self.require_token()?;
        self.slow().post(&format!("/workflows/{id}/publish"), body)
    }

    // --------------------------------------------------------- components

    pub fn list_components(&self, skip: i64, limit: i64) -> Result<Value> {
        self.require_token()?;
        self.client
            .get(&format!("/components/?skip={skip}&limit={limit}"))
    }

    pub fn get_component(&self, id: &str) -> Result<Value> {
        self.require_token()?;
        self.client.get(&format!("/components/{id}"))
    }

    pub fn delete_component(&self, id: &str) -> Result<Value> {
        self.require_token()?;
        self.client.delete(&format!("/components/{id}"))
    }

    // ---------------------------------------------------------- variables

    pub fn list_variables(&self, id: &str) -> Result<Value> {
        self.require_token()?;
        self.client.get(&format!("/workflows/{id}/variables"))
    }

    pub fn set_variable(&self, id: &str, key: &str, body: Value) -> Result<Value> {
        self.require_token()?;
        self.client
            .put(&format!("/workflows/{id}/variables/{key}"), body)
    }

    pub fn delete_variable(&self, id: &str, key: &str) -> Result<Value> {
        self.require_token()?;
        self.client
            .delete(&format!("/workflows/{id}/variables/{key}"))
    }

    /// The guarded path for the three planned variable routes.
    pub fn require_variables_capability(&self) -> Result<()> {
        match self.has_capability("/variables") {
            Ok(true) => Ok(()),
            Ok(false) => Err(CliError::unsupported(
                "variables are not available on this server yet",
            )
            .with_detail(json!({ "server": self.client.base() }))
            .with_hint(
                "see docs/workflow-environment-variables-plan.md §5 and §12 (phased rollout)",
            )),
            // A server old enough to lack the spec endpoint cannot be probed;
            // let the real request decide rather than blocking the user.
            Err(_) => Ok(()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn server_urls_are_normalised() {
        assert_eq!(normalise_server("localhost:8000"), "http://localhost:8000");
        assert_eq!(normalise_server("http://x/"), "http://x");
        assert_eq!(normalise_server(" https://x "), "https://x");
    }

    #[test]
    fn paths_are_prefixed_with_the_api_version() {
        let client = Client::new("http://localhost:8000", None, 30);
        assert_eq!(
            client.url("/workflows/"),
            "http://localhost:8000/api/v1/workflows/"
        );
    }

    #[test]
    fn a_missing_token_is_exit_four_before_any_request() {
        let api = Api::new("http://127.0.0.1:1", None, 5);
        let error = api.list_workflows(0, 1).unwrap_err();
        assert_eq!(error.exit_code(), crate::error::EXIT_UNAUTHORIZED);
    }
}
