# GenAlima — CLI Plan

A first-class `genalima` command-line client, written in Rust, that lets any coding agent (or human)
do everything the web editor does to a workflow: create it, edit its graph, test it, save it, run it,
and publish it as a component version.

The guiding rule is **the API is the product**: the CLI is a thin, well-tested client of the existing
`/api/v1` surface. It adds no endpoints, holds no database credentials, and never re-implements
execution. Where the UI does work client-side (edge auto-mapping, contract renames, component
insertion, publish boundary checks), the CLI mirrors it deliberately and the mirror is pinned by a
shared fixture suite (§8.4).

---

## 1. Decisions taken (from review)

| Question               | Decision                                        | Consequence                                                                                                                                                                                   |
| ---------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Language / stack       | **Rust** (`rust-lang`)                          | One static binary, no Python/Node needed by the consumer. Costs a hand-written mirror of the client-side rules (§3, §8).                                                                      |
| How it reaches the app | **HTTP API only** (`/api/v1`)                   | Honours auth and permissions; works local _and_ remote; needs only a URL and a token. `cargo`/`rustc` are **not installed on this machine today** (§13.1).                                    |
| `deploy`               | **Skipped for now**                             | `push` + `publish` cover create/edit/test/save/publish. A `deploy` (apply-a-project) is sketched in §15.1 so the door stays open.                                                             |
| Local file format      | **A single `workflow.json` in exact API shape** | Zero translation on read; the server's canonical JSON _is_ the file. Costs readability for node code — mitigated by `workflow code get/set` (§5.6).                                           |
| Parity scope           | **Workflow lifecycle + auth**                   | Workflows, graph, contracts, runs, node tests, publish, components, variables, login/logout/whoami. Signup, password reset, user settings, admin users and organizations are deferred (§2.2). |

Two conventions this plan follows, copied from the existing plans in this directory:
every non-obvious choice gets a stated _why_, and every phase ends with something a reviewer can run.

---

## 2. Scope

### 2.1 In scope — the parity surface

Everything reachable from `/workflows`, `/workflow/$id` and `/components` in the web app, plus the
auth needed to reach it.

| UI capability (route)                                         | CLI equivalent                                        |
| ------------------------------------------------------------- | ----------------------------------------------------- | ----------------------------- | ---------------------------- | ------- |
| Sign in, sign out, session check                              | `login`, `logout`, `whoami`                           |
| List workflows, paginate, search the loaded page              | `workflow list`                                       |
| Create a workflow                                             | `workflow new` (server) / `workflow init` (offline)   |
| Open a workflow (hydrate graph)                               | `workflow show`, `workflow pull`                      |
| Rename via the header input                                   | `workflow rename`                                     |
| Delete via the row's trash button                             | `workflow delete`                                     |
| Add / move / delete code nodes                                | `workflow node add                                    | set                           | rm`, or edit `workflow.json` |
| Edit code (CodeMirror)                                        | `workflow code get                                    | set`, or edit `workflow.json` |
| Edit input/output contracts                                   | `workflow contract set                                | field                         | rm                           | rename` |
| Connect nodes, auto-map, per-field mapping                    | `workflow edge add                                    | rm                            | map`                         |
| Delete selection (`Del`)                                      | `workflow node rm`, `workflow edge rm`                |
| Node settings: mode, timeout, enforcement, on-error, disabled | `workflow node set`                                   |
| Issues button (type/coverage faults)                          | `workflow validate`                                   |
| Save / ⌘S                                                     | `workflow push`                                       |
| Run / ⌘↵ with trigger items, Fields or JSON view              | `workflow run`, `workflow inputs`                     |
| Test one node (inspector _test_ tab)                          | `workflow test-node`                                  |
| Run history picker; per-node output/input/logs                | `workflow runs`, `workflow log`                       |
| Publish dialog (name, version, notes, boundary preview)       | `workflow publish`                                    |
| List components, versions, `View code`                        | `component list`, `component show`, `component graph` |
| Delete a component version                                    | `component delete`                                    |
| Insert a component onto the canvas                            | `component insert`                                    |
| Environment variables (planned in the UI)                     | `variable list                                        | set                           | unset` (§6.5)                |

### 2.2 Deferred — full-parity backlog

The original ask was "whatever the UI can do, the CLI should do". These are the UI surfaces that are
deliberately _not_ in v1, each with the reason:

| Deferred                                             | Why                                                    | Cheap to add later                   |
| ---------------------------------------------------- | ------------------------------------------------------ | ------------------------------------ |
| Signup (`POST /users/signup`)                        | Self-service onboarding, not workflow work             | Trivial (`auth signup`)              |
| Password recovery / reset                            | Email round-trip; interactive by nature                | Trivial                              |
| User settings (profile, password)                    | Already covered by the admin API; not workflow work    | Easy (`user me`, `user password`)    |
| Admin user CRUD (`/admin`)                           | Needs superuser; the UI's _Edit user_ is itself a stub | Easy, behind `--yes`                 |
| Organizations CRUD                                   | No workflow depends on it                              | Easy                                 |
| Theme, panel widths, palette collapse, zoom, minimap | Browser-only state                                     | Not applicable                       |
| Landing page, marketing links                        | Not application surface                                | Not applicable                       |
| `Edit user` modal                                    | A placeholder in the UI with no API call               | Would be a _new_ feature, not parity |

The UI also has gaps the CLI **will not** copy (documented as intentional supersets):
single-version components cannot be deleted in the UI (`component delete` allows it);
node `notes` is dropped by the UI's save payload but round-trips through the API (`node set --notes`);
`active` and `settings` are writable through the API but have no UI (`workflow set`).

---

## 3. Why Rust, and the one thing it costs

Rust buys a single self-contained binary that runs on a bare agent container with no Python, Node or
venv, correct exit codes, and a parse-error-proof argument surface. The cost is real and worth naming:

> **The CLI cannot import `app.services.workflow`.** The graph rules (`graph.py`), the type checker
> (`types.py`), the publish boundary rule (`publish.py`) and the runner (`python_runner.py`) live in
> Python. A Rust CLI must mirror the _client-side_ subset — the same subset
> `frontend/src/components/Workflows/types.ts` already mirrors — and mirror drift is the main risk
> this plan spends effort on.

Mitigations, all of them load-bearing:

1. **The server stays the authority.** `workflow validate` is advisory. Every write goes to the
   server, and a rejected write is rendered as a first-class result, not an exception (§10.3).
2. **A shared fixture suite** (`cli/tests/fixtures/parity/*.json`) is consumed by _both_ the Rust
   tests and a new pytest module, so a rule change on either side fails a test on the other (§8.4).
3. **The mirror is one module** (`cli/src/validate.rs`) so it is auditable against `types.py` and
   `graph.py` in a single sitting, and it carries the server's exact message strings.

---

## 4. Architecture

```
stdin / flags / env / config.toml
        │
        ▼
  cli.rs  (clap derive: global flags + subcommands)  ──►  completions, schema, doctor
        │
        ▼
  config.rs ── resolve profile → (server_url, token)     credentials.toml (0600)
        │
        ▼
  commands/*  ── orchestration only: read file → call api → render → exit code
        │                    │
        │                    └──► validate.rs   (offline mirror, advisory)
        │                    └──► project.rs    (workflow.json read/write/canonicalise)
        │                    └──► graph_edit.rs (local node/edge/contract mutations)
        ▼
  api/*  (one module per route group: typed request + typed response + error mapping)
        │
        ▼
  reqwest/ureq ──► POST/GET/PUT/DELETE  /api/v1/...
        │
        ▼
  render.rs ── human tables (tabled) or the --json envelope (§7)
```

Four principles the code should be reviewed against:

1. **One writer.** Local commands (`init`, `node`, `edge`, `contract`, `code`, `component insert`)
   never touch the server. `push` is the only command that writes a graph. `run` and `publish` save
   first only when the local file differs from the server, exactly like the editor's `ensureSaved()`.
2. **The file is the API's JSON.** No bespoke on-disk schema, no YAML, no translation layer. `pull`
   writes what `GET /workflows/{id}` returned, modulo formatting and key order.
3. **`--json` is verbatim.** With `--json`, `data` is the server's response body unchanged (or a
   documented shape for locally computed results), wrapped in one envelope (§7.1).
4. **Fail closed.** Destructive commands need `--yes` when stdin is not a TTY. No secrets on a
   command line by default. No automatic retry of anything that re-runs a workflow.

---

## 5. The local workflow file

### 5.1 Shape

`workflow.json` is a `WorkflowDetailPublic`, exactly as `GET /api/v1/workflows/{id}` returns it
(`app/models.py:277`), with `id` nullable before the first push:

```json
{
  "active": true,
  "created_at": "2025-10-02T09:12:44.511203",
  "description": "Reads the daily CSV and posts a summary.",
  "edges": [
    {
      "id": "b0a1…",
      "mapping": { "rows": "rows" },
      "source_handle": "main",
      "source_node_id": "3f2c…",
      "target_handle": "main",
      "target_node_id": "9d47…",
      "workflow_id": "c8e0…"
    }
  ],
  "id": "c8e0…",
  "is_frozen": false,
  "name": "Daily report",
  "nodes": [
    {
      "code": "result = [{\"json\": {\"rows\": 3}}]\n",
      "disabled": false,
      "id": "3f2c…",
      "input": { "date": { "default": null, "required": true, "type": "str" } },
      "key": "code_1",
      "name": "Fetch",
      "notes": "Called by the scheduler.",
      "output": {
        "rows": { "default": null, "required": true, "type": "int" }
      },
      "parameters": {
        "language": "python",
        "mode": "runOnceForAllItems",
        "onError": "stopWorkflow",
        "timeout": 30
      },
      "position_x": 80,
      "position_y": 80,
      "type": "code",
      "type_enforcement": "strict",
      "type_version": 1,
      "workflow_id": "c8e0…"
    }
  ],
  "owner_id": "1a2b…",
  "settings": null,
  "updated_at": "2025-10-02T09:40:02.881744",
  "variables": [],
  "version": 3
}
```

### 5.2 Canonical formatting

`pull`, `init`, `node`, `edge`, `contract`, `code` and `component insert` all write through one
function, so the file is byte-stable:

- UTF-8, no BOM, two-space indent, one trailing newline, `\n` line endings.
- Object keys sorted alphabetically at every depth. `serde_json`'s default `Map` is a `BTreeMap`, so
  this is what you get as long as the `preserve_order` feature is **not** enabled — record that as a
  comment in `Cargo.toml`, because turning it on silently breaks diff stability.
- `nodes` sorted by `key`; `edges` by `(source_node_id, target_node_id)`. This matches the server's
  own `_load_graph` ordering (`workflows.py:120`), so a re-`pull` is a no-op.
- Writes are atomic: temp file in the same directory, then `rename(2)`.

The payoff: `pull && push` is a no-op, `git diff` after a re-pull is empty, and two agents editing
the same file produce mergeable diffs.

### 5.3 Server-owned fields

`id`, `owner_id`, `version`, `is_frozen`, `created_at`, `updated_at`, and every `workflow_id` on a
node or edge are **server-owned**. The CLI keeps them in the file (fidelity) and:

- ignores them when building a payload — `PUT /{id}/graph` receives only the
  `WorkflowNodeCreate` / `WorkflowEdgeCreate` fields, with `workflow_id` stripped;
- refuses to push a file whose `is_frozen` is true, or whose target is a snapshot (403), with the
  message _"published snapshots are read-only; publish a new version instead"_;
- never invents a `version` locally — after a push it writes back the `version` from the response.

### 5.4 Binding a file to a remote workflow

`id` in the file is the binding. Resolution order for every command that needs a workflow:

1. explicit positional id (`genalima workflow push 3f2c…`) — overrides the file;
2. `--file <path>` (or `GENALIMA_WORKFLOW_FILE`);
3. `workflow.json` in the current directory, then each parent directory;
4. otherwise: usage error 2 with _"no workflow.json found; pass --file or run `genalima workflow init`"_.

`workflow init` writes a file with `"id": null` so a project can be authored entirely offline; the
first `push` creates the remote workflow (`POST /workflows/`) and writes the returned `id` back.
Monorepos use one directory per workflow: `workflows/daily-report/workflow.json`; `workflow list
--local` walks the tree for `workflow.json` files and prints `path → id → name`.

### 5.5 The node-id trap

`PUT /{id}/graph` rejects a node id that already belongs to _another_ workflow
(`workflows.py:392`, `400 "node id … belongs to another workflow"`). This happens the moment someone
copies a `workflow.json` to start a new workflow, which is exactly what an agent will do. The CLI
therefore:

- documents the failure with node **keys and names** resolved, not bare uuids;
- offers `workflow push --regenerate-ids`, which assigns fresh uuids to every node and rewires every
  edge in one pass (the same transform as `plan_snapshot` in `publish.py`, applied locally);
- offers `workflow clone <id> --name "Copy"` which does `pull` → `--regenerate-ids` → `init`
  semantics in one step, i.e. _"Save as"_ for workflows.

### 5.6 Editing Python inside JSON

Code lives in the `code` string field, so a node body is a JSON string with `\n` escapes. That is
acceptable for an agent writing whole files, but hostile for iterative editing. Three escape hatches,
all local-only, none of them changing the format:

```bash
genalima workflow code list                       # code_1  Fetch
genalima workflow code get code_1                 # raw Python on stdout, pipe-safe
genalima workflow code get code_1 > node.py       # edit in a real editor
genalima workflow code set code_1 --file node.py  # write it back, escapes handled
genalima workflow code set code_1 -              # or from stdin
```

`code get` prints the raw string with no envelope and no trailing metadata, so `>` redirection and
`python -m py_compile` work. `code set` preserves every other field of the node.

---

## 6. Command surface

Binary name: **`genalima`** (crate `genalima-cli`, module directory `cli/`). Every command described
below maps to an endpoint in §10.1 or to local file work; nothing here needs a backend change.

### 6.0 Global flags (accepted by every command)

| Flag                      | Env                          | Purpose                                                                                                                                             |
| ------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--server <URL>`          | `GENALIMA_SERVER_URL`        | Base URL, e.g. `http://localhost:8000`. No `/api/v1` suffix.                                                                                        |
| `--profile <NAME>`        | `GENALIMA_PROFILE`           | Config profile (§9).                                                                                                                                |
| `--token <JWT>`           | `GENALIMA_TOKEN`             | Bearer token. Discouraged on the command line (visible in `ps`); env is the CI path.                                                                |
| `--file <PATH>`           | `GENALIMA_WORKFLOW_FILE`     | The `workflow.json` to operate on.                                                                                                                  |
| `--json`                  | —                            | Machine output: one JSON envelope on stdout (§7.1).                                                                                                 |
| `--quiet` / `-q`          | —                            | Suppress human chatter; errors still print.                                                                                                         |
| `--verbose` / `-v`, `-vv` | —                            | HTTP request/response lines with the `Authorization` header redacted.                                                                               |
| `--no-color`              | `NO_COLOR`, `CLICOLOR_FORCE` | Disable ANSI. Auto-disabled when stdout is not a TTY.                                                                                               |
| `--timeout <SECS>`        | `GENALIMA_TIMEOUT`           | Per-request timeout; `0` = no limit. Defaults by command (§10.4).                                                                                   |
| `--yes`                   | —                            | Assume yes for destructive prompts (required when stdin is not a TTY).                                                                              |
| `--dry-run`               | —                            | Print the requests that would be sent and exit 0 without sending. On `push`/`publish` also prints the local diff and the offline validation report. |

### 6.1 Auth

| Command                                                      | Endpoint                          | Notes                                                                                                                                                                                                                                 |
| ------------------------------------------------------------ | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `genalima login --email <E> [--password-stdin] [--server …]` | `POST /api/v1/login/access-token` | `application/x-www-form-urlencoded`, fields `username` + `password` (same as the UI). Prompts with a hidden read when stdin is a TTY and `--password-stdin` is absent. Stores the token in `credentials.toml` for the active profile. |
| `genalima logout`                                            | _none_                            | Removes the stored token only. The UI's logout is local-only too, and the API has no revocation endpoint — say so in the help text.                                                                                                   |
| `genalima whoami [--json]`                                   | `POST /api/v1/login/test-token`   | Prints email, id, superuser, organization, and token expiry (decoded locally, §9.3).                                                                                                                                                  |

`GENALIMA_TOKEN` takes precedence over any stored token, so CI and agents never need `login`:
obtain a token once, put it in the secret store, export it.

### 6.2 Workflows

| Command                                                                        | Endpoint(s)                                                                                         | Notes                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workflow init [NAME] [--file P] [--template blank\|passthrough\|component]`   | _none_                                                                                              | Offline scaffold: canonical file, `id: null`, fresh uuids. `blank` = no nodes (parity with the UI's create); `passthrough` = one node with the UI's `DEFAULT_CODE`; `component` = entry+exit pair with a mapped contract, immediately publishable.                      |
| `workflow new <NAME> [--description D] [--template …] [--file P]`              | `POST /workflows/` then `PUT /{id}/graph` if the template has nodes                                 | Server create, mirroring the list page's _New workflow_ (which lands in the editor). Writes the resulting file.                                                                                                                                                         |
| `workflow list [--limit N] [--page N] [--all] [--search S]`                    | `GET /workflows/?skip&limit`                                                                        | Default page size 25, like the UI. `--all` walks pages until `count`. `--search` filters **fetched** rows by name/description with the same case-insensitive rule as the UI's search box — documented as client-side, so `--search` without `--all` only sees one page. |
| `workflow show [ID] [--file P]`                                                | `GET /workflows/{id}`                                                                               | Metadata, version, boundary nodes, node/edge summary, last run. `--json` = the raw `WorkflowDetailPublic`.                                                                                                                                                              |
| `workflow pull [ID] [--file P] [--force]`                                      | `GET /workflows/{id}`                                                                               | Canonicalises and writes the file; creates parent directories. Refuses to clobber a file with local changes unless `--force` (compares against the last-pulled canonical form — see §6.7).                                                                              |
| `workflow push [ID] [--file P] [--dry-run] [--regenerate-ids] [--no-metadata]` | `PUT /{id}/graph`, then `PUT /{id}` if metadata changed; `POST /workflows/` first when `id` is null | The save. Graph first, metadata second, then rewrite the file from the responses. Validates locally first and refuses on a hard local failure unless `--force`.                                                                                                         |
| `workflow validate [--file P] [--for-publish] [--json]`                        | _none_                                                                                              | Offline mirror of the server's rules (§8). Exit 3 when faults are found. Never contacts the server — usable in a pre-commit hook with no credentials.                                                                                                                   |
| `workflow rename [ID] --name <N>`                                              | `PUT /{id}`                                                                                         | Metadata only, like the header input. Updates the file.                                                                                                                                                                                                                 |
| `workflow set [ID] [--description D] [--active true\|false] [--settings JSON]` | `PUT /{id}`                                                                                         | API capability with no UI; documented as a superset.                                                                                                                                                                                                                    |
| `workflow delete <ID> --yes`                                                   | `DELETE /{id}`                                                                                      | Prompts on a TTY, requires `--yes` otherwise.                                                                                                                                                                                                                           |
| `workflow clone <ID> --name <N> [--file P]`                                    | `GET /{id}` + `POST /workflows/`                                                                    | Fresh ids, new remote workflow, local file written.                                                                                                                                                                                                                     |
| `workflow fmt [--file P]`                                                      | _none_                                                                                              | Rewrites the file in canonical order (§5.2).                                                                                                                                                                                                                            |
| `workflow diff [--file P] [ID]`                                                | `GET /workflows/{id}`                                                                               | Local-vs-server diff: added/removed/changed nodes by `key`, edges by endpoint pair, contract and parameter changes. This is what makes `--dry-run` trustworthy.                                                                                                         |
| `workflow inputs [--file P] [--json]`                                          | _none_ (or `GET /{id}` for verify)                                                                  | Prints a ready-to-edit trigger skeleton derived from the entry node's declared input contract — the CLI's answer to the run dialog's _Fields_ view.                                                                                                                     |

### 6.3 Graph editing (local only, then `push`)

These mirror canvas actions exactly, including the UI's derived helpers. All of them rewrite
`workflow.json` atomically and set nothing on the server.

| Command                                                                                                                                                                                                | Mirrors                           | Notes                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `workflow node add --key K --name N [--code-file F\|--code-s C] [--mode M] [--timeout S] [--on-error E] [--enforcement strict\|warn\|off] [--input SPEC] [--output SPEC] [--position X,Y] [--notes T]` | palette _Python code_ + inspector | Defaults identical to `newCodeNode()` in `types.ts`: `type: "code"`, `type_version: 1`, `DEFAULT_CODE`, `runOnceForAllItems`, `30`, `stopWorkflow`, `strict`, grid position `80 + (i%4)*340, 80 + floor(i/4)*240`. `--key` defaults to the UI's `nextNodeKey` rule (`code_{max+1}`) so keys agree with the editor. |
| `workflow node set <KEY> [--name] [--code-file\|--code-s] [--mode] [--timeout] [--on-error] [--enforcement] [--disabled true\|false] [--notes] [--position X,Y]`                                       | inspector _settings_/_code_       | `--timeout` rejects `< 1` (the UI clamps to 30; the CLI is stricter and says so). `--notes` is the superset the UI drops.                                                                                                                                                                                          |
| `workflow node rm <KEY>`                                                                                                                                                                               | node trash / `Del`                | Removes the node and every edge touching it.                                                                                                                                                                                                                                                                       |
| `workflow edge add --from <KEY> --to <KEY> [--map TARGET=SOURCE …] [--auto-map] [--source-handle H] [--target-handle H]`                                                                               | drag-to-connect                   | Rejects self-connections (`graph.py:98`). `--auto-map` = `autoMapFields`: map every target input whose name also exists in the source output; with neither flag the mapping is `{}`.                                                                                                                               |
| `workflow edge rm --from <KEY> --to <KEY>`                                                                                                                                                             | edge trash / `Del`                | —                                                                                                                                                                                                                                                                                                                  |
| `workflow edge map --from <KEY> --to <KEY> [--set T=S …] [--clear T …] [--auto-map] [--clear-all]`                                                                                                     | edge inspector                    | Unknown field names are written as given and then reported by `validate` as dangling references, matching the UI's visible red state.                                                                                                                                                                              |
| `workflow contract set <KEY> <input\|output> --json '<contract>'`                                                                                                                                      | _Add field_ / whole panel         | Replaces the contract, then remaps edge mappings via the rename/removal rule (§8.2).                                                                                                                                                                                                                               |
| `workflow contract field <KEY> <input\|output> <FIELD> --type T [--required true\|false] [--default JSON] [--items T] [--description D] [--enum JSON]`                                                 | field row                         | `--required` with `--default` is rejected locally with the server's exact message (`models.py:336`).                                                                                                                                                                                                               |
| `workflow contract rm <KEY> <input\|output> <FIELD>`                                                                                                                                                   | remove-field                      | Drops mappings that referenced the field.                                                                                                                                                                                                                                                                          |
| `workflow contract rename <KEY> <input\|output> <OLD> <NEW>`                                                                                                                                           | field name input                  | Follows the rename through every edge mapping, like `remapEdgeAfterContractChange`.                                                                                                                                                                                                                                |

Spec syntax for `--input`/`--output` on `node add` is the server's own shorthand
(`models.py:499`): `--input 'q:str,n:int'`, `--output 'ok:bool=default:true'`; `list[str]` means
`type: "list", items: "str"`. The long form is always available through `contract field`.

### 6.4 Running and testing

| Command                                                                                                                                  | Endpoint                         | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workflow run [ID] [--file P] --items <FILE\|-> \| --items-json '<JSON>' \| --field k=v … [--no-save] [--allow-failure] [--node-output]` | `POST /{id}/run`                 | Default items `[{"json": {}}]` (the server's own default, `models.py:667`). `--field` builds one item and applies the UI's _Fields_ coercion rules (int/float/bool/enum/JSON) with the same messages. Saves first when the local file differs (§6.7) unless `--no-save`. Prints a per-node table: status, ms, first output line, error. Exit 8 when the run's status is `error` unless `--allow-failure`. `--node-output` adds each node's items as JSON. |
| `workflow test-node <KEY\|ID> [--items …] [--no-save] [--allow-failure]`                                                                 | `POST /{id}/nodes/{node_id}/run` | Accepts a node **key** (agents think in keys) and resolves it to the saved id via the local file, falling back to the server's graph. Mirrors the inspector's _test_ tab, including its looser input rule: items need only be a JSON array (the UI's test tab, unlike the run dialog, does not require a `json` object on each item).                                                                                                                     |
| `workflow runs [ID] [--limit N] [--page N] [--json]`                                                                                     | `GET /{id}/runs?skip&limit`      | Newest first, node results omitted (parity). Default limit 20.                                                                                                                                                                                                                                                                                                                                                                                            |
| `workflow log <RUN_ID> [ID] [--node <KEY>] [--logs-only] [--json]`                                                                       | `GET /{id}/runs/{run_id}`        | The run panel as text: status, duration, run-level error, then per-node status/duration/error/logs and declared-vs-observed output shape. `--logs-only` prints just the log text, concatenated, for piping.                                                                                                                                                                                                                                               |

Item sources are deliberately exclusive; supplying two is usage error 2. `--items -` reads stdin, so
an agent can pipe a JSON list without a temp file.

### 6.5 Publishing, components and variables

| Command                                                                                                                                  | Endpoint                                                         | Notes                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workflow publish [ID] [--file P] --name <N> [--version N\|auto] [--description D] [--release-notes R] [--no-save] [--dry-run] [--json]` | `POST /{id}/publish`                                             | Sends `graph` (with `--no-save`, sends none and publishes the saved graph) exactly like the dialog. `--version auto` (default) lists components, takes `max(version)+1` for the name case-insensitively, and falls back to 1. On 409 it prints the existing versions and `suggested_version` and exits 6. `--dry-run` runs the boundary check locally and reports the version that _would_ be used. |
| `component list [--limit N] [--all] [--name S] [--json]`                                                                                 | `GET /components/`                                               | Grouped by trimmed lowercased name, versions descending — the UI's `groupByName`.                                                                                                                                                                                                                                                                                                                   |
| `component show <ID\|NAME[@VERSION]>`                                                                                                    | `GET /components/{id}`                                           | Contract (`input`/`output`), variables manifest, owner, release notes. `NAME@VERSION` resolves through `component list`.                                                                                                                                                                                                                                                                            |
| `component graph <ID\|NAME[@VERSION]> [--json] [--write P]`                                                                              | `GET /components/{id}` → `GET /workflows/{snapshot_workflow_id}` | The UI's _View code_, as text or as a file. `--write` produces a valid `workflow.json` (its id points at the frozen snapshot, so `push` will refuse — by design, and the message says so).                                                                                                                                                                                                          |
| `component insert <ID\|NAME[@VERSION]> [--file P] [--at X,Y]`                                                                            | `GET /components/{id}` → `GET /workflows/{snapshot}`             | Mirrors `insertComponentGraph`: fresh uuids for nodes and edges, keys de-duplicated with `_2`/`_3`, positions offset so the copy's top-left sits at `--at`, single-node copies renamed to the component name, edges with missing endpoints dropped. Needs `--at` because there is no canvas; defaults to `max(x)+340, min(y)`.                                                                      |
| `component delete <ID> --yes`                                                                                                            | `DELETE /components/{id}`                                        | Allowed for single-version components (UI superset, §2.2).                                                                                                                                                                                                                                                                                                                                          |
| `variable list [ID] [--json]`                                                                                                            | `GET /workflows/{id}/variables`                                  | Declarations only — `key`, `is_secret`, `required`, `has_value`, `description`. There is no value field in the API, so there is none here.                                                                                                                                                                                                                                                          |
| `variable set <KEY> [--value-stdin \| --from-env KEY \| --value V] [--secret true\|false] [--required true\|false] [--description D]`    | `PUT /workflows/{id}/variables/{key}`                            | **Not yet implemented on the server** — see below. `--value-stdin` and `--from-env` are the recommended forms; `--value` warns that it lands in shell history and `ps`.                                                                                                                                                                                                                             |
| `variable unset <KEY> --yes`                                                                                                             | `DELETE /workflows/{id}/variables/{key}`                         | Same caveat.                                                                                                                                                                                                                                                                                                                                                                                        |

**Variable commands are capability-gated.** `WorkflowVariable` and its schemas exist
(`models.py:351`, commit `814c6e2`) but no routes are wired: `app/api/main.py` includes no variables
router, and `workflow-environment-variables-plan.md` §5 specifies the three endpoints as _planned_.
The CLI therefore probes `GET /api/v1/openapi.json` for `/workflows/{id}/variables` (cached per
profile in `~/.cache/genalima/capabilities.json`, keyed by server URL and spec hash) and, when they
are absent, exits 5 with:

```
variables are not available on this server yet
  server: http://localhost:8000
  see:    docs/workflow-environment-variables-plan.md §5, §12 (phased rollout)
```

This is a feature, not a workaround: the same probe powers `doctor`, so an agent can discover the
server's real surface instead of trusting a stale spec.

### 6.6 Meta commands

| Command                                              | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `genalima doctor [--json]`                           | The first command an agent should run: server URL and profile in effect, config/credential file paths, auth status, token expiry, `GET /utils/health-check/`, and a capability table (workflows/components/runs/variables present or missing) parsed from the live OpenAPI spec. Warnings for a stale token, a token that will expire within a day, a server whose spec lacks endpoints the CLI needs, and a `workflow.json` in the tree that is not canonical. |
| `genalima schema [workflow\|run\|component\|all]`    | JSON Schema for `workflow.json` and the `--json` envelopes, generated with `schemars`. Lets an agent write a valid file from scratch with no documentation.                                                                                                                                                                                                                                                                                                     |
| `genalima completions <bash\|zsh\|fish\|powershell>` | `clap_complete` output.                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `genalima man`                                       | Optional `clap_mangen` roff output (packaging phase).                                                                                                                                                                                                                                                                                                                                                                                                           |
| `genalima version`                                   | Semver, git sha, build target, and the server's version if reachable.                                                                                                                                                                                                                                                                                                                                                                                           |

### 6.7 "Save first" semantics (parity with `ensureSaved()`)

The UI saves the graph before running or testing a node, and always sends the canvas on publish. The
CLI cannot know "unsaved changes" from memory, so it compares:

1. build the canonical push payload from `workflow.json` (§5.3);
2. `GET /workflows/{id}` and canonicalise the graph the same way;
3. if they differ → `push` (reporting exactly what changed, via `workflow diff`), then continue;
4. `--no-save` skips step 3 and operates on the **saved** graph, which is what you want in CI when
   the file is not the source of truth.

Because the comparison is on canonicalised graphs, a re-`pull`ed file never triggers a spurious
push, and a `version` bump on the server never counts as a local change.

---

## 7. The agent contract

Agents need three things from a CLI: a stable machine-readable output, meaningful exit codes, and no
prompts. This section is the specification for all three, and it is what makes "any coding agent can
use it" true rather than aspirational.

### 7.1 `--json` output

With `--json`, **stdout carries exactly one JSON object and nothing else**, success or failure:

```json
{
  "ok": true,
  "command": "workflow.push",
  "data": { "id": "c8e0…", "version": 4 },
  "meta": {
    "server": "http://localhost:8000",
    "cli": "0.3.1",
    "duration_ms": 184
  }
}
```

```json
{
  "ok": false,
  "command": "workflow.push",
  "error": {
    "code": "remote_validation",
    "message": "incompatible connections",
    "detail": {
      "edges": [
        {
          "edge_id": "b0a1…",
          "reason": "field 'rows': source type is 'Any' (undeclared) and cannot be proven to satisfy 'int'"
        }
      ],
      "nodes": []
    },
    "hint": "run `genalima workflow validate` to see every fault at once"
  },
  "meta": { "server": "http://localhost:8000", "cli": "0.3.1" }
}
```

Rules:

- `data` is the **server's response body verbatim** wherever the command only relays the API
  ([`workflow list` → `{data, count}`], [`workflow run` → `WorkflowRunPublic`], …). Never a
  CLI-invented projection. For locally computed commands (`validate`, `diff`, `doctor`) `data` is a
  documented CLI shape, and `genalima schema` publishes it.
- Diagnostics, progress and warnings go to **stderr**, never stdout.
- `--json` implies `--no-color`, no spinners, no prompts (a command that would prompt fails with
  exit 2 and tells you which flag to pass), and no warnings on stdout.
- An error's `detail` is the parsed server body when there is one (`str`, `dict` or `list`), and
  `code` is the stable machine token from §7.2 — message text may change, codes may not.

### 7.2 Exit codes

| Code | Token               | Meaning                                                                                                                                                                          |
| ---- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | `ok`                | Success. For `run`, also "ran and the run's status is not `error`" (or `--allow-failure` was given).                                                                             |
| 1    | `internal`          | Unexpected: transport failure, 5xx, malformed response, bug.                                                                                                                     |
| 2    | `usage`             | Bad flags, missing required arguments, mutually exclusive options, a prompt that cannot be shown, no `--yes` on a destructive command. `clap`'s own code, kept.                  |
| 3    | `invalid_local`     | The local file failed the offline mirror (`validate`) or the pre-flight before `push`/`run`/`publish` (unless `--force`).                                                        |
| 4    | `unauthorized`      | 401/403: missing, expired or insufficiently privileged token; frozen snapshot; not enough permissions.                                                                           |
| 5    | `not_found`         | 404, and the "server lacks this capability" case (variables today).                                                                                                              |
| 6    | `conflict`          | 409: a published version already exists for that name. Carries `existing_versions` and `suggested_version`.                                                                      |
| 7    | `remote_validation` | 400 from the server: graph structure, incompatible connections, missing variables, publish boundaries. Carries `node_ids`/`edge_ids` or `edges`/`nodes` as the server sent them. |
| 8    | `run_failed`        | The request succeeded and the workflow or node **ran and failed** (status `error`). The distinction from 7 matters: 7 means it never ran.                                        |

Codes 3–8 are stable API for agents and get a test each.

### 7.3 Non-interactive rules

- Prompts only when `stdin` is a TTY; otherwise fail with exit 2 and the flag to pass.
- Destructive commands (`delete`, `unset`, `component delete`) require `--yes` when not a TTY.
- No command ever opens an editor or launches a browser.
- `workflow run` never streams interactively — it prints the finished run (the API is synchronous).
- Secrets are never accepted as positional arguments; `--value` exists but warns.

---

## 8. The offline mirror (`cli/src/validate.rs`)

`workflow validate` is the CLI's most-used command, because it is the one thing an agent can run
without a server, a token or a database. It must mirror the server exactly — a validator that
disagrees with the server is worse than none — so the mirror is specified here rule by rule, with
the server function and the exact message string each rule must produce.

### 8.1 Graph structure — mirror of `app/services/workflow/graph.py`

| Rule                              | Server location | Message                                                               |
| --------------------------------- | --------------- | --------------------------------------------------------------------- |
| Duplicate node id                 | `graph.py:61`   | `duplicate node id` (+ `node_ids`)                                    |
| Duplicate node key                | `graph.py:68`   | `duplicate node key '{key}'` (+ both `node_ids`)                      |
| Edge endpoint not in the node set | `graph.py:94`   | `edge references a node that is not part of the graph` (+ `edge_ids`) |
| Self-connection                   | `graph.py:99`   | `a node cannot be connected to itself` (+ `node_ids`, `edge_ids`)     |
| Cycle                             | `graph.py:133`  | `the graph contains a cycle` (+ the unplaced `node_ids`)              |

Kahn's algorithm with the queue seeded in node order and neighbours visited in edge order, so the
CLI's `--order` output and the run panel's ordering agree (`types.ts:executionOrder`).

### 8.2 Edge and coverage faults — mirror of `types.py`

Skipped entirely when the target is `disabled` or `type_enforcement == "off"` (`types.py:223`).

| Rule                                      | Message                                                                                 |
| ----------------------------------------- | --------------------------------------------------------------------------------------- |
| Mapping names an undeclared target input  | `mapping names input field '{f}', which the target does not declare`                    |
| Mapping reads an undeclared source output | `maps input '{t}' from '{s}', which the source does not declare`                        |
| `Any` source into a typed target          | `field '{f}': source type is 'Any' (undeclared) and cannot be proven to satisfy '{to}'` |
| Type mismatch (int→float allowed)         | `field '{f}': source declares '{from}', target expects '{to}'`                          |
| List item mismatch                        | `field '{f}': source list items are {a} but target expects '{b}'`                       |
| Required target fed by optional source    | `field '{f}' is required by the target but optional in the source`                      |
| One input two inbound edges               | `input field '{f}' is provided by more than one incoming edge`                          |
| Unmapped required input                   | `required input field '{f}' is not mapped from any upstream node`                       |

Reporting shape matches `check_graph`: per-edge faults under `edges` (`edge_id`, joined `reason`), and
coverage faults under `nodes` (`node_id`, `reason`). Entry nodes are exempt from coverage
(no inbound edge → inputs come from the trigger items), as on the server.

### 8.3 Publish boundaries — mirror of `publish.py:publish_shape`

| Rule                  | Message                                                                           |
| --------------------- | --------------------------------------------------------------------------------- |
| Empty graph           | `a workflow needs at least one node before it can be published`                   |
| Not exactly one entry | `a workflow must have exactly one entry node (nothing flows into it), found {n}`  |
| Not exactly one exit  | `a workflow must have exactly one exit node (nothing flows out of it), found {n}` |

### 8.4 Field specs and local edits

- Type vocabulary is closed: `str, int, float, bool, list, dict, datetime, Any`
  (`models.py:ALLOWED_FIELD_TYPES`); `items` is validated only when `type == "list"`.
- `required` resolution: unset → `default is None`; `required: true` with a default → rejected with
  `field of type '{t}' has a default and cannot be required` (`models.py:336`).
- Contract rename/removal remaps edge mappings: renames are followed, removed fields drop their
  mappings, and an ambiguous change (unequal counts of added and removed keys) is treated as
  removals only so a stale reference surfaces instead of silently rewiring
  (`types.ts:diffContract`, `remapEdgeAfterContractChange`).
- Component insertion: fresh uuids, `_2`-suffixed duplicate keys, offsets, single-node rename, edges
  to missing endpoints dropped (`types.ts:insertComponentGraph`).
- Trigger items: `parseTriggerItems` — a JSON **list** whose every element is a non-null object with
  an object `json`; messages `Must be a JSON list of items.` / `Item {i} needs a "json" object.`
  (`types.ts:parseTriggerItems`).
- `--field` coercion mirrors the dialog's _Fields_ rules: integer for `int` (`Expected an integer,
got …`), number for `float`, `true/false` for `bool`, membership for `enum`, JSON plus a type check
  for `list`/`dict`/`Any`, `This field is required.` for an empty required cell.

### 8.5 Parity fixtures — the anti-drift mechanism

`cli/tests/fixtures/parity/` holds one JSON file per case:

```json
{
  "name": "required input not mapped",
  "nodes": [
    {
      "id": "3f2c0000-0000-4000-8000-000000000001",
      "key": "code_1",
      "name": "Fetch",
      "type": "code",
      "type_version": 1,
      "position_x": 80,
      "position_y": 80,
      "disabled": false,
      "code": "result = []\n",
      "input": {},
      "output": {
        "rows": { "type": "int", "required": true, "default": null }
      },
      "type_enforcement": "strict",
      "parameters": {
        "language": "python",
        "mode": "runOnceForAllItems",
        "timeout": 30,
        "onError": "stopWorkflow"
      },
      "notes": null
    },
    {
      "id": "9d470000-0000-4000-8000-000000000002",
      "key": "code_2",
      "name": "Publish",
      "type": "code",
      "type_version": 1,
      "position_x": 420,
      "position_y": 80,
      "disabled": false,
      "code": "result = items\n",
      "input": { "rows": { "type": "int", "required": true, "default": null } },
      "output": {},
      "type_enforcement": "strict",
      "parameters": {
        "language": "python",
        "mode": "runOnceForAllItems",
        "timeout": 30,
        "onError": "stopWorkflow"
      },
      "notes": null
    }
  ],
  "edges": [
    {
      "id": "b0a10000-0000-4000-8000-000000000003",
      "source_node_id": "3f2c0000-0000-4000-8000-000000000001",
      "target_node_id": "9d470000-0000-4000-8000-000000000002",
      "source_handle": "main",
      "target_handle": "main",
      "mapping": {}
    }
  ],
  "expect": {
    "valid": false,
    "edges": [],
    "nodes": [
      {
        "node_id": "9d470000-0000-4000-8000-000000000002",
        "reason": "required input field 'rows' is not mapped from any upstream node"
      }
    ]
  }
}
```

The two node ids above are deterministic, hand-written UUIDs so the expectation is readable and a
diff of the fixture is meaningful; `genalima` generates real v4 ids at runtime.

- The Rust suite (`cli/tests/parity.rs`) loads every case, runs `validate.rs`, and asserts the
  verdict and the exact strings.
- A new pytest module (`app/tests/test_cli_parity.py`) loads **the same files** and asserts that
  `validate_and_order`, `check_graph` and `publish_shape` produce the same verdicts. The fixture
  directory path is the only coupling, injected by an env var with a repo-relative default.
- Cases are added whenever the server's rules change; a rule change without a fixture is caught in
  review by the fact that both suites must pass.

This is the cheapest available substitute for sharing code across the language boundary, and it is
why the plan can accept the Rust decision without hand-waving the risk.

---

## 9. Configuration and credentials

### 9.1 Files

| Path                                          | Purpose                                                                                                                                           | Mode                                                                     |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `$GENALIMA_HOME` → else `~/.config/genalima/` | Base directory, deliberately the same on macOS and Linux so agents can predict it.                                                                | —                                                                        |
| `config.toml`                                 | Profiles: `default_profile` and `[profiles.<name>] server = "…"`.                                                                                 | 0644                                                                     |
| `credentials.toml`                            | `[profiles.<name>] token = "eyJ…"`. Never referenced by `workflow.json`.                                                                          | **0600** on write; a group/world-readable file is warned about on read (§18.2) |
| `~/.cache/genalima/capabilities.json`         | Cached OpenAPI capability probe, keyed by server URL + spec hash.                                                                                 | 0644                                                                     |
| `./.genalima.toml` (optional, per project)    | `profile = "local"` / `server = "…"` so a repository pins its dev server. **Rejected if it contains a token** — a secret must never be committed. | 0644                                                                     |

```toml
# ~/.config/genalima/config.toml
default_profile = "local"

[profiles.local]
server = "http://localhost:8000"

[profiles.staging]
server = "https://staging.genalima.example"
```

### 9.2 Precedence

Flag → environment → project `.genalima.toml` → user `config.toml` profile → built-in default
(`http://localhost:8000`, profile `default`). `--verbose` prints which source won for the server and
whether a token came from the environment or a file (never the token itself).

### 9.3 The token is an 8-day JWT with no refresh

`create_access_token` signs a JWT with `sub` = user id and `exp` = now + `ACCESS_TOKEN_EXPIRE_MINUTES`
(default **8 days**, `config.py:46`); there is no refresh token and no revocation list, and the UI's
logout is local-only. So the CLI:

- decodes `exp` locally (base64url of the payload + `serde_json`; **no crypto dependency**, and the
  CLI must never claim to have verified the token);
- warns when `exp` is within 24 hours and errors with exit 4 and _"token expired 3h ago — run
  `genalima login`"_ before sending a request that would 403 anyway;
- never writes a token into `workflow.json`, `--json` output, `--verbose` logs, or error messages.
  A test asserts the literal token string never appears in any captured output.

---

## 10. HTTP layer

### 10.1 Endpoints used

| Command group               | Method   | Path                                         | Body / params                                           |
| --------------------------- | -------- | -------------------------------------------- | ------------------------------------------------------- |
| auth                        | `POST`   | `/api/v1/login/access-token`                 | form: `username`, `password`                            |
| auth                        | `POST`   | `/api/v1/login/test-token`                   | —                                                       |
| doctor                      | `GET`    | `/api/v1/utils/health-check/`                | —                                                       |
| capabilities                | `GET`    | `/api/v1/openapi.json`                       | —                                                       |
| workflow list               | `GET`    | `/api/v1/workflows/`                         | `skip`, `limit`                                         |
| workflow new/clone          | `POST`   | `/api/v1/workflows/`                         | `{name, description?, active?, settings?}`              |
| workflow show/pull/diff     | `GET`    | `/api/v1/workflows/{id}`                     | —                                                       |
| workflow rename/set         | `PUT`    | `/api/v1/workflows/{id}`                     | `{name?, description?, active?, settings?}`             |
| workflow delete             | `DELETE` | `/api/v1/workflows/{id}`                     | —                                                       |
| workflow push               | `PUT`    | `/api/v1/workflows/{id}/graph`               | `{nodes, edges}` (ids preserved)                        |
| workflow run                | `POST`   | `/api/v1/workflows/{id}/run`                 | `{items}`                                               |
| workflow test-node          | `POST`   | `/api/v1/workflows/{id}/nodes/{node_id}/run` | `{items}`                                               |
| workflow runs               | `GET`    | `/api/v1/workflows/{id}/runs`                | `skip`, `limit`                                         |
| workflow log                | `GET`    | `/api/v1/workflows/{id}/runs/{run_id}`       | —                                                       |
| workflow publish            | `POST`   | `/api/v1/workflows/{id}/publish`             | `{name, version, description?, release_notes?, graph?}` |
| component list              | `GET`    | `/api/v1/components/`                        | `skip`, `limit`                                         |
| component show/graph/insert | `GET`    | `/api/v1/components/{id}`                    | —                                                       |
| component graph/insert      | `GET`    | `/api/v1/workflows/{snapshot_workflow_id}`   | —                                                       |
| component delete            | `DELETE` | `/api/v1/components/{id}`                    | —                                                       |
| variable list               | `GET`    | `/api/v1/workflows/{id}/variables`           | planned                                                 |
| variable set                | `PUT`    | `/api/v1/workflows/{id}/variables/{key}`     | planned                                                 |
| variable unset              | `DELETE` | `/api/v1/workflows/{id}/variables/{key}`     | planned                                                 |

No endpoint is added and no endpoint is bypassed. `frontend/openapi.json` is a stale snapshot in the
repo; the live `/api/v1/openapi.json` is authoritative, so the CLI's typed models are **hand-written**
(~10 structs) rather than generated. Rationale: codegen from a spec that is behind the code would
produce a client that cannot express `run`, `publish` or `components` at all.

### 10.2 Auth header

`Authorization: Bearer <token>` on every request except
`/login/access-token` and `/utils/health-check/`. `Accept: application/json`. No cookies: the UI uses
`localStorage`, not credentials, so there is no cookie flow to replicate.

### 10.3 Error mapping

| Server response                                                                                           | Exit | Rendering                                                                                                                     |
| --------------------------------------------------------------------------------------------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------- |
| `400 {"message": …, "node_ids": [...], "edge_ids": [...]}` (GraphError)                                   | 7    | Message + each offending node/edge resolved to `key (name)`                                                                   |
| `400 {"message": "incompatible connections", "edges": [{edge_id, reason}], "nodes": [{node_id, reason}]}` | 7    | Grouped: per-edge faults (`code_1 → code_2: reason`) then per-node coverage faults, then _"run `genalima workflow validate`"_ |
| `400 "Add a node before running the workflow"` (bare string)                                              | 7    | As-is                                                                                                                         |
| `400 "Join an organization before publishing a component"`                                                | 7    | As-is + how to join (UI: `/settings`)                                                                                         |
| `400 {"message": …, "missing": [...], "undecryptable": [...]}` (planned variables)                        | 7    | Missing names listed; suggests `variable set`                                                                                 |
| `401` / `403 "Not enough permissions"`                                                                    | 4    | Auth hint                                                                                                                     |
| `403 "Published snapshots are read-only"`                                                                 | 4    | _"this is a component snapshot; publish a new version from the source workflow"_                                              |
| `404`                                                                                                     | 5    | Entity name + id echo                                                                                                         |
| `409 {"message", "existing_versions", "suggested_version"}`                                               | 6    | Existing versions, suggestion, and `--version <n>` for a one-line retry                                                       |
| `422 [{loc, msg, type}]`                                                                                  | 3    | Rendered as `field: message`. A rejected body is an authoring error, so it shares the local-validation code rather than "usage" (§18.2)                        |
| 5xx, timeouts, TLS                                                                                        | 1    | Status + a short body excerpt, and _"if the server is starting up, retry"_                                                    |

Publish's `409` is the one place the CLI may act on the body: with `--version auto` it retries once
with `suggested_version` and reports that it did.

### 10.4 Timeouts, retries, streaming

- Read/GET default timeout 30s; `run`/`test-node`/`publish` default **600s**, because the endpoints
  are synchronous and a graph of 30s-timeout nodes can legally take minutes. `--timeout 0` disables
  the limit.
- Retries: one retry with 250ms backoff for **GET** on connection reset / 502 / 503 / 504 only.
  Never for `run` or `test-node` — a retried run executes twice and the second run's rows would
  duplicate history. `PUT /graph` and `PUT /variables/{key}` are safe to retry (replace semantics);
  that is opt-in with `--retry`.
- No streaming: run responses arrive whole and are rendered whole. `--follow` is explicitly out of
  scope, since the API has no run-status polling endpoint.

---

## 11. Crate layout and dependencies

```
cli/
  Cargo.toml
  README.md                     install, quickstart, and the agent contract in one page
  src/
    main.rs                     entry, exit-code mapping, envelope emission
    cli.rs                      clap derive: global flags, subcommands, value parsers
    error.rs                    CliError enum → code + exit + hint
    config.rs                   profiles, files, precedence, GENALIMA_HOME
    auth.rs                     login/logout/whoami, token store, JWT exp decode
    api/
      mod.rs                    client, headers, timeouts, retry policy, error parse
      workflows.rs  runs.rs  components.rs  variables.rs  system.rs
    model/
      mod.rs                    serde structs for the API shapes used above
      workflow.rs  graph.rs  run.rs  component.rs  variable.rs
    project.rs                  discovery, canonical read/write, atomic replace
    canonical.rs               ordering + formatting rules (§5.2)
    validate.rs                 the offline mirror (§8)
    graph_edit.rs               node/edge/contract mutations + id regeneration
    insert.rs                   component insertion transform (§6.5)
    items.rs                    trigger-item parsing and --field coercion
    workfile.rs                 workflow diff (§6.2)
    render.rs                   human tables, problem lists, run panel
    json_out.rs                 the --json envelope
    commands/
      auth.rs  doctor.rs  schema.rs  completions.rs
      workflow/{init,new,list,show,pull,push,validate,rename,set,delete,clone,fmt,diff,inputs,run,test,runs,log,publish,code,node,edge,contract}.rs
      component/{list,show,graph,insert,delete}.rs
      variable/{list,set,unset}.rs
  tests/
    parity.rs  cli.rs  fixtures/parity/*.json
```

Dependencies, chosen to keep the build small and the binary self-contained:

| Crate                                                                            | Use                                                                                   | Note                                                                                                                                                 |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `clap` (derive, env, wrap_help)                                                  | args, help, `--help` text as documentation                                            | plus `clap_complete`, optional `clap_mangen`                                                                                                         |
| `ureq` (rustls) or `reqwest` (blocking, rustls, json)                            | HTTP                                                                                  | **Decision: `ureq`** — blocking, no async runtime, sequential calls only. Switch to `reqwest` only if streaming or a connection pool is ever needed. |
| `serde`, `serde_json`                                                            | the file format and every payload                                                     | **Do not enable `preserve_order`** (§5.2)                                                                                                            |
| `toml`                                                                           | config and credentials files                                                          | —                                                                                                                                                    |
| `uuid` (v4, serde)                                                               | node/edge ids for `init`, `node add`, `clone`, `--regenerate-ids`, `component insert` | —                                                                                                                                                    |
| `thiserror` (+ `anyhow` in `main.rs` only)                                       | errors with codes                                                                     | —                                                                                                                                                    |
| `tabled`                                                                         | human tables                                                                          | `--json` never uses it                                                                                                                               |
| `anstream`, `anstyle`                                                            | colour with `NO_COLOR` support                                                        | already in clap's tree; no extra dep                                                                                                                 |
| `rpassword`                                                                      | hidden password prompt                                                                | only used when stdin is a TTY                                                                                                                        |
| `dirs`                                                                           | `home_dir` for `~/.config`                                                            | the base path itself is fixed by us (§9.1)                                                                                                           |
| `time` (formatting, serde)                                                       | rendering run timestamps and relative ages                                            | pass-through values stay ISO strings                                                                                                                 |
| `schemars`                                                                       | `genalima schema`                                                                     | derives on the model structs                                                                                                                         |
| `sha2` or `blake3`                                                               | capability-cache key                                                                  | trivial; either                                                                                                                                      |
| dev: `assert_cmd`, `predicates`, `wiremock` (or `httpmock`), `insta`, `tempfile` | command-level tests, mock server, golden renderings                                   | see §12                                                                                                                                              |

MSRV: Rust 2021, `rustc ≥ 1.75` (declared in `Cargo.toml` as `rust-version`) — comfortably satisfied
by current stable, and low enough for Debian/Ubuntu packages.

### 11.1 Files touched in this repository

| File                           | Change                                                                                                                                                             |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cli/**`                       | New crate (above).                                                                                                                                                 |
| `cli/README.md`                | Install, quickstart, agent contract (§7), examples.                                                                                                                |
| `docs/cli-plan.md`             | This document.                                                                                                                                                     |
| `docs/cli.md`                  | New: the user-facing command reference, written after phase 4 from the shipped `--help`.                                                                           |
| `README.md`                    | A **CLI** section: `cargo install --path cli`, `genalima login`, `genalima workflow init/push/run/publish`; link `docs/cli.md`.                                    |
| `.gitignore`                   | `cli/target/`. Nothing else: `workflow.json` must be committed, and no existing pattern (`*.jsonl`, `*secret*.json`, `dist/`) matches it.                          |
| `app/tests/test_cli_parity.py` | New: asserts the Python validators agree with `cli/tests/fixtures/parity/`.                                                                                        |
| `scripts/cli-e2e.sh`           | New: end-to-end against a live server (login → init → push → run → publish → delete), gated on `GENALIMA_SERVER_URL` + `GENALIMA_TOKEN`.                           |
| `.github/workflows/cli.yml`    | New (optional but recommended — the repo has no CI today): `cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo test` on Linux/macOS, plus the pytest suite. |
| `Dockerfile`                   | Optional, phase 6: a builder stage that compiles the CLI and copies the binary into the runtime image, so agents working _inside_ the container get it free.       |

**No backend change is required for the in-scope surface.** The only backend work the CLI depends on
is the variables router already specified in `docs/workflow-environment-variables-plan.md` §5.

---

## 12. Tests

Rust (in `cli/`):

- **Unit** — config precedence; credential-file permission check; JWT `exp` decoding (valid, expired,
  malformed, missing); canonical ordering and idempotent re-serialisation; `workflow diff`; id
  regeneration preserving edge wiring; component-insert key de-duplication and offsetting;
  `--field` coercion and item parsing; exit-code mapping for every error variant.
- **Parity** (`tests/parity.rs`) — every fixture in `cli/tests/fixtures/parity/`, exact strings.
- **Command-level** (`tests/cli.rs` with `assert_cmd` + `wiremock`) — request shape asserted for
  each command (method, path, `Authorization`, content type, body), including the form-encoded login;
  response handling for the real error bodies quoted in §10.3, taken verbatim from the routes;
  `--json` envelope additivity (one object, parseable, stderr separate); `--dry-run` sends nothing
  (mock asserts zero requests); non-TTY destructive commands refuse without `--yes`.
- **Golden** (`insta`) — human renderings of a workflow list, a run panel with a failure, a problem
  list, and a publish conflict, so table regressions are visible in review.

Python:

- **`app/tests/test_cli_parity.py`** — the shared fixtures through `validate_and_order`,
  `check_graph`, `publish_shape`. Skips cleanly if `cli/tests/fixtures/parity/` is absent (so the
  Python suite never depends on the Rust crate being present, only on the fixtures).

End-to-end:

- **`scripts/cli-e2e.sh`** — against a live server: login, create, push a two-node graph, run it,
  assert output, test one node, publish v1, re-publish expecting exit 6, insert the component into a
  new workflow, delete both. Skipped unless the env vars are set; also runnable by hand against
  `python main.py`.

The one place the CLI cannot be tested without a server is the run engine, and that is intentional:
the CLI never re-implements execution.

---

## 13. Build, install, release

### 13.1 Toolchain (missing today)

`cargo` and `rustc` are **not installed on this machine** (verified: `cargo --version` → not found;
`node v26`, `python 3.14` are). Phase 0 therefore starts with:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
. "$HOME/.cargo/env"
rustc --version && cargo --version
```

Then, in the repo:

```bash
cd cli
cargo build --release          # target/release/genalima
cargo install --path .         # ~/.cargo/bin/genalima
```

The Rust build is a developer/CI concern only: consumers of the shipped binary need no toolchain.

### 13.2 Distribution (phase 6)

- `cargo-dist` (or a hand-written matrix) publishing GitHub release artifacts for
  `aarch64-apple-darwin`, `x86_64-apple-darwin`, `x86_64-unknown-linux-gnu`,
  `x86_64-unknown-linux-musl`, `aarch64-unknown-linux-musl`, `x86_64-pc-windows-msvc`, plus a
  `curl | sh` installer and a Homebrew formula.
- `cargo publish` for `genalima-cli` once the crates.io name is checked (open item §17.3).
- The Dockerfile builder stage (§11.1) for agents inside the app image.
- Version pinning: the CLI reports its own version and treats the server's OpenAPI spec as the
  compatibility contract, warning (not failing) when the server has endpoints the CLI does not know.

### 13.3 Shell completion and docs

`genalima completions zsh > ~/.zfunc/_genalima`, and `docs/cli.md` generated from `--help` output so
the reference cannot drift from the binary.

---

## 14. Milestones

Each phase is independently reviewable and ends with a runnable acceptance check.

**Phase 0 — skeleton and auth.**
Crate, `clap` surface, exit codes, `--json` envelope, config/credentials, `login`, `logout`,
`whoami`, `doctor`, `version`, `completions`.
_Acceptance:_ `cargo test` green; `genalima login --password-stdin` against `python main.py` stores
a 0600 credential; `genalima doctor` prints server, auth and capability status; `--json` emits
exactly one parseable object.

**Phase 1 — read path.**
`model/*`, `canonical.rs`, `project.rs`, `workflow list|show|pull|inputs|fmt`, `component list|show`.
_Acceptance:_ `pull` of an existing workflow produces a file that `git diff`s clean on a second
`pull`; `workflow list --json` equals the raw `GET /workflows/` body.

**Phase 2 — write path.**
`workflow init|new|push|validate|rename|set|delete|clone|diff`, `graph_edit.rs` basics
(`node`, `edge`, `code`), `--dry-run`, local pre-flight, server 400 rendering, `--regenerate-ids`.
_Acceptance:_ `init` → `push` → `pull` is a fixed point; a graph with a cycle, a dangling mapping and
an `Any → int` edge each fail with exit 3 locally and exit 7 remotely with the _same_ messages;
pushing a copy of another workflow's file succeeds with `--regenerate-ids` and fails helpfully
without it.

**Phase 3 — run path.**
`workflow run|test-node|runs|log`, `items.rs`, run rendering, exit code 8, `--items -`,
`--field` coercion.
_Acceptance:_ a two-node graph runs, prints per-node status and logs, exits 8 on a node that raises,
and exits 7 (not 8) when the graph is rejected before running; `test-node` resolves a key to an id;
`--dry-run` on `run` sends nothing.

**Phase 4 — publish and components.**
`workflow publish`, `component graph|insert|delete`, `--version auto`, 409 handling, boundary
pre-flight.
_Acceptance:_ publish v1 then v2; a duplicate version exits 6 with the existing versions;
`component insert` into a fresh `init` graph yields a graph that `validate` accepts and `run` executes;
`component graph --write` produces a file whose `push` refuses with the frozen-snapshot message.

**Phase 5 — variables (when the router lands).**
`variable list|set|unset`, capability probe, `--value-stdin`/`--from-env`, missing-variable error
rendering on run.
_Acceptance:_ on a server without the routes, all three commands exit 5 with the pointer to the plan;
on a server with them, a required variable with no value blocks a run with exit 7 and the names listed.

**Phase 6 — polish and distribution.**
`man`, `schema`, release artifacts, Dockerfile stage, `scripts/cli-e2e.sh`, `docs/cli.md`, README
section, CI workflow.
_Acceptance:_ a fresh container with neither Python nor Node installs the binary from a release
artifact and completes the e2e script; the parity fixtures run in `cargo test` **and** `pytest`.

---

## 15. Later work

### 15.1 What `deploy` would become (deferred, per review)

Deliberately out of scope, but the design should not block it. A future `genalima deploy` is
_apply a project to an environment_: a project file listing many `workflow.json` files, an
`environment` name mapped to a server profile, `plan` (idempotent diff per workflow: create / update /
publish-unpublished), `apply --yes`, and a lock file recording `(path → workflow id, version,
component id)`. Everything it needs already exists at the API level — `POST /workflows/`,
`PUT /{id}`, `PUT /{id}/graph`, `POST /{id}/publish` — which is precisely why `push` and `publish`
must stay honest about their results (ids and versions written back to the file). Nothing in phases
0–6 needs to change to keep this door open, and no hidden state is introduced that `deploy` would
later have to reconcile.

A second, unrelated meaning of "deploy" is in flight in
[`docs/workflow-deployment-plan.md`](workflow-deployment-plan.md): a **Deploy** button that packages a
workflow into an AWS Lambda function with an HTTP or cron trigger. That is a workflow-level action, not
a project-level apply, so when its API exists the CLI should grow
`workflow deploy [--trigger http|cron|none] …` alongside `workflow publish`, mapping onto its endpoint
and reusing the same envelope and exit codes. The two features share nothing but the word, and this
plan deliberately does not guess at its request shape.

### 15.2 Other follow-ons

- **MCP server wrapper.** The `--json` envelope and stable exit codes make an MCP tool surface a thin
  adapter (`workflow_validate`, `workflow_push`, `workflow_run`, `workflow_publish`,
  `component_list`). Explicitly not in v1; the CLI is the substrate.
- **Server-side search and pagination** for `/workflows/?search=` so `workflow list --search` is not
  page-limited. Not required, but it is the one place CLI parity is visibly weaker than the UI.
- **Dry-run publish diff** against the previously published version (`component graph` vs local), so a
  release note can be reviewed as a diff.
- **Watch mode** (`push` on file change) for humans; agents do not need it.
- **Server-side run cancellation/timeout**, which would make `--follow` meaningful.

---

## 16. Rejected alternatives

| Alternative                                                                 | Why not                                                                                                                                                                                                                                                                                                                    |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Python CLI in this repo** (`app/cli.py`, reusing `app.services.workflow`) | Would eliminate the mirror entirely and be ~4× faster to build. Rejected by review in favour of a self-contained Rust binary; the cost is the mirror, paid down by the parity fixtures (§8.5). Recorded here because it is the strongest competing option and the right fallback if the mirror proves hard to keep honest. |
| **Direct database / service-layer access**                                  | Needs `POSTGRES_*` and `SECRET_KEY`, bypasses every permission rule in `_load_workflow` and `_get_component`, and would let an agent read encrypted variable ciphertext. Non-starter for agents.                                                                                                                           |
| **Reusing `frontend/openapi.json` for codegen**                             | The committed spec is stale — it lacks `run`, `nodes/{id}/run`, `runs`, `publish` and `components` entirely. A generated client could not express the product. Hand-written models + the live spec for capability probing is correct until the spec is regenerated in CI.                                                  |
| **YAML, or `workflow.yaml` + `nodes/*.py`**                                 | Rejected by review in favour of exact API shape. The readability cost is bought back with `workflow code get/set` and `workflow fmt` rather than a second format to keep in sync.                                                                                                                                          |
| **`--token` as the primary auth path**                                      | Leaks into `ps` output and shell history. Supported but documented as discouraged; environment variable and credential file are the recommended paths.                                                                                                                                                                     |
| **Auto-retrying `POST /run`**                                               | Would execute the workflow twice and duplicate run history. Retries are restricted to GETs and opted into for idempotent PUTs.                                                                                                                                                                                             |
| **A `--local` mode that runs the engine without a server**                  | Would require porting the runner and engine to Rust, i.e. a second execution semantics to keep in sync. The server is the only runner.                                                                                                                                                                                     |
| **Generating the workflow file from a node-graph DSL**                      | A second source of truth and a compiler to maintain; JSON with surgical edit commands is enough.                                                                                                                                                                                                                           |
| **`--json` output printed to stderr for errors**                            | Tempting for Unix purity, but agents then need two parsers and a stream to distinguish. One envelope on stdout, always, with the exit code as the second channel.                                                                                                                                                          |

---

## 17. Open items to confirm

1. **Binary name.** `genalima` is assumed. `alima` matches the Docker image/database naming
   (`Dockerfile`, `POSTGRES_DB=alima`); a `galima` alias is possible but two names is one too many.
2. **Colour/emoji level of the human output.** Tables and colour are assumed; no emoji.
3. **`--json` envelope shape.** `{ok, command, data, error, meta}` as specified in §7.1 — confirm the
   field names before phase 0 freezes them, since they are public API for agents.
4. **Environment variable prefix.** `GENALIMA_*` assumed (`GENALIMA_SERVER_URL`, `GENALIMA_TOKEN`,
   `GENALIMA_PROFILE`, `GENALIMA_HOME`, `GENALIMA_WORKFLOW_FILE`, `GENALIMA_TIMEOUT`).
5. **Default profile name and port.** `default` → `http://localhost:8000`, matching `main.py`.
6. **Variables timing.** Ship `variable` commands in phase 5 with capability gating (assumed), or hold
   them until `docs/workflow-environment-variables-plan.md` is implemented? The former makes the CLI
   forward-compatible and testable today.
7. **Where `workflow.json` lives in this repo's own examples.** `examples/` is empty; a committed
   example project (`examples/daily-report/workflow.json`) would double as documentation and as an
   e2e fixture — worth adding in phase 6.
8. **CI.** The repo has no `.github/workflows/` today. Adding `cli.yml` (§11.1) is recommended but is a
   new practice for this repo; say the word and phase 0 includes it instead of deferring to phase 6.
9. **crates.io publishing.** If the CLI is published, the crate name `genalima-cli` and the MSRV need
   to be settled before the first release.

---

## 18. As implemented

Phases 0–4 and 6 of §14 are implemented, plus phase 5 behind the capability gate. This section records
where the code deliberately differs from the plan above, and what was actually run to verify it. The
questions in §17 that needed an answer are marked resolved.

### 18.1 What exists

```
cli/                              Rust 2021, MSRV 1.75, zero warnings under `cargo clippy`
  Cargo.toml                      clap, clap_complete, ureq(rustls), serde_json, serde, toml,
                                  uuid, thiserror, rpassword, dirs, time
  README.md                       install, quickstart, the agent contract, command index
  src/lib.rs + src/main.rs        library + thin binary, so `tests/` can drive the real executable
  src/{api,auth,canonical,cli,config,diff,error,globals,graph_edit,insert,items,model,project,
       render,validate}.rs
  src/commands/{mod,workflow,component,variable,meta}.rs
  tests/{cli,parity}.rs
  tests/fixtures/parity/*.json    22 shared cases, read by Rust *and* pytest
app/tests/test_cli_parity.py      the Python half of the parity suite
scripts/cli-e2e.sh                end-to-end against a live server, self-cleaning
```

`genalima --help` exposes **47 leaf commands** (7 top level, 32 under `workflow`, 5 under
`component`, 3 under `variable`). Every command from §6 is present; nothing was dropped.

### 18.2 Deviations from the plan

| # | Plan said | Implemented | Why |
|---|---|---|---|
| 1 | `cli/src/main.rs` as a binary crate | `src/lib.rs` + a thin `src/main.rs` | An integration test cannot import a binary crate, and `CARGO_BIN_EXE_*` is only set for `tests/`. The command surface is unchanged. |
| 2 | 422 → exit 2 ("a client bug") | 422 → exit 3 (`invalid_local`) | A rejected body is an authoring error (a bad field type in `workflow.json` is the common case), and it is the same class of fault the offline mirror already reports as 3. One code, one meaning. |
| 3 | credentials readable-by-others: warn and refuse | warn on read, always write `0600` | Refusing would make a fresh container with a loose umask unable to authenticate at all, which is a worse failure than a warning. The write path is strict and asserted in a test. |
| 4 | `publish_shape` raises on the first boundary fault | `validate --for-publish` and the publish pre-flight report **both** a missing entry and a missing exit | Fixing two entry nodes is one edit; showing one fault per push is needless round trips. The *verdict* is identical, which is what the parity fixtures pin. Documented in `publish_problems`. |
| 5 | 5xx → "a short body excerpt, and *if the server is starting up, retry*" | 5xx → excerpt plus a hint naming the server logs and `alembic upgrade head` | Written from the failure actually hit (§18.3, item 1); "retry" would have been misleading. |
| 6 | `variable list [ID]` | id is positional, like every other workflow-id argument; `variable set/unset` take `--id` because their positional is the key | Consistency: the positional is the workflow id wherever there is one. |
| 7 | publish sends `graph` in the body | `publish` pushes local changes first, then publishes the **saved** graph (no `graph` in the body) | Same outcome — the snapshot matches the working state — with one validation and one write instead of two. With `--no-save` nothing is pushed, exactly as specified. |
| 8 | `docs/cli.md`, a generated command reference | deferred; `cli/README.md` + each command's `--help` instead | A hand-maintained copy of `--help` drifts. Regenerate it from `--help` when the command surface stabilises. |
| 9 | CI workflow `.github/workflows/cli.yml` | not added (§17.8 still open) | New practice for this repo; `cargo fmt --check`, `cargo clippy -- -D warnings` and `cargo test` all pass locally, so nothing blocks on it. |
| 10 | `examples/daily-report/workflow.json` | not added (§17.7 still open) | `workflow init --template component` is a better starting point because it is always current. |

Resolved from §17: the binary is `genalima` (1), the envelope is `{ok, command, data, error, meta}` (3),
the environment prefix is `GENALIMA_*` (4), the default profile/server is `default` →
`http://localhost:8000` (5), and variables ship capability-gated (6).

### 18.3 Verification

Rust (`cd cli`):

| Command | Result |
|---|---|
| `cargo fmt --check` | clean |
| `cargo clippy --all-targets` | 0 warnings |
| `cargo test` | **93 passed** — 77 unit, 14 command-level against a mock API, 2 parity |

The parity suite is the load-bearing one: 22 fixtures through the Rust mirror, and the *same* files
through the server's real rules in pytest. It found two classes of problem while being written — an
incomplete fixture (a dangling mapping also leaves the target's required input uncovered) and the fact
that a cyclic graph never reaches `publish_shape`, neither in the route nor in the mirror.

Python (from the repository root):

| Command | Result |
|---|---|
| `.venv/bin/python -m pytest app/tests/test_cli_parity.py -q` | 23 passed (22 fixtures + a completeness check) |
| `.venv/bin/python -m pytest -q` | **83 passed** (60 pre-existing, unbroken) |

End-to-end against the live local API, `GENALIMA_SERVER_URL=http://localhost:8000 scripts/cli-e2e.sh`:
login → doctor → whoami → `init --template component` → validate `--for-publish --order` → fmt → push
(create) → diff → push (no-op) → run (two nodes actually executed, 55ms/51ms) → test-node with the
declared-vs-returned shape table → runs → publish v1 → re-publish (exit 6) → component list/show/graph
→ insert into a second workflow → validate → `list --local` → a duplicated node key exits 3 locally and
7 from the server under `--force` → the variables capability gate exits 5 → cleanup deletes the
component and the workflow. All steps passed.

Two things that run turned up, neither of them in the CLI:

1. **The dev database was one migration behind** (`8a4110661e22` vs head `b0a12deb8b80`), so
   `POST /workflows/{id}/publish` answered 500 for *any* client — the web editor's Publish button
   included. `alembic upgrade head` fixed it; §18.2 item 5 is the hint the CLI now prints instead of a
   bare `HTTP 500`.
2. **`WorkflowVariable` exists but no router serves it** (`app/api/main.py` includes no variables
   router), so `variable list` exits 5 with a pointer to
   `docs/workflow-environment-variables-plan.md` against a real server. That is the gate working, not a
   defect, and it is the one place the CLI is ahead of the API.

### 18.4 Suggested next steps

1. **CI** (§17.8): add `cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo test` and the pytest
   parity module to a workflow; the whole suite runs in about 5 seconds.
2. **A committed example** (§17.7) once the workflow file format is frozen, as documentation for agents.
3. **The variables router**, which unblocks `variable list|set|unset` for real; the CLI side is written
   and only needs the endpoints.
4. **`deploy`** (§15.1) remains the natural next feature; nothing in the current design blocks it.
5. **`docs/cli.md`** generated from `--help` (deviation 8) when the surface stabilises.

