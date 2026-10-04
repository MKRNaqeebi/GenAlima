//! Command-level tests: the real `genalima` binary against a hand-rolled mock
//! API, plus the offline commands against a temp directory.
//!
//! The mock records every request, so a test can assert what the CLI actually
//! sent (method, path, body) rather than only what it printed — which is what
//! matters for a client whose whole job is to speak the API correctly.

use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::process::{Command, Output};
use std::sync::{Arc, Mutex};

const WORKFLOW_ID: &str = "11111111-1111-4111-8111-111111111111";
const OWNER_ID: &str = "22222222-2222-4222-8222-222222222222";
const TOKEN: &str = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhYmMifQ.signature";

// ------------------------------------------------------------------ the mock

#[derive(Debug, Clone)]
struct Recorded {
    method: String,
    path: String,
    body: String,
}

type Handler = Arc<dyn Fn(&str, &str, &str) -> (u16, String) + Send + Sync>;

struct Mock {
    base: String,
    requests: Arc<Mutex<Vec<Recorded>>>,
}

impl Mock {
    fn start<F>(handler: F) -> Mock
    where
        F: Fn(&str, &str, &str) -> (u16, String) + Send + Sync + 'static,
    {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let requests = Arc::new(Mutex::new(Vec::new()));
        let log = requests.clone();
        let handler: Handler = Arc::new(handler);
        std::thread::spawn(move || {
            for stream in listener.incoming().flatten() {
                let handler = handler.clone();
                let log = log.clone();
                std::thread::spawn(move || {
                    let _ = serve(stream, handler.as_ref(), &log);
                });
            }
        });
        Mock { base, requests }
    }

    fn recorded(&self) -> Vec<Recorded> {
        self.requests.lock().unwrap().clone()
    }

    fn methods_and_paths(&self) -> Vec<String> {
        self.recorded()
            .into_iter()
            .map(|request| format!("{} {}", request.method, request.path))
            .collect()
    }
}

fn serve(
    mut stream: TcpStream,
    handler: &dyn Fn(&str, &str, &str) -> (u16, String),
    log: &Arc<Mutex<Vec<Recorded>>>,
) -> std::io::Result<()> {
    let mut reader = BufReader::new(stream.try_clone()?);
    let mut request_line = String::new();
    reader.read_line(&mut request_line)?;
    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or_default().to_string();
    let path = parts.next().unwrap_or_default().to_string();

    let mut content_length = 0usize;
    loop {
        let mut line = String::new();
        if reader.read_line(&mut line)? == 0 {
            break;
        }
        if line == "\r\n" || line == "\n" {
            break;
        }
        if let Some(value) = line.to_ascii_lowercase().strip_prefix("content-length:") {
            content_length = value.trim().parse().unwrap_or(0);
        }
    }
    let mut body = vec![0u8; content_length];
    if content_length > 0 {
        reader.read_exact(&mut body)?;
    }
    let body = String::from_utf8_lossy(&body).to_string();
    log.lock().unwrap().push(Recorded {
        method: method.clone(),
        path: path.clone(),
        body: body.clone(),
    });

    let (status, response) = handler(&method, &path, &body);
    let reason = match status {
        200 => "OK",
        201 => "Created",
        400 => "Bad Request",
        401 => "Unauthorized",
        403 => "Forbidden",
        404 => "Not Found",
        409 => "Conflict",
        422 => "Unprocessable Entity",
        _ => "Error",
    };
    let payload = format!(
        "HTTP/1.1 {status} {reason}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{response}",
        response.len()
    );
    stream.write_all(payload.as_bytes())?;
    stream.flush()
}

// --------------------------------------------------------------- test harness

struct Env {
    dir: tempfile::TempDir,
}

impl Env {
    fn new() -> Env {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join("home")).unwrap();
        Env { dir }
    }

    fn path(&self, name: &str) -> PathBuf {
        self.dir.path().join(name)
    }

    fn write_workflow(&self, value: &Value) {
        let text = serde_json::to_string_pretty(value).unwrap() + "\n";
        std::fs::write(self.path("workflow.json"), text).unwrap();
    }

    fn run(&self, args: &[&str]) -> Output {
        self.run_with(args, &[])
    }

    fn run_with(&self, args: &[&str], envs: &[(&str, String)]) -> Output {
        let mut command = Command::new(env!("CARGO_BIN_EXE_genalima"));
        command
            .args(args)
            .current_dir(self.dir.path())
            .env("GENALIMA_HOME", self.dir.path().join("home"))
            .env("NO_COLOR", "1")
            .env_remove("GENALIMA_SERVER_URL")
            .env_remove("GENALIMA_TOKEN")
            .env_remove("GENALIMA_PROFILE")
            .env_remove("GENALIMA_WORKFLOW_FILE");
        for (key, value) in envs {
            command.env(key, value);
        }
        command.output().unwrap()
    }
}

fn stdout(output: &Output) -> String {
    String::from_utf8_lossy(&output.stdout).to_string()
}

fn stderr(output: &Output) -> String {
    String::from_utf8_lossy(&output.stderr).to_string()
}

fn envelope(output: &Output) -> Value {
    let text = stdout(output);
    serde_json::from_str(text.trim()).unwrap_or_else(|error| {
        panic!(
            "stdout was not one JSON object ({error}): {text:?} stderr: {}",
            stderr(output)
        )
    })
}

fn code(output: &Output) -> Option<i32> {
    output.status.code()
}

fn authed(env: &Env, args: &[&str], mock: &Mock) -> Output {
    let mut all: Vec<&str> = args.to_vec();
    all.push("--json");
    env.run_with(
        &all,
        &[
            ("GENALIMA_SERVER_URL", mock.base.clone()),
            ("GENALIMA_TOKEN", TOKEN.to_string()),
        ],
    )
}

// ------------------------------------------------------------- offline tests

#[test]
fn init_writes_a_canonical_file_and_validate_passes_offline() {
    let env = Env::new();
    let output = env.run(&[
        "workflow",
        "init",
        "Daily report",
        "--template",
        "component",
    ]);
    assert_eq!(code(&output), Some(0), "stderr: {}", stderr(&output));

    let file = env.path("workflow.json");
    assert!(file.is_file());
    let text = std::fs::read_to_string(&file).unwrap();
    assert!(text.ends_with("}\n"), "canonical files end with a newline");
    assert!(
        text.contains("\"id\": null"),
        "an offline scaffold has no id"
    );

    let output = env.run(&["workflow", "validate", "--for-publish", "--order"]);
    assert_eq!(code(&output), Some(0), "stderr: {}", stderr(&output));
    assert!(stdout(&output).contains("ok"));

    let output = env.run(&["workflow", "validate", "--json"]);
    let payload = envelope(&output);
    assert_eq!(payload["ok"], true);
    assert_eq!(payload["command"], "workflow.validate");
    assert_eq!(payload["data"]["valid"], true);
}

#[test]
fn a_cycle_exits_three_with_a_machine_readable_problem() {
    let env = Env::new();
    let a = "33333333-3333-4333-8333-333333333333";
    let b = "44444444-4444-4444-8444-444444444444";
    let node = |id: &str, key: &str| {
        json!({
            "id": id, "key": key, "name": key, "type": "code",
            "input": {"x": {"type": "int", "required": true, "default": null}},
            "output": {"x": {"type": "int", "required": true, "default": null}},
            "parameters": {"language": "python", "mode": "runOnceForAllItems", "timeout": 30, "onError": "stopWorkflow"}
        })
    };
    env.write_workflow(&json!({
        "name": "Cyclic",
        "active": true,
        "is_frozen": false,
        "nodes": [node(a, "code_1"), node(b, "code_2")],
        "edges": [
            {"source_node_id": a, "target_node_id": b, "mapping": {"x": "x"}},
            {"source_node_id": b, "target_node_id": a, "mapping": {"x": "x"}},
        ],
    }));

    let output = env.run(&["workflow", "validate", "--json"]);
    assert_eq!(code(&output), Some(3), "a local failure is exit 3");
    let payload = envelope(&output);
    assert_eq!(payload["ok"], false);
    assert_eq!(payload["error"]["code"], "invalid_local");
    let problems = payload["error"]["detail"]["problems"].as_array().unwrap();
    assert_eq!(problems.len(), 1);
    assert_eq!(problems[0]["reason"], "the graph contains a cycle");
    assert_eq!(problems[0]["scope"], "graph");
    assert_eq!(problems[0]["ids"].as_array().unwrap().len(), 2);
}

#[test]
fn code_get_is_raw_and_code_set_round_trips() {
    let env = Env::new();
    env.run(&["workflow", "init", "Code test", "--template", "passthrough"]);

    let output = env.run(&["workflow", "code", "get", "code_1"]);
    assert_eq!(code(&output), Some(0));
    let raw = stdout(&output);
    assert!(raw.starts_with("result = []"), "raw: {raw:?}");
    assert!(
        !raw.contains("\"ok\""),
        "raw output must not be an envelope"
    );

    std::fs::write(
        env.path("node.py"),
        "result = [{\"json\": {\"ok\": True}}]\n",
    )
    .unwrap();
    let output = env.run(&[
        "workflow",
        "code",
        "set",
        "code_1",
        "--code-file",
        "node.py",
    ]);
    assert_eq!(code(&output), Some(0), "stderr: {}", stderr(&output));

    let output = env.run(&["workflow", "code", "get", "code_1"]);
    assert_eq!(stdout(&output), "result = [{\"json\": {\"ok\": True}}]\n");
}

#[test]
fn local_edits_never_contact_the_server() {
    let env = Env::new();
    env.run(&["workflow", "init", "Edits", "--template", "blank"]);
    env.run(&[
        "workflow", "node", "add", "--key", "code_1", "--name", "Fetch", "--output", "rows:int",
    ]);
    env.run(&[
        "workflow", "node", "add", "--key", "code_2", "--name", "Report", "--input", "rows:int",
    ]);
    let output = env.run(&[
        "workflow",
        "edge",
        "add",
        "--from",
        "code_1",
        "--to",
        "code_2",
        "--auto-map",
    ]);
    assert_eq!(code(&output), Some(0), "stderr: {}", stderr(&output));

    // A graph with a unmapped required input is a problem; auto-map fixed it.
    let output = env.run(&["workflow", "validate"]);
    assert_eq!(code(&output), Some(0), "stderr: {}", stderr(&output));

    // Renaming follows the mapping, so the graph stays valid.
    let output = env.run(&[
        "workflow",
        "contract",
        "rename",
        "code_2",
        "input",
        "rows",
        "row_count",
    ]);
    assert_eq!(code(&output), Some(0), "stderr: {}", stderr(&output));
    let output = env.run(&["workflow", "validate"]);
    assert_eq!(code(&output), Some(0), "stderr: {}", stderr(&output));

    let text = std::fs::read_to_string(env.path("workflow.json")).unwrap();
    assert!(text.contains("row_count"), "the rename is persisted");
}

#[test]
fn a_missing_token_is_exit_four_and_says_what_to_do() {
    let env = Env::new();
    let output = env.run(&["workflow", "list", "--json"]);
    assert_eq!(code(&output), Some(4));
    let payload = envelope(&output);
    assert_eq!(payload["error"]["code"], "unauthorized");
    assert!(payload["error"]["hint"].as_str().unwrap().contains("login"));
}

// -------------------------------------------------------------- mock-API tests

#[test]
fn login_stores_a_credential_and_whoami_uses_it() {
    let mock = Mock::start(|_method, path, _body| {
        match path {
        "/api/v1/login/access-token" => (
            200,
            json!({"access_token": TOKEN, "token_type": "bearer"}).to_string(),
        ),
        "/api/v1/login/test-token" => (
            200,
            json!({"id": OWNER_ID, "email": "dev@example.com", "is_active": true, "is_superuser": false})
                .to_string(),
        ),
        other => (404, json!({"detail": format!("unmocked {other}")}).to_string()),
    }
    });

    let env = Env::new();
    let output = env.run_with(
        &["login", "--email", "dev@example.com", "--password-stdin"],
        &[("GENALIMA_SERVER_URL", mock.base.clone())],
    );
    // `--password-stdin` with no stdin content fails cleanly rather than hanging.
    assert_eq!(code(&output), Some(2), "stderr: {}", stderr(&output));

    let output = {
        let mut command = Command::new(env!("CARGO_BIN_EXE_genalima"));
        command
            .args(["login", "--email", "dev@example.com", "--password-stdin"])
            .current_dir(env.dir.path())
            .env("GENALIMA_HOME", env.dir.path().join("home"))
            .env("NO_COLOR", "1")
            .env("GENALIMA_SERVER_URL", &mock.base)
            .env_remove("GENALIMA_TOKEN")
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped());
        let mut child = command.spawn().unwrap();
        child
            .stdin
            .as_mut()
            .unwrap()
            .write_all(b"hunter2\n")
            .unwrap();
        child.wait_with_output().unwrap()
    };
    assert_eq!(code(&output), Some(0), "stderr: {}", stderr(&output));

    let credentials = env.path("home/credentials.toml");
    assert!(credentials.is_file(), "the token must be persisted");
    let text = std::fs::read_to_string(&credentials).unwrap();
    assert!(text.contains(TOKEN));
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mode = std::fs::metadata(&credentials)
            .unwrap()
            .permissions()
            .mode()
            & 0o777;
        assert_eq!(mode, 0o600, "credentials must not be group/world readable");
    }

    // whoami reads the stored credential: no GENALIMA_TOKEN in the environment.
    let output = env.run_with(
        &["--json", "whoami"],
        &[("GENALIMA_SERVER_URL", mock.base.clone())],
    );
    assert_eq!(code(&output), Some(0), "stderr: {}", stderr(&output));
    let payload = envelope(&output);
    assert_eq!(payload["ok"], true);
    assert_eq!(payload["command"], "whoami");
    assert_eq!(payload["data"]["email"], "dev@example.com");
    assert_eq!(
        stdout(&output).trim().lines().count(),
        1,
        "one envelope, no chatter"
    );
}

/// A mock that behaves like the real `PUT /graph` + `GET /workflows/{id}` pair:
/// whatever graph was last saved is what a read returns.
fn sticky_workflow_mock() -> (Mock, Arc<Mutex<Option<Value>>>) {
    let stored: Arc<Mutex<Option<Value>>> = Arc::new(Mutex::new(None));
    let state = stored.clone();
    let mock = Mock::start(move |method, path, body| {
        let graph = || {
            state
                .lock()
                .unwrap()
                .clone()
                .unwrap_or_else(|| json!({"nodes": [], "edges": []}))
        };
        match (method, path) {
            ("POST", "/api/v1/workflows/") => (
                200,
                json!({
                    "id": WORKFLOW_ID,
                    "name": "Daily report",
                    "version": 1,
                    "owner_id": OWNER_ID,
                    "created_at": "2025-10-02T09:00:00",
                    "is_frozen": false,
                })
                .to_string(),
            ),
            ("PUT", p) if p.ends_with("/graph") => {
                let parsed: Value = serde_json::from_str(body).unwrap();
                *state.lock().unwrap() = Some(parsed);
                (200, json!({"id": WORKFLOW_ID, "version": 2}).to_string())
            }
            ("GET", p) if p.starts_with("/api/v1/workflows/") => {
                let graph = graph();
                (
                    200,
                    json!({
                        "id": WORKFLOW_ID,
                        "name": "Daily report",
                        "description": null,
                        "active": true,
                        "settings": null,
                        "owner_id": OWNER_ID,
                        "version": 2,
                        "is_frozen": false,
                        "created_at": "2025-10-02T09:00:00",
                        "updated_at": "2025-10-02T09:05:00",
                        "nodes": graph["nodes"],
                        "edges": graph["edges"],
                    })
                    .to_string(),
                )
            }
            ("PUT", p) if p.starts_with("/api/v1/workflows/") => (
                200,
                json!({"name": "Daily report", "version": 2, "updated_at": "2025-10-02T09:05:00"})
                    .to_string(),
            ),
            _ => (
                404,
                json!({"detail": format!("unmocked {method} {path}")}).to_string(),
            ),
        }
    });
    (mock, stored)
}

#[test]
fn push_creates_the_workflow_then_a_second_push_is_a_no_op() {
    let (mock, _stored) = sticky_workflow_mock();
    let env = Env::new();
    env.run(&[
        "workflow",
        "init",
        "Daily report",
        "--template",
        "component",
    ]);

    let output = authed(&env, &["workflow", "push"], &mock);
    assert_eq!(code(&output), Some(0), "stderr: {}", stderr(&output));
    let payload = envelope(&output);
    assert_eq!(payload["data"]["created"], true);
    assert_eq!(payload["data"]["id"], WORKFLOW_ID);

    let paths = mock.methods_and_paths();
    assert_eq!(
        paths,
        vec![
            "POST /api/v1/workflows/".to_string(),
            format!("PUT /api/v1/workflows/{WORKFLOW_ID}/graph"),
            format!("PUT /api/v1/workflows/{WORKFLOW_ID}"),
        ]
    );

    // The id was written back, so the file is bound to the server workflow.
    let text = std::fs::read_to_string(env.path("workflow.json")).unwrap();
    assert!(
        text.contains(WORKFLOW_ID),
        "the file must keep the server id"
    );

    // Second push: the server already matches, so nothing is sent.
    let before = mock.recorded().len();
    let output = authed(&env, &["workflow", "push"], &mock);
    assert_eq!(code(&output), Some(0), "stderr: {}", stderr(&output));
    let payload = envelope(&output);
    assert_eq!(payload["data"]["graph_saved"], false);
    assert_eq!(payload["data"]["metadata_saved"], false);

    let after = mock.recorded();
    assert_eq!(after.len(), before + 1, "only the comparison GET is sent");
    assert_eq!(after.last().unwrap().method, "GET");
}

#[test]
fn a_remote_type_error_is_exit_seven_and_keeps_the_details() {
    let mock = Mock::start(|method, path, _body| {
        match (method, path) {
        ("GET", p) if p.starts_with("/api/v1/workflows/") => (
            200,
            json!({
                "id": WORKFLOW_ID, "name": "Typed", "version": 1,
                "is_frozen": false, "nodes": [], "edges": [],
            })
            .to_string(),
        ),
        ("PUT", p) if p.ends_with("/graph") => (
            400,
            json!({
                "detail": {
                    "message": "incompatible connections",
                    "edges": [{"edge_id": "e1", "reason": "field 'rows': source type is 'Any' (undeclared) and cannot be proven to satisfy 'int'"}],
                    "nodes": []
                }
            })
            .to_string(),
        ),
        _ => (404, json!({"detail": "unmocked"}).to_string()),
    }
    });

    let env = Env::new();
    env.write_workflow(&json!({
        "id": WORKFLOW_ID,
        "name": "Typed",
        "active": true,
        "is_frozen": false,
        "nodes": [{
            "id": "55555555-5555-4555-8555-555555555555",
            "key": "code_1", "name": "Fetch", "type": "code",
            "output": {"rows": {"type": "Any", "required": false, "default": null}},
            "parameters": {"language": "python", "mode": "runOnceForAllItems", "timeout": 30, "onError": "stopWorkflow"}
        }],
        "edges": [],
    }));

    let output = authed(&env, &["workflow", "push"], &mock);
    assert_eq!(code(&output), Some(7), "stderr: {}", stderr(&output));
    let payload = envelope(&output);
    assert_eq!(payload["error"]["code"], "remote_validation");
    assert_eq!(payload["error"]["message"], "incompatible connections");
    assert_eq!(payload["error"]["detail"]["edges"][0]["edge_id"], "e1");
    assert!(payload["error"]["hint"]
        .as_str()
        .unwrap()
        .contains("validate"));
}

#[test]
fn a_publish_conflict_is_exit_six_with_the_suggested_version() {
    let workflow = json!({
        "id": WORKFLOW_ID,
        "name": "Report",
        "active": true,
        "is_frozen": false,
        "nodes": [{
            "id": "66666666-6666-4666-8666-666666666666",
            "key": "code_1", "name": "Only", "type": "code",
            "parameters": {"language": "python", "mode": "runOnceForAllItems", "timeout": 30, "onError": "stopWorkflow"}
        }],
        "edges": [],
    });
    let echo = workflow.to_string();
    let mock = Mock::start(move |method, path, _body| match (method, path) {
        ("GET", p) if p.starts_with("/api/v1/workflows/") => (200, echo.clone()),
        ("GET", p) if p.starts_with("/api/v1/components/") => {
            (200, json!({"data": [], "count": 0}).to_string())
        }
        ("POST", p) if p.ends_with("/publish") => (
            409,
            json!({
                "detail": {
                    "message": "version 1 of 'Report' already exists",
                    "existing_versions": [1],
                    "suggested_version": 2,
                }
            })
            .to_string(),
        ),
        _ => (404, json!({"detail": "unmocked"}).to_string()),
    });

    let env = Env::new();
    env.write_workflow(&workflow);

    let output = authed(&env, &["workflow", "publish"], &mock);
    assert_eq!(code(&output), Some(6), "stderr: {}", stderr(&output));
    let payload = envelope(&output);
    assert_eq!(payload["error"]["code"], "conflict");
    assert_eq!(payload["error"]["detail"]["suggested_version"], 2);

    // The version actually posted was the auto-computed one.
    let publish = mock
        .recorded()
        .into_iter()
        .find(|request| request.path.ends_with("/publish"))
        .unwrap();
    let body: Value = serde_json::from_str(&publish.body).unwrap();
    assert_eq!(body["name"], "Report");
    assert_eq!(body["version"], 1);
    assert!(
        body.get("graph").is_none(),
        "the graph is pushed, not re-sent"
    );
}

#[test]
fn a_failed_run_is_exit_eight_and_carries_the_run() {
    let workflow = json!({
        "id": WORKFLOW_ID,
        "name": "Runner",
        "active": true,
        "is_frozen": false,
        "nodes": [{
            "id": "77777777-7777-4777-8777-777777777777",
            "key": "code_1", "name": "Boom", "type": "code",
            "parameters": {"language": "python", "mode": "runOnceForAllItems", "timeout": 30, "onError": "stopWorkflow"}
        }],
        "edges": [],
    });
    let echo = workflow.to_string();
    let mock = Mock::start(move |method, path, _body| match (method, path) {
        ("GET", p) if p.starts_with("/api/v1/workflows/") => (200, echo.clone()),
        ("POST", p) if p.ends_with("/run") => (
            200,
            json!({
                "id": "88888888-8888-4888-8888-888888888888",
                "workflow_id": WORKFLOW_ID,
                "status": "error",
                "mode": "manual",
                "trigger_items": [{"json": {}}],
                "error": "KeyError: 'rows'",
                "started_at": "2025-10-02T09:10:00",
                "finished_at": "2025-10-02T09:10:01",
                "nodes": [{
                    "id": "99999999-9999-4999-8999-999999999999",
                    "run_id": "88888888-8888-4888-8888-888888888888",
                    "node_id": "77777777-7777-4777-8777-777777777777",
                    "status": "error",
                    "input_items": [], "output_items": [],
                    "logs": "hello\n", "error": "KeyError: 'rows'", "duration_ms": 12
                }]
            })
            .to_string(),
        ),
        _ => (404, json!({"detail": "unmocked"}).to_string()),
    });

    let env = Env::new();
    env.write_workflow(&workflow);

    let output = authed(&env, &["workflow", "run"], &mock);
    assert_eq!(code(&output), Some(8), "stderr: {}", stderr(&output));
    let payload = envelope(&output);
    assert_eq!(payload["error"]["code"], "run_failed");
    assert_eq!(payload["error"]["detail"]["status"], "error");

    // --allow-failure turns the same run into a success.
    let output = authed(&env, &["workflow", "run", "--allow-failure"], &mock);
    assert_eq!(code(&output), Some(0), "stderr: {}", stderr(&output));
    let payload = envelope(&output);
    assert_eq!(payload["data"]["status"], "error");
}

#[test]
fn the_variables_capability_gate_exits_five_with_a_pointer() {
    let mock = Mock::start(|_method, path, _body| match path {
        "/api/v1/openapi.json" => (
            200,
            json!({"info": {"title": "GenAlima", "version": "0.1.0"}, "paths": {
                "/api/v1/workflows/": {}, "/api/v1/workflows/{id}/graph": {},
                "/api/v1/workflows/{id}/run": {}, "/api/v1/workflows/{id}/publish": {},
                "/api/v1/components/": {}
            }})
            .to_string(),
        ),
        other => (
            404,
            json!({"detail": format!("unmocked {other}")}).to_string(),
        ),
    });

    let env = Env::new();
    let output = authed(&env, &["variable", "list", WORKFLOW_ID], &mock);
    assert_eq!(code(&output), Some(5), "stderr: {}", stderr(&output));
    let payload = envelope(&output);
    assert_eq!(payload["error"]["code"], "not_found");
    assert!(payload["error"]["message"]
        .as_str()
        .unwrap()
        .contains("variables are not available"));
    assert!(payload["error"]["hint"]
        .as_str()
        .unwrap()
        .contains("workflow-environment-variables-plan"));
}

#[test]
fn list_renders_a_table_in_human_mode() {
    let mock = Mock::start(|method, path, _body| match (method, path) {
        ("GET", "/api/v1/workflows/?skip=0&limit=25") => (
            200,
            json!({
                "data": [{
                    "id": WORKFLOW_ID, "name": "Daily report", "description": "does things",
                    "active": true, "version": 3, "last_run_status": "success",
                    "last_run_at": "2025-10-02T09:00:00", "published_version": 2,
                    "updated_at": "2025-10-02T09:30:00"
                }],
                "count": 1
            })
            .to_string(),
        ),
        _ => (404, json!({"detail": "unmocked"}).to_string()),
    });

    let env = Env::new();
    let output = env.run_with(
        &["workflow", "list"],
        &[
            ("GENALIMA_SERVER_URL", mock.base.clone()),
            ("GENALIMA_TOKEN", TOKEN.to_string()),
        ],
    );
    assert_eq!(code(&output), Some(0), "stderr: {}", stderr(&output));
    let text = stdout(&output);
    assert!(text.contains("Daily report"), "text: {text}");
    assert!(text.contains("passed"), "the last run status is shown");
    assert!(text.contains("v2"), "the published version is shown");
    assert!(
        text.contains("last run"),
        "the table has a header row: {text}"
    );
}

#[test]
fn doctor_reports_capabilities_without_a_token() {
    let mock = Mock::start(|method, path, _body| match (method, path) {
        ("GET", "/api/v1/utils/health-check/") => (200, "true".to_string()),
        ("GET", "/api/v1/openapi.json") => (
            200,
            json!({"info": {"title": "GenAlima", "version": "0.1.0"}, "paths": {
                "/api/v1/workflows/": {}, "/api/v1/workflows/{id}/graph": {},
                "/api/v1/workflows/{id}/run": {}, "/api/v1/workflows/{id}/runs": {},
                "/api/v1/workflows/{id}/publish": {}, "/api/v1/components/": {}
            }})
            .to_string(),
        ),
        _ => (404, json!({"detail": "unmocked"}).to_string()),
    });

    let env = Env::new();
    let output = env.run_with(
        &["doctor", "--json"],
        &[("GENALIMA_SERVER_URL", mock.base.clone())],
    );
    assert_eq!(code(&output), Some(0), "stderr: {}", stderr(&output));
    let payload = envelope(&output);
    assert_eq!(payload["data"]["reachable"], true);
    assert_eq!(payload["data"]["capabilities"]["variables"], false);
    assert_eq!(payload["data"]["capabilities"]["publish"], true);
    let warnings = payload["data"]["warnings"].as_array().unwrap();
    assert!(warnings
        .iter()
        .any(|warning| warning.as_str().unwrap().contains("no token")));
}

#[test]
fn schema_and_completions_are_self_describing() {
    let env = Env::new();
    let output = env.run(&["schema", "workflow"]);
    assert_eq!(code(&output), Some(0), "stderr: {}", stderr(&output));
    let schema: Value = serde_json::from_str(stdout(&output).trim()).unwrap();
    assert!(schema["properties"]["nodes"].is_object());
    assert!(schema["properties"]["edges"].is_object());
    assert_eq!(
        schema["properties"]["nodes"]["items"]["properties"]["type"]["const"],
        "code"
    );

    let output = env.run(&["completions", "bash"]);
    assert_eq!(code(&output), Some(0));
    assert!(stdout(&output).contains("genalima"));
}
