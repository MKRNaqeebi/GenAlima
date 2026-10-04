//! Published components: list, show, read the graph behind a version, insert it
//! into a local workflow, and delete a version.

use crate::cli::{
    ComponentDeleteArgs, ComponentGraphArgs, ComponentInsertArgs, ComponentListArgs,
    ComponentRefArgs, ComponentSub,
};
use crate::commands::{confirm, Ctx, Out};
use crate::error::{CliError, Result};
use crate::globals;
use crate::insert;
use crate::model::{Component, ComponentList, WorkflowFile};
use crate::project;
use crate::render;
use serde_json::{json, Value};
use std::path::PathBuf;
use uuid::Uuid;

pub fn run(ctx: &Ctx, sub: &ComponentSub) -> Result<Out> {
    match sub {
        ComponentSub::List(args) => list(ctx, args),
        ComponentSub::Show(args) => show(ctx, args),
        ComponentSub::Graph(args) => graph(ctx, args),
        ComponentSub::Insert(args) => insert_into_file(ctx, args),
        ComponentSub::Delete(args) => delete(ctx, args),
    }
}

/// Every published version the caller's organization can see.
fn fetch_all(ctx: &Ctx, limit: i64, all: bool) -> Result<Vec<Component>> {
    ctx.api.require_token()?;
    let page_size = if all { 100 } else { limit.max(1) };
    let mut components = Vec::new();
    let mut skip = 0i64;
    loop {
        let value = ctx.api.list_components(skip, page_size)?;
        let page: ComponentList = serde_json::from_value(value)
            .map_err(|error| CliError::internal(format!("unreadable component list: {error}")))?;
        let received = page.data.len() as i64;
        components.extend(page.data);
        skip += received;
        if !all || received < page_size || skip >= page.count {
            break;
        }
    }
    Ok(components)
}

/// `NAME`, `NAME@VERSION` or a uuid.
pub fn resolve(ctx: &Ctx, reference: &str) -> Result<Component> {
    if let Ok(id) = Uuid::parse_str(reference) {
        let value = ctx.api.get_component(&id.to_string())?;
        return Component::from_value(&value)
            .map_err(|error| CliError::internal(format!("unreadable component: {error}")));
    }

    let (name, version) =
        match reference.rsplit_once('@') {
            Some((name, version)) => (
                name,
                Some(version.parse::<i64>().map_err(|_| {
                    CliError::usage(format!("'{version}' is not a version number"))
                })?),
            ),
            None => (reference, None),
        };

    let wanted = name.trim().to_lowercase();
    let mut matches: Vec<Component> = fetch_all(ctx, 100, true)?
        .into_iter()
        .filter(|component| component.name.trim().to_lowercase() == wanted)
        .collect();
    if matches.is_empty() {
        return Err(
            CliError::not_found(format!("no component named '{name}' is visible to you"))
                .with_hint("run `genalima component list` to see what is published"),
        );
    }
    matches.sort_by_key(|component| component.version);
    let chosen = match version {
        Some(version) => matches
            .iter()
            .find(|component| component.version == version)
            .ok_or_else(|| {
                CliError::not_found(format!("{name} has no v{version}")).with_hint(format!(
                    "available versions: {}",
                    matches
                        .iter()
                        .map(|component| component.version.to_string())
                        .collect::<Vec<_>>()
                        .join(", ")
                ))
            })?,
        None => matches.last().expect("non-empty"),
    };
    Ok(chosen.clone())
}

fn list(ctx: &Ctx, args: &ComponentListArgs) -> Result<Out> {
    let mut components = fetch_all(ctx, args.limit, args.all)?;
    if let Some(filter) = &args.name {
        let needle = filter.to_lowercase();
        components.retain(|component| component.name.to_lowercase().contains(&needle));
    }
    components.sort_by(|a, b| {
        a.name
            .to_lowercase()
            .cmp(&b.name.to_lowercase())
            .then(b.version.cmp(&a.version))
    });

    let rows: Vec<Vec<String>> = components
        .iter()
        .map(|component| {
            vec![
                component.name.clone(),
                format!("v{}", component.version),
                component
                    .id
                    .map(|id| render::short_id(&id.to_string()))
                    .unwrap_or_default(),
                render::contract_summary(&component.input),
                render::optional(component.release_notes.as_deref()),
            ]
        })
        .collect();

    let human = if components.is_empty() {
        "no published components yet\nopen a workflow and run `genalima workflow publish`"
            .to_string()
    } else {
        let mut rendered = render::table(&["name", "version", "id", "input", "notes"], &rows);
        rendered.push_str(&format!("\n{} component version(s)", components.len()));
        rendered
    };

    Ok(Out::new(
        json!({ "data": components, "count": components.len() }),
        human,
    ))
}

fn show(ctx: &Ctx, args: &ComponentRefArgs) -> Result<Out> {
    let component = resolve(ctx, &args.reference)?;
    let human = format!(
        "{} {}\n{} {}\n{} {}\n{} {}\n{} {}\n{} {}\n{} {}\n{} {}",
        render::bold("name"),
        component.name,
        render::bold("version"),
        component.version,
        render::bold("id"),
        component.id.map(|id| id.to_string()).unwrap_or_default(),
        render::bold("owner"),
        render::optional(component.owner_id.map(|id| id.to_string()).as_deref()),
        render::bold("input"),
        render::contract_summary(&component.input),
        render::bold("output"),
        render::contract_summary(&component.output),
        render::bold("variables"),
        if component.variables.is_empty() {
            "none".to_string()
        } else {
            component
                .variables
                .keys()
                .cloned()
                .collect::<Vec<_>>()
                .join(", ")
        },
        render::bold("release notes"),
        render::optional(component.release_notes.as_deref())
    );
    Ok(Out::new(
        serde_json::to_value(&component).unwrap_or(Value::Null),
        human,
    ))
}

fn graph(ctx: &Ctx, args: &ComponentGraphArgs) -> Result<Out> {
    let component = resolve(ctx, &args.reference)?;
    let snapshot_id = component
        .snapshot_workflow_id
        .ok_or_else(|| CliError::internal("the component has no snapshot workflow"))?;
    let value = ctx.api.get_workflow(&snapshot_id.to_string())?;
    let mut snapshot = crate::commands::workflow_from_value(value.clone())?;

    if let Some(path) = &args.write {
        snapshot.id = Some(snapshot_id);
        snapshot.name = component.name.clone();
        if component.description.is_some() {
            snapshot.description = component.description.clone();
        }
        let text = project::save(path, &mut snapshot)?;
        globals::note(&format!(
            "wrote {} ({} nodes, {} bytes)",
            path.display(),
            snapshot.nodes.len(),
            text.len()
        ));
        globals::note(
            "note: this file's id is the frozen snapshot, so `workflow push` will refuse it",
        );
        return Ok(Out::new(
            json!({ "path": path, "id": snapshot_id, "nodes": snapshot.nodes.len() }),
            format!("wrote {}", path.display()),
        ));
    }

    let human = render_graph_summary(&snapshot, Some(&component.label()));
    Ok(Out::new(value, human))
}

fn render_graph_summary(snapshot: &WorkflowFile, caption: Option<&str>) -> String {
    let title = caption
        .map(str::to_string)
        .unwrap_or_else(|| format!("{} v{}", snapshot.name, snapshot.version.unwrap_or(1)));
    let mut out = format!(
        "{} {} \n",
        render::bold(&title),
        render::dim(if snapshot.is_frozen {
            "(read-only snapshot)"
        } else {
            ""
        })
    );
    let rows: Vec<Vec<String>> = snapshot
        .nodes
        .iter()
        .map(|node| {
            vec![
                node.key.clone(),
                node.name.clone(),
                render::contract_summary(&node.input),
                render::contract_summary(&node.output),
            ]
        })
        .collect();
    out.push_str(&render::table(&["key", "name", "input", "output"], &rows));
    if !snapshot.edges.is_empty() {
        out.push_str("\n\n");
        let edge_rows: Vec<Vec<String>> = snapshot
            .edges
            .iter()
            .map(|edge| {
                let from = snapshot
                    .node_by_id(edge.source_node_id)
                    .map(|node| node.key.clone())
                    .unwrap_or_else(|| render::short_id(&edge.source_node_id.to_string()));
                let to = snapshot
                    .node_by_id(edge.target_node_id)
                    .map(|node| node.key.clone())
                    .unwrap_or_else(|| render::short_id(&edge.target_node_id.to_string()));
                vec![
                    format!("{from} → {to}"),
                    serde_json::to_string(&edge.mapping).unwrap_or_default(),
                ]
            })
            .collect();
        out.push_str(&render::table(&["edge", "mapping"], &edge_rows));
    }
    out
}

fn insert_into_file(ctx: &Ctx, args: &ComponentInsertArgs) -> Result<Out> {
    let (path, mut workflow) = ctx.workflow()?;
    let component = resolve(ctx, &args.reference)?;
    let snapshot_id = component
        .snapshot_workflow_id
        .ok_or_else(|| CliError::internal("the component has no snapshot workflow"))?;
    let snapshot_value = ctx.api.get_workflow(&snapshot_id.to_string())?;
    let snapshot = crate::commands::workflow_from_value(snapshot_value)?;

    let nodes: Vec<Value> = snapshot
        .nodes
        .iter()
        .map(|node| serde_json::to_value(node).unwrap_or(Value::Null))
        .collect();
    let edges: Vec<Value> = snapshot
        .edges
        .iter()
        .map(|edge| serde_json::to_value(edge).unwrap_or(Value::Null))
        .collect();
    let origin = match &args.at {
        Some(text) => Some(crate::commands::parse_position(text)?),
        None => None,
    };

    let insertion =
        insert::insert_component(&mut workflow, &nodes, &edges, &component.name, origin)?;
    project::save(&path, &mut workflow)?;
    globals::note(&format!(
        "inserted {} node(s) and {} edge(s) from {}",
        insertion.nodes,
        insertion.edges,
        component.label()
    ));
    globals::note("run `genalima workflow validate` then `genalima workflow push`");

    Ok(Out::new(
        json!({
            "component": component.label(),
            "path": path,
            "nodes": insertion.nodes,
            "edges": insertion.edges,
            "keys": insertion.keys,
        }),
        format!(
            "inserted {} into {} as {}",
            component.label(),
            path.display(),
            insertion.keys.join(", ")
        ),
    ))
}

fn delete(ctx: &Ctx, args: &ComponentDeleteArgs) -> Result<Out> {
    let id = if let Ok(id) = Uuid::parse_str(&args.id) {
        id
    } else {
        resolve(ctx, &args.id)?
            .id
            .ok_or_else(|| CliError::internal("the component has no id"))?
    };
    confirm(&format!("Delete component version {id}?"))?;
    let response = ctx.api.delete_component(&id.to_string())?;
    Ok(Out::new(response, format!("deleted component {id}")))
}

/// Not a command: `--file` discovery for insertion, used by tests.
#[allow(dead_code)]
pub fn default_path() -> Option<PathBuf> {
    project::discover_if_present(None)
}
