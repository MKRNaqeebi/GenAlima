//! Auth and self-description: `login`, `logout`, `whoami`, `doctor`, `schema`,
//! `completions`, `version`.
//!
//! `doctor` is the command an agent should run first: it reports what the server
//! actually implements, rather than trusting a spec file in the repository.

use crate::auth;
use crate::cli::{CompletionsArgs, LoginArgs, SchemaArgs, SchemaTarget};
use crate::commands::{Ctx, Out};
use crate::error::{CliError, Result};
use crate::globals;
use crate::render;
use serde_json::{json, Value};
use std::io::IsTerminal;

pub fn login(ctx: &Ctx, args: &LoginArgs) -> Result<Out> {
    let password = if args.password_stdin {
        let mut text = String::new();
        std::io::Read::read_to_string(&mut std::io::stdin(), &mut text)?;
        text.trim_end_matches(['\n', '\r']).to_string()
    } else if std::io::stdin().is_terminal() {
        rpassword::prompt_password(format!("Password for {}: ", args.email))
            .map_err(|error| CliError::internal(format!("could not read the password: {error}")))?
    } else {
        return Err(CliError::usage(
            "stdin is not a terminal; pass --password-stdin",
        ));
    };

    if password.is_empty() {
        return Err(CliError::usage("the password is empty"));
    }

    let token = auth::login(
        &ctx.config.server,
        &args.email,
        &password,
        ctx.config.timeout,
    )?;
    let path = ctx.config.store_token(&token)?;

    let state = match auth::token_state(&token) {
        auth::TokenState::Valid { expires } | auth::TokenState::Expiring { expires } => expires
            .format(&time::format_description::well_known::Rfc3339)
            .unwrap_or_else(|_| "unknown".to_string()),
        _ => "unknown".to_string(),
    };

    globals::note(&format!(
        "logged in as {} against {}",
        args.email, ctx.config.server
    ));
    globals::note(&format!("token stored in {}", path.display()));
    Ok(Out::new(
        json!({
            "email": args.email,
            "server": ctx.config.server,
            "profile": ctx.config.profile,
            "credentials": path,
            "token_expires": state,
        }),
        format!(
            "{} {}\n{} {}\n{} {}",
            render::bold("logged in as"),
            args.email,
            render::bold("server"),
            ctx.config.server,
            render::bold("token expires"),
            state
        ),
    ))
}

pub fn logout(ctx: &Ctx) -> Result<Out> {
    let removed = auth::logout(&ctx.config)?;
    let note = if removed {
        "removed the stored token"
    } else {
        "there was no stored token"
    };
    // The API has no revocation endpoint and the UI's logout is local-only too.
    globals::note(note);
    globals::note("note: the token stays valid on the server until it expires");
    Ok(Out::new(
        json!({ "removed": removed, "profile": ctx.config.profile }),
        format!("{note} (profile '{}')", ctx.config.profile),
    ))
}

pub fn whoami(ctx: &Ctx) -> Result<Out> {
    let user = ctx.api.test_token()?;
    let parsed: crate::model::User = serde_json::from_value(user.clone()).unwrap_or_default();
    let state = match &ctx.config.token {
        Some(token) => match auth::token_state(token) {
            auth::TokenState::Valid { expires } => format!("valid until {expires}"),
            auth::TokenState::Expiring { expires } => {
                format!("expires soon ({expires})")
            }
            auth::TokenState::Expired { expires } => format!("EXPIRED at {expires}"),
            auth::TokenState::Unknown => "expiry unknown".to_string(),
        },
        None => "no local token".to_string(),
    };

    let human = format!(
        "{} {}\n{} {}\n{} {}\n{} {}\n{} {}",
        render::bold("email"),
        parsed.email,
        render::bold("id"),
        parsed.id.map(|id| id.to_string()).unwrap_or_default(),
        render::bold("superuser"),
        parsed.is_superuser,
        render::bold("organization"),
        render::optional(parsed.organization_id.map(|id| id.to_string()).as_deref()),
        render::bold("token"),
        state
    );
    Ok(Out::new(user, human))
}

pub fn doctor(ctx: &Ctx) -> Result<Out> {
    let mut report = json!({
        "cli": env!("CARGO_PKG_VERSION"),
        "server": ctx.config.server,
        "server_source": ctx.config.server_source,
        "profile": ctx.config.profile,
        "token_source": ctx.config.token_source,
        "home": ctx.config.base_dir,
        "config_file": ctx.config.config_path,
        "credentials_file": ctx.config.credentials_path,
        "project_file": ctx.config.project_path,
    });

    let mut warnings: Vec<String> = Vec::new();

    // Token freshness, without contacting the server.
    let token_state = match &ctx.config.token {
        None => {
            warnings.push(format!(
                "no token: run `genalima login`, or set {}",
                crate::config::ENV_TOKEN
            ));
            json!({ "present": false })
        }
        Some(token) => match auth::token_state(token) {
            auth::TokenState::Valid { expires } => {
                json!({ "present": true, "state": "valid", "expires": expires.to_string() })
            }
            auth::TokenState::Expiring { expires } => {
                warnings.push(format!("the token expires at {expires}"));
                json!({ "present": true, "state": "expiring", "expires": expires.to_string() })
            }
            auth::TokenState::Expired { expires } => {
                warnings.push(format!("the token expired at {expires}"));
                json!({ "present": true, "state": "expired", "expires": expires.to_string() })
            }
            auth::TokenState::Unknown => {
                json!({ "present": true, "state": "unknown" })
            }
        },
    };
    report["token"] = token_state;

    // Reachability.
    let health = ctx.api.health();
    report["reachable"] = json!(health.is_ok());
    if let Err(error) = &health {
        warnings.push(format!("health check failed: {}", error.message()));
    }

    // Capabilities, from the live spec.
    let mut capabilities = json!({});
    match ctx.api.openapi() {
        Ok(spec) => {
            let paths = spec
                .get("paths")
                .and_then(Value::as_object)
                .cloned()
                .unwrap_or_default();
            let probes: [(&str, &str); 6] = [
                ("workflows", "/workflows/"),
                ("graph", "/graph"),
                ("run", "/run"),
                ("runs", "/runs"),
                ("publish", "/publish"),
                ("variables", "/variables"),
            ];
            let mut object = serde_json::Map::new();
            for (name, fragment) in probes {
                let present = paths.keys().any(|path| path.contains(fragment));
                object.insert(name.to_string(), json!(present));
                if name == "variables" && !present {
                    warnings.push(
                        "variables are not implemented on this server \
                         (docs/workflow-environment-variables-plan.md §5)"
                            .to_string(),
                    );
                }
            }
            object.insert(
                "components".into(),
                json!(paths.keys().any(|p| p.contains("/components"))),
            );
            capabilities = Value::Object(object);
        }
        Err(error) => {
            warnings.push(format!(
                "could not read the OpenAPI spec: {}",
                error.message()
            ));
        }
    }
    report["capabilities"] = capabilities.clone();
    report["warnings"] = json!(warnings);

    let mut human = String::new();
    human.push_str(&format!(
        "{} {}\n",
        render::bold("genalima"),
        env!("CARGO_PKG_VERSION")
    ));
    human.push_str(&format!(
        "{} {} (from {})\n",
        render::bold("server"),
        ctx.config.server,
        ctx.config.server_source
    ));
    human.push_str(&format!(
        "{} {} (token from {})\n",
        render::bold("profile"),
        ctx.config.profile,
        ctx.config.token_source
    ));
    human.push_str(&format!(
        "{} {}\n",
        render::bold("config"),
        ctx.config.config_path.display()
    ));
    human.push_str(&format!(
        "{} {}\n",
        render::bold("credentials"),
        ctx.config.credentials_path.display()
    ));
    if let Some(project) = &ctx.config.project_path {
        human.push_str(&format!(
            "{} {}\n",
            render::bold("project"),
            project.display()
        ));
    }
    human.push_str(&format!(
        "{} {}\n",
        render::bold("reachable"),
        match &health {
            Ok(_) => render::green("yes"),
            Err(_) => render::red("no"),
        }
    ));
    if let Some(map) = capabilities.as_object() {
        let rows: Vec<Vec<String>> = map
            .iter()
            .map(|(name, present)| {
                vec![
                    name.clone(),
                    if present.as_bool().unwrap_or(false) {
                        render::green("yes")
                    } else {
                        render::red("no")
                    },
                ]
            })
            .collect();
        human.push_str(&format!("\n{}\n", render::bold("capabilities")));
        human.push_str(&render::table(&["capability", "present"], &rows));
    }
    if !warnings.is_empty() {
        human.push_str(&format!("\n{}\n", render::bold("warnings")));
        for warning in &warnings {
            human.push_str(&format!("  ! {warning}\n"));
        }
    }

    Ok(Out::new(report, human.trim_end()))
}

pub fn schema(args: &SchemaArgs) -> Result<Out> {
    let document = match args.target {
        SchemaTarget::Workflow => workflow_schema(),
        SchemaTarget::Envelope => envelope_schema(),
        SchemaTarget::All => json!({
            "workflow": workflow_schema(),
            "envelope": envelope_schema(),
        }),
    };
    Ok(Out::value(document))
}

pub fn completions(args: &CompletionsArgs) -> Result<Out> {
    use clap::CommandFactory;
    let mut command = crate::cli::Cli::command();
    let name = command.get_name().to_string();
    let mut buffer: Vec<u8> = Vec::new();
    clap_complete::generate(args.shell, &mut command, name, &mut buffer);
    let text = String::from_utf8_lossy(&buffer).to_string();
    Ok(Out::raw(json!(text), text))
}

pub fn version(ctx: &Ctx) -> Result<Out> {
    let mut payload = json!({
        "cli": env!("CARGO_PKG_VERSION"),
        "target": format!("{}-{}", std::env::consts::ARCH, std::env::consts::OS),
    });
    let mut human = format!("genalima {}\n", env!("CARGO_PKG_VERSION"));
    match ctx.api.openapi() {
        Ok(spec) => {
            let server_version = spec
                .get("info")
                .and_then(|info| info.get("version"))
                .and_then(Value::as_str)
                .unwrap_or("unknown")
                .to_string();
            let title = spec
                .get("info")
                .and_then(|info| info.get("title"))
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            human.push_str(&format!(
                "server {server_version} ({title}) at {}\n",
                ctx.config.server
            ));
            payload["server"] = json!({ "version": server_version, "title": title });
        }
        Err(error) => {
            human.push_str(&format!(
                "server unreachable at {} ({})\n",
                ctx.config.server,
                error.message()
            ));
        }
    }
    Ok(Out::new(payload, human.trim_end()))
}

// ------------------------------------------------------------------- schema

fn spec_schema() -> Value {
    json!({
        "type": "object",
        "description": "One field of a node's input or output contract.",
        "properties": {
            "type": { "enum": crate::model::FIELD_TYPES },
            "required": { "type": ["boolean", "null"] },
            "default": {},
            "description": { "type": ["string", "null"], "maxLength": 255 },
            "enum": { "type": ["array", "null"] },
            "items": { "type": ["string", "null"], "enum": crate::model::FIELD_TYPES }
        },
        "additionalProperties": true
    })
}

fn workflow_schema() -> Value {
    json!({
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "title": "GenAlima workflow.json",
        "description": "The exact shape GET /api/v1/workflows/{id} returns. Server-owned fields are informational.",
        "type": "object",
        "required": ["name", "nodes", "edges"],
        "properties": {
            "id": { "type": ["string", "null"], "description": "null until the first push" },
            "name": { "type": "string", "maxLength": 255 },
            "description": { "type": ["string", "null"], "maxLength": 1024 },
            "active": { "type": "boolean", "default": true },
            "settings": { "type": ["object", "null"] },
            "owner_id": { "type": ["string", "null"] },
            "version": { "type": ["integer", "null"] },
            "is_frozen": { "type": "boolean" },
            "created_at": { "type": ["string", "null"] },
            "updated_at": { "type": ["string", "null"] },
            "variables": { "type": "array", "description": "Declarations only; values are never returned" },
            "nodes": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": ["key", "name"],
                    "properties": {
                        "id": { "type": ["string", "null"], "format": "uuid" },
                        "workflow_id": { "type": ["string", "null"], "format": "uuid" },
                        "key": { "type": "string", "maxLength": 64 },
                        "name": { "type": "string", "maxLength": 255 },
                        "type": { "const": "code" },
                        "type_version": { "type": "integer", "default": 1 },
                        "position_x": { "type": "number" },
                        "position_y": { "type": "number" },
                        "disabled": { "type": "boolean" },
                        "code": { "type": "string" },
                        "input": { "type": "object", "additionalProperties": spec_schema() },
                        "output": { "type": "object", "additionalProperties": spec_schema() },
                        "type_enforcement": { "enum": crate::model::ENFORCEMENT_MODES },
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "language": { "const": "python" },
                                "mode": { "enum": crate::model::NODE_MODES },
                                "timeout": { "type": "number" },
                                "onError": { "enum": crate::model::ON_ERROR }
                            },
                            "additionalProperties": true
                        },
                        "notes": { "type": ["string", "null"], "maxLength": 1024 }
                    },
                    "additionalProperties": true
                }
            },
            "edges": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": ["source_node_id", "target_node_id"],
                    "properties": {
                        "id": { "type": ["string", "null"], "format": "uuid" },
                        "workflow_id": { "type": ["string", "null"], "format": "uuid" },
                        "source_node_id": { "type": "string", "format": "uuid" },
                        "target_node_id": { "type": "string", "format": "uuid" },
                        "source_handle": { "type": "string", "default": "main" },
                        "target_handle": { "type": "string", "default": "main" },
                        "mapping": {
                            "type": "object",
                            "description": "{target_field: source_field}; strict, so {} carries nothing",
                            "additionalProperties": { "type": "string" }
                        }
                    },
                    "additionalProperties": true
                }
            }
        },
        "additionalProperties": true
    })
}

fn envelope_schema() -> Value {
    json!({
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "title": "genalima --json envelope",
        "type": "object",
        "required": ["ok", "command"],
        "properties": {
            "ok": { "type": "boolean" },
            "command": { "type": "string", "examples": ["workflow.push", "workflow.run"] },
            "data": { "description": "The server's response body verbatim, or a documented CLI shape" },
            "error": {
                "type": "object",
                "required": ["code", "message"],
                "properties": {
                    "code": {
                        "enum": ["usage", "internal", "invalid_local", "unauthorized", "not_found", "conflict", "remote_validation", "run_failed"]
                    },
                    "message": { "type": "string" },
                    "detail": {},
                    "hint": { "type": "string" }
                }
            },
            "meta": {
                "type": "object",
                "properties": {
                    "server": { "type": "string" },
                    "cli": { "type": "string" },
                    "duration_ms": { "type": "integer" }
                }
            }
        },
        "additionalProperties": false
    })
}
