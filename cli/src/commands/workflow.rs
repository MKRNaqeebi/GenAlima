//! Every `genalima workflow ...` command.
//!
//! Commands split into three groups, and the split is the design:
//!
//! * **local-only** (`init`, `fmt`, `inputs`, `code`, `node`, `edge`, `contract`)
//!   edit `workflow.json` and never touch the server;
//! * **server-only** (`list`, `show`, `pull`, `runs`, `log`, `clone`, `delete`);
//! * **both** (`push`, `validate`, `diff`, `run`, `test-node`, `publish`), where
//!   local changes are saved first exactly as the editor's `ensureSaved()` does.

use crate::cli::{
    CloneArgs, CodeSub, ContractFieldArgs, ContractRenameArgs, ContractRmArgs, ContractSetArgs,
    ContractSub, DeleteArgs, EdgeAddArgs, EdgeMapArgs, EdgePairArgs, EdgeSub, IdArgs, InitArgs,
    ItemsArgs, ListArgs, LogArgs, NewArgs, NodeAddArgs, NodeKeyArgs, NodeSetArgs, NodeSub,
    PublishArgs, PullArgs, PushArgs, RenameArgs, RunArgs, RunsArgs, SetArgs, Template,
    TestNodeArgs, ValidateArgs, WorkflowSub,
};
use crate::commands::{
    confirm, display_problems, local_problems, parse_pairs, parse_position, push, read_code,
    save_if_changed, Ctx, Out, PushOptions,
};
use crate::error::{CliError, Problem, Result};
use crate::globals;
use crate::graph_edit::{self, FieldChange, NewNode, SetNode};
use crate::items;
use crate::model::{Contract, Node, Run, WorkflowFile};
use crate::project;
use crate::render;
use crate::validate;
use serde_json::{json, Value};
use std::path::PathBuf;
use uuid::Uuid;

pub fn run(ctx: &Ctx, sub: &WorkflowSub) -> Result<Out> {
    match sub {
        WorkflowSub::Init(args) => init(ctx, args),
        WorkflowSub::New(args) => new(ctx, args),
        WorkflowSub::List(args) => list(ctx, args),
        WorkflowSub::Show(args) => show(ctx, args),
        WorkflowSub::Pull(args) => pull(ctx, args),
        WorkflowSub::Push(args) => push_command(ctx, args),
        WorkflowSub::Validate(args) => validate_command(ctx, args),
        WorkflowSub::Rename(args) => rename(ctx, args),
        WorkflowSub::Set(args) => set(ctx, args),
        WorkflowSub::Delete(args) => delete(ctx, args),
        WorkflowSub::Clone(args) => clone(ctx, args),
        WorkflowSub::Fmt => fmt(ctx),
        WorkflowSub::Diff(args) => diff(ctx, args),
        WorkflowSub::Inputs => inputs(ctx),
        WorkflowSub::Run(args) => run_command(ctx, args),
        WorkflowSub::TestNode(args) => test_node(ctx, args),
        WorkflowSub::Runs(args) => runs(ctx, args),
        WorkflowSub::Log(args) => log(ctx, args),
        WorkflowSub::Publish(args) => publish(ctx, args),
        WorkflowSub::Code(sub) => code(ctx, sub),
        WorkflowSub::Node(sub) => node(ctx, sub),
        WorkflowSub::Edge(sub) => edge(ctx, sub),
        WorkflowSub::Contract(sub) => contract(ctx, sub),
    }
}

// ------------------------------------------------------------------ templates

fn apply_template(workflow: &mut WorkflowFile, template: Template) {
    match template {
        Template::Blank => {}
        Template::Passthrough => {
            let mut node = Node::new("code_1", "Code 1", (80.0, 80.0));
            node.workflow_id = workflow.id;
            workflow.nodes.push(node);
        }
        Template::Component => {
            let mut entry = Node::new("code_1", "Input", (80.0, 80.0));
            entry.input.insert("payload".into(), required_spec("dict"));
            entry.output.insert("payload".into(), required_spec("dict"));
            entry.code = "result = items\n".to_string();
            entry.workflow_id = workflow.id;

            let mut exit = Node::new("code_2", "Output", (420.0, 80.0));
            exit.input.insert("payload".into(), required_spec("dict"));
            exit.code = "result = items\n".to_string();
            exit.workflow_id = workflow.id;

            let mut edge = crate::model::Edge::new(entry.id.unwrap(), exit.id.unwrap());
            edge.mapping.insert("payload".into(), "payload".into());
            edge.workflow_id = workflow.id;

            workflow.nodes.push(entry);
            workflow.nodes.push(exit);
            workflow.edges.push(edge);
        }
    }
}

fn required_spec(field_type: &str) -> crate::model::FieldSpec {
    let mut spec = crate::model::FieldSpec::typed(field_type);
    spec.required = Some(true);
    spec
}

// ---------------------------------------------------------------------- init

fn init(ctx: &Ctx, args: &InitArgs) -> Result<Out> {
    let path = ctx
        .file
        .clone()
        .unwrap_or_else(|| PathBuf::from(project::DEFAULT_FILE));
    if path.exists() && !args.force {
        return Err(CliError::usage(format!(
            "{} already exists; pass --force to overwrite",
            path.display()
        )));
    }
    let mut workflow = WorkflowFile::blank(args.name.clone());
    workflow.description = args.description.clone();
    apply_template(&mut workflow, args.template);
    project::save(&path, &mut workflow)?;

    globals::note(&format!(
        "wrote {} ({} node(s), {} edge(s)) with no remote workflow yet",
        path.display(),
        workflow.nodes.len(),
        workflow.edges.len()
    ));
    globals::note("next: `genalima workflow validate`, then `genalima workflow push`");

    Ok(Out::new(
        json!({
            "path": path,
            "id": Value::Null,
            "name": workflow.name,
            "nodes": workflow.nodes.len(),
            "edges": workflow.edges.len(),
        }),
        format!(
            "created {} — {} node(s), {} edge(s)\nrun `genalima workflow push` to create it on {}",
            path.display(),
            workflow.nodes.len(),
            workflow.edges.len(),
            ctx.config.server
        ),
    ))
}

fn new(ctx: &Ctx, args: &NewArgs) -> Result<Out> {
    let path = ctx
        .file
        .clone()
        .unwrap_or_else(|| PathBuf::from(project::DEFAULT_FILE));
    if !args.no_file && path.exists() {
        return Err(CliError::usage(format!(
            "{} already exists; remove it or pass --file elsewhere",
            path.display()
        )));
    }

    let mut workflow = WorkflowFile::blank(args.name.clone());
    workflow.description = args.description.clone();
    apply_template(&mut workflow, args.template);

    let options = PushOptions::default();
    let outcome = push(
        ctx,
        if args.no_file { None } else { Some(&path) },
        &mut workflow,
        &options,
    )?;

    let id = workflow
        .id
        .map(|id| id.to_string())
        .ok_or_else(|| CliError::internal("the created workflow has no id"))?;
    globals::note(&format!("created workflow {id}"));

    let human = if args.no_file {
        format!("created workflow {id} ({} nodes)", workflow.nodes.len())
    } else {
        format!(
            "created workflow {id} and {} ({} nodes)\nrun `genalima workflow run` or open {}",
            path.display(),
            workflow.nodes.len(),
            ctx.config.server
        )
    };
    Ok(Out::new(
        json!({
            "id": id,
            "version": outcome.version,
            "path": if args.no_file { Value::Null } else { json!(path) },
            "nodes": workflow.nodes.len(),
        }),
        human,
    ))
}

// ---------------------------------------------------------------------- list

fn list(ctx: &Ctx, args: &ListArgs) -> Result<Out> {
    if args.local {
        let root = std::env::current_dir().map_err(|error| {
            CliError::internal(format!("could not read the working directory: {error}"))
        })?;
        let files = project::find_local_files(&root);
        let mut rows = Vec::new();
        let mut data = Vec::new();
        for file in files {
            let Ok(workflow) = project::load(&file) else {
                continue;
            };
            let problems = local_problems(&workflow, false).len();
            rows.push(vec![
                file.display().to_string(),
                workflow
                    .id
                    .map(|id| render::short_id(&id.to_string()))
                    .unwrap_or_else(|| "(not pushed)".to_string()),
                workflow.name.clone(),
                workflow.nodes.len().to_string(),
                if problems == 0 {
                    render::green("ok")
                } else {
                    render::red(&format!("{problems} issue(s)"))
                },
            ]);
            data.push(json!({
                "path": file,
                "id": workflow.id,
                "name": workflow.name,
                "nodes": workflow.nodes.len(),
                "problems": problems,
            }));
        }
        let human = if rows.is_empty() {
            "no workflow.json files found in this tree".to_string()
        } else {
            render::table(&["path", "id", "name", "nodes", "state"], &rows)
        };
        return Ok(Out::new(
            json!({ "data": data, "count": data.len() }),
            human,
        ));
    }

    let page_size = args.limit.max(1);
    let mut components;
    let mut raw_pages: Vec<Value> = Vec::new();
    let mut rows: Vec<Vec<String>> = Vec::new();
    let mut listed = Vec::new();
    let mut skip = if args.all {
        0
    } else {
        (args.page.max(1) - 1) * page_size
    };
    let mut total = 0i64;

    loop {
        let value = ctx.api.list_workflows(skip, page_size)?;
        let page: crate::model::WorkflowList =
            serde_json::from_value(value.clone()).unwrap_or_default();
        if listed.is_empty() {
            total = page.count;
        }
        let received = page.data.len() as i64;
        listed.extend(page.data);
        raw_pages.push(value);
        skip += received;
        if !args.all || received < page_size || skip >= total {
            break;
        }
    }

    if let Some(search) = &args.search {
        let needle = search.to_lowercase();
        listed.retain(|workflow| {
            workflow.name.to_lowercase().contains(&needle)
                || workflow
                    .description
                    .as_deref()
                    .map(|text| text.to_lowercase().contains(&needle))
                    .unwrap_or(false)
        });
    }

    for workflow in &listed {
        rows.push(vec![
            workflow
                .id
                .map(|id| render::short_id(&id.to_string()))
                .unwrap_or_default(),
            workflow.name.clone(),
            format!("v{}", workflow.version.unwrap_or(1)),
            match workflow.last_run_status.as_deref() {
                Some("success") => render::green("passed"),
                Some("running") => render::yellow("running"),
                Some(status) => render::red(status),
                None => render::dim("never run"),
            },
            workflow
                .last_run_at
                .as_deref()
                .map(render::human_time)
                .unwrap_or_else(|| "—".to_string()),
            workflow
                .published_version
                .map(|version| format!("v{version}"))
                .unwrap_or_else(|| "—".to_string()),
            workflow
                .updated_at
                .as_deref()
                .map(render::human_time)
                .unwrap_or_else(|| "—".to_string()),
        ]);
    }

    let human = if rows.is_empty() {
        "no workflows yet\ncreate one with `genalima workflow new \"My workflow\"`".to_string()
    } else {
        components = render::table(
            &[
                "id",
                "name",
                "version",
                "last run",
                "when",
                "published",
                "updated",
            ],
            &rows,
        );
        components.push_str(&format!("\n{} of {} workflow(s)", listed.len(), total));
        components
    };

    let data = if args.all {
        json!({ "data": listed, "count": listed.len() })
    } else {
        raw_pages
            .into_iter()
            .next()
            .unwrap_or_else(|| json!({"data": [], "count": 0}))
    };
    Ok(Out::new(data, human))
}

// --------------------------------------------------------------- show / pull

fn render_workflow(workflow: &WorkflowFile, path: Option<&PathBuf>) -> String {
    let mut out = String::new();
    out.push_str(&format!(
        "{} {}\n",
        render::bold(&workflow.name),
        render::dim(&format!("v{}", workflow.version.unwrap_or(1)))
    ));
    if let Some(path) = path {
        out.push_str(&format!("{} {}\n", render::bold("file"), path.display()));
    }
    out.push_str(&format!(
        "{} {}\n",
        render::bold("id"),
        workflow
            .id
            .map(|id| id.to_string())
            .unwrap_or_else(|| "(not pushed yet)".to_string())
    ));
    out.push_str(&format!(
        "{} {}\n",
        render::bold("description"),
        render::optional(workflow.description.as_deref())
    ));
    out.push_str(&format!("{} {}\n", render::bold("active"), workflow.active));
    if workflow.is_frozen {
        out.push_str(&format!("{}\n", render::yellow("read-only snapshot")));
    }

    let entry = workflow
        .entry_id()
        .and_then(|id| workflow.node_by_id(id))
        .map(|node| {
            format!(
                "{} ({}) — {}",
                node.key,
                node.name,
                render::contract_summary(&node.input)
            )
        })
        .unwrap_or_else(|| "—".to_string());
    let exit = workflow
        .exit_id()
        .and_then(|id| workflow.node_by_id(id))
        .map(|node| {
            format!(
                "{} ({}) — {}",
                node.key,
                node.name,
                render::contract_summary(&node.output)
            )
        })
        .unwrap_or_else(|| "—".to_string());
    out.push_str(&format!("{} {entry}\n", render::bold("entry")));
    out.push_str(&format!("{} {exit}\n", render::bold("exit")));

    if !workflow.nodes.is_empty() {
        let rows: Vec<Vec<String>> = workflow
            .nodes
            .iter()
            .map(|node| {
                vec![
                    node.key.clone(),
                    node.name.clone(),
                    render::contract_summary(&node.input),
                    render::contract_summary(&node.output),
                    render::duration(Some((node.parameters.timeout_seconds() * 1000.0) as i64)),
                    if node.disabled {
                        render::dim("disabled")
                    } else {
                        node.parameters.mode.clone()
                    },
                ]
            })
            .collect();
        out.push_str(&format!(
            "\n{}",
            render::table(
                &["key", "name", "input", "output", "timeout", "mode"],
                &rows
            )
        ));
    }
    if !workflow.edges.is_empty() {
        let rows: Vec<Vec<String>> = workflow
            .edges
            .iter()
            .map(|edge| {
                let from = workflow
                    .node_by_id(edge.source_node_id)
                    .map(|node| node.key.clone())
                    .unwrap_or_else(|| render::short_id(&edge.source_node_id.to_string()));
                let to = workflow
                    .node_by_id(edge.target_node_id)
                    .map(|node| node.key.clone())
                    .unwrap_or_else(|| render::short_id(&edge.target_node_id.to_string()));
                vec![
                    format!("{from} → {to}"),
                    serde_json::to_string(&edge.mapping).unwrap_or_default(),
                ]
            })
            .collect();
        out.push_str(&format!("\n{}", render::table(&["edge", "mapping"], &rows)));
    }
    let problems = local_problems(workflow, false);
    out.push_str(&format!(
        "\n{} {}",
        render::bold("issues"),
        if problems.is_empty() {
            render::green("none")
        } else {
            render::red(&format!("{}", problems.len()))
        }
    ));
    out
}

fn show(ctx: &Ctx, args: &IdArgs) -> Result<Out> {
    let local = ctx.workflow_opt();
    let id = match args.id.clone() {
        Some(id) => Some(id),
        None => local
            .as_ref()
            .and_then(|(_, workflow)| workflow.id)
            .map(|id| id.to_string()),
    };

    if let Some(id) = id {
        let value = ctx.api.get_workflow(&id)?;
        let workflow = crate::commands::workflow_from_value(value.clone())?;
        return Ok(Out::new(value, render_workflow(&workflow, None)));
    }

    let (path, workflow) = ctx.workflow()?;
    Ok(Out::new(
        serde_json::to_value(&workflow).unwrap_or(Value::Null),
        render_workflow(&workflow, Some(&path)),
    ))
}

fn pull(ctx: &Ctx, args: &PullArgs) -> Result<Out> {
    let id = ctx.workflow_id(args.id.as_deref())?;
    let value = ctx.api.get_workflow(&id)?;
    let mut remote = crate::commands::workflow_from_value(value)?;

    let path = ctx
        .file
        .clone()
        .unwrap_or_else(|| PathBuf::from(project::DEFAULT_FILE));
    if path.exists() && !args.force {
        let local = project::load(&path)?;
        if project::graph_differs(&local, &remote) || project::metadata_differs(&local, &remote) {
            return Err(CliError::usage(format!(
                "{} differs from the server; pass --force to overwrite it",
                path.display()
            )));
        }
    }

    let text = project::save(&path, &mut remote)?;
    globals::note(&format!(
        "wrote {} ({} bytes, {} nodes)",
        path.display(),
        text.len(),
        remote.nodes.len()
    ));
    Ok(Out::new(
        json!({
            "path": path,
            "id": remote.id,
            "version": remote.version,
            "nodes": remote.nodes.len(),
            "edges": remote.edges.len(),
        }),
        format!(
            "pulled {} v{} into {}\nnext: edit, then `genalima workflow push`",
            remote.name,
            remote.version.unwrap_or(1),
            path.display()
        ),
    ))
}

// ------------------------------------------------------------ push / validate

fn push_command(ctx: &Ctx, args: &PushArgs) -> Result<Out> {
    let (path, mut workflow) = ctx.workflow()?;
    let options = PushOptions {
        dry_run: args.dry_run,
        regenerate_ids: args.regenerate_ids,
        no_metadata: args.no_metadata,
        force: args.force,
    };
    let outcome = push(ctx, Some(&path), &mut workflow, &options)?;

    if args.dry_run {
        let mut human = String::from("dry run — nothing was sent\n");
        for request in &outcome.requests {
            human.push_str(&format!("  {request}\n"));
        }
        if outcome.diff.is_empty() {
            human.push_str("no changes: the server already matches this file");
        } else {
            human.push_str("changes:\n");
            for line in &outcome.diff {
                human.push_str(&format!("  {line}\n"));
            }
        }
        human.push_str(&format!("\ndestination: {}", ctx.config.server));
        return Ok(Out::new(
            json!({
                "dry_run": true,
                "requests": outcome.requests,
                "changes": outcome.diff,
                "server": ctx.config.server,
            }),
            human.trim_end(),
        ));
    }

    let human = if outcome.created {
        format!(
            "created {} and pushed {} node(s), {} edge(s)\nnow at v{}",
            workflow.id.map(|id| id.to_string()).unwrap_or_default(),
            workflow.nodes.len(),
            workflow.edges.len(),
            outcome.version.unwrap_or(1)
        )
    } else if !outcome.changed() {
        format!(
            "{} already matches the server (v{})",
            path.display(),
            workflow.version.unwrap_or(1)
        )
    } else {
        let mut human = format!(
            "pushed {} — {} node(s), {} edge(s)",
            path.display(),
            workflow.nodes.len(),
            workflow.edges.len()
        );
        if outcome.graph_saved {
            human.push_str("\n  graph saved");
        }
        if outcome.metadata_saved {
            human.push_str("\n  metadata saved");
        }
        for line in &outcome.diff {
            human.push_str(&format!("\n  {line}"));
        }
        human.push_str(&format!("\nnow at v{}", outcome.version.unwrap_or(1)));
        human
    };

    Ok(Out::new(outcome.as_json(&workflow), human))
}

fn validate_command(ctx: &Ctx, args: &ValidateArgs) -> Result<Out> {
    let (path, workflow) = ctx.workflow()?;
    let problems = local_problems(&workflow, args.for_publish);
    let order = validate::order(&workflow.nodes, &workflow.edges)
        .ok()
        .map(|ids| {
            ids.iter()
                .map(|id| {
                    workflow
                        .node_by_id(*id)
                        .map(|node| node.key.clone())
                        .unwrap_or_else(|| id.to_string())
                })
                .collect::<Vec<String>>()
        });

    if problems.is_empty() {
        let mut human = format!(
            "{} {} — {} node(s), {} edge(s), {} issue(s)",
            render::green("ok"),
            path.display(),
            workflow.nodes.len(),
            workflow.edges.len(),
            problems.len()
        );
        if args.for_publish {
            human.push_str("\nthe publish boundary rule is satisfied");
        }
        if let (true, Some(order)) = (args.order, &order) {
            human.push_str(&format!("\nexecution order: {}", order.join(" → ")));
        }
        return Ok(Out::new(
            json!({
                "valid": true,
                "path": path,
                "problems": [],
                "order": order,
            }),
            human,
        ));
    }

    let message = format!("{} problem(s) found in {}", problems.len(), path.display());
    let detail_problems: Vec<Problem> = display_problems(&workflow, &problems);
    let mut data = json!({
        "valid": false,
        "path": path,
        "problems": detail_problems.iter().map(Problem::as_json).collect::<Vec<_>>(),
        "order": order,
    });
    if args.order {
        data["order"] = json!(order);
    }
    Err(CliError::invalid_local(message, detail_problems))
}

// ---------------------------------------------------------- metadata commands

fn rename(ctx: &Ctx, args: &RenameArgs) -> Result<Out> {
    let id = ctx.workflow_id(args.id.as_deref())?;
    let updated = ctx.api.update_workflow(&id, json!({ "name": args.name }))?;
    if let Some((path, mut workflow)) = ctx.workflow_opt() {
        if workflow.id.map(|value| value.to_string()).as_deref() == Some(id.as_str()) {
            workflow.name = args.name.clone();
            project::save(&path, &mut workflow)?;
        }
    }
    Ok(Out::new(
        updated,
        format!("renamed {} to {}", render::short_id(&id), args.name),
    ))
}

fn set(ctx: &Ctx, args: &SetArgs) -> Result<Out> {
    let id = ctx.workflow_id(args.id.as_deref())?;
    let mut body = serde_json::Map::new();
    if let Some(description) = &args.description {
        body.insert(
            "description".into(),
            if description.is_empty() {
                Value::Null
            } else {
                json!(description)
            },
        );
    }
    if let Some(active) = args.active {
        body.insert("active".into(), json!(active));
    }
    if let Some(settings) = &args.settings {
        let parsed: Value = serde_json::from_str(settings)
            .map_err(|error| CliError::usage(format!("--settings is not valid JSON: {error}")))?;
        body.insert("settings".into(), parsed);
    }
    if body.is_empty() {
        return Err(CliError::usage(
            "nothing to set: pass --description, --active or --settings",
        ));
    }
    let updated = ctx.api.update_workflow(&id, Value::Object(body.clone()))?;

    if let Some((path, mut workflow)) = ctx.workflow_opt() {
        if workflow.id.map(|value| value.to_string()).as_deref() == Some(id.as_str()) {
            if let Some(description) = &args.description {
                workflow.description = if description.is_empty() {
                    None
                } else {
                    Some(description.clone())
                };
            }
            if let Some(active) = args.active {
                workflow.active = active;
            }
            if let Some(settings) = body.get("settings") {
                workflow.settings = Some(settings.clone());
            }
            project::save(&path, &mut workflow)?;
        }
    }

    Ok(Out::new(
        updated,
        format!(
            "updated {}: {}",
            render::short_id(&id),
            body.keys().cloned().collect::<Vec<_>>().join(", ")
        ),
    ))
}

fn delete(ctx: &Ctx, args: &DeleteArgs) -> Result<Out> {
    let (_, local) = match ctx.workflow_opt() {
        Some(pair) => (true, Some(pair.1)),
        None => (false, None),
    };
    let id = ctx.workflow_id(args.id.as_deref())?;
    let name = local
        .as_ref()
        .map(|workflow| workflow.name.clone())
        .unwrap_or_else(|| render::short_id(&id));
    confirm(&format!("Delete workflow '{name}' ({id})?"))?;
    let response = ctx.api.delete_workflow(&id)?;
    Ok(Out::new(response, format!("deleted workflow {id}")))
}

fn clone(ctx: &Ctx, args: &CloneArgs) -> Result<Out> {
    let mut copy = if args.local {
        let (_, workflow) = ctx.workflow()?;
        workflow
    } else {
        crate::commands::workflow_from_value(ctx.api.get_workflow(&args.id)?)?
    };

    copy.name = args.name.clone();
    copy.id = None;
    copy.is_frozen = false;
    copy.version = None;
    copy.owner_id = None;
    copy.created_at = None;
    copy.updated_at = None;
    for node in copy.nodes.iter_mut() {
        node.workflow_id = None;
    }
    for edge in copy.edges.iter_mut() {
        edge.workflow_id = None;
    }
    let (nodes, edges) = graph_edit::regenerate_ids(&mut copy);

    let path = ctx
        .file
        .clone()
        .unwrap_or_else(|| PathBuf::from(project::DEFAULT_FILE));
    if path.exists() {
        return Err(CliError::usage(format!(
            "{} already exists; pass --file elsewhere",
            path.display()
        )));
    }

    if args.local {
        project::save(&path, &mut copy)?;
        return Ok(Out::new(
            json!({ "path": path, "id": Value::Null, "nodes": nodes, "edges": edges }),
            format!(
                "cloned locally into {} with {nodes} node(s) and {edges} edge(s)\nrun \
                 `genalima workflow push` to create it",
                path.display()
            ),
        ));
    }

    let outcome = push(ctx, Some(&path), &mut copy, &PushOptions::default())?;
    let id = copy
        .id
        .map(|id| id.to_string())
        .unwrap_or_else(|| "?".to_string());
    Ok(Out::new(
        json!({ "id": id, "path": path, "network": outcome.created, "nodes": nodes, "edges": edges }),
        format!("cloned into {id} and {}", path.display()),
    ))
}

// --------------------------------------------------------------- local tools

fn fmt(ctx: &Ctx) -> Result<Out> {
    let (path, mut workflow) = ctx.workflow()?;
    let before = std::fs::read_to_string(&path).unwrap_or_default();
    let after = project::save(&path, &mut workflow)?;
    let changed = before != after;
    Ok(Out::new(
        json!({ "path": path, "changed": changed }),
        if changed {
            format!("rewrote {} in canonical order", path.display())
        } else {
            format!("{} was already canonical", path.display())
        },
    ))
}

fn diff(ctx: &Ctx, args: &IdArgs) -> Result<Out> {
    let (_, local) = ctx.workflow()?;
    let id = ctx.workflow_id(args.id.as_deref())?;
    let remote = crate::commands::workflow_from_value(ctx.api.get_workflow(&id)?)?;
    let lines = crate::diff::diff(&local, &remote);
    let human = if lines.is_empty() {
        "no differences: the server matches this file".to_string()
    } else {
        lines.join("\n")
    };
    Ok(Out::new(
        json!({
            "id": id,
            "differences": lines,
            "changed": !lines.is_empty(),
        }),
        human,
    ))
}

fn inputs(ctx: &Ctx) -> Result<Out> {
    let (_, workflow) = ctx.workflow()?;
    let skeleton = items::skeleton(&workflow);
    let contract = items::entry_contract(&workflow);
    let human = format!(
        "{}\n\n{}",
        crate::canonical::to_json_string(&Value::Array(skeleton.clone())).trim_end(),
        render::dim(&format!(
            "entry contract: {}",
            render::contract_summary(&contract)
        ))
    );
    Ok(Out::new(Value::Array(skeleton), human))
}

// ------------------------------------------------------------------- running

fn read_items(
    args: &ItemsArgs,
    workflow: Option<&WorkflowFile>,
    strict: bool,
) -> Result<Vec<Value>> {
    let sources = [
        args.items.is_some(),
        args.items_json.is_some(),
        !args.field.is_empty(),
    ]
    .iter()
    .filter(|present| **present)
    .count();
    if sources > 1 {
        return Err(CliError::usage(
            "pass only one of --items, --items-json or --field",
        ));
    }

    let parse = |text: &str| -> Result<Vec<Value>> {
        if strict {
            items::parse_items(text)
        } else {
            let value: Value = serde_json::from_str(text)
                .map_err(|error| CliError::usage(format!("could not parse items: {error}")))?;
            match value {
                Value::Array(items) => Ok(items),
                _ => Err(CliError::usage("Must be a JSON list of items.")),
            }
        }
    };

    if let Some(spec) = &args.items_json {
        return parse(spec);
    }
    if let Some(path) = &args.items {
        let text = if path == "-" {
            let mut text = String::new();
            std::io::Read::read_to_string(&mut std::io::stdin(), &mut text)?;
            text
        } else {
            std::fs::read_to_string(path).map_err(|error| {
                CliError::usage(format!("could not read items from {path}: {error}"))
            })?
        };
        return parse(&text);
    }
    if !args.field.is_empty() {
        let fields = parse_pairs(&args.field)?;
        let contract: Contract = workflow.map(items::entry_contract).unwrap_or_default();
        return Ok(vec![items::build_item(&fields, &contract)?]);
    }
    Ok(vec![json!({ "json": {} })])
}

fn run_command(ctx: &Ctx, args: &RunArgs) -> Result<Out> {
    let local = ctx.workflow_opt();
    let id = ctx.workflow_id(args.id.as_deref())?;

    let mut workflow: Option<WorkflowFile> = None;
    if let Some((path, mut file)) = local {
        if !args.no_save && file.id.is_some() {
            save_if_changed(ctx, &path, &mut file)?;
        }
        workflow = Some(file);
    } else if args.items.items.is_none()
        && args.items.items_json.is_none()
        && args.items.field.is_empty()
    {
        return Err(CliError::usage(
            "no workflow.json found here; pass --items, or --file to point at one",
        ));
    }

    let items = read_items(&args.items, workflow.as_ref(), true)?;
    let value = ctx.api.run_workflow(&id, Value::Array(items))?;
    let run = Run::from_value(&value).unwrap_or_default();

    let mut human = render::run_panel(&run, workflow.as_ref());
    if args.node_output {
        human.push_str(&format!(
            "\n\n{}",
            serde_json::to_string_pretty(&value).unwrap_or_default()
        ));
    }

    if run.status == "error" && !args.allow_failure {
        return Err(CliError::run_failed(
            run.error
                .clone()
                .unwrap_or_else(|| "the run failed".to_string()),
            Some(value),
        ));
    }

    Ok(Out::new(value, human))
}

fn test_node(ctx: &Ctx, args: &TestNodeArgs) -> Result<Out> {
    let id = ctx.workflow_id(args.id.as_deref())?;
    let local = ctx.workflow_opt();

    let node_id = if let Ok(uuid) = Uuid::parse_str(&args.node) {
        uuid
    } else {
        let from_local = local
            .as_ref()
            .and_then(|(_, workflow)| workflow.node_by_key(&args.node))
            .and_then(|node| node.id);
        match from_local {
            Some(id) => id,
            None => {
                let remote = crate::commands::workflow_from_value(ctx.api.get_workflow(&id)?)?;
                remote
                    .node_by_key(&args.node)
                    .and_then(|node| node.id)
                    .ok_or_else(|| {
                        CliError::not_found(format!("no node with key '{}'", args.node))
                    })?
            }
        }
    };

    if let Some((path, mut workflow)) = local {
        if workflow.id.is_some() && !args.no_save {
            save_if_changed(ctx, &path, &mut workflow)?;
        }
    }

    let workflow_ref = ctx.workflow_opt().map(|(_, workflow)| workflow);
    // The inspector's test tab accepts any JSON list, so this is lenient on
    // purpose; only the run dialog insists on a `json` object per item.
    let items = read_items(&args.items, workflow_ref.as_ref(), false)?;
    let value = ctx
        .api
        .run_node(&id, &node_id.to_string(), Value::Array(items))?;
    let run = Run::from_value(&value).unwrap_or_default();

    let mut human = render::run_panel(&run, workflow_ref.as_ref());
    if let Some(contract) = workflow_ref
        .as_ref()
        .and_then(|workflow| workflow.node_by_id(node_id))
        .map(|node| node.output.clone())
    {
        if let Some(node_run) = run.nodes.first() {
            let comparison = render::shape_comparison(&contract, &node_run.output_items);
            if !comparison.is_empty() {
                human.push_str(&format!("\n\n{}", comparison));
            }
        }
    }

    if run.status == "error" && !args.allow_failure {
        return Err(CliError::run_failed(
            run.error
                .clone()
                .unwrap_or_else(|| "the node failed".to_string()),
            Some(value),
        ));
    }
    Ok(Out::new(value, human))
}

fn runs(ctx: &Ctx, args: &RunsArgs) -> Result<Out> {
    let id = ctx.workflow_id(args.id.as_deref())?;
    let skip = (args.page.max(1) - 1) * args.limit.max(1);
    let value = ctx.api.list_runs(&id, skip, args.limit.max(1))?;
    let listing: crate::model::RunList = serde_json::from_value(value.clone()).unwrap_or_default();

    let rows: Vec<Vec<String>> = listing
        .data
        .iter()
        .map(|run| {
            vec![
                run.id
                    .map(|id| render::short_id(&id.to_string()))
                    .unwrap_or_default(),
                run.mode.clone(),
                render::status_label(&run.status),
                run.started_at
                    .as_deref()
                    .map(render::human_time)
                    .unwrap_or_else(|| "—".to_string()),
            ]
        })
        .collect();
    let human = if rows.is_empty() {
        "no runs yet\nrun one with `genalima workflow run`".to_string()
    } else {
        format!(
            "{}\n{} of {} run(s)",
            render::table(&["id", "mode", "status", "started"], &rows),
            listing.data.len(),
            listing.count
        )
    };
    Ok(Out::new(value, human))
}

fn log(ctx: &Ctx, args: &LogArgs) -> Result<Out> {
    let id = ctx.workflow_id(args.id.as_deref())?;
    let value = ctx.api.get_run(&id, &args.run_id)?;
    let mut run = Run::from_value(&value).unwrap_or_default();

    let workflow = ctx.workflow_for_id(&id);
    if let Some(key) = &args.node {
        let node_id = workflow
            .as_ref()
            .and_then(|workflow| workflow.node_by_key(key))
            .and_then(|node| node.id);
        match node_id {
            Some(node_id) => run.nodes.retain(|node| node.node_id == Some(node_id)),
            None => {
                run.nodes
                    .retain(|node| node.node_id.map(|id| id.to_string()) == Some(key.clone()));
            }
        }
    }

    if args.logs_only {
        let mut text = String::new();
        for node in &run.nodes {
            if let Some(logs) = &node.logs {
                text.push_str(logs);
                if !logs.ends_with('\n') {
                    text.push('\n');
                }
            }
        }
        return Ok(Out::raw(value, text));
    }

    let human = render::run_panel(&run, workflow.as_ref());
    Ok(Out::new(value, human))
}

// ------------------------------------------------------------------ publish

fn next_version(ctx: &Ctx, name: &str) -> Result<i64> {
    let needle = name.trim().to_lowercase();
    let mut highest = 0i64;
    let mut skip = 0i64;
    loop {
        let value = ctx.api.list_components(skip, 100)?;
        let page: crate::model::ComponentList = serde_json::from_value(value).unwrap_or_default();
        let received = page.data.len() as i64;
        for component in &page.data {
            if component.name.trim().to_lowercase() == needle {
                highest = highest.max(component.version);
            }
        }
        skip += received;
        if received < 100 || skip >= page.count {
            break;
        }
    }
    Ok(highest + 1)
}

fn publish(ctx: &Ctx, args: &PublishArgs) -> Result<Out> {
    let id = ctx.workflow_id(args.id.as_deref())?;
    let local = ctx.workflow_opt();

    let workflow = match local {
        Some((path, mut workflow)) => {
            if !args.no_save && workflow.id.is_some() {
                save_if_changed(ctx, &path, &mut workflow)?;
            }
            Some(workflow)
        }
        None => None,
    };

    // The boundary rule is checked locally first so a doomed publish costs no
    // round trip; the server still has the final say.
    if let Some(workflow) = &workflow {
        let problems: Vec<Problem> = local_problems(workflow, true)
            .into_iter()
            .filter(|problem| problem.scope == "publish")
            .collect();
        if !problems.is_empty() {
            return Err(CliError::invalid_local(
                "the graph cannot be published yet",
                display_problems(workflow, &problems),
            ));
        }
    }

    let name = args
        .name
        .clone()
        .or_else(|| workflow.as_ref().map(|workflow| workflow.name.clone()))
        .filter(|name| !name.trim().is_empty())
        .ok_or_else(|| {
            CliError::usage("no component name: pass --name, or name the workflow first")
        })?;

    let version = if args.version.trim().eq_ignore_ascii_case("auto") {
        next_version(ctx, &name)?
    } else {
        args.version
            .trim()
            .parse::<i64>()
            .map_err(|_| CliError::usage("--version must be an integer or 'auto'"))?
    };

    let description = args.description.clone().or_else(|| {
        workflow
            .as_ref()
            .and_then(|workflow| workflow.description.clone())
    });
    let release_notes = args.release_notes.clone();

    if args.dry_run {
        let human = format!(
            "dry run — nothing was published\n  name: {name}\n  version: {version}\n  \
             boundary: ok\n  server: {}",
            ctx.config.server
        );
        return Ok(Out::new(
            json!({
                "dry_run": true,
                "name": name,
                "version": version,
                "server": ctx.config.server,
            }),
            human,
        ));
    }

    let body = json!({
        "name": name,
        "version": version,
        "description": description,
        "release_notes": release_notes,
    });
    let component = ctx.api.publish(&id, body)?;

    Ok(Out::new(
        component,
        format!(
            "{} v{} is now available to your organization",
            name, version
        ),
    ))
}

// -------------------------------------------------------------- code editing

fn code(ctx: &Ctx, sub: &CodeSub) -> Result<Out> {
    match sub {
        CodeSub::List => {
            let (path, workflow) = ctx.workflow()?;
            let rows: Vec<Vec<String>> = workflow
                .nodes
                .iter()
                .map(|node| {
                    vec![
                        node.key.clone(),
                        node.name.clone(),
                        node.code.lines().count().to_string(),
                    ]
                })
                .collect();
            let human = if rows.is_empty() {
                format!("{} has no nodes", path.display())
            } else {
                render::table(&["key", "name", "lines"], &rows)
            };
            Ok(Out::new(
                json!({
                    "path": path,
                    "nodes": workflow.nodes.iter().map(|node| json!({
                        "key": node.key,
                        "name": node.name,
                        "lines": node.code.lines().count(),
                    })).collect::<Vec<_>>(),
                }),
                human,
            ))
        }
        CodeSub::Get(args) => {
            let (_, workflow) = ctx.workflow()?;
            let node = graph_edit::find_node(&workflow, &args.node)?;
            Ok(Out::raw(json!(node.code), node.code.clone()))
        }
        CodeSub::Set(args) => {
            let (path, mut workflow) = ctx.workflow()?;
            let text = read_code(&args.code_file, &args.code, args.stdin)?;
            graph_edit::set_node(
                &mut workflow,
                &args.node,
                SetNode {
                    name: None,
                    code: Some(text.clone()),
                    mode: None,
                    timeout: None,
                    on_error: None,
                    enforcement: None,
                    notes: None,
                    disabled: None,
                    position: None,
                    new_key: None,
                },
            )?;
            project::save(&path, &mut workflow)?;
            Ok(Out::new(
                json!({
                    "path": path,
                    "node": args.node,
                    "bytes": text.len(),
                    "lines": text.lines().count(),
                }),
                format!(
                    "replaced {} lines of code on {} in {}",
                    text.lines().count(),
                    args.node,
                    path.display()
                ),
            ))
        }
    }
}

// -------------------------------------------------------------- node editing

fn node(ctx: &Ctx, sub: &NodeSub) -> Result<Out> {
    match sub {
        NodeSub::Add(args) => node_add(ctx, args),
        NodeSub::Set(args) => node_set(ctx, args),
        NodeSub::Rm(args) => node_rm(ctx, args),
    }
}

fn node_add(ctx: &Ctx, args: &NodeAddArgs) -> Result<Out> {
    let (path, mut workflow) = ctx.workflow()?;
    let code = if args.code.is_some() || args.code_file.is_some() {
        Some(read_code(&args.code_file, &args.code, false)?)
    } else {
        None
    };
    let input = args
        .input
        .as_deref()
        .map(graph_edit::parse_contract)
        .transpose()?;
    let output = args
        .output
        .as_deref()
        .map(graph_edit::parse_contract)
        .transpose()?;
    let position = args.position.as_deref().map(parse_position).transpose()?;

    let key = graph_edit::add_node(
        &mut workflow,
        NewNode {
            key: args.key.clone(),
            name: args.name.clone(),
            code,
            mode: args.mode.clone(),
            timeout: args.timeout,
            on_error: args.on_error.clone(),
            enforcement: args.enforcement.clone(),
            input,
            output,
            position,
            notes: args.notes.clone(),
            disabled: args.disabled,
        },
    )?;
    project::save(&path, &mut workflow)?;
    Ok(Out::new(
        json!({ "path": path, "key": key, "nodes": workflow.nodes.len() }),
        format!(
            "added node {} ({}) to {}\nnext: `genalima workflow validate`",
            key,
            args.name,
            path.display()
        ),
    ))
}

fn node_set(ctx: &Ctx, args: &NodeSetArgs) -> Result<Out> {
    let (path, mut workflow) = ctx.workflow()?;
    let code = if args.code.is_some() || args.code_file.is_some() {
        Some(read_code(&args.code_file, &args.code, false)?)
    } else {
        None
    };
    let position = args.position.as_deref().map(parse_position).transpose()?;
    graph_edit::set_node(
        &mut workflow,
        &args.node,
        SetNode {
            name: args.name.clone(),
            code,
            mode: args.mode.clone(),
            timeout: args.timeout,
            on_error: args.on_error.clone(),
            enforcement: args.enforcement.clone(),
            notes: args.notes.clone(),
            disabled: args.disabled,
            position,
            new_key: args.key.clone(),
        },
    )?;
    project::save(&path, &mut workflow)?;
    Ok(Out::new(
        json!({ "path": path, "node": args.node }),
        format!("updated {} in {}", args.node, path.display()),
    ))
}

fn node_rm(ctx: &Ctx, args: &NodeKeyArgs) -> Result<Out> {
    let (path, mut workflow) = ctx.workflow()?;
    let removed = graph_edit::remove_node(&mut workflow, &args.node)?;
    project::save(&path, &mut workflow)?;
    Ok(Out::new(
        json!({ "path": path, "node": args.node, "edges_removed": removed }),
        format!(
            "removed node {} and {} edge(s) from {}",
            args.node,
            removed,
            path.display()
        ),
    ))
}

// -------------------------------------------------------------- edge editing

fn edge(ctx: &Ctx, sub: &EdgeSub) -> Result<Out> {
    match sub {
        EdgeSub::Add(args) => edge_add(ctx, args),
        EdgeSub::Rm(args) => edge_rm(ctx, args),
        EdgeSub::Map(args) => edge_map(ctx, args),
    }
}

fn edge_add(ctx: &Ctx, args: &EdgeAddArgs) -> Result<Out> {
    let (path, mut workflow) = ctx.workflow()?;
    let mapping: Vec<(String, String)> = parse_pairs(&args.mappings)?;
    graph_edit::add_edge(&mut workflow, &args.from, &args.to, None, args.auto_map)?;
    if !mapping.is_empty() {
        graph_edit::map_edge(
            &mut workflow,
            &args.from,
            &args.to,
            &mapping,
            &[],
            false,
            false,
        )?;
    }
    // Handles are not exposed by the UI, but the API accepts them.
    if args.source_handle != "main" || args.target_handle != "main" {
        let edge_id = graph_edit::find_edge(&workflow, &args.from, &args.to)?.id;
        for edge in workflow.edges.iter_mut().filter(|edge| edge.id == edge_id) {
            edge.source_handle = args.source_handle.clone();
            edge.target_handle = args.target_handle.clone();
        }
    }
    let mapping = graph_edit::find_edge(&workflow, &args.from, &args.to)?
        .mapping
        .clone();
    project::save(&path, &mut workflow)?;
    Ok(Out::new(
        json!({
            "path": path,
            "from": args.from,
            "to": args.to,
            "mapping": mapping,
        }),
        format!(
            "connected {} → {} with mapping {}",
            args.from,
            args.to,
            serde_json::to_string(&mapping).unwrap_or_default()
        ),
    ))
}

fn edge_rm(ctx: &Ctx, args: &EdgePairArgs) -> Result<Out> {
    let (path, mut workflow) = ctx.workflow()?;
    graph_edit::remove_edge(&mut workflow, &args.from, &args.to)?;
    project::save(&path, &mut workflow)?;
    Ok(Out::new(
        json!({ "path": path, "from": args.from, "to": args.to }),
        format!("removed the edge {} → {}", args.from, args.to),
    ))
}

fn edge_map(ctx: &Ctx, args: &EdgeMapArgs) -> Result<Out> {
    let (path, mut workflow) = ctx.workflow()?;
    let set = parse_pairs(&args.set)?;
    graph_edit::map_edge(
        &mut workflow,
        &args.from,
        &args.to,
        &set,
        &args.clear,
        args.clear_all,
        args.auto_map,
    )?;
    let mapping = graph_edit::find_edge(&workflow, &args.from, &args.to)?
        .mapping
        .clone();
    project::save(&path, &mut workflow)?;
    Ok(Out::new(
        json!({
            "path": path,
            "from": args.from,
            "to": args.to,
            "mapping": mapping,
        }),
        format!(
            "{} → {} mapping is now {}",
            args.from,
            args.to,
            serde_json::to_string(&mapping).unwrap_or_default()
        ),
    ))
}

// ---------------------------------------------------------- contract editing

fn contract(ctx: &Ctx, sub: &ContractSub) -> Result<Out> {
    match sub {
        ContractSub::Set(args) => contract_set(ctx, args),
        ContractSub::Field(args) => contract_field(ctx, args),
        ContractSub::Rm(args) => contract_rm(ctx, args),
        ContractSub::Rename(args) => contract_rename(ctx, args),
    }
}

fn contract_set(ctx: &Ctx, args: &ContractSetArgs) -> Result<Out> {
    let (path, mut workflow) = ctx.workflow()?;
    let contract: Contract = serde_json::from_str(&args.json)
        .map_err(|error| CliError::usage(format!("--json is not a valid contract: {error}")))?;
    let touched =
        graph_edit::set_contract(&mut workflow, &args.node, &args.side, contract.clone())?;
    project::save(&path, &mut workflow)?;
    Ok(Out::new(
        json!({ "path": path, "node": args.node, "side": args.side, "fields": contract.len(), "edges_remapped": touched }),
        format!(
            "{} {} contract on {} now has {} field(s){}",
            args.node,
            args.side,
            path.display(),
            contract.len(),
            if touched > 0 {
                format!("; remapped {touched} edge(s)")
            } else {
                String::new()
            }
        ),
    ))
}

fn contract_field(ctx: &Ctx, args: &ContractFieldArgs) -> Result<Out> {
    let (path, mut workflow) = ctx.workflow()?;
    let mut spec = crate::model::FieldSpec::typed(args.r#type.clone());
    spec.items = args.items.clone();
    spec.description = args.description.clone();
    if let Some(default) = &args.default {
        spec.default = serde_json::from_str(default)
            .map_err(|error| CliError::usage(format!("--default is not valid JSON: {error}")))?;
    }
    if let Some(required) = args.required {
        spec.required = Some(required);
    } else if !spec.default.is_null() {
        spec.required = Some(false);
    }
    if let Some(enum_values) = &args.r#enum {
        spec.enum_values = Some(serde_json::from_str(enum_values).map_err(|error| {
            CliError::usage(format!("--enum is not a valid JSON list: {error}"))
        })?);
    }
    let touched = graph_edit::change_field(
        &mut workflow,
        &args.node,
        &args.side,
        FieldChange {
            field: args.field.clone(),
            spec: Some(spec.clone()),
            remove: false,
        },
    )?;
    project::save(&path, &mut workflow)?;
    Ok(Out::new(
        json!({
            "path": path,
            "node": args.node,
            "side": args.side,
            "field": args.field,
            "spec": spec,
            "edges_remapped": touched,
        }),
        format!(
            "set {} {} field '{}' to {}",
            args.node,
            args.side,
            args.field,
            spec.describe()
        ),
    ))
}

fn contract_rm(ctx: &Ctx, args: &ContractRmArgs) -> Result<Out> {
    let (path, mut workflow) = ctx.workflow()?;
    let touched = graph_edit::change_field(
        &mut workflow,
        &args.node,
        &args.side,
        FieldChange {
            field: args.field.clone(),
            spec: None,
            remove: true,
        },
    )?;
    project::save(&path, &mut workflow)?;
    Ok(Out::new(
        json!({ "path": path, "node": args.node, "side": args.side, "field": args.field, "edges_remapped": touched }),
        format!(
            "removed {} {} field '{}'{}",
            args.node,
            args.side,
            args.field,
            if touched > 0 {
                format!("; dropped {touched} mapping(s)")
            } else {
                String::new()
            }
        ),
    ))
}

fn contract_rename(ctx: &Ctx, args: &ContractRenameArgs) -> Result<Out> {
    let (path, mut workflow) = ctx.workflow()?;
    let touched =
        graph_edit::rename_field(&mut workflow, &args.node, &args.side, &args.from, &args.to)?;
    project::save(&path, &mut workflow)?;
    Ok(Out::new(
        json!({ "path": path, "node": args.node, "side": args.side, "from": args.from, "to": args.to, "edges_remapped": touched }),
        format!(
            "renamed {} {} field '{}' to '{}'{}",
            args.node,
            args.side,
            args.from,
            args.to,
            if touched > 0 {
                format!("; followed in {touched} edge mapping(s)")
            } else {
                String::new()
            }
        ),
    ))
}
