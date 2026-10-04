//! The command surface: clap derive structs and nothing else.
//!
//! Global flags are `global = true`, so they work before or after the
//! subcommand (`genalima --json workflow list` and
//! `genalima workflow list --json` are the same). Environment variables are
//! deliberately *not* wired here: `config.rs` owns the flag → env → project →
//! profile precedence so there is one place to read it.

use clap::{Args, Parser, Subcommand, ValueEnum};
use std::path::PathBuf;

#[derive(Parser, Debug)]
#[command(
    name = "genalima",
    version,
    about = "Create, edit, test, save and publish GenAlima typed Python workflows",
    long_about = "A command-line client for GenAlima.\n\n\
        It talks to the same /api/v1 surface the web editor uses, so it needs only a \
        server URL and a token. Everything it can do, the editor can do; a few things \
        (node notes, workflow settings, deleting a single-version component) it can do \
        that the editor cannot.\n\n\
        Agent contract:\n  \
        * with --json, stdout carries exactly one JSON envelope and nothing else;\n  \
        * exit codes are stable: 3 invalid local file, 4 unauthorized, 5 not found, \
        6 version conflict, 7 the server rejected the graph, 8 the workflow ran and failed;\n  \
        * prompts only happen on a TTY; use --yes for destructive commands.",
    after_help = "Examples:\n  \
        genalima login --email you@example.com\n  \
        genalima workflow init \"Daily report\"\n  \
        genalima workflow node add --key code_1 --name Fetch --input date:str\n  \
        genalima workflow validate\n  \
        genalima workflow push\n  \
        genalima workflow run --field date=2025-10-02\n  \
        genalima workflow publish --name \"Daily report\" --version auto"
)]
pub struct Cli {
    #[command(flatten)]
    pub global: GlobalArgs,

    #[command(subcommand)]
    pub command: Command,
}

#[derive(Args, Debug, Clone, Default)]
pub struct GlobalArgs {
    /// Base URL of the API, e.g. http://localhost:8000
    #[arg(long, global = true, value_name = "URL")]
    pub server: Option<String>,

    /// Bearer token. Prefer GENALIMA_TOKEN: a flag is visible in `ps`.
    #[arg(long, global = true, value_name = "JWT")]
    pub token: Option<String>,

    /// Config profile to use
    #[arg(long, global = true, value_name = "NAME")]
    pub profile: Option<String>,

    /// The workflow.json to operate on
    #[arg(long, global = true, value_name = "PATH")]
    pub file: Option<PathBuf>,

    /// Machine output: one JSON envelope on stdout
    #[arg(long, global = true)]
    pub json: bool,

    /// Suppress progress output
    #[arg(long, short, global = true)]
    pub quiet: bool,

    /// Trace requests (-v) and payloads (-vv)
    #[arg(long, short, global = true, action = clap::ArgAction::Count)]
    pub verbose: u8,

    /// Disable colour (also honours NO_COLOR)
    #[arg(long, global = true)]
    pub no_color: bool,

    /// Force colour even when stdout is not a terminal
    #[arg(long, global = true)]
    pub color: bool,

    /// Per-request timeout in seconds; 0 means no limit
    #[arg(long, global = true, value_name = "SECS")]
    pub timeout: Option<u64>,

    /// Assume yes for destructive prompts (required when stdin is not a TTY)
    #[arg(long, short = 'y', global = true)]
    pub yes: bool,
}

#[derive(Subcommand, Debug)]
pub enum Command {
    /// Log in and store a token for the active profile
    Login(LoginArgs),
    /// Forget the stored token (there is no server-side revocation)
    Logout,
    /// Show who the current token belongs to
    Whoami,
    /// Diagnose configuration, auth and server capabilities
    Doctor,
    /// Print the JSON Schema for workflow.json and the --json envelopes
    Schema(SchemaArgs),
    /// Print shell completions
    Completions(CompletionsArgs),
    /// Print the CLI and server versions
    Version,

    /// Work with workflows: create, edit, validate, save, run, publish
    #[command(subcommand)]
    Workflow(WorkflowSub),

    /// Work with published components
    #[command(subcommand)]
    Component(ComponentSub),

    /// Work with a workflow's environment variables (server support required)
    #[command(subcommand)]
    Variable(VariableSub),
}

impl Command {
    /// The stable command name that appears in the `--json` envelope.
    pub fn name(&self) -> String {
        match self {
            Command::Login(_) => "login".into(),
            Command::Logout => "logout".into(),
            Command::Whoami => "whoami".into(),
            Command::Doctor => "doctor".into(),
            Command::Schema(_) => "schema".into(),
            Command::Completions(_) => "completions".into(),
            Command::Version => "version".into(),
            Command::Workflow(sub) => format!("workflow.{}", sub.name()),
            Command::Component(sub) => format!("component.{}", sub.name()),
            Command::Variable(sub) => format!("variable.{}", sub.name()),
        }
    }
}

// --------------------------------------------------------------------- auth

#[derive(Args, Debug)]
pub struct LoginArgs {
    /// Email address
    #[arg(long, value_name = "EMAIL")]
    pub email: String,

    /// Read the password from stdin instead of prompting
    #[arg(long)]
    pub password_stdin: bool,
}

#[derive(Args, Debug)]
pub struct SchemaArgs {
    /// Which schema to print
    #[arg(value_enum, default_value_t = SchemaTarget::Workflow)]
    pub target: SchemaTarget,
}

#[derive(ValueEnum, Clone, Copy, Debug)]
pub enum SchemaTarget {
    Workflow,
    Envelope,
    All,
}

#[derive(Args, Debug)]
pub struct CompletionsArgs {
    /// Shell to generate for
    #[arg(value_enum)]
    pub shell: clap_complete::Shell,
}

// ----------------------------------------------------------------- workflows

#[derive(Subcommand, Debug)]
pub enum WorkflowSub {
    /// Scaffold workflow.json offline, with no server call
    Init(InitArgs),
    /// Create a workflow on the server and scaffold its file
    New(NewArgs),
    /// List your workflows
    List(ListArgs),
    /// Show a workflow's metadata, graph and boundaries
    Show(IdArgs),
    /// Download a workflow into workflow.json
    Pull(PullArgs),
    /// Save workflow.json to the server (the only command that writes a graph)
    Push(PushArgs),
    /// Check workflow.json offline against the server's rules
    Validate(ValidateArgs),
    /// Rename a workflow (metadata only)
    Rename(RenameArgs),
    /// Update description, active flag or settings
    Set(SetArgs),
    /// Delete a workflow
    Delete(DeleteArgs),
    /// Copy a workflow to a new one, with fresh node ids
    Clone(CloneArgs),
    /// Rewrite workflow.json in canonical order
    Fmt,
    /// Show what a push would change
    Diff(IdArgs),
    /// Print a trigger-item skeleton from the entry node's contract
    Inputs,
    /// Run the saved graph
    Run(RunArgs),
    /// Run one node against supplied items
    #[command(name = "test-node")]
    TestNode(TestNodeArgs),
    /// Run history, newest first
    Runs(RunsArgs),
    /// Show one run with every node's output, logs and error
    Log(LogArgs),
    /// Publish a component version
    Publish(PublishArgs),
    /// Read or replace one node's code
    #[command(subcommand)]
    Code(CodeSub),
    /// Add, change or remove a node
    #[command(subcommand)]
    Node(NodeSub),
    /// Add, change or remove an edge
    #[command(subcommand)]
    Edge(EdgeSub),
    /// Edit a node's input or output contract
    #[command(subcommand)]
    Contract(ContractSub),
}

impl WorkflowSub {
    pub fn name(&self) -> &'static str {
        match self {
            WorkflowSub::Init(_) => "init",
            WorkflowSub::New(_) => "new",
            WorkflowSub::List(_) => "list",
            WorkflowSub::Show(_) => "show",
            WorkflowSub::Pull(_) => "pull",
            WorkflowSub::Push(_) => "push",
            WorkflowSub::Validate(_) => "validate",
            WorkflowSub::Rename(_) => "rename",
            WorkflowSub::Set(_) => "set",
            WorkflowSub::Delete(_) => "delete",
            WorkflowSub::Clone(_) => "clone",
            WorkflowSub::Fmt => "fmt",
            WorkflowSub::Diff(_) => "diff",
            WorkflowSub::Inputs => "inputs",
            WorkflowSub::Run(_) => "run",
            WorkflowSub::TestNode(_) => "test-node",
            WorkflowSub::Runs(_) => "runs",
            WorkflowSub::Log(_) => "log",
            WorkflowSub::Publish(_) => "publish",
            WorkflowSub::Code(sub) => sub.name(),
            WorkflowSub::Node(sub) => sub.name(),
            WorkflowSub::Edge(sub) => sub.name(),
            WorkflowSub::Contract(sub) => sub.name(),
        }
    }
}

#[derive(ValueEnum, Clone, Copy, Debug, PartialEq)]
pub enum Template {
    /// No nodes, like the editor's "New workflow"
    Blank,
    /// One code node with the editor's default body
    Passthrough,
    /// A publishable entry + exit pair
    Component,
}

#[derive(Args, Debug)]
pub struct InitArgs {
    /// Workflow name
    #[arg(default_value = "Untitled workflow")]
    pub name: String,
    /// Starting shape
    #[arg(long, value_enum, default_value_t = Template::Blank)]
    pub template: Template,
    /// Description written into the file
    #[arg(long)]
    pub description: Option<String>,
    /// Overwrite an existing file
    #[arg(long)]
    pub force: bool,
}

#[derive(Args, Debug)]
pub struct NewArgs {
    /// Workflow name
    pub name: String,
    /// Description
    #[arg(long)]
    pub description: Option<String>,
    /// Starting shape
    #[arg(long, value_enum, default_value_t = Template::Blank)]
    pub template: Template,
    /// Create the workflow on the server but write no file
    #[arg(long)]
    pub no_file: bool,
}

#[derive(Args, Debug)]
pub struct ListArgs {
    /// Page size
    #[arg(long, default_value_t = 25)]
    pub limit: i64,
    /// Page number, starting at 1
    #[arg(long, default_value_t = 1)]
    pub page: i64,
    /// Walk every page
    #[arg(long)]
    pub all: bool,
    /// Filter fetched rows by name or description (client-side, like the editor)
    #[arg(long, value_name = "TEXT")]
    pub search: Option<String>,
    /// List workflow.json files in the working tree instead of the server
    #[arg(long)]
    pub local: bool,
}

#[derive(Args, Debug)]
pub struct IdArgs {
    /// Workflow id; defaults to the id in workflow.json
    pub id: Option<String>,
}

#[derive(Args, Debug)]
pub struct PullArgs {
    /// Workflow id; defaults to the id in workflow.json
    pub id: Option<String>,
    /// Overwrite a file that has local changes
    #[arg(long)]
    pub force: bool,
}

#[derive(Args, Debug)]
pub struct PushArgs {
    /// Workflow id; defaults to the id in workflow.json
    pub id: Option<String>,
    /// Print the requests and the diff without sending anything
    #[arg(long)]
    pub dry_run: bool,
    /// Assign fresh node and edge ids (use when the file was copied)
    #[arg(long)]
    pub regenerate_ids: bool,
    /// Save the graph but not the metadata
    #[arg(long)]
    pub no_metadata: bool,
    /// Push even when the offline validation finds problems
    #[arg(long)]
    pub force: bool,
}

#[derive(Args, Debug)]
pub struct ValidateArgs {
    /// Also check the publish boundary rule
    #[arg(long)]
    pub for_publish: bool,
    /// Print the topological execution order
    #[arg(long)]
    pub order: bool,
}

#[derive(Args, Debug)]
pub struct RenameArgs {
    /// Workflow id; defaults to the id in workflow.json
    pub id: Option<String>,
    /// New name
    #[arg(long, value_name = "NAME")]
    pub name: String,
}

#[derive(Args, Debug)]
pub struct SetArgs {
    /// Workflow id; defaults to the id in workflow.json
    pub id: Option<String>,
    /// New description
    #[arg(long)]
    pub description: Option<String>,
    /// Activate or deactivate
    #[arg(long, value_name = "BOOL")]
    pub active: Option<bool>,
    /// Settings as a JSON object
    #[arg(long, value_name = "JSON")]
    pub settings: Option<String>,
}

#[derive(Args, Debug)]
pub struct DeleteArgs {
    /// Workflow id; defaults to the id in workflow.json
    pub id: Option<String>,
}

#[derive(Args, Debug)]
pub struct CloneArgs {
    /// Source workflow id
    pub id: String,
    /// Name for the copy
    #[arg(long, value_name = "NAME")]
    pub name: String,
    /// Clone locally only; no server call
    #[arg(long)]
    pub local: bool,
}

#[derive(Args, Debug, Default)]
pub struct ItemsArgs {
    /// A file holding the items JSON, or - for stdin
    #[arg(long, value_name = "PATH")]
    pub items: Option<String>,
    /// Items JSON given inline
    #[arg(long, value_name = "JSON")]
    pub items_json: Option<String>,
    /// One item field; repeatable, typed by the entry node's contract
    #[arg(long, value_name = "KEY=VALUE")]
    pub field: Vec<String>,
}

#[derive(Args, Debug)]
pub struct RunArgs {
    /// Workflow id; defaults to the id in workflow.json
    pub id: Option<String>,
    #[command(flatten)]
    pub items: ItemsArgs,
    /// Run the saved graph, without pushing local changes first
    #[arg(long)]
    pub no_save: bool,
    /// Exit 0 even when the run fails
    #[arg(long)]
    pub allow_failure: bool,
    /// Include every node's output items
    #[arg(long)]
    pub node_output: bool,
}

#[derive(Args, Debug)]
pub struct TestNodeArgs {
    /// Node key (code_1) or node id
    pub node: String,
    /// Workflow id; defaults to the id in workflow.json
    #[arg(long)]
    pub id: Option<String>,
    #[command(flatten)]
    pub items: ItemsArgs,
    /// Run the saved node, without pushing local changes first
    #[arg(long)]
    pub no_save: bool,
    /// Exit 0 even when the node fails
    #[arg(long)]
    pub allow_failure: bool,
}

#[derive(Args, Debug)]
pub struct RunsArgs {
    /// Workflow id; defaults to the id in workflow.json
    pub id: Option<String>,
    /// Page size
    #[arg(long, default_value_t = 20)]
    pub limit: i64,
    /// Page number, starting at 1
    #[arg(long, default_value_t = 1)]
    pub page: i64,
}

#[derive(Args, Debug)]
pub struct LogArgs {
    /// Run id
    pub run_id: String,
    /// Workflow id; defaults to the id in workflow.json
    #[arg(long)]
    pub id: Option<String>,
    /// Only this node's key
    #[arg(long, value_name = "KEY")]
    pub node: Option<String>,
    /// Print only log text, for piping
    #[arg(long)]
    pub logs_only: bool,
}

#[derive(Args, Debug)]
pub struct PublishArgs {
    /// Workflow id; defaults to the id in workflow.json
    pub id: Option<String>,
    /// Component name; defaults to the workflow's name
    #[arg(long, value_name = "NAME")]
    pub name: Option<String>,
    /// Component version, or "auto" for the next free one
    #[arg(long, default_value = "auto", value_name = "N|auto")]
    pub version: String,
    /// Component description
    #[arg(long)]
    pub description: Option<String>,
    /// Release notes for this version
    #[arg(long)]
    pub release_notes: Option<String>,
    /// Publish the saved graph without pushing local changes first
    #[arg(long)]
    pub no_save: bool,
    /// Check the boundary rule and the version number without publishing
    #[arg(long)]
    pub dry_run: bool,
}

// ------------------------------------------------------------- code editing

#[derive(Subcommand, Debug)]
pub enum CodeSub {
    /// List node keys and names
    List,
    /// Print one node's code verbatim
    Get(CodeNodeArgs),
    /// Replace one node's code from a file, a string or stdin
    Set(CodeSetArgs),
}

impl CodeSub {
    pub fn name(&self) -> &'static str {
        match self {
            CodeSub::List => "code.list",
            CodeSub::Get(_) => "code.get",
            CodeSub::Set(_) => "code.set",
        }
    }
}

#[derive(Args, Debug)]
pub struct CodeNodeArgs {
    /// Node key
    pub node: String,
}

#[derive(Args, Debug)]
pub struct CodeSetArgs {
    /// Node key
    pub node: String,
    /// Read the code from this file
    #[arg(long, value_name = "PATH", conflicts_with = "code")]
    pub code_file: Option<PathBuf>,
    /// The code itself
    #[arg(long, value_name = "TEXT", conflicts_with = "code_file")]
    pub code: Option<String>,
    /// Read the code from stdin
    #[arg(long)]
    pub stdin: bool,
}

// -------------------------------------------------------------- node editing

#[derive(Subcommand, Debug)]
pub enum NodeSub {
    /// Add a code node
    Add(NodeAddArgs),
    /// Change a node's settings or code
    Set(NodeSetArgs),
    /// Remove a node and its edges
    Rm(NodeKeyArgs),
}

impl NodeSub {
    pub fn name(&self) -> &'static str {
        match self {
            NodeSub::Add(_) => "node.add",
            NodeSub::Set(_) => "node.set",
            NodeSub::Rm(_) => "node.rm",
        }
    }
}

#[derive(Args, Debug)]
pub struct NodeAddArgs {
    /// Node name
    #[arg(long, value_name = "NAME")]
    pub name: String,
    /// Node key; defaults to code_<n>
    #[arg(long, value_name = "KEY")]
    pub key: Option<String>,
    /// Python code, from a file
    #[arg(long, value_name = "PATH")]
    pub code_file: Option<PathBuf>,
    /// Python code, inline
    #[arg(long, value_name = "TEXT")]
    pub code: Option<String>,
    /// Execution mode
    #[arg(long, value_name = "MODE")]
    pub mode: Option<String>,
    /// Per-node timeout in seconds
    #[arg(long, value_name = "SECS")]
    pub timeout: Option<f64>,
    /// Error policy
    #[arg(long, value_name = "POLICY")]
    pub on_error: Option<String>,
    /// Type enforcement
    #[arg(long, value_name = "MODE")]
    pub enforcement: Option<String>,
    /// Input contract shorthand, e.g. "date:str,count:int=1"
    #[arg(long, value_name = "SPEC")]
    pub input: Option<String>,
    /// Output contract shorthand
    #[arg(long, value_name = "SPEC")]
    pub output: Option<String>,
    /// Canvas position as X,Y
    #[arg(long, value_name = "X,Y")]
    pub position: Option<String>,
    /// Mark the node disabled (items pass through)
    #[arg(long)]
    pub disabled: bool,
    /// Free-text note (the editor drops this; the API keeps it)
    #[arg(long, value_name = "TEXT")]
    pub notes: Option<String>,
}

#[derive(Args, Debug)]
pub struct NodeSetArgs {
    /// Node key
    pub node: String,
    /// New node key
    #[arg(long, value_name = "KEY")]
    pub key: Option<String>,
    /// New name
    #[arg(long, value_name = "NAME")]
    pub name: Option<String>,
    /// Replace the code from a file
    #[arg(long, value_name = "PATH")]
    pub code_file: Option<PathBuf>,
    /// Replace the code inline
    #[arg(long, value_name = "TEXT")]
    pub code: Option<String>,
    /// Execution mode
    #[arg(long, value_name = "MODE")]
    pub mode: Option<String>,
    /// Per-node timeout in seconds
    #[arg(long, value_name = "SECS")]
    pub timeout: Option<f64>,
    /// Error policy
    #[arg(long, value_name = "POLICY")]
    pub on_error: Option<String>,
    /// Type enforcement
    #[arg(long, value_name = "MODE")]
    pub enforcement: Option<String>,
    /// Free-text note
    #[arg(long, value_name = "TEXT")]
    pub notes: Option<String>,
    /// Disable or enable
    #[arg(long, value_name = "BOOL")]
    pub disabled: Option<bool>,
    /// Canvas position as X,Y
    #[arg(long, value_name = "X,Y")]
    pub position: Option<String>,
}

#[derive(Args, Debug)]
pub struct NodeKeyArgs {
    /// Node key
    pub node: String,
}

// -------------------------------------------------------------- edge editing

#[derive(Subcommand, Debug)]
pub enum EdgeSub {
    /// Connect two nodes
    Add(EdgeAddArgs),
    /// Remove a connection
    Rm(EdgePairArgs),
    /// Change an edge's field mapping
    Map(EdgeMapArgs),
}

impl EdgeSub {
    pub fn name(&self) -> &'static str {
        match self {
            EdgeSub::Add(_) => "edge.add",
            EdgeSub::Rm(_) => "edge.rm",
            EdgeSub::Map(_) => "edge.map",
        }
    }
}

#[derive(Args, Debug)]
pub struct EdgeAddArgs {
    /// Source node key
    #[arg(long, value_name = "KEY")]
    pub from: String,
    /// Target node key
    #[arg(long, value_name = "KEY")]
    pub to: String,
    /// A mapping pair TARGET=SOURCE; repeatable
    #[arg(long = "map", value_name = "TARGET=SOURCE")]
    pub mappings: Vec<String>,
    /// Map every same-named field (the editor's auto-map)
    #[arg(long)]
    pub auto_map: bool,
    /// Source handle
    #[arg(long, default_value = "main", value_name = "HANDLE")]
    pub source_handle: String,
    /// Target handle
    #[arg(long, default_value = "main", value_name = "HANDLE")]
    pub target_handle: String,
}

#[derive(Args, Debug)]
pub struct EdgePairArgs {
    /// Source node key
    #[arg(long, value_name = "KEY")]
    pub from: String,
    /// Target node key
    #[arg(long, value_name = "KEY")]
    pub to: String,
}

#[derive(Args, Debug)]
pub struct EdgeMapArgs {
    /// Source node key
    #[arg(long, value_name = "KEY")]
    pub from: String,
    /// Target node key
    #[arg(long, value_name = "KEY")]
    pub to: String,
    /// Set a pair TARGET=SOURCE; repeatable
    #[arg(long = "set", value_name = "TARGET=SOURCE")]
    pub set: Vec<String>,
    /// Drop the mapping for this target field; repeatable
    #[arg(long = "clear", value_name = "FIELD")]
    pub clear: Vec<String>,
    /// Drop every mapping on the edge
    #[arg(long)]
    pub clear_all: bool,
    /// Re-run auto-map after the other changes
    #[arg(long)]
    pub auto_map: bool,
}

// ---------------------------------------------------------- contract editing

#[derive(Subcommand, Debug)]
pub enum ContractSub {
    /// Replace one side of a contract from JSON
    Set(ContractSetArgs),
    /// Add or change a single field
    Field(ContractFieldArgs),
    /// Remove a field
    Rm(ContractRmArgs),
    /// Rename a field, following it through edge mappings
    Rename(ContractRenameArgs),
}

impl ContractSub {
    pub fn name(&self) -> &'static str {
        match self {
            ContractSub::Set(_) => "contract.set",
            ContractSub::Field(_) => "contract.field",
            ContractSub::Rm(_) => "contract.rm",
            ContractSub::Rename(_) => "contract.rename",
        }
    }
}

#[derive(Args, Debug)]
pub struct ContractSetArgs {
    /// Node key
    pub node: String,
    /// input or output
    pub side: String,
    /// The contract as JSON, e.g. {"q":{"type":"str"}}
    #[arg(long, value_name = "JSON")]
    pub json: String,
}

#[derive(Args, Debug)]
pub struct ContractFieldArgs {
    /// Node key
    pub node: String,
    /// input or output
    pub side: String,
    /// Field name
    pub field: String,
    /// Field type
    #[arg(long, value_name = "TYPE", default_value = "str")]
    pub r#type: String,
    /// Element type when --type is list
    #[arg(long, value_name = "TYPE")]
    pub items: Option<String>,
    /// Required
    #[arg(long, value_name = "BOOL")]
    pub required: Option<bool>,
    /// Default value as JSON
    #[arg(long, value_name = "JSON")]
    pub default: Option<String>,
    /// Description
    #[arg(long)]
    pub description: Option<String>,
    /// Allowed values as a JSON list
    #[arg(long, value_name = "JSON")]
    pub r#enum: Option<String>,
}

#[derive(Args, Debug)]
pub struct ContractRmArgs {
    /// Node key
    pub node: String,
    /// input or output
    pub side: String,
    /// Field name
    pub field: String,
}

#[derive(Args, Debug)]
pub struct ContractRenameArgs {
    /// Node key
    pub node: String,
    /// input or output
    pub side: String,
    /// Current field name
    pub from: String,
    /// New field name
    pub to: String,
}

// ---------------------------------------------------------------- components

#[derive(Subcommand, Debug)]
pub enum ComponentSub {
    /// List published component versions, newest first per name
    List(ComponentListArgs),
    /// Show one version's contract and metadata
    Show(ComponentRefArgs),
    /// Print or write the graph behind a version
    Graph(ComponentGraphArgs),
    /// Copy a version's nodes into workflow.json
    Insert(ComponentInsertArgs),
    /// Delete a component version
    Delete(ComponentDeleteArgs),
}

impl ComponentSub {
    pub fn name(&self) -> &'static str {
        match self {
            ComponentSub::List(_) => "list",
            ComponentSub::Show(_) => "show",
            ComponentSub::Graph(_) => "graph",
            ComponentSub::Insert(_) => "insert",
            ComponentSub::Delete(_) => "delete",
        }
    }
}

#[derive(Args, Debug)]
pub struct ComponentListArgs {
    /// Page size
    #[arg(long, default_value_t = 100)]
    pub limit: i64,
    /// Walk every page
    #[arg(long)]
    pub all: bool,
    /// Only versions whose name contains this text
    #[arg(long, value_name = "TEXT")]
    pub name: Option<String>,
}

#[derive(Args, Debug)]
pub struct ComponentRefArgs {
    /// Component id, or NAME or NAME@VERSION
    pub reference: String,
}

#[derive(Args, Debug)]
pub struct ComponentGraphArgs {
    /// Component id, or NAME or NAME@VERSION
    pub reference: String,
    /// Write a workflow.json with the snapshot graph
    #[arg(long, value_name = "PATH")]
    pub write: Option<PathBuf>,
}

#[derive(Args, Debug)]
pub struct ComponentInsertArgs {
    /// Component id, or NAME or NAME@VERSION
    pub reference: String,
    /// Top-left corner for the inserted copy, as X,Y
    #[arg(long, value_name = "X,Y")]
    pub at: Option<String>,
}

#[derive(Args, Debug)]
pub struct ComponentDeleteArgs {
    /// Component id, or NAME@VERSION
    pub id: String,
}

// ----------------------------------------------------------------- variables

#[derive(Subcommand, Debug)]
pub enum VariableSub {
    /// List a workflow's variable declarations (values are never returned)
    List(VariableListArgs),
    /// Create or update one variable
    Set(VariableSetArgs),
    /// Remove one variable
    Unset(VariableKeyArgs),
}

impl VariableSub {
    pub fn name(&self) -> &'static str {
        match self {
            VariableSub::List(_) => "list",
            VariableSub::Set(_) => "set",
            VariableSub::Unset(_) => "unset",
        }
    }
}

#[derive(Args, Debug)]
pub struct VariableListArgs {
    /// Workflow id; defaults to the id in workflow.json
    pub id: Option<String>,
}

#[derive(Args, Debug)]
pub struct VariableSetArgs {
    /// Variable name (an environment-variable name)
    pub key: String,
    /// Workflow id; defaults to the id in workflow.json
    #[arg(long)]
    pub id: Option<String>,
    /// Read the value from stdin
    #[arg(long)]
    pub value_stdin: bool,
    /// Read the value from an environment variable of this name
    #[arg(long, value_name = "ENV")]
    pub from_env: Option<String>,
    /// The value itself (lands in shell history; prefer --value-stdin)
    #[arg(long, value_name = "TEXT")]
    pub value: Option<String>,
    /// Mark as secret
    #[arg(long, value_name = "BOOL")]
    pub secret: Option<bool>,
    /// Require a value before a run may start
    #[arg(long, value_name = "BOOL")]
    pub required: Option<bool>,
    /// Description
    #[arg(long)]
    pub description: Option<String>,
}

#[derive(Args, Debug)]
pub struct VariableKeyArgs {
    /// Variable name
    pub key: String,
    /// Workflow id; defaults to the id in workflow.json
    #[arg(long)]
    pub id: Option<String>,
}
