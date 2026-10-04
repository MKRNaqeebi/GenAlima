//! Human-readable rendering. `--json` never uses this module.

use crate::globals;
use crate::model::{Contract, Run, WorkflowFile};
use serde_json::Value;
use std::collections::BTreeMap;
use uuid::Uuid;

// ------------------------------------------------------------------- colour

pub fn bold(text: &str) -> String {
    wrap("\u{1b}[1m", text)
}
pub fn dim(text: &str) -> String {
    wrap("\u{1b}[2m", text)
}
pub fn red(text: &str) -> String {
    wrap("\u{1b}[31m", text)
}
pub fn green(text: &str) -> String {
    wrap("\u{1b}[32m", text)
}
pub fn yellow(text: &str) -> String {
    wrap("\u{1b}[33m", text)
}

fn wrap(code: &str, text: &str) -> String {
    if globals::color() {
        format!("{code}{text}\u{1b}[0m")
    } else {
        text.to_string()
    }
}

// -------------------------------------------------------------------- table

/// A plain, aligned table. Cells must not contain colour codes, or the widths
/// go wrong — colour whole lines instead.
pub fn table(headers: &[&str], rows: &[Vec<String>]) -> String {
    if rows.is_empty() {
        return String::new();
    }
    let mut widths: Vec<usize> = headers.iter().map(|header| width(header)).collect();
    for row in rows {
        for (index, width) in widths.iter_mut().enumerate() {
            let cell = row.get(index).map(String::as_str).unwrap_or("");
            *width = (*width).max(self_width(cell));
        }
    }

    let mut out = String::new();
    out.push_str(&render_row(
        &headers
            .iter()
            .map(|header| header.to_string())
            .collect::<Vec<_>>(),
        &widths,
    ));
    out.push('\n');
    out.push_str(
        &widths
            .iter()
            .map(|width| "-".repeat(*width))
            .collect::<Vec<_>>()
            .join("  "),
    );
    for row in rows {
        out.push('\n');
        out.push_str(&render_row(row, &widths));
    }
    out
}

fn render_row(cells: &[String], widths: &[usize]) -> String {
    let mut parts = Vec::with_capacity(widths.len());
    for (index, width) in widths.iter().enumerate() {
        let cell = cells.get(index).map(String::as_str).unwrap_or("");
        let padding = width.saturating_sub(self_width(cell));
        parts.push(format!("{cell}{}", " ".repeat(padding)));
    }
    parts.join("  ").trim_end().to_string()
}

fn width(text: &str) -> usize {
    self_width(text)
}

fn self_width(text: &str) -> usize {
    text.chars().count()
}

// ------------------------------------------------------------------- runs

pub fn status_label(status: &str) -> String {
    match status {
        "success" => green("success"),
        "error" => red("error"),
        "skipped" => dim("skipped"),
        "running" => yellow("running"),
        "pending" => dim("pending"),
        other => other.to_string(),
    }
}

fn status_mark(status: &str) -> &'static str {
    match status {
        "success" => "✓",
        "error" => "✗",
        "skipped" => "–",
        "running" => "…",
        _ => "·",
    }
}

pub fn duration(ms: Option<i64>) -> String {
    match ms {
        None => "—".to_string(),
        Some(ms) if ms < 1000 => format!("{ms}ms"),
        Some(ms) => format!("{:.1}s", ms as f64 / 1000.0),
    }
}

/// The run panel as text: the run, then every node in execution order.
pub fn run_panel(run: &Run, workflow: Option<&WorkflowFile>) -> String {
    let mut out = String::new();
    let started = run
        .started_at
        .as_deref()
        .map(human_time)
        .unwrap_or_else(|| "—".to_string());
    out.push_str(&format!(
        "{} {}  {}\n",
        bold("run"),
        run.id
            .map(|id| short_id(&id.to_string()))
            .unwrap_or_else(|| "—".to_string()),
        dim(&format!(
            "{} · {} · started {}",
            run.mode,
            status_label(&run.status),
            started
        ))
    ));
    if let Some(error) = &run.error {
        out.push_str(&format!("{} {}\n", red("run error:"), error));
    }

    let names = node_names(workflow);
    if run.nodes.is_empty() {
        out.push_str(&dim("(no per-node results in this response)"));
        return out;
    }

    let rows: Vec<Vec<String>> = run
        .nodes
        .iter()
        .map(|node| {
            let id = node.node_id.unwrap_or_default();
            let name = names
                .get(&id)
                .cloned()
                .unwrap_or_else(|| short_id(&id.to_string()));
            vec![
                format!("{} {}", status_mark(&node.status), name),
                node.status.clone(),
                duration(node.duration_ms),
                node.output_items.len().to_string(),
            ]
        })
        .collect();
    out.push_str(&table(&["node", "status", "duration", "out"], &rows));
    out.push('\n');

    for node in &run.nodes {
        let id = node.node_id.unwrap_or_default();
        let name = names
            .get(&id)
            .cloned()
            .unwrap_or_else(|| short_id(&id.to_string()));
        if let Some(error) = &node.error {
            out.push_str(&format!("\n{} {}\n", red(&format!("{name}:")), error));
        }
        if let Some(logs) = &node.logs {
            if !logs.trim().is_empty() {
                out.push_str(&format!("\n{} {}\n", dim(&format!("{name} logs:")), ""));
                for line in logs.lines() {
                    out.push_str(&format!("  {line}\n"));
                }
            }
        }
        if !node.output_items.is_empty() {
            out.push_str(&format!("\n{} {}\n", dim(&format!("{name} output:")), ""));
            for line in serde_json::to_string_pretty(&node.output_items)
                .unwrap_or_default()
                .lines()
            {
                out.push_str(&format!("  {line}\n"));
            }
        }
    }
    out.trim_end().to_string()
}

pub fn node_names(workflow: Option<&WorkflowFile>) -> BTreeMap<Uuid, String> {
    let mut names = BTreeMap::new();
    if let Some(workflow) = workflow {
        for node in &workflow.nodes {
            if let Some(id) = node.id {
                names.insert(id, format!("{} ({})", node.key, node.name));
            }
        }
    }
    names
}

/// Declared-vs-observed output shape, the run panel's comparison table.
pub fn shape_comparison(contract: &Contract, items: &[Value]) -> String {
    let observed = observed_shape(items);
    let mut rows = Vec::new();
    for (field, spec) in contract {
        let seen = observed
            .get(field)
            .cloned()
            .unwrap_or_else(|| "missing".to_string());
        let declared = spec.describe();
        let marker = if seen == "missing" || seen.starts_with("null") {
            red("✗")
        } else if seen == declared || (declared == "float" && seen == "int") {
            green("✓")
        } else {
            yellow("!")
        };
        rows.push(vec![field.clone(), declared, seen, marker.to_string()]);
    }
    for (field, seen) in &observed {
        if !contract.contains_key(field) {
            rows.push(vec![
                field.clone(),
                "—".to_string(),
                seen.clone(),
                dim("+").to_string(),
            ]);
        }
    }
    if rows.is_empty() {
        return String::new();
    }
    table(&["field", "declared", "returned", ""], &rows)
}

fn observed_shape(items: &[Value]) -> BTreeMap<String, String> {
    let mut shape = BTreeMap::new();
    for item in items.iter().take(50) {
        if let Some(json) = item.get("json").and_then(Value::as_object) {
            for (key, value) in json {
                shape.entry(key.clone()).or_insert_with(|| type_name(value));
            }
        }
    }
    shape
}

pub fn type_name(value: &Value) -> String {
    match value {
        Value::Null => "null".to_string(),
        Value::Bool(_) => "bool".to_string(),
        Value::Number(number) if number.is_i64() || number.is_u64() => "int".to_string(),
        Value::Number(_) => "float".to_string(),
        Value::String(_) => "str".to_string(),
        Value::Array(_) => "list".to_string(),
        Value::Object(_) => "dict".to_string(),
    }
}

// ------------------------------------------------------------------ misc

pub fn short_id(id: &str) -> String {
    if id.len() > 8 {
        id[..8].to_string()
    } else {
        id.to_string()
    }
}

pub fn contract_summary(contract: &Contract) -> String {
    if contract.is_empty() {
        return "anything (no fields declared)".to_string();
    }
    contract
        .iter()
        .map(|(field, spec)| format!("{field}: {}", spec.describe()))
        .collect::<Vec<_>>()
        .join(", ")
}

pub fn optional(value: Option<&str>) -> String {
    match value {
        Some(text) if !text.is_empty() => text.to_string(),
        _ => "—".to_string(),
    }
}

/// Naive UTC timestamps are what the API returns; render them as an age when
/// parseable and pass them through when not.
pub fn human_time(text: &str) -> String {
    let Some(parsed) = parse_naive(text) else {
        return text.to_string();
    };
    let now = time::OffsetDateTime::now_utc();
    let delta = now - parsed;
    let seconds = delta.whole_seconds();
    if seconds < 0 {
        return format!("{text} (in the future)");
    }
    let relative = if seconds < 60 {
        format!("{seconds}s ago")
    } else if seconds < 3600 {
        format!("{}m ago", seconds / 60)
    } else if seconds < 86_400 {
        format!("{}h ago", seconds / 3600)
    } else {
        format!("{}d ago", seconds / 86_400)
    };
    format!("{text} ({relative})")
}

fn parse_naive(text: &str) -> Option<time::OffsetDateTime> {
    let prefix: String = text.chars().take(19).collect();
    let format = time::macros::format_description!("[year]-[month]-[day]T[hour]:[minute]:[second]");
    let parsed = time::PrimitiveDateTime::parse(&prefix, &format).ok()?;
    Some(parsed.assume_utc())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{Node, RunNode};
    use serde_json::json;

    fn sample_run() -> Run {
        Run {
            id: Some(Uuid::parse_str("c8e00000-0000-4000-8000-000000000001").unwrap()),
            status: "error".into(),
            mode: "manual".into(),
            started_at: Some("2025-10-02T09:12:44.511203".into()),
            nodes: vec![
                RunNode {
                    node_id: Some(Uuid::parse_str("3f2c0000-0000-4000-8000-000000000001").unwrap()),
                    status: "success".into(),
                    duration_ms: Some(12),
                    output_items: vec![json!({"json": {"rows": 3}})],
                    ..RunNode::default()
                },
                RunNode {
                    node_id: Some(Uuid::parse_str("9d470000-0000-4000-8000-000000000002").unwrap()),
                    status: "error".into(),
                    duration_ms: Some(3),
                    error: Some("KeyError: 'rows'".into()),
                    logs: Some("hello\n".into()),
                    ..RunNode::default()
                },
            ],
            ..Run::default()
        }
    }

    fn sample_workflow() -> WorkflowFile {
        let mut workflow = WorkflowFile::blank("Demo");
        let mut first = Node::new("code_1", "Fetch", (0.0, 0.0));
        first.id = Some(Uuid::parse_str("3f2c0000-0000-4000-8000-000000000001").unwrap());
        let mut second = Node::new("code_2", "Report", (0.0, 0.0));
        second.id = Some(Uuid::parse_str("9d470000-0000-4000-8000-000000000002").unwrap());
        workflow.nodes.push(first);
        workflow.nodes.push(second);
        workflow
    }

    #[test]
    fn tables_align_columns() {
        let rendered = table(
            &["key", "name"],
            &[
                vec!["code_1".into(), "Fetch".into()],
                vec!["code_20".into(), "A very long name".into()],
            ],
        );
        let lines: Vec<&str> = rendered.lines().collect();
        assert_eq!(lines.len(), 4);
        assert!(lines[1].starts_with("-------"));
        assert!(lines[2].starts_with("code_1 "));
    }

    #[test]
    fn an_empty_table_renders_nothing() {
        assert_eq!(table(&["a"], &[]), "");
    }

    #[test]
    fn a_run_panel_names_nodes_and_surfaces_failures() {
        let workflow = sample_workflow();
        let rendered = run_panel(&sample_run(), Some(&workflow));
        assert!(rendered.contains("code_1 (Fetch)"));
        assert!(rendered.contains("code_2 (Report)"));
        assert!(rendered.contains("KeyError: 'rows'"));
        assert!(rendered.contains("hello"));
    }

    #[test]
    fn shape_comparison_flags_a_missing_field() {
        let mut contract = Contract::new();
        contract.insert("rows".into(), crate::model::FieldSpec::typed("int"));
        contract.insert("note".into(), crate::model::FieldSpec::typed("str"));
        let rendered = shape_comparison(&contract, &[json!({"json": {"rows": 3}})]);
        assert!(rendered.contains("missing"));
        assert!(rendered.contains("rows"));
    }

    #[test]
    fn times_are_rendered_relative_when_parseable() {
        assert!(human_time("2025-10-02T09:12:44.511203").contains("ago"));
        assert_eq!(human_time("not a time"), "not a time");
    }
}
