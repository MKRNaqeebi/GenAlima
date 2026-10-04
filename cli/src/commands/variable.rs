//! Per-workflow environment variables.
//!
//! The three routes this uses are specified in
//! `docs/workflow-environment-variables-plan.md` §5 but are not implemented on
//! the server yet (the model landed in commit `814c6e2`, the router did not), so
//! every command is capability-gated: without the routes it exits 5 with a
//! pointer to the plan instead of a confusing 404.
//!
//! A value can be set, replaced or cleared and is **never** read back — the API's
//! `WorkflowVariablePublic` has no value field, so neither does this.

use crate::cli::{VariableKeyArgs, VariableListArgs, VariableSetArgs, VariableSub};
use crate::commands::{confirm, Ctx, Out};
use crate::error::{CliError, Result};
use crate::globals;
use crate::model::VariableList;
use crate::render;
use serde_json::{json, Map, Value};

pub fn run(ctx: &Ctx, sub: &VariableSub) -> Result<Out> {
    match sub {
        VariableSub::List(args) => list(ctx, args),
        VariableSub::Set(args) => set(ctx, args),
        VariableSub::Unset(args) => unset(ctx, args),
    }
}

fn list(ctx: &Ctx, args: &VariableListArgs) -> Result<Out> {
    ctx.api.require_variables_capability()?;
    let id = ctx.workflow_id(args.id.as_deref())?;
    let value = ctx.api.list_variables(&id)?;
    let listing: VariableList = serde_json::from_value(value.clone()).unwrap_or_default();

    let rows: Vec<Vec<String>> = listing
        .data
        .iter()
        .map(|variable| {
            vec![
                variable.key.clone(),
                if variable.has_value {
                    render::green("set")
                } else {
                    render::red("not set")
                }
                .to_string(),
                if variable.is_secret { "yes" } else { "no" }.to_string(),
                if variable.required { "yes" } else { "no" }.to_string(),
                render::optional(variable.description.as_deref()),
            ]
        })
        .collect();

    let human = if listing.data.is_empty() {
        "no variables declared".to_string()
    } else {
        render::table(
            &["key", "value", "secret", "required", "description"],
            &rows,
        )
    };
    Ok(Out::new(value, human))
}

fn set(ctx: &Ctx, args: &VariableSetArgs) -> Result<Out> {
    ctx.api.require_variables_capability()?;
    let id = ctx.workflow_id(args.id.as_deref())?;

    let value = read_value(args)?;

    // PATCH semantics: only the keys the user asked for are sent, so an omitted
    // `value` keeps the stored secret and an explicit null clears it.
    let mut body = Map::new();
    if let Some(value) = value {
        body.insert("value".into(), value);
    }
    if let Some(secret) = args.secret {
        body.insert("is_secret".into(), json!(secret));
    }
    if let Some(required) = args.required {
        body.insert("required".into(), json!(required));
    }
    if let Some(description) = &args.description {
        body.insert("description".into(), json!(description));
    }
    if body.is_empty() {
        return Err(CliError::usage(
            "nothing to set: pass --value-stdin, --from-env, --value, --secret, --required or \
             --description",
        ));
    }

    let response = ctx.api.set_variable(&id, &args.key, Value::Object(body))?;
    let stored = if value_is_present(args) {
        "value stored (it can never be read back)"
    } else {
        "declaration updated"
    };
    globals::note(stored);
    Ok(Out::new(
        response,
        format!("{} {stored}", render::bold(&args.key)),
    ))
}

fn value_is_present(args: &VariableSetArgs) -> bool {
    args.value_stdin || args.from_env.is_some() || args.value.is_some()
}

/// A variable's value comes from stdin, an environment variable, or an explicit
/// flag that warns about shell history. `None` means "leave it alone".
fn read_value(args: &VariableSetArgs) -> Result<Option<Value>> {
    let sources = [
        args.value_stdin,
        args.from_env.is_some(),
        args.value.is_some(),
    ]
    .iter()
    .filter(|present| **present)
    .count();
    if sources > 1 {
        return Err(CliError::usage(
            "pass only one of --value-stdin, --from-env or --value",
        ));
    }
    if args.value_stdin {
        let mut text = String::new();
        std::io::Read::read_to_string(&mut std::io::stdin(), &mut text)?;
        let text = text.trim_end_matches(['\n', '\r']).to_string();
        if text.is_empty() {
            return Err(CliError::usage("no value was read from stdin"));
        }
        return Ok(Some(json!(text)));
    }
    if let Some(name) = &args.from_env {
        let text = std::env::var(name).map_err(|_| {
            CliError::usage(format!("{name} is not set in this process's environment"))
        })?;
        return Ok(Some(json!(text)));
    }
    if let Some(value) = &args.value {
        globals::warn(
            "--value is visible in `ps` and in your shell history; prefer --value-stdin or \
             --from-env",
        );
        return Ok(Some(json!(value)));
    }
    Ok(None)
}

fn unset(ctx: &Ctx, args: &VariableKeyArgs) -> Result<Out> {
    ctx.api.require_variables_capability()?;
    let id = ctx.workflow_id(args.id.as_deref())?;
    confirm(&format!("Delete variable '{}'?", args.key))?;
    let response = ctx.api.delete_variable(&id, &args.key)?;
    Ok(Out::new(response, format!("deleted {}", args.key)))
}
