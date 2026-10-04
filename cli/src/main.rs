//! `genalima` — entry point, envelope emission and exit codes.
//!
//! stdout discipline: human mode prints the command's rendering; `--json` mode
//! prints exactly one envelope and nothing else, success or failure. Exit code 0
//! and a well-formed envelope is the only success signal an agent needs.

#![recursion_limit = "256"]

use clap::Parser;
use genalima_cli::cli::Cli;
use genalima_cli::commands;
use genalima_cli::error::CliError;
use genalima_cli::globals;
use genalima_cli::render;
use serde_json::{json, Value};
use std::time::Instant;

fn main() {
    let cli = Cli::parse();
    globals::set_json(cli.global.json);
    globals::set_quiet(cli.global.quiet);
    globals::set_verbose(cli.global.verbose as usize);
    globals::set_assume_yes(cli.global.yes);
    globals::init_color(cli.global.no_color, cli.global.color);

    let command = cli.command.name();
    let started = Instant::now();
    let result = commands::run(&cli);
    let duration_ms = started.elapsed().as_millis() as u64;

    match result {
        Ok(out) => {
            if globals::json_mode() {
                let envelope = json!({
                    "ok": true,
                    "command": command,
                    "data": out.data,
                    "meta": meta(duration_ms),
                });
                println!("{}", serde_json::to_string(&envelope).unwrap_or_default());
            } else if out.raw {
                // Raw output is for pipelines (`genalima workflow code get >
                // node.py`): print exactly what the command produced.
                print!("{}", out.human);
            } else {
                print!("{}", out.human);
                if !out.human.ends_with('\n') {
                    println!();
                }
            }
        }
        Err(error) => {
            if globals::json_mode() {
                let envelope = json!({
                    "ok": false,
                    "command": command,
                    "error": error.as_json(),
                    "meta": meta(duration_ms),
                });
                println!("{}", serde_json::to_string(&envelope).unwrap_or_default());
            } else {
                print_error(&error);
            }
            std::process::exit(error.exit_code());
        }
    }
}

fn meta(duration_ms: u64) -> Value {
    let mut object = serde_json::Map::new();
    object.insert("cli".into(), json!(env!("CARGO_PKG_VERSION")));
    object.insert("duration_ms".into(), json!(duration_ms));
    if let Some(server) = globals::server() {
        object.insert("server".into(), json!(server));
    }
    Value::Object(object)
}

/// Human error rendering: message, then the structured detail the server sent
/// (or the local mirror produced), then the hint.
fn print_error(error: &CliError) {
    eprintln!("{} {}", render::red("error:"), error.message());
    if globals::verbose() > 0 {
        eprintln!("  code: {}", error.code());
    }
    if let Some(detail) = error.detail() {
        render_detail(detail);
    }
    if let Some(hint) = error.hint() {
        eprintln!("{} {hint}", render::yellow("hint:"));
    }
}

fn render_detail(detail: &Value) {
    // Local mirror (`validate`, the pre-flight, a rejected run).
    if let Some(problems) = detail.get("problems").and_then(Value::as_array) {
        let mut last_scope = String::new();
        for problem in problems {
            let scope = problem
                .get("scope")
                .and_then(Value::as_str)
                .unwrap_or("problem")
                .to_string();
            if scope != last_scope {
                eprintln!("  {}:", render::bold(&scope));
                last_scope = scope;
            }
            eprintln!(
                "    {} {}",
                render::red("×"),
                problem.get("id").and_then(Value::as_str).unwrap_or("")
            );
            eprintln!(
                "        {}",
                problem.get("reason").and_then(Value::as_str).unwrap_or("")
            );
        }
        return;
    }

    // The server's graph/type 400 bodies.
    for (key, label) in [("edges", "edge"), ("nodes", "node")] {
        if let Some(items) = detail.get(key).and_then(Value::as_array) {
            for item in items {
                let id = item
                    .get(format!("{label}_id"))
                    .and_then(Value::as_str)
                    .unwrap_or("");
                let reason = item.get("reason").and_then(Value::as_str).unwrap_or("");
                eprintln!("  {} {}: {}", render::red("×"), id, reason);
            }
        }
    }

    if let Some(missing) = detail.get("missing").and_then(Value::as_array) {
        let names: Vec<String> = missing
            .iter()
            .filter_map(Value::as_str)
            .map(str::to_string)
            .collect();
        if !names.is_empty() {
            eprintln!("  missing variables: {}", names.join(", "));
        }
    }

    if globals::verbose() > 0 {
        eprintln!("  {}", serde_json::to_string(detail).unwrap_or_default());
    }
}
