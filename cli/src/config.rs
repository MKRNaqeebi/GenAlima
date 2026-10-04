//! Profiles, credential files and the flag → env → project → user precedence.
//!
//! Resolution never fails: a command that needs no server (`init`, `validate`,
//! `fmt`) must work with no config at all. Authentication is required lazily, by
//! the command that needs it, through [`crate::api::Api::require_token`].

use crate::error::{CliError, Result};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

pub const DEFAULT_SERVER: &str = "http://localhost:8000";
pub const DEFAULT_PROFILE: &str = "default";
pub const ENV_SERVER: &str = "GENALIMA_SERVER_URL";
pub const ENV_TOKEN: &str = "GENALIMA_TOKEN";
pub const ENV_PROFILE: &str = "GENALIMA_PROFILE";
pub const ENV_HOME: &str = "GENALIMA_HOME";
pub const ENV_TIMEOUT: &str = "GENALIMA_TIMEOUT";
pub const ENV_WORKFLOW_FILE: &str = "GENALIMA_WORKFLOW_FILE";
pub const PROJECT_FILE: &str = ".genalima.toml";

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ProfileEntry {
    #[serde(default)]
    pub server: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ConfigFile {
    #[serde(default)]
    pub default_profile: Option<String>,
    #[serde(default)]
    pub profiles: BTreeMap<String, ProfileEntry>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TokenEntry {
    #[serde(default)]
    pub token: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct CredentialsFile {
    #[serde(default)]
    pub profiles: BTreeMap<String, TokenEntry>,
}

/// The optional per-project pin. A token here would be committed, so it is
/// refused on read rather than ignored (`docs/cli-plan.md` §9.1).
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ProjectConfig {
    #[serde(default)]
    pub profile: Option<String>,
    #[serde(default)]
    pub server: Option<String>,
    #[serde(default)]
    pub token: Option<String>,
}

/// Flag-level overrides.
#[derive(Debug, Clone, Default)]
pub struct Overrides {
    pub server: Option<String>,
    pub token: Option<String>,
    pub profile: Option<String>,
    pub timeout: Option<u64>,
}

#[derive(Debug, Clone)]
pub struct Config {
    pub server: String,
    pub token: Option<String>,
    pub profile: String,
    pub base_dir: PathBuf,
    pub config_path: PathBuf,
    pub credentials_path: PathBuf,
    pub project_path: Option<PathBuf>,
    pub timeout: Option<u64>,
    pub server_source: String,
    pub token_source: String,
}

impl Config {
    pub fn resolve(overrides: &Overrides) -> Result<Self> {
        let base_dir = base_dir()?;
        let config_path = base_dir.join("config.toml");
        let credentials_path = base_dir.join("credentials.toml");
        let project_path = find_project_file();

        let project = match &project_path {
            Some(path) => read_project(path)?,
            None => ProjectConfig::default(),
        };
        if project.token.is_some() {
            return Err(CliError::usage(format!(
                "{} sets a token; a credential must never be committed. Use `genalima login` or \
                 the {} environment variable instead",
                project_path
                    .as_ref()
                    .map(|path| path.display().to_string())
                    .unwrap_or_else(|| PROJECT_FILE.to_string()),
                ENV_TOKEN
            )));
        }

        let user = read_config_file(&config_path);
        let credentials = read_credentials(&credentials_path);

        let profile = overrides
            .profile
            .clone()
            .or_else(|| env(ENV_PROFILE))
            .or_else(|| project.profile.clone())
            .or_else(|| user.default_profile.clone())
            .unwrap_or_else(|| DEFAULT_PROFILE.to_string());

        let (server, server_source) = if let Some(server) = overrides.server.clone() {
            (server, "--server".to_string())
        } else if let Some(server) = env(ENV_SERVER) {
            (server, ENV_SERVER.to_string())
        } else if let Some(server) = project.server.clone() {
            (server, PROJECT_FILE.to_string())
        } else if let Some(server) = user
            .profiles
            .get(&profile)
            .and_then(|entry| entry.server.clone())
        {
            (server, format!("config.toml [{profile}]"))
        } else {
            (DEFAULT_SERVER.to_string(), "default".to_string())
        };

        let (token, token_source) = if let Some(token) = overrides.token.clone() {
            (Some(token), "--token".to_string())
        } else if let Some(token) = env(ENV_TOKEN) {
            (Some(token), ENV_TOKEN.to_string())
        } else if let Some(token) = credentials
            .profiles
            .get(&profile)
            .and_then(|entry| entry.token.clone())
        {
            (Some(token), format!("credentials.toml [{profile}]"))
        } else {
            (None, "none".to_string())
        };

        let timeout = overrides
            .timeout
            .or_else(|| env(ENV_TIMEOUT).and_then(|value| value.parse().ok()));

        Ok(Self {
            server: server.trim_end_matches('/').to_string(),
            token,
            profile,
            base_dir,
            config_path,
            credentials_path,
            project_path,
            timeout,
            server_source,
            token_source,
        })
    }

    /// Store a token for the active profile with `0600` permissions.
    pub fn store_token(&self, token: &str) -> Result<PathBuf> {
        let mut credentials = read_credentials(&self.credentials_path);
        credentials
            .profiles
            .entry(self.profile.clone())
            .or_default()
            .token = Some(token.to_string());
        let text = toml::to_string_pretty(&credentials).map_err(|error| {
            CliError::internal(format!("could not serialise credentials: {error}"))
        })?;
        crate::canonical::write_atomic(&self.credentials_path, &text)?;
        restrict_permissions(&self.credentials_path)?;
        Ok(self.credentials_path.clone())
    }

    /// Remove the stored token. Returns whether one was there.
    pub fn clear_token(&self) -> Result<bool> {
        let mut credentials = read_credentials(&self.credentials_path);
        let removed = credentials
            .profiles
            .get_mut(&self.profile)
            .and_then(|entry| entry.token.take())
            .is_some();
        if removed {
            let text = toml::to_string_pretty(&credentials).map_err(|error| {
                CliError::internal(format!("could not serialise credentials: {error}"))
            })?;
            crate::canonical::write_atomic(&self.credentials_path, &text)?;
        }
        Ok(removed)
    }
}

/// `$GENALIMA_HOME`, else `~/.config/genalima` on every platform — a fixed,
/// predictable path so an agent can find or pre-seed it.
pub fn base_dir() -> Result<PathBuf> {
    if let Some(home) = env(ENV_HOME) {
        return Ok(PathBuf::from(home));
    }
    let home = dirs::home_dir()
        .ok_or_else(|| CliError::internal("could not determine the home directory"))?;
    Ok(home.join(".config").join("genalima"))
}

fn env(name: &str) -> Option<String> {
    match std::env::var(name) {
        Ok(value) if !value.trim().is_empty() => Some(value),
        _ => None,
    }
}

/// Search the working directory and its parents for `.genalima.toml`.
fn find_project_file() -> Option<PathBuf> {
    let mut dir = std::env::current_dir().ok()?;
    loop {
        let candidate = dir.join(PROJECT_FILE);
        if candidate.is_file() {
            return Some(candidate);
        }
        if !dir.pop() {
            return None;
        }
    }
}

fn read_project(path: &Path) -> Result<ProjectConfig> {
    let text = std::fs::read_to_string(path)?;
    toml::from_str(&text)
        .map_err(|error| CliError::usage(format!("{} is not valid TOML: {error}", path.display())))
}

fn read_config_file(path: &Path) -> ConfigFile {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|text| toml::from_str(&text).ok())
        .unwrap_or_default()
}

fn read_credentials(path: &Path) -> CredentialsFile {
    if !path.is_file() {
        return CredentialsFile::default();
    }
    check_permissions(path);
    std::fs::read_to_string(path)
        .ok()
        .and_then(|text| toml::from_str(&text).ok())
        .unwrap_or_default()
}

/// A group- or world-readable credential file is a real leak on a shared host.
/// Warn loudly; do not refuse, or a container with a loose umask could never
/// authenticate at all.
fn check_permissions(path: &Path) {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(metadata) = std::fs::metadata(path) {
            let mode = metadata.permissions().mode() & 0o777;
            if mode & 0o077 != 0 {
                crate::globals::warn(&format!(
                    "{} is readable by group/other (mode {:o}); run `chmod 600 {}`",
                    path.display(),
                    mode,
                    path.display()
                ));
            }
        }
    }
    #[cfg(not(unix))]
    {
        let _ = path;
    }
}

fn restrict_permissions(path: &Path) -> Result<()> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut permissions = std::fs::metadata(path)?.permissions();
        permissions.set_mode(0o600);
        std::fs::set_permissions(path, permissions)?;
    }
    #[cfg(not(unix))]
    {
        let _ = path;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_project_token_is_refused() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(PROJECT_FILE);
        std::fs::write(&path, "server = \"http://x\"\ntoken = \"secret\"\n").unwrap();
        let error = read_project(&path).and_then(|project| {
            if project.token.is_some() {
                Err(CliError::usage("token refused"))
            } else {
                Ok(project)
            }
        });
        assert!(error.is_err());
    }

    #[test]
    fn credentials_round_trip() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("credentials.toml");
        let mut credentials = CredentialsFile::default();
        credentials.profiles.entry("work".into()).or_default().token = Some("abc".into());
        let text = toml::to_string_pretty(&credentials).unwrap();
        std::fs::write(&path, text).unwrap();
        let parsed = read_credentials(&path);
        assert_eq!(
            parsed.profiles["work"].token.as_deref(),
            Some("abc"),
            "a stored token must be readable back"
        );
    }
}
