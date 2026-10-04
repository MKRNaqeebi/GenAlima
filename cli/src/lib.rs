//! `genalima` — a command-line client for GenAlima typed Python workflows.
//!
//! The crate is a library plus a thin binary so the command layer can be tested
//! end to end: `tests/cli.rs` runs the real executable against a mock API, and
//! `tests/parity.rs` runs the shared fixtures in `tests/fixtures/parity/`
//! through [`validate`], the same fixtures the Python suite feeds to the server
//! rules.
//!
//! Reading order for a reviewer:
//!
//! * [`cli`] — the command surface;
//! * [`commands`] — behaviour, with `push` as the only graph writer;
//! * [`validate`] — the offline mirror of the server's graph rules;
//! * [`model`] + [`canonical`] — the `workflow.json` contract.

// The `schema` command builds one deep `serde_json::json!` document; the default
// macro recursion limit is not enough for it.
#![recursion_limit = "256"]

pub mod api;
pub mod auth;
pub mod canonical;
pub mod cli;
pub mod commands;
pub mod config;
pub mod diff;
pub mod error;
pub mod globals;
pub mod graph_edit;
pub mod insert;
pub mod items;
pub mod model;
pub mod project;
pub mod render;
pub mod validate;
