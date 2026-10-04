//! Finding, reading and writing the local `workflow.json`.

use crate::canonical;
use crate::error::{CliError, Result};
use crate::model::WorkflowFile;
use serde_json::Value;
use std::path::{Path, PathBuf};

pub const DEFAULT_FILE: &str = "workflow.json";

/// Resolution order: `--file`, then `GENALIMA_WORKFLOW_FILE`, then
/// `workflow.json` in the working directory or any parent (`docs/cli-plan.md`
/// §5.4).
pub fn discover(explicit: Option<&Path>) -> Result<PathBuf> {
    if let Some(path) = explicit {
        return Ok(path.to_path_buf());
    }
    if let Some(path) = std::env::var_os(crate::config::ENV_WORKFLOW_FILE) {
        if !path.is_empty() {
            return Ok(PathBuf::from(path));
        }
    }
    let mut dir = std::env::current_dir().map_err(|error| {
        CliError::internal(format!("could not read the working directory: {error}"))
    })?;
    loop {
        let candidate = dir.join(DEFAULT_FILE);
        if candidate.is_file() {
            return Ok(candidate);
        }
        if !dir.pop() {
            break;
        }
    }
    Err(CliError::usage(format!(
        "no {DEFAULT_FILE} found; pass --file, or run `genalima workflow init`"
    )))
}

/// Resolve the file for a command that may also be given an explicit workflow
/// id. An id without a `--file` still needs the file when one exists, because
/// `run`/`publish` compare local and remote state.
pub fn discover_if_present(explicit: Option<&Path>) -> Option<PathBuf> {
    discover(explicit).ok()
}

pub fn load(path: &Path) -> Result<WorkflowFile> {
    let text = std::fs::read_to_string(path)
        .map_err(|error| CliError::usage(format!("could not read {}: {error}", path.display())))?;
    let value: Value = serde_json::from_str(&text).map_err(|error| {
        CliError::usage(format!("{} is not valid JSON: {error}", path.display()))
    })?;
    let workflow = WorkflowFile::from_value(value).map_err(|error| {
        CliError::usage(format!(
            "{} does not look like a workflow file: {error}",
            path.display()
        ))
    })?;
    Ok(workflow)
}

/// Write the canonical form and return the text that was written.
pub fn save(path: &Path, workflow: &mut WorkflowFile) -> Result<String> {
    canonical::canonicalize(workflow);
    let text = canonical::workflow_string(workflow)?;
    canonical::write_atomic(path, &text)?;
    Ok(text)
}

/// Every `workflow.json` under `root`, for `workflow list --local`.
pub fn find_local_files(root: &Path) -> Vec<PathBuf> {
    let mut found = Vec::new();
    collect(root, 0, &mut found);
    found.sort();
    found
}

fn collect(dir: &Path, depth: usize, found: &mut Vec<PathBuf>) {
    // Deep enough for a monorepo, shallow enough not to walk a checkout of the
    // whole world; `node_modules` and `.git` are skipped by name below.
    if depth > 6 {
        return;
    }
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if path.is_dir() {
            if matches!(
                name.as_str(),
                "node_modules" | ".git" | "target" | ".venv" | "venv" | "dist" | "__pycache__"
            ) {
                continue;
            }
            collect(&path, depth + 1, found);
        } else if name == DEFAULT_FILE {
            found.push(path);
        }
    }
}

/// Whether the local file's graph differs from the server's. Metadata is
/// compared separately so a rename does not look like a graph change.
pub fn graph_differs(local: &WorkflowFile, remote: &WorkflowFile) -> bool {
    let mut local = local.clone();
    let mut remote = remote.clone();
    canonical::canonicalize(&mut local);
    canonical::canonicalize(&mut remote);
    let left = serde_json::to_value(local.graph_payload()).unwrap_or(Value::Null);
    let right = serde_json::to_value(remote.graph_payload()).unwrap_or(Value::Null);
    left != right
}

pub fn metadata_differs(local: &WorkflowFile, remote: &WorkflowFile) -> bool {
    local.name != remote.name
        || local.description != remote.description
        || local.active != remote.active
        || local.settings != remote.settings
}

/// The workflow id to act on: the positional id if given, else the file's.
pub fn resolve_id(explicit: Option<&str>, workflow: Option<&WorkflowFile>) -> Result<String> {
    if let Some(id) = explicit {
        return Ok(id.to_string());
    }
    if let Some(workflow) = workflow {
        if let Some(id) = workflow.id {
            return Ok(id.to_string());
        }
    }
    Err(CliError::usage(
        "no workflow id: pass one, or push a workflow.json that has an id",
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::Node;

    #[test]
    fn discovery_walks_up_to_a_parent() {
        let dir = tempfile::tempdir().unwrap();
        let nested = dir.path().join("workflows/demo");
        std::fs::create_dir_all(&nested).unwrap();
        std::fs::write(nested.join(DEFAULT_FILE), "{}\n").unwrap();
        let found = discover(Some(&nested.join(DEFAULT_FILE))).unwrap();
        assert_eq!(found, nested.join(DEFAULT_FILE));
    }

    #[test]
    fn local_file_search_skips_noise_directories() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join("node_modules/pkg")).unwrap();
        std::fs::create_dir_all(dir.path().join("workflows/a")).unwrap();
        std::fs::write(dir.path().join("node_modules/pkg/workflow.json"), "{}").unwrap();
        std::fs::write(dir.path().join("workflows/a/workflow.json"), "{}").unwrap();
        let found = find_local_files(dir.path());
        assert_eq!(found.len(), 1);
        assert!(found[0].ends_with("workflows/a/workflow.json"));
    }

    #[test]
    fn a_graph_change_is_detected_but_a_rename_is_not() {
        let mut local = WorkflowFile::blank("Demo");
        local.nodes.push(Node::new("code_1", "Fetch", (0.0, 0.0)));
        let mut remote = local.clone();
        assert!(!graph_differs(&local, &remote));
        assert!(!metadata_differs(&local, &remote));

        remote.nodes[0].code = "result = []\n".to_string();
        assert!(graph_differs(&local, &remote));

        let mut renamed = local.clone();
        renamed.name = "Renamed".to_string();
        assert!(!graph_differs(&local, &renamed));
        assert!(metadata_differs(&local, &renamed));
    }

    #[test]
    fn ids_resolve_from_the_file() {
        let mut workflow = WorkflowFile::blank("Demo");
        workflow.id = Some(uuid::Uuid::new_v4());
        let id = resolve_id(None, Some(&workflow)).unwrap();
        assert_eq!(id, workflow.id.unwrap().to_string());
        assert!(resolve_id(None, Some(&WorkflowFile::blank("x"))).is_err());
        assert_eq!(resolve_id(Some("abc"), None).unwrap(), "abc");
    }
}
