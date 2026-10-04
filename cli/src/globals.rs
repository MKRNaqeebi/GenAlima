//! Process-wide output switches.
//!
//! The CLI is single-threaded in practice (`main` reads one command and runs
//! it), so these are atomics rather than a context threaded through every
//! function. The three rules they encode are the agent contract in
//! `docs/cli-plan.md` §7:
//!
//! * stdout carries data (or, with `--json`, exactly one envelope);
//! * every diagnostic goes to stderr;
//! * colour is off unless stdout is a terminal and `NO_COLOR` is unset.

use std::io::IsTerminal;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};

static JSON: AtomicBool = AtomicBool::new(false);
static QUIET: AtomicBool = AtomicBool::new(false);
static VERBOSE: AtomicUsize = AtomicUsize::new(0);
static COLOR: AtomicBool = AtomicBool::new(false);
static ASSUME_YES: AtomicBool = AtomicBool::new(false);
static SERVER: std::sync::OnceLock<String> = std::sync::OnceLock::new();

/// Remember the resolved server so the `--json` envelope can name it.
pub fn set_server(server: &str) {
    let _ = SERVER.set(server.to_string());
}

pub fn server() -> Option<String> {
    SERVER.get().cloned()
}

pub fn json_mode() -> bool {
    JSON.load(Ordering::Relaxed)
}

/// Turn on the envelope and force colour off; `--json` implies both.
pub fn set_json(on: bool) {
    JSON.store(on, Ordering::Relaxed);
    if on {
        COLOR.store(false, Ordering::Relaxed);
    }
}

pub fn quiet() -> bool {
    QUIET.load(Ordering::Relaxed)
}

pub fn set_quiet(on: bool) {
    QUIET.store(on, Ordering::Relaxed);
}

pub fn verbose() -> usize {
    VERBOSE.load(Ordering::Relaxed)
}

pub fn set_verbose(level: usize) {
    VERBOSE.store(level, Ordering::Relaxed);
}

pub fn color() -> bool {
    COLOR.load(Ordering::Relaxed)
}

pub fn assume_yes() -> bool {
    ASSUME_YES.load(Ordering::Relaxed)
}

pub fn set_assume_yes(on: bool) {
    ASSUME_YES.store(on, Ordering::Relaxed);
}

/// Resolve colour from the flags, the environment and the terminal.
pub fn init_color(force_no_color: bool, force_color: bool) {
    let env_no_color = std::env::var_os("NO_COLOR").is_some();
    let env_force = std::env::var_os("CLICOLOR_FORCE").is_some();
    let tty = std::io::stdout().is_terminal();
    let on = !json_mode() && !force_no_color && !env_no_color && (force_color || env_force || tty);
    COLOR.store(on, Ordering::Relaxed);
}

/// Progress and context: stderr, suppressed by `--quiet`.
pub fn note(message: &str) {
    if !quiet() {
        eprintln!("{message}");
    }
}

/// Warnings: always stderr, never suppressed.
pub fn warn(message: &str) {
    eprintln!("warning: {message}");
}

/// Request/response tracing, only with `-v`. The caller must have redacted
/// anything secret already.
pub fn debug(message: &str) {
    if verbose() > 0 {
        eprintln!("{message}");
    }
}

/// `-vv` tracing.
pub fn trace(message: &str) {
    if verbose() > 1 {
        eprintln!("{message}");
    }
}
