//! Command dispatch and the helpers every command shares.
//!
//! `push` lives here because `run`, `test-node` and `publish` all need the same
//! "save local changes first" semantics the editor's `ensureSaved()` has.

pub mod component;
pub mod meta;
pub mod variable;
pub mod workflow;

use crate::api::Api;
use crate::cli::{Cli, Command};
use crate::config::{Config, Overrides};
use crate::error::{CliError, Problem, Result};
use crate::globals;
use crate::model::WorkflowFile;
use crate::project;
use crate::validate;
use serde_json::{json, Value};
use std::io::IsTerminal;
use std::path::{Path, PathBuf};
use uuid::Uuid;

/// What a command produced: the machine payload, the human rendering, and
/// whether the human rendering is raw text that must not be decorated.
pub struct Out {
    pub data: Value,
    pub human: String,
    pub raw: bool,
}

impl Out {
    pub fn new(data: Value, human: impl Into<String>) -> Self {
        Self {
            data,
            human: human.into(),
            raw: false,
        }
    }

    /// No human rendering of its own: print the payload.
    pub fn value(data: Value) -> Self {
        Self::new(
            data.clone(),
            crate::canonical::to_json_string(&data).trim_end(),
        )
    }

    /// Raw text on stdout in human mode (pipelines), a payload under `--json`.
    pub fn raw(data: Value, human: impl Into<String>) -> Self {
        Self {
            data,
            human: human.into(),
            raw: true,
        }
    }
}

/// Everything a command needs: resolved config, a client, and the file flag.
pub struct Ctx {
    pub config: Config,
    pub api: Api,
    pub file: Option<PathBuf>,
}

impl Ctx {
    /// The file this command must operate on.
    pub fn workflow(&self) -> Result<(PathBuf, WorkflowFile)> {
        let path = project::discover(self.file.as_deref())?;
        let workflow = project::load(&path)?;
        Ok((path, workflow))
    }

    /// The file if there is one, without failing when there is not.
    pub fn workflow_opt(&self) -> Option<(PathBuf, WorkflowFile)> {
        let path = project::discover_if_present(self.file.as_deref())?;
        let workflow = project::load(&path).ok()?;
        Some((path, workflow))
    }

    /// The workflow id: the positional argument, else the file's.
    pub fn workflow_id(&self, explicit: Option<&str>) -> Result<String> {
        let workflow = self.workflow_opt().map(|(_, workflow)| workflow);
        project::resolve_id(explicit, workflow.as_ref())
    }

    /// The local file when it matches the id, for rendering names and contracts.
    pub fn workflow_for_id(&self, id: &str) -> Option<WorkflowFile> {
        let (_, workflow) = self.workflow_opt()?;
        match workflow.id {
            Some(local) if local.to_string() == id => Some(workflow),
            _ => None,
        }
    }

    pub fn verbose_note(&self) {
        if globals::verbose() > 0 {
            globals::debug(&format!(
                "server {} (from {})",
                self.config.server, self.config.server_source
            ));
            globals::debug(&format!(
                "profile {} · token from {}",
                self.config.profile, self.config.token_source
            ));
        }
    }
}

pub fn run(cli: &Cli) -> Result<Out> {
    let overrides = Overrides {
        server: cli.global.server.clone(),
        token: cli.global.token.clone(),
        profile: cli.global.profile.clone(),
        timeout: cli.global.timeout,
    };
    let config = Config::resolve(&overrides)?;
    let timeout = config.timeout.unwrap_or(30);
    let api = Api::new(&config.server, config.token.clone(), timeout);
    globals::set_server(&config.server);
    let ctx = Ctx {
        config,
        api,
        file: cli.global.file.clone(),
    };
    ctx.verbose_note();

    match &cli.command {
        Command::Login(args) => meta::login(&ctx, args),
        Command::Logout => meta::logout(&ctx),
        Command::Whoami => meta::whoami(&ctx),
        Command::Doctor => meta::doctor(&ctx),
        Command::Schema(args) => meta::schema(args),
        Command::Completions(args) => meta::completions(args),
        Command::Version => meta::version(&ctx),
        Command::Workflow(sub) => workflow::run(&ctx, sub),
        Command::Component(sub) => component::run(&ctx, sub),
        Command::Variable(sub) => variable::run(&ctx, sub),
    }
}

// ------------------------------------------------------------------- shared

pub fn workflow_from_value(value: Value) -> Result<WorkflowFile> {
    WorkflowFile::from_value(value).map_err(|error| {
        CliError::internal(format!(
            "the server returned an unreadable workflow: {error}"
        ))
    })
}

pub fn confirm(prompt: &str) -> Result<()> {
    if globals::assume_yes() {
        return Ok(());
    }
    if !std::io::stdin().is_terminal() {
        return Err(CliError::usage(format!(
            "{prompt}: refusing without --yes (stdin is not a terminal)"
        )));
    }
    eprint!("{prompt} [y/N] ");
    let mut answer = String::new();
    std::io::stdin().read_line(&mut answer)?;
    if matches!(answer.trim().to_ascii_lowercase().as_str(), "y" | "yes") {
        Ok(())
    } else {
        Err(CliError::usage("aborted"))
    }
}

pub fn parse_position(text: &str) -> Result<(f64, f64)> {
    let (x, y) = text
        .split_once(',')
        .ok_or_else(|| CliError::usage("position must look like 120,80"))?;
    let x = x
        .trim()
        .parse::<f64>()
        .map_err(|_| CliError::usage(format!("'{x}' is not a number")))?;
    let y = y
        .trim()
        .parse::<f64>()
        .map_err(|_| CliError::usage(format!("'{y}' is not a number")))?;
    Ok((x, y))
}

pub fn parse_pairs(pairs: &[String]) -> Result<Vec<(String, String)>> {
    let mut parsed = Vec::with_capacity(pairs.len());
    for pair in pairs {
        let (left, right) = pair
            .split_once('=')
            .ok_or_else(|| CliError::usage(format!("'{pair}' must look like KEY=VALUE")))?;
        parsed.push((left.trim().to_string(), right.trim().to_string()));
    }
    Ok(parsed)
}

/// Read a `--code-file` / stdin body.
pub fn read_code(file: &Option<PathBuf>, inline: &Option<String>, stdin: bool) -> Result<String> {
    if stdin {
        let mut text = String::new();
        std::io::Read::read_to_string(&mut std::io::stdin(), &mut text)?;
        return Ok(text);
    }
    if let Some(inline) = inline {
        return Ok(inline.clone());
    }
    if let Some(path) = file {
        return std::fs::read_to_string(path).map_err(|error| {
            CliError::usage(format!("could not read {}: {error}", path.display()))
        });
    }
    Err(CliError::usage("pass --code, --code-file or --stdin"))
}

/// Local validation, used as a pre-flight and by `workflow validate`.
pub fn local_problems(workflow: &WorkflowFile, for_publish: bool) -> Vec<Problem> {
    validate::validate(workflow, for_publish)
}

/// Replace machine ids with readable labels for human-facing output while
/// keeping the machine ids in `ids`.
pub fn display_problems(workflow: &WorkflowFile, problems: &[Problem]) -> Vec<Problem> {
    problems
        .iter()
        .map(|problem| {
            let mut copy = problem.clone();
            copy.id = validate::describe_id(workflow, &problem.id);
            copy
        })
        .collect()
}

// --------------------------------------------------------------------- push

#[derive(Debug, Clone, Default)]
pub struct PushOptions {
    pub dry_run: bool,
    pub regenerate_ids: bool,
    pub no_metadata: bool,
    pub force: bool,
}

#[derive(Debug, Default)]
pub struct PushOutcome {
    pub created: bool,
    pub graph_saved: bool,
    pub metadata_saved: bool,
    pub version: Option<i64>,
    pub diff: Vec<String>,
    pub requests: Vec<String>,
}

impl PushOutcome {
    pub fn changed(&self) -> bool {
        self.created || self.graph_saved || self.metadata_saved
    }

    pub fn as_json(&self, workflow: &WorkflowFile) -> Value {
        json!({
            "id": workflow.id,
            "version": self.version,
            "created": self.created,
            "graph_saved": self.graph_saved,
            "metadata_saved": self.metadata_saved,
            "changes": self.diff,
        })
    }
}

pub fn metadata_body(workflow: &WorkflowFile) -> Value {
    json!({
        "name": workflow.name,
        "description": workflow.description,
        "active": workflow.active,
        "settings": workflow.settings,
    })
}

/// The one command that writes a graph. Order matters: graph first (so a
/// metadata failure cannot leave a new workflow without its nodes), metadata
/// second, then the file is rewritten from what the server accepted.
pub fn push(
    ctx: &Ctx,
    path: Option<&Path>,
    workflow: &mut WorkflowFile,
    options: &PushOptions,
) -> Result<PushOutcome> {
    if workflow.is_frozen {
        return Err(
            CliError::unauthorized("this file is a published snapshot and is read-only")
                .with_hint("publish a new version from the source workflow instead"),
        );
    }

    let problems = local_problems(workflow, false);
    if !problems.is_empty() {
        if options.force {
            globals::warn(&format!(
                "{} local problem(s) ignored because of --force",
                problems.len()
            ));
        } else {
            return Err(CliError::invalid_local(
                format!(
                    "{} problem(s) found; fix them or pass --force",
                    problems.len()
                ),
                display_problems(workflow, &problems),
            ));
        }
    }

    if options.regenerate_ids {
        let (nodes, edges) = crate::graph_edit::regenerate_ids(workflow);
        globals::note(&format!(
            "regenerated {nodes} node id(s) and {edges} edge id(s)"
        ));
    }

    let mut outcome = PushOutcome::default();

    // A file with no id becomes a new workflow.
    if workflow.id.is_none() {
        outcome.created = true;
        outcome.graph_saved = true;
        outcome.metadata_saved = !options.no_metadata;
        if options.dry_run {
            outcome.requests.push(format!(
                "POST /api/v1/workflows/ {}",
                metadata_body(workflow)
            ));
            outcome
                .requests
                .push("PUT /api/v1/workflows/{new}/graph".to_string());
            outcome.diff = vec!["+ workflow (not created yet)".to_string()];
            return Ok(outcome);
        }
        ctx.api.require_token()?;
        let created = ctx.api.create_workflow(metadata_body(workflow))?;
        let id = created
            .get("id")
            .and_then(Value::as_str)
            .ok_or_else(|| CliError::internal("the create response had no id"))?;
        workflow.id = Some(Uuid::parse_str(id)?);
        workflow.version = created.get("version").and_then(Value::as_i64);
        workflow.owner_id = created
            .get("owner_id")
            .and_then(Value::as_str)
            .and_then(|value| Uuid::parse_str(value).ok());
        workflow.created_at = created
            .get("created_at")
            .and_then(Value::as_str)
            .map(str::to_string);
        for node in workflow.nodes.iter_mut() {
            node.workflow_id = workflow.id;
        }
        for edge in workflow.edges.iter_mut() {
            edge.workflow_id = workflow.id;
        }
        outcome.diff.push(format!("+ workflow {}", id));
        let response = ctx.api.save_graph(id, workflow.graph_payload())?;
        outcome.version = response.get("version").and_then(Value::as_i64);
        if !options.no_metadata {
            let updated = ctx.api.update_workflow(id, metadata_body(workflow))?;
            apply_metadata(workflow, &updated);
        } else {
            workflow.version = outcome.version;
        }
        if let Some(path) = path {
            project::save(path, workflow)?;
        }
        return Ok(outcome);
    }

    let id = workflow.id.unwrap().to_string();

    // Compare with the server so an unchanged file is a no-op.
    if options.dry_run {
        outcome.graph_saved = true;
        outcome.metadata_saved = !options.no_metadata;
        outcome.requests.push(format!(
            "PUT /api/v1/workflows/{id}/graph ({} nodes, {} edges)",
            workflow.nodes.len(),
            workflow.edges.len()
        ));
        if !options.no_metadata {
            outcome.requests.push(format!(
                "PUT /api/v1/workflows/{id} {}",
                metadata_body(workflow)
            ));
        }
        if let Ok(remote_value) = ctx.api.get_workflow(&id) {
            let remote = workflow_from_value(remote_value)?;
            outcome.diff = crate::diff::diff(workflow, &remote);
            outcome.graph_saved = project::graph_differs(workflow, &remote);
            outcome.metadata_saved =
                !options.no_metadata && project::metadata_differs(workflow, &remote);
        }
        return Ok(outcome);
    }

    ctx.api.require_token()?;
    let remote = workflow_from_value(ctx.api.get_workflow(&id)?)?;
    if remote.is_frozen {
        return Err(CliError::unauthorized(
            "this workflow is a published snapshot and is read-only",
        )
        .with_hint("publish a new version from the source workflow instead"));
    }
    outcome.diff = crate::diff::diff(workflow, &remote);
    outcome.graph_saved = project::graph_differs(workflow, &remote);
    outcome.metadata_saved = !options.no_metadata && project::metadata_differs(workflow, &remote);

    if outcome.graph_saved {
        let response = ctx.api.save_graph(&id, workflow.graph_payload())?;
        outcome.version = response.get("version").and_then(Value::as_i64);
        workflow.version = outcome.version;
    }
    if outcome.metadata_saved {
        let updated = ctx.api.update_workflow(&id, metadata_body(workflow))?;
        apply_metadata(workflow, &updated);
    }
    if let Some(path) = path {
        // A fresh read of the server's canonical graph keeps ids in step.
        if outcome.graph_saved {
            let refreshed = workflow_from_value(ctx.api.get_workflow(&id)?)?;
            refresh_graph(workflow, &refreshed);
        }
        project::save(path, workflow)?;
    }
    Ok(outcome)
}

fn apply_metadata(workflow: &mut WorkflowFile, updated: &Value) {
    if let Some(name) = updated.get("name").and_then(Value::as_str) {
        workflow.name = name.to_string();
    }
    if let Some(version) = updated.get("version").and_then(Value::as_i64) {
        workflow.version = Some(version);
    }
    if let Some(updated_at) = updated.get("updated_at").and_then(Value::as_str) {
        workflow.updated_at = Some(updated_at.to_string());
    }
}

/// Keep server-issued ids and canonical contracts while preserving local
/// metadata the update response does not carry.
fn refresh_graph(workflow: &mut WorkflowFile, remote: &WorkflowFile) {
    workflow.nodes = remote.nodes.clone();
    workflow.edges = remote.edges.clone();
    workflow.version = remote.version;
    workflow.updated_at = remote.updated_at.clone();
    workflow.owner_id = remote.owner_id;
    workflow.created_at = remote.created_at.clone();
    workflow.is_frozen = remote.is_frozen;
}

/// `run`, `test-node` and `publish` save local changes first, like the editor.
pub fn save_if_changed(ctx: &Ctx, path: &Path, workflow: &mut WorkflowFile) -> Result<bool> {
    let Some(id) = workflow.id else {
        return Err(CliError::usage(
            "this workflow has no id yet; run `genalima workflow push` first",
        ));
    };
    let remote = workflow_from_value(ctx.api.get_workflow(&id.to_string())?)?;
    if !project::graph_differs(workflow, &remote) && !project::metadata_differs(workflow, &remote) {
        return Ok(false);
    }
    globals::note("saving local changes first");
    push(ctx, Some(path), workflow, &PushOptions::default())?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn positions_must_be_a_pair() {
        assert_eq!(parse_position("120,80").unwrap(), (120.0, 80.0));
        assert!(parse_position("120").is_err());
        assert!(parse_position("a,b").is_err());
    }

    #[test]
    fn mapping_pairs_split_on_the_first_equals() {
        let pairs = parse_pairs(&["target=source=2".to_string()]).unwrap();
        assert_eq!(pairs[0].0, "target");
        assert_eq!(pairs[0].1, "source=2");
        assert!(parse_pairs(&["nope".to_string()]).is_err());
    }
}
