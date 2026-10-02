# GenAlima — Per-Workflow Environment Variables Plan

> Status: **Draft for review**
> Scope: give each workflow its own named variables — DB connection strings, LLM API keys, tokens — stored
> encrypted, written write-only, and injected into that workflow's code-node subprocesses.
> Supersedes `docs/code-node-workflows-plan.md` §2 item 4 (*"No credential plumbing. Code nodes are pure
> functions of their input items."*).
> Out of scope for v1: organization-wide shared variable tiers, per-node variable overrides, external
> secret managers (Vault/1Password/AWS SM), audit logging of secret reads.

---

## 1. Decisions taken (from review)

| Question | Decision |
|---|---|
| How does node code read variables? | **Both.** The child gets the values in `os.environ` *and* as an `env` mapping in scope, so `openai`/`langchain` pick keys up automatically and `env["DB_URL"]` is available for explicit, declared access. |
| Keep inheriting the API process environment? | **Yes.** The child still inherits the API's environment; the workflow's variables are layered on top and win on name collisions. (Consequence recorded in §9 — this is convenience, not isolation.) |
| Running a published snapshot that needs variables? | **Fail fast**, before a run row is written, with the exact missing names. The supported distribution path is copying the component into your own workflow and defining values there. Values never cross users. |
| Can the owner read a secret back? | **No.** Write-only: the API never returns values, the UI shows "set / not set", and a value can only be replaced or cleared. |

---

## 2. The model in one example

A workflow `Nightly invoice sync` declares:

| Name | Secret | Required | Value |
|---|---|---|---|
| `INVOICE_DB_URL` | yes | yes | *(set)* |
| `OPENAI_API_KEY` | yes | yes | *(set)* |
| `REGION` | no | no | `eu-central-1` |

Node code then has all three available twice over:

```python
# ambient, so SDKs that read os.environ work unchanged
import os
os.environ["OPENAI_API_KEY"]

# explicit and declared
db = env["INVOICE_DB_URL"]
result = [{"json": {"region": env.get("REGION", "us-east-1")}}]
```

A workflow that declares nothing behaves exactly as today.

Two properties matter more than the feature itself:

1. **A value is never serialized back out.** `GET` returns names, flags and `has_value`, never the string.
   `WorkflowPublic.settings` is returned in every list response, which is why variables are *not* stored there
   (§13).
2. **Values are encrypted at rest** under an application key, so a database dump does not yield credentials.

---

## 3. Data model

New models in `app/models.py`, following the existing `Base / Create / Update / Public / XsPublic`
convention, the `owner_id`+`CASCADE` instinct of `WorkflowComponent`, and the `WorkflowFieldSpec`
"plain dict in the DB, typed in the public model" trick.

```python
# ---------------------------------------------------------------------------
# Per-workflow environment variables
# ---------------------------------------------------------------------------
ENV_KEY_PATTERN = r"^[A-Za-z_][A-Za-z0-9_]{0,63}$"
MAX_VARIABLES_PER_WORKFLOW = 100
MAX_VARIABLE_VALUE_LENGTH = 8192


class WorkflowVariable(SQLModel, table=True):
    """
    One named variable belonging to one workflow.

    `value_encrypted` holds a Fernet token (§4), never plaintext, and is
    nullable: a declaration without a value is how a published snapshot records
    what a component needs. `is_secret` and `required` are declarative: a
    secret is masked in the UI, and `required` makes a run refuse to start while
    the value is missing. `(workflow_id, key)` is unique, so a name exists once
    per workflow and "setting" it is an upsert.
    """
    __table_args__ = (UniqueConstraint("workflow_id", "key", name="uq_workflowvariable_workflow_key"),)

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    workflow_id: uuid.UUID = Field(foreign_key="workflow.id", nullable=False, ondelete="CASCADE")
    key: str = Field(max_length=64, regex=ENV_KEY_PATTERN)
    value_encrypted: str | None = Field(default=None, sa_column=Column(Text))
    is_secret: bool = Field(default=True)
    required: bool = Field(default=False)
    description: str | None = Field(default=None, max_length=255)
    created_by_id: uuid.UUID | None = Field(default=None, foreign_key="user.id", ondelete="SET NULL")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class WorkflowVariablePublic(SQLModel):
    """
    A variable as the API returns it. There is deliberately no `value` field:
    the only way to learn a stored value is to run code that uses it.
    """
    key: str
    is_secret: bool = False
    required: bool = False
    has_value: bool = False          # value_encrypted is not None and decrypts
    description: str | None = None
    updated_at: datetime | None = None


class WorkflowVariableUpdate(SQLModel):
    """
    Body of `PUT /workflows/{id}/variables/{key}`. PATCH semantics: a field left
    out is unchanged, an explicit `null` value clears the stored secret, and a
    string sets it. The route reads `model_fields_set` to tell those apart.
    """
    value: str | None = Field(default=None, max_length=MAX_VARIABLE_VALUE_LENGTH)
    is_secret: bool | None = None
    required: bool | None = None
    description: str | None = Field(default=None, max_length=255)


class WorkflowVariablesPublic(SQLModel):
    data: list[WorkflowVariablePublic]
    count: int


class WorkflowVariableSpec(SQLModel):
    """
    A variable a published component needs — name, flags and prose, no value.
    Mirrors `WorkflowFieldSpec`: same shape in JSON columns and in responses.
    """
    key: str
    is_secret: bool = False
    required: bool = True
    description: str | None = None
```

Two additions to existing models:

```python
class WorkflowDetailPublic(WorkflowPublic):
    nodes: list[WorkflowNodePublic] = Field(default_factory=list)
    edges: list[WorkflowEdgePublic] = Field(default_factory=list)
    variables: list[WorkflowVariablePublic] = Field(default_factory=list)   # NEW

class WorkflowComponent(...):
    variables: Dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))  # NEW
```

`WorkflowDetailPublic.variables` means opening the editor (or a snapshot) is still one request, and the
component-insert flow learns what a component needs without a second call. `WorkflowComponent.variables`
follows the same precedent as `input`/`output` on that model — the manifest is denormalized so a component
listing needs no extra query. It is keyed by variable name for O(1) lookup:

```json
{"INVOICE_DB_URL": {"key": "INVOICE_DB_URL", "is_secret": true, "required": true, "description": "Read replica"}}
```

**Migration** (`alembic revision --autogenerate -m "add workflow variables"`, head is `8a4110661e22`):
create `workflow_variable` with the unique constraint and a `workflow_id` index, add
`workflow_component.variables` as `JSON NOT NULL DEFAULT '{}'`. No backfill: existing workflows simply have
no variables.

---

## 4. Secret storage

New module `app/services/workflow/secrets.py`, sibling of `types.py`/`graph.py`. Pure functions over the
settings object, so it unit-tests without a database.

- **Cipher**: `cryptography.fernet.Fernet` (already a pinned dependency, `cryptography==44.0.0`).
- **Key**: `settings.WORKFLOW_ENCRYPTION_KEY` when set; otherwise derived from `SECRET_KEY` via
  `hashlib.sha256(f"workflow-variables:{SECRET_KEY}".encode()).digest()` and base64url-encoded. A dedicated
  key is preferred because it decouples secret storage from session-token rotation; deriving keeps local dev
  zero-config. Reworded as an open item in §14.
- **Envelope**: stored as `v1:<token>`, so a future rotation (or a second key while re-encrypting) is a
  prefix branch, not a data migration.
- **Fail loudly**: a missing/short key or a token that will not decrypt raises a typed
  `SecretsError`. A workflow variable whose ciphertext cannot be decrypted is reported as *missing with a
  distinct reason* rather than crashing the run (§6).
- `decrypt_many(rows) -> dict[str, str]` is the single place rows become a value mapping; nothing else in
  the app touches `value_encrypted`.
- Values are never logged, never put in `repr`, and never included in exception text.

---

## 5. API surface

All nested under the workflow route, so the existing `_get_workflow` / `_get_writable_workflow` access rules
apply unchanged: owners and superusers write, organization members may read a colleague's published snapshot,
and anything else stays a 404.

| Method | Path | Who | Purpose |
|---|---|---|---|
| `GET` | `/api/v1/workflows/{id}/variables` | reader | Declarations only: `key`, `is_secret`, `required`, `has_value`, `description`. |
| `PUT` | `/api/v1/workflows/{id}/variables/{key}` | writer | Upsert one variable. 403 on a frozen snapshot. |
| `DELETE` | `/api/v1/workflows/{id}/variables/{key}` | writer | Remove one variable. 403 on a frozen snapshot. |

Endpoint detail:

- `PUT` creates the row when `key` is new and patches it otherwise. `value` omitted keeps the stored secret;
  `"value": null` clears it; a string sets it. Creating without a value is allowed — that is a declaration,
  useful on its own because `required` is what makes a run refuse to start.
- Defaults for a **new** row: `is_secret=true` (safe by default), `required=false`. A variable created with
  `required=true` and no value is valid to save but blocks runs until it is filled, which is the intended
  signal.
- Rejects with 400: a key failing `ENV_KEY_PATTERN` (so `=`, spaces or a leading digit never reach
  `os.environ`), more than `MAX_VARIABLES_PER_WORKFLOW` variables, a value over 8 KB.
- `GET` is cheap and **redacted by construction**: the route builds `WorkflowVariablePublic` from the row and
  only sets `has_value`, so a field cannot leak by accident (`_variables_public` helper, mirroring
  `_graph_public`).
- Per-key rather than bulk `PUT …/variables` (replacing the whole set, like `PUT …/graph`). Variables carry no
  cross-row invariant that would need atomic validation, and a bulk replace cannot distinguish "keep the
  secret I cannot see" from "clear it" without a sentinel. **Rejected alternative**, §13.
- No reveal endpoint by design. A lost secret is replaced, not recovered.
- No `GET` endpoint for reading the process environment: that would hand every user the platform's secrets.

---

## 6. Runtime plumbing

Three touch points, in order.

**1. Route: resolve and fail fast** (`app/api/routes/workflows.py`). A helper used by both run endpoints:

```python
def _run_variables(session, workflow_id) -> dict[str, str]:
    """
    The workflow's variables as a name -> value mapping.

    Raises 400 naming every required variable that has no usable value, before
    any run row is written: a missing DB URL is a configuration mistake, not a
    run worth recording.
    """
```

Detail shape, so the editor can render an actionable banner:

```json
{"detail": {"message": "Workflow is missing values for 2 variables",
            "missing": ["INVOICE_DB_URL"],
            "undecryptable": ["OPENAI_API_KEY"]}}
```

`undecryptable` is separate: the name exists but its ciphertext does not open under the current key
(typically `SECRET_KEY` was rotated on a deployment with no dedicated encryption key). The message says to
re-enter the value. Both run endpoints (`/{id}/run`, `/{id}/nodes/{node_id}/run`) use it, so a single-node
test is blocked by a workflow-wide missing required variable too — predictable, and the node being tested
usually needs it anyway.

**2. Engine: thread the mapping** (`app/services/workflow/engine.py`). `execute_node` and `execute_graph`
gain a `variables: Mapping[str, str] | None = None` keyword, defaulted so every existing caller and test
keeps working, and the `RunNode` callable type gains the fifth parameter:

```python
RunNode = Callable[[str, str, list[dict[str, Any]], float, Mapping[str, str]], RunnerResult]
```

Variables are workflow-wide, so the graph loop reads them once and passes the same mapping to every node.

**3. Runner: carry values over stdin** (`app/services/workflow/runners/python_runner.py`). The request JSON
becomes `{"code", "mode", "items", "nonce", "env"}` and the child does:

```python
scope_env = {str(k): str(v) for k, v in (request.get("env") or {}).items()}
os.environ.update(scope_env)          # SDKs that read the environment just work
...
scope = _globals({"items": items, "env": EnvMapping(scope_env)})
```

- Values travel on **stdin, not in the child's environment or argv**, so they do not appear in `ps` output
  for a co-resident process. The child then materializes them into its own `os.environ` for SDK benefit.
- `EnvMapping` is a `dict` subclass whose `__missing__` raises
  `KeyError("environment variable 'X' is not defined for this workflow; add it in the Environment panel")`,
  so a typo in a node is diagnosable from the run panel without opening the docs.
- Inherited environment is untouched (decision in §1) and a workflow variable of the same name wins.
- `run()` with no `variables` sends `"env": {}`, so `test_workflow_runner.py`'s existing calls stay valid.

**4. Run history: best-effort redaction.** Run rows store `logs`, `error` and `output_items`, and
organization members can read a snapshot's runs. Before `_finish_run` persists anything, every *secret*
value is replaced by `***` in those fields — in the per-node JSON as well as the raw strings.

- Only values of 8+ characters are redacted, so a two-character secret cannot rewrite unrelated text.
- It is a safety net for accidents (a node that `print`s its config, a traceback quoting a connection
  string), not a guarantee: anything the node transforms — base64, a substring, a hash — is not caught.
  Documented as such in the README.
- Redaction is applied to the response too, so a caller cannot see what the stored run does not contain.

---

## 7. Publishing, components and snapshots

Publishing copies the workflow; it must copy **needs, never secrets**.

At `POST /workflows/{id}/publish` (in `_copy_graph_into_snapshot`, alongside the node/edge copy):

1. Copy each variable into the **snapshot** as a **declaration only** — same `key`, `is_secret`,
   `description`, `value_encrypted = NULL`, and `required = var.required or var.has_value`. A variable that
   had a value at publish time is, by definition, needed by the published graph; it becomes required so a
   snapshot run names it instead of failing with a `KeyError`.
2. Denormalize the same names into `WorkflowComponent.variables` (§3), so `GET /components/` and the
   component palette can show what a component needs with no extra query.

Then:

- **Running a snapshot fails fast** with `missing: [...]`, exactly as §6. Nobody can set values on a frozen
  snapshot — not even its author — so the failure is the intended, honest answer rather than a silent
  fallback to the publisher's secrets. This is also why the manifest is worth having: the error message can
  say *what* to define instead of *that something is undefined*.
- **Copying a component onto the canvas** (`insertComponentGraph`) compares `component.variables` against the
  target workflow's declarations and, if anything required is absent or unset, opens the Environment dialog
  pre-seeded with those names and shows a toast: *"Nightly invoice sync needs 2 variables."* The copy is
  editable code in the user's own workflow, so the values the user supplies are the ones it runs with.
  Nothing about the publisher's values is involved.
- **Unpublish/delete** needs no new logic: snapshot declaration rows die with the snapshot through the
  existing FK cascade.
- A published component's manifest exposes **names only** to the organization. That leaks no value, and the
  names are already visible in the copied code (`env["STRIPE_PROD_KEY"]`).

---

## 8. UI

Plain Tailwind + `react-icons`, matching `PublishDialog`'s hand-rolled dialog (there is no component library
in this app).

- `frontend/src/components/Workflows/EnvironmentDialog.tsx` (new): a table of rows — name, value, `Secret`,
  `Required`, description, remove — plus "Add variable" and one Save that issues the per-key `PUT`s and
  `DELETE`s and reports partial failure in a toast. A value cell shows `Not set` or `•••• set` with
  *Replace* / *Clear*; the field is a `type="password"` input that is never populated from the server. Save is
  disabled for a frozen snapshot, which instead renders the declarations read-only.
- `WorkflowEditor.tsx`: an **Environment** button in the header (next to Run, `FiKey`), badged with the
  variable count and flagged amber when a required variable has no value — the same visual language as the
  existing `unsaved changes` and `Types OK` indicators. A `missing variables` 400 from Run opens the dialog
  with the offending names highlighted.
- `api.ts`: a `WorkflowVariablesService` with `readWorkflowVariables`, `updateWorkflowVariable`,
  `deleteWorkflowVariable`, hand-written in that module's existing style (it is deliberately not the
  generated client), plus `WorkflowVariablePublic` / `WorkflowVariableUpdate` types. `WorkflowDetailPublic`
  and `WorkflowComponentPublic` types gain `variables`.
- `NodePalette.tsx`: components that need variables get a "needs 2 variables" hint; `insertComponentGraph`
  returns the unmet names so the editor can act on them.
- `RunPanel.tsx`: render the structured `missing` / `undecryptable` detail as a banner with an *Open
  environment* action instead of a bare 400 string.
- `CodeNodeComponent.tsx` (optional polish): a small key glyph on nodes whose code mentions `env[`. Cheap
  hint, no static analysis guarantee claimed.

---

## 9. Security model, stated plainly

- **Write-only is enforced server-side.** `WorkflowVariablePublic` has no value field, so no route can return
  one; there is nothing to leak from a hijacked session, a browser extension, or a proxy log.
- **Values are encrypted at rest.** The key lives in the API process configuration; a database dump alone is
  not enough to read a credential.
- **Workflow-scoped by construction.** Only the owner (or a superuser) can define a workflow's variables, and
  only that workflow's runs resolve them. A colleague reading a shared snapshot sees names and flags.
- **Whoever can edit a workflow can read its variables.** They can write `result = [{"json": {"k":
  env["X"]}}]` and run it. This is inherent — the same trust boundary the plan already draws in §12
  (*"code runs with the API process's permissions"*) — so variables add no new class of access, only a
  tidier one. Do not put a personal credential in a workflow other people can edit.
- **Because the process environment is still inherited** (§1), a node can also read the platform's own
  `SECRET_KEY`, `POSTGRES_PASSWORD`, `OPENAI_API_KEY`, … with no declaration at all. Per-workflow variables
  therefore *organize and encrypt* credentials; they do **not** isolate nodes from the platform. Anyone who
  wants that isolation later needs the rejected option in §13, and it is a breaking change for nodes that
  read ambient variables today. Flagged again in §14.
- **Redaction is best-effort** (§6.4): run history for a workflow whose node prints a secret is scrubbed for
  that literal value, but transformed copies are not caught.
- **Losing a value means replacing it.** No recovery path exists by design.

---

## 10. Files touched

| File | Change |
|---|---|
| `app/models.py` | `WorkflowVariable` + 4 schemas; `variables` on `WorkflowDetailPublic` and `WorkflowComponent` |
| `app/alembic/versions/<new>_add_workflow_variables.py` | new table + component column |
| `app/services/workflow/secrets.py` | new: Fernet encrypt/decrypt, `decrypt_many`, `SecretsError` |
| `app/services/workflow/variables.py` | new: key validation, `missing_required`, `redact`, `as_specs` |
| `app/services/workflow/engine.py` | `variables` threaded through `execute_node` / `execute_graph` |
| `app/services/workflow/runners/python_runner.py` | `env` in the request, `os.environ.update`, `EnvMapping`, redaction hook |
| `app/services/workflow/publish.py` | declaration copy plan |
| `app/api/routes/workflows.py` | 3 variable routes, `_run_variables`, `_variables_public`, redacted `_finish_run`, publish copy |
| `app/api/routes/components.py` | no change needed — it returns the ORM row, so the new column surfaces once `WorkflowComponentPublic` re-types it; the file is only touched if a listing should omit the manifest |
| `app/core/config.py` | `WORKFLOW_ENCRYPTION_KEY`, `WORKFLOW_VARIABLES_ENABLED` |
| `.env.example` | document the two settings |
| `frontend/src/components/Workflows/{api.ts,types.ts,WorkflowEditor.tsx,NodePalette.tsx,RunPanel.tsx}` | as §8 |
| `frontend/src/components/Workflows/EnvironmentDialog.tsx` | new |
| `README.md`, `docs/code-node-workflows-plan.md` | code-node contract + supersede §2 item 4 |
| `app/tests/` | new `test_workflow_variables.py`; extend engine, runner and publish tests |

No new dependency: `cryptography` is already pinned, and the frontend needs nothing new.

---

## 11. Tests

Backend (`pytest`, no new fixtures needed — the existing suite is pure-function and subprocess based):

- `test_workflow_variables.py` (new): round-trip encrypt/decrypt; ciphertext is not the plaintext; wrong key
  raises `SecretsError`; token scheme prefix; key validation rejects `=`, leading digits, over-length;
  `missing_required` distinguishes absent from undecryptable; `redact` masks long secrets and leaves short
  ones and unrelated text alone.
- `test_workflow_runner.py` (extend): a variable is visible in both `os.environ` and `env`; an inherited
  variable is still visible; a workflow variable shadows an inherited one; `env["NOPE"]` gives the actionable
  message; a value never appears in `logs` when the runner is given one.
- `test_workflow_engine.py` (extend): the mapping reaches `run_node` for every node; `fake_runner`'s
  signature grows the fifth parameter.
- `test_workflow_publish.py` (extend): a published snapshot carries declarations with `value_encrypted` NULL;
  `required` is promoted for variables that had a value; the manifest lands on the component; **no value ever
  reaches the snapshot or the manifest** (assert the plaintext appears nowhere in the snapshot graph).
- Route-level: 400 with the structured `missing` detail; 403 on a frozen snapshot; 400 on a bad key;
  `GET` response contains no value for any field (assert the plaintext is absent from `response.text`).

Frontend: `npx tsc -p tsconfig.build.json --noEmit`, plus a Playwright case in the existing workflow spec —
add a variable, reference it, run, assert the value reached the output, then assert the run history shows
`***`.

Manual check after implementation: `alembic upgrade head`, create a workflow, set a fake
`OPENAI_API_KEY`, run a node returning it, confirm the value in the run panel and `***` in
`GET /workflows/{id}/runs/{run_id}`.

---

## 12. Phased rollout

| Phase | Content | Depends on |
|---|---|---|
| 1 | Model, migration, `secrets.py`, `variables.py`, unit tests | — |
| 2 | Variable routes + `has_value`, `WorkflowDetailPublic.variables`; no values in any response | 1 |
| 3 | Runner request `env` + `EnvMapping` + `os.environ.update`; engine threading | 1 |
| 4 | `_run_variables` fail-fast on both run endpoints; redaction on persist and response | 2, 3 |
| 5 | Publish: declaration copy, promotion, component manifest | 2 |
| 6 | Frontend: `api.ts`/types, `EnvironmentDialog`, header badge, run banner | 2 |
| 7 | Frontend: component "needs variables" flow into the dialog | 5, 6 |
| 8 | Docs, `.env.example`, README, supersede the old plan's §2 item 4 | 4 |

Phases 1–4 are the shippable core (a workflow can hold and use secrets); 5–7 make them pleasant; each phase
is independently reviewable and the suite stays green at every step. `WORKFLOW_VARIABLES_ENABLED=false`
gives a kill switch that hides the routes and treats every workflow as having no variables.

---

## 13. Rejected alternatives

- **Store variables in `Workflow.settings` (the JSON column that already exists).** Cheapest possible
  change, no migration, and it is what the field name invites. Rejected: `WorkflowPublic` returns `settings`
  in every list response, so every secret would be readable by every reader of the workflow; there is no
  per-key write path, no uniqueness, no place for encryption, and no way to express "keep the value I cannot
  see".
- **Bulk `PUT /workflows/{id}/variables`** replacing the whole set, mirroring `PUT …/graph`. Rejected: no
  cross-row invariant needs atomic validation, and write-only values force a sentinel to distinguish "keep"
  from "clear". Per-key upsert states the same thing without the sentinel. (§5)
- **`env` mapping only, no `os.environ`.** Strictest and greppable, but `openai`/`langchain` read
  `OPENAI_API_KEY` from the process environment, so every user would have to write
  `os.environ["OPENAI_API_KEY"] = env["OPENAI_API_KEY"]` first. (§1)
- **Restrict the child to a minimal environment** (`PATH`, `HOME`, locale) plus declared variables. This is
  the design that actually isolates nodes and would make the platform's own secrets unreachable. Rejected for
  v1 in favour of a non-breaking change, at the cost described in §9. It remains the right v2 if workflows
  become multi-tenant. (§1, §14)
- **Organization-wide shared variables** as a fallback tier, so a snapshot run could resolve a company-wide
  key. Rejected for v1: there are no organization roles (`User.organization_id` and `is_superuser` are all
  that exist), so any member could add a shared name, use it from a workflow they own, and read the value
  back out through their own node's output. The table is shaped so this is an additive migration later:
  a `scope`/`organization_id` pair with workflow-level values winning on collision.
- **Author-only fallback: run a snapshot with the source workflow's values.** Convenient for testing your own
  published version, but it shares the publisher's secrets with every organization member who can press Run,
  and it makes a snapshot's outcome depend on a mutable workflow. Rejected; the missing-variables error is
  more honest. (§7)
- **`pgcrypto` / database-side encryption.** Moves the key into the database or the query text, so a dump
  plus a connection string is enough to decrypt. Rejected for an application-held key.
- **External secret manager (Vault, AWS SM, 1Password).** The right answer at scale and the wrong one today:
  no such dependency exists in this stack, and it would make local development require a vault. The
  `secrets.py` boundary is deliberately the only place a value is decrypted, so swapping the backend later is
  a single module.

---

## 14. Open items to confirm

1. **Encryption key**: dedicated `WORKFLOW_ENCRYPTION_KEY` with a documented fallback to a `SECRET_KEY`
   derivation (recommended, zero-config locally) versus requiring a dedicated key outright. Rotation of
   `SECRET_KEY` on a deployment with no dedicated key makes stored values unreadable — surfaced as
   `undecryptable` (§6.1) rather than as silent breakage.
2. **Process-environment inheritance** (§1, §9): confirmed as non-breaking for v1, but it means per-workflow
   variables do not isolate nodes from the platform's own secrets. Worth revisiting before workflows become
   multi-tenant.
3. **Node-test runs blocked by a workflow-wide required variable** (§6.1): consistent, but if
   testing an unrelated node becomes annoying, the alternative is to enforce only the variables the tested
   node's code references — which needs the static analysis rejected here.
4. **Redaction length threshold** of 8 characters (§6.4): a knob, not a principle.
