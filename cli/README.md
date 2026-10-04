# 🧑💻 genalima — the GenAlima CLI

Create, edit, test, save and publish [GenAlima](../README.md) typed Python
workflows from a terminal. It talks to the same `/api/v1` surface the web editor
uses, so it needs only a server URL and a token.

The design and the reasoning behind it are in
[`docs/cli-plan.md`](../docs/cli-plan.md).

## Install

Requires Rust 1.75+ ([rustup](https://rustup.rs)):

```bash
cargo install --path cli          # puts `genalima` in ~/.cargo/bin
# or, without installing:
cargo build --release && ./target/release/genalima --help
```

## Quick start

```bash
genalima login --email you@example.com          # or export GENALIMA_TOKEN=...
genalima workflow init "Daily report"           # offline; writes workflow.json
genalima workflow node add --name Fetch --output rows:int
genalima workflow validate                      # offline, no server needed
genalima workflow push                          # creates it on the server
genalima workflow run --field date=2025-10-02
genalima workflow publish --name "Daily report" --version auto
```

`workflow.json` **is** the API's JSON, in canonical form: keys sorted, nodes by
key, edges by endpoint, one trailing newline, written atomically. `pull` then
`push` is a no-op, so the file diffs cleanly in git.

Because Python node bodies live in a JSON string, two commands keep them
editable as real files:

```bash
genalima workflow code get code_1 > node.py
genalima workflow code set code_1 --file node.py
```

## For coding agents

- **`--json` prints exactly one JSON object on stdout**, success or failure, and
  nothing else:

  ```json
  {"ok": true, "command": "workflow.push", "data": {"id": "…", "version": 4}, "meta": {"cli": "0.1.0", "duration_ms": 184}}
  ```

  `data` is the server's response body verbatim wherever the command only relays
  the API. `error` carries a stable `code`, the `message`, the server's `detail`
  and a `hint`.

- **Exit codes are stable:**

  | code | meaning |
  |---|---|
  | 0 | success |
  | 1 | transport or server fault (5xx) |
  | 2 | bad usage |
  | 3 | the local file is invalid (offline validation, or the pre-flight) |
  | 4 | missing, expired or insufficient token |
  | 5 | not found (also: the server lacks this capability) |
  | 6 | version conflict on publish |
  | 7 | the server rejected the graph |
  | 8 | the request worked and the workflow **ran and failed** |

- **Offline first.** `workflow validate` mirrors the server's rules exactly and
  needs no server, no token and no database. Both test suites read the same
  fixtures (`cli/tests/fixtures/parity/`), so the mirror cannot drift silently.

- **No prompts without a TTY.** Destructive commands require `--yes` when stdin
  is not a terminal. `--dry-run` prints the requests and the diff without
  sending anything. `genalima doctor` reports what the server actually
  implements, by reading its live OpenAPI spec.

- **Secrets stay out of files and logs.** Variable values are write-only (the
  API never returns them), `--value-stdin` / `--from-env` are preferred over
  `--value`, and the token is redacted from all output including `-vv`.

## Configuration

Resolution order: flags → environment → `.genalima.toml` (project) →
`~/.config/genalima/config.toml` (profile).

| setting | flag | environment |
|---|---|---|
| server | `--server` | `GENALIMA_SERVER_URL` |
| token | `--token` | `GENALIMA_TOKEN` |
| profile | `--profile` | `GENALIMA_PROFILE` |
| config directory | — | `GENALIMA_HOME` |
| workflow file | `--file` | `GENALIMA_WORKFLOW_FILE` |
| timeout | `--timeout` | `GENALIMA_TIMEOUT` |

The token lives in `~/.config/genalima/credentials.toml` with mode `0600`. In CI,
skip `login` and set `GENALIMA_TOKEN` (the token lasts 8 days and there is no
refresh, so `doctor` warns before it expires).

## Commands

```
genalima login | logout | whoami | doctor | schema | completions | version

genalima workflow init | new | list | show | pull | push | validate | rename
                  set | delete | clone | fmt | diff | inputs
                  run | test-node | runs | log | publish
                  code list|get|set
                  node add|set|rm
                  edge add|rm|map
                  contract set|field|rm|rename

genalima component list | show | graph | insert | delete
genalima variable list | set | unset        # needs a server that implements them
```

Every command's `--help` is the reference, e.g.
`genalima workflow run --help`. `genalima schema workflow` prints a JSON Schema
for `workflow.json`, so a file can be written from scratch without the docs.

## Development

```bash
cd cli
cargo fmt --check
cargo clippy --all-targets          # warning-free
cargo test                          # unit + integration + parity fixtures

# the Python half of the parity suite, from the repository root
.venv/bin/python -m pytest app/tests/test_cli_parity.py

# end-to-end against a live server (creates and deletes its own entities)
GENALIMA_SERVER_URL=http://localhost:8000 \
GENALIMA_EMAIL=admin@example.com GENALIMA_PASSWORD=… \
scripts/cli-e2e.sh
```
