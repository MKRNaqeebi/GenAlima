# GenAlima — Code-Node Workflow Plan

> Status: **Draft for review**
> Scope: copy the *Code node + graph-of-nodes* feature from n8n into GenAlima, backed by Postgres and GenAlima's existing FastAPI + React stack.
> Out of scope for v1: auth/permissions hardening, import/export, non-code node types (LLM/HTTP/knowledge connectors), scheduling, JavaScript execution.

---

## 1. What we are copying (and what we are not)

n8n's model, stripped to essentials:

- A **workflow** is a DAG of nodes plus edges.
- A **Code node** is a node whose entire behaviour is a user-authored string of Python plus two
  settings: `mode` and `language`.
- Data flows between nodes as a list of **items**, shaped `{ "json": {...}, "binary": {...} }`.
- The whole graph (including the code) is persisted per workflow; execution results are stored
  per run.

We keep the **node/edge/item semantics and the Code-node contract**, because they are what makes
the feature feel like n8n. We deliberately change three storage details, and add one feature n8n
does not have at all:

| n8n | GenAlima plan | Why |
|---|---|---|
| `nodes`/`connections` as one JSON TEXT blob, connections keyed by **node name** | normalized `workflow_node` + `workflow_edge` tables, edges keyed by **node UUID** | per-node CRUD/diff, FK integrity, no rename-rewrites the graph, no giant-blob JSON escaping bugs |
| `jsCode`/`pythonCode` buried inside a JSON `parameters` blob | first-class `code` TEXT column | avoids the `\n`-corruption class of bugs; a `GET` returns code verbatim |
| one execution blob | `workflow_run` + `workflow_run_node` | run history is queryable and rendered in the UI |
| **no node types — a node's contract is implicit** | **every node declares a strict, Pydantic-style input and output contract** | catches wiring mistakes when the graph is saved instead of when the next node runs (§6) |

---

## 2. Assumed defaults (change these if wrong)

1. **Python only.** One runner, no Node dependency for execution. Because GenAlima already ships
   `pandas`, `numpy`, `httpx`, etc., user code runs with normal Python imports available.
2. **Execution is synchronous/manual** (`POST /workflows/{id}/run`). No queue, no scheduler,
   no webhooks in v1. Runs are stored for inspection.
3. **Node `type` field exists from day one** (`type = "code"`), so HTTP / LLM / knowledge nodes
   can be added later without re-shaping the graph.
4. **No credential plumbing.** Code nodes are pure functions of their input items.
5. **No sandboxing/isolation work.** User code is trusted; see §12.
6. IDs are client-generated UUIDs (frontend `uuid` package) so an edge can reference nodes
   before they are persisted — same trick n8n can't use because it keys on names.
7. **Strict typing is part of v1, not a later add-on.** Every node declares its input and output
   contracts; the graph save and the run engine both enforce them (§6). Contracts are optional per
   node (an empty contract means "untyped"), so the feature is adoptable incrementally.

---

## 3. Architecture overview

```
┌─────────────────────────── React (TanStack Router) ───────────────────────────┐
│  /workflows                     /workflow/$workflowId                          │
│  WorkflowsList  ───────────▶   WorkflowEditor                                  │
│                                   ├─ WorkflowCanvas   (@xyflow/react)          │
│                                   ├─ CodeNode         (custom node)            │
│                                   ├─ NodeInspector    (code editor + settings) │
│                                   └─ RunPanel         (per-node status + logs)  │
└───────────────────────────────────────┬────────────────────────────────────────┘
                                        │ generated client (openapi-ts)
┌───────────────────────────────────────▼────────────────────────────────────────┐
│ FastAPI  app/api/routes/workflows.py                                           │
│   CRUD  +  PUT /{id}/graph (transactional upsert)  +  POST /{id}/run           │
├────────────────────────────────────────────────────────────────────────────────┤
│ app/services/workflow/                                                          │
│   graph.py    validate DAG, topo order, entry nodes                             │
│   engine.py   execute graph, accumulate items, persist run rows                 │
│   runners/python_runner.py   subprocess + timeout + sentinel protocol           │
└───────────────────────────────────────┬────────────────────────────────────────┘
                                        │ SQLModel / Alembic
                          workflow · workflow_node · workflow_edge
                          workflow_run · workflow_run_node
```

---

## 4. Data model

New models appended to `app/models.py`, following the existing `Base / Create / Update / Public / XsPublic`
convention and the `owner_id` + `CASCADE` pattern used by `Connector` and `Template`.

```python
# ---------------------------------------------------------------------------
# Workflows
# ---------------------------------------------------------------------------
class WorkflowBase(SQLModel):
    name: str = Field(max_length=255)
    description: str | None = Field(default=None, max_length=1024)
    active: bool = Field(default=True)
    settings: Dict[str, Any] | None = Field(default=None, sa_column=Column(JSON))

class Workflow(WorkflowBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    owner_id: uuid.UUID = Field(foreign_key="user.id", nullable=False, ondelete="CASCADE")
    version: int = Field(default=1)          # bumped on every graph save
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    owner: User | None = Relationship(back_populates="workflows")
    nodes: list["WorkflowNode"] = Relationship(
        back_populates="workflow", sa_relationship_kwargs={"cascade": "all, delete-orphan"})
    edges: list["WorkflowEdge"] = Relationship(
        back_populates="workflow", sa_relationship_kwargs={"cascade": "all, delete-orphan"})

# ---------------------------------------------------------------------------
# Graph parts
# ---------------------------------------------------------------------------
class WorkflowNode(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    workflow_id: uuid.UUID = Field(foreign_key="workflow.id", nullable=False, ondelete="CASCADE")
    key: str = Field(max_length=64)                    # stable, unique inside the workflow
    name: str = Field(max_length=255)
    type: str = Field(default="code", max_length=64)   # only "code" in v1
    type_version: int = Field(default=1)
    position_x: float = Field(default=0)
    position_y: float = Field(default=0)
    disabled: bool = Field(default=False)
    code: str = Field(default="", sa_column=Column(Text))          # <- the code block itself
    input: Dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))   # see §6
    output: Dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))  # see §6
    type_enforcement: str = Field(default="strict", max_length=8)  # strict|warn|off
    parameters: Dict[str, Any] = Field(
        default_factory=lambda: {"language": "python", "mode": "runOnceForAllItems"},
        sa_column=Column(JSON),
    )
    notes: str | None = Field(default=None, max_length=1024)
    workflow: Workflow | None = Relationship(back_populates="nodes")

class WorkflowEdge(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    workflow_id: uuid.UUID = Field(foreign_key="workflow.id", nullable=False, ondelete="CASCADE")
    source_node_id: uuid.UUID = Field(foreign_key="workflownode.id", nullable=False, ondelete="CASCADE")
    source_handle: str = Field(default="main", max_length=32)
    target_node_id: uuid.UUID = Field(foreign_key="workflownode.id", nullable=False, ondelete="CASCADE")
    target_handle: str = Field(default="main", max_length=32)
    workflow: Workflow | None = Relationship(back_populates="edges")
```

> Table names: `workflow`, `workflow_node`, `workflow_edge`, `workflow_run`, `workflow_run_node`.
> `workflow` is not a reserved word in Postgres, but double-check the generated migration.

The contract fields are the one place the table model and the API models deliberately differ:
`WorkflowNode` stores them as plain `Dict[str, Any]`, while `WorkflowNodeCreate` /
`WorkflowNodePublic` type them as `Dict[str, WorkflowFieldSpec]` so payloads are actually
validated. Rationale and the failure this avoids are in §6.2.

### Run history

```python
class WorkflowRun(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    workflow_id: uuid.UUID = Field(foreign_key="workflow.id", nullable=False, ondelete="CASCADE")
    status: str = Field(default="running", max_length=16)   # running|success|error|cancelled
    mode: str = Field(default="manual", max_length=16)      # manual|single_node
    trigger_items: list[dict] = Field(default_factory=list, sa_column=Column(JSON))
    error: str | None = Field(default=None, sa_column=Column(Text))
    started_at: datetime = Field(default_factory=datetime.utcnow)
    finished_at: datetime | None = None

class WorkflowRunNode(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    run_id: uuid.UUID = Field(foreign_key="workflowrun.id", nullable=False, ondelete="CASCADE")
    node_id: uuid.UUID = Field(foreign_key="workflow_node.id", nullable=False, ondelete="CASCADE")
    status: str = Field(default="pending", max_length=16)   # pending|running|success|error|skipped
    input_items: list[dict] = Field(default_factory=list, sa_column=Column(JSON))
    output_items: list[dict] = Field(default_factory=list, sa_column=Column(JSON))
    logs: str | None = Field(default=None, sa_column=Column(Text))
    error: str | None = Field(default=None, sa_column=Column(Text))
    duration_ms: int | None = None
```

Migration: one autogenerated Alembic revision
(`alembic revision --autogenerate -m "add code-node workflows"`), merged as the new head on
top of `088b512b6a7b`. Add `workflows` to the `User` relationship list in `app/models.py`.

---

## 5. Execution engine

### 5.1 Item contract (n8n-compatible)

```python
item  = {"json": {...}, "binary": {}}
items = [item, item, ...]        # every edge carries a list of items
```

n8n reserves five top-level item keys — `json`, `binary`, `pairedItem`, `error`, `index` — and its
Code node adds `pairedItem: {"item": <input index>}` automatically in per-item mode. We do the same
so lineage survives a run; `error`/`index` stay unused for now but are reserved by the validator.

- Entry nodes (in-degree 0) receive the run's `trigger_items` (default `[{"json": {}}]`).
- A node with multiple incoming edges receives the **concatenation** of its upstream outputs,
  in the order edges were created. A future `merge` policy can change this.
- Output validation mirrors n8n: all-items mode must return a list of dicts; each-item mode must
  return one dict (a list is an error), and returning `None` skips that item.

### 5.2 Graph validation (`graph.py`)

1. Every edge endpoint exists in the graph.
2. No duplicate `key`; no self-loops.
3. Kahn's algorithm for a topological order → if leftovers, raise `CycleError` (HTTP 400).
4. Collect entry nodes; if none, raise `NoEntryNodeError`.
5. Unreachable nodes are reported as warnings, not errors.

No new dependency needed — a ~40-line Kahn implementation. (`langgraph` is already installed, but
a plain executor gives us n8n item semantics without fighting a graph library's state model.)

### 5.3 Runner protocol

The runner is a subprocess with one JSON protocol, which keeps the engine decoupled and lets the
runner move into a worker later without touching the engine.

- Parent → child: JSON on **stdin**:
  `{"code": "...", "mode": "...", "items": [...], "timeout": 30}`
- Child → parent: on **stdout**, a sentinel line followed by JSON:
  ```
  <user print() output>
  __ALIMA_RESULT__{"output": [...], "error": null, "logs": "..."}
  ```
  Everything before the sentinel is treated as logs; this survives users printing arbitrary JSON.
- Any non-zero exit / missing sentinel / timeout → `NodeExecutionError` with the captured stderr.

### 5.4 Python runner (`runners/python_runner.py`)

- Invoked as `sys.executable -I runner_python.py` (isolated mode: no user site-packages, no
  `PYTHONPATH`). Working directory is the repo root so GenAlima's installed packages
  (`pandas`, `numpy`, `httpx`, …) import normally.
- `subprocess.run(..., timeout=<node timeout, default 30s>, capture_output=True, text=True)`.
  Timeout exists to keep a bad node from hanging the request, not as a security control.
- User code is `exec`'d in a globals dict that already contains `items`, `item`, `json`, `math`,
  `datetime`, plus the standard builtins. `result` is read back out of that dict.
- User contract:

  ```python
  # runOnceForAllItems — `items` is in scope; assign to `result`
  import pandas as pd
  result = [{"json": {**item["json"], "ok": True}} for item in items]

  # runOnceForEachItem — `item` is in scope; assign `result` to ONE item
  result = {"json": {**item["json"], "seen": True}}
  ```

- **Deliberate divergence from n8n.** n8n injects `_items` / `_item` and wraps user code in a
  function so a top-level `return` works. We chose Pythonic `items` / `item` + a `result`
  assignment instead, to match normal Python. Consequence: n8n Python code does **not** paste in
  unchanged and must be translated on import (see §13).
- Implementation detail: point 2 has an important nuance — **a timed-out `subprocess.run` leaves
  the child alive** if it spawned children. Kill the process group (`start_new_session=True` +
  `os.killpg`) on timeout.

### 5.5 Engine loop (`engine.py`)

```
1. load workflow + nodes + edges, build in-memory graph
2. validate + topological order
3. create WorkflowRun(status="running"), commit (so the UI can poll)
4. for node in topo order:
     inputs = trigger_items if entry else concat(outputs of inbound edges)
     if node.disabled: output = inputs (pass-through); mark "success"
     on_error = node.parameters.get("onError", "stopWorkflow")
     if any upstream failed and on_error == "stopWorkflow":
         mark node "skipped"; continue
     t0; output, logs, error = python_runner.run(node.code, mode, inputs, timeout)
     persist WorkflowRunNode(status, input_items, output_items, logs, error, duration_ms)
     on error: run.status = "error", abort remaining (mark "skipped"), break
5. run.status = success, finished_at; return run with per-node results inline
```

The single-node test endpoint calls the runner directly with caller-supplied items and records a
`WorkflowRun(mode="single_node")` with one `WorkflowRunNode` row, so the UI has one code path.

Failure policy uses n8n's current `onError` field (`stopWorkflow` default, `continueRegularOutput`,
`continueErrorOutput`) rather than the deprecated `continueOnFail` boolean it replaced. It lives in
`parameters`, so no schema change is needed — but the default `parameters` dict in `app/models.py`
should gain `"onError": "stopWorkflow"` for parity.

One deliberate divergence: **a node may be retried/continued, but a `WorkflowRunNode` row is
written once per attempt** — we do not model n8n's `retryOf`/`retrySuccessId` chain.

---

## 6. Strict input/output typing (our addition over n8n)

This is the one thing we do that n8n does not. In n8n a node's contract is implicit: you only find
out that a field is missing when the next node throws. Here every code node declares **typed input
and output contracts**, enforced at authoring time (edges) and at run time (items).

### 6.1 Type language

A contract is a dict of field name → Pydantic-style field spec, which is exactly how the models
store it (`WorkflowFieldSpec` in `app/models.py`):

```python
input  = {"query": {"type": "str", "description": "user question"}}
output = {
    "answer": {"type": "str"},
    "score":  {"type": "float", "default": 0.0},
    "sources": {"type": "list", "items": "str", "required": False},
}
```

Rules (Pydantic semantics, verified against the implementation):

- `type` ∈ `str | int | float | bool | list | dict | datetime | Any`. Typos like `"string"` are
  rejected at write time.
- `list` fields name their element type in `items`; `dict` is an untyped JSON object.
- `required` is **derived**: omit it and it becomes `false` when a `default` is set, `true`
  otherwise — same as writing `x: float = 0.0` in Pydantic. Declaring `required: true` *with* a
  default is rejected as contradictory.
- `{"q": "str"}` is accepted as shorthand for `{"q": {"type": "str"}}`.
- Contracts are **canonicalised on write** (shorthands expanded, `required` resolved, all keys
  present), so the JSON column always holds a uniform, complete spec.
- An empty dict means "no declared contract". That is legal for an entry node's input, but an
  untyped **output** cannot be statically proven to satisfy a typed downstream input (see 6.4).

### 6.2 Storage

`workflow_node` gains three columns via the already-written models:

| Column | Type | Meaning |
|---|---|---|
| `input` | JSON | declared input contract |
| `output` | JSON | declared output contract |
| `type_enforcement` | `strict` \| `warn` \| `off` | how violations are handled |

One implementation trap already hit and fixed: on SQLModel `table=True` classes, `sa_column`
fields **skip type validation on direct construction**, and a `Dict[str, <PydanticModel>]`
annotation stores model instances that `json.dumps` cannot serialise. So `WorkflowNode` re-types
`input`/`output` to plain `Dict[str, Any]` while `WorkflowNodeCreate`/`WorkflowNodePublic` keep the
typed `Dict[str, WorkflowFieldSpec]`. Validation happens through `model_validate` (the pattern the
rest of the repo uses), never through direct `WorkflowNode(...)` kwargs.

### 6.3 Runtime enforcement (`app/services/workflow/types.py`)

Per node, around the runner call:

1. **Input check** — each incoming item's `json` is validated against the input contract before
   the runner starts. A violation is attributed to the **incoming edge**, not just to this node,
   so the error names the upstream node the author actually needs to fix.
2. **Output check** — each returned item's `json` is validated against the output contract.

Semantics:

- Validation is **strict**: no coercion (`"10"` does not satisfy `int`), undeclared fields are
  allowed and ignored, and a declared field of the wrong type fails. (Exact-shape contracts are a
  possible later flag — see §15.)
- Missing required field or wrong type → `ValidationError` carrying item index and field path:
  `item 2: field 'score' expected float, got str`.
- `type_enforcement` decides the consequence: `strict` behaves like a node failure and follows the
  node's `onError` policy; `warn` records the message in `WorkflowRunNode.logs` and continues;
  `off` skips validation for that node.
- Compilation is cached per node (schema hash → Pydantic model built with `create_model`), so a
  100-item run validates without rebuilding the model 100 times. No new dependency — Pydantic is
  already installed.

### 6.4 Static edge checking on save

`PUT /workflows/{id}/graph` runs a compatibility pass over every edge and returns **400** listing
each incompatible one, instead of silently storing a graph that can only fail at run time.

An edge `source → target` is compatible when, for each field `f` in `target.input`:

| Case | Result |
|---|---|
| `f` not in `source.output` and `target.input[f]` has a default | ok (default fills it) |
| `f` not in `source.output` and is optional | ok (may legitimately be absent) |
| `f` not in `source.output` and is required | **error** — target requires a field nothing provides |
| `f` in both, types identical | ok |
| `f` in both, `int` → `float` | ok (the one allowed widening) |
| `f` in both, either side `Any` | source `Any` → error (unprovable); target `Any` → ok |
| `f` in both, `list` types but `items` differ or source `items` unset | **error** |
| `f` required by target but optional in source | **error** — source may omit it at run time |

Skipped: edges into a node whose `type_enforcement` is `off`, and disabled nodes (pass-through).
An untyped output feeding a typed input is reported as "source has no declared output contract",
which is the message that pushes authors to annotate the upstream node.

### 6.5 Editor

- The node inspector gains an **Input / Output** contract builder: a row per field (name, type,
  required-or-default, description) with add/remove, plus a raw-JSON escape hatch.
- A connection that fails the compatibility check is drawn as an error edge with the reason in a
  tooltip, so the 400 is locatable rather than a wall of text.
- The run panel shows the node's actual return shape next to the declared output, and a later
  "infer contract from last run" button can propose a contract — deliberately not in v1.

---

## 7. Backend API

New router `app/api/routes/workflows.py`, registered in `app/api/main.py` as
`api_router.include_router(workflows.router)`.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/workflows/` | paginated list (`skip`/`limit`, owner-scoped, same shape as `TemplatesPublic`) |
| `POST` | `/workflows/` | create with `{name, description}`; returns workflow + empty graph |
| `GET` | `/workflows/{id}` | workflow + nodes + edges in one payload |
| `PUT` | `/workflows/{id}` | rename / description / active / settings |
| `DELETE` | `/workflows/{id}` | hard delete (cascades to nodes, edges, runs) |
| `PUT` | `/workflows/{id}/graph` | **transactional** upsert of `{nodes, edges}`; deletes removed ones; bumps `version` |
| `POST` | `/workflows/{id}/run` | `{items?: [...]}` → execute full graph, return run + node results |
| `POST` | `/workflows/{id}/nodes/{node_id}/run` | `{items: [...]}` → single-node test |
| `GET` | `/workflows/{id}/runs` | run history (paginated) |
| `GET` | `/runs/{run_id}` | full run with per-node input/output/logs |

Pydantic payloads — these already exist in `app/models.py` as `WorkflowNodeCreate`,
`WorkflowEdgeCreate`, `WorkflowGraphIn`, `WorkflowGraphPublic` and `WorkflowRunIn`:

```python
class WorkflowNodeCreate(WorkflowNodeBase):
    id: uuid.UUID | None = None            # client-generated; server fills if absent
    # inherits code, input, output, type_enforcement, parameters, position_*, ...
```

Two construction rules enforced by the models, both verified against a real insert:

- Validate payloads through `WorkflowNodeCreate.model_validate(...)`, **not** by constructing
  `WorkflowNode(...)` directly — on a `table=True` class the constructor skips Pydantic
  validators entirely, so malformed contracts would reach the database.
- `WorkflowNodeCreate.id` is optional so edges can reference not-yet-saved nodes. `WorkflowNode`
  resolves a missing id in a `mode="before"` validator, so `WorkflowNode.model_validate(
  node_in.model_dump(), update={"workflow_id": ...})` generates the PK instead of failing on
  `id=None`. Don't strip `id` first; the model handles it.

`PUT /graph` semantics (this is the save path the editor uses):

1. Validate DAG (else `400` with the offending node/edge ids).
2. **Type-check every edge** (§6.4); on failure return `400`:
   `{"detail": {"message": "incompatible connections", "edges": [{"edge_id": ..., "reason": "field 'score' required by target but not provided by source"}]}}`.
3. In one transaction: upsert nodes by `id` (or `key`), upsert edges, delete rows not present.
4. `workflow.version += 1`, `workflow.updated_at = utcnow()`.
5. Return the canonical graph (fresh ids, canonicalised contracts) so the client can reconcile.

Notes:
- Reuse `CurrentUser` / `SessionDep` from `app/api/deps.py` and the owner-scoping style of
  `templates.py`. Keep the existing dependency so we don't accidentally create an
  unauthenticated surface.
- `main.py::serve_index` lists SPA paths explicitly — add `@app.get("/workflows")` and
  `@app.get("/workflow/{workflow_id}")` so a hard refresh on the editor doesn't 404.
- Prefer `orjson` (already a dependency) for run payload responses if JSON-encoding large item
  lists shows up in profiling.

---

## 8. Frontend

### 8.1 Dependencies to add

```
@xyflow/react             # React Flow v12 — canvas, pan/zoom, handles, minimap
@uiw/react-codemirror      # CodeMirror 6 React wrapper
@codemirror/lang-python
```

No state library is added — local `useState` + react-query is enough and matches the rest of the app.

### 8.2 Routes

- `frontend/src/routes/_layout/workflows.tsx` — card grid + "Add Workflow", mirroring
  `templates.tsx` (search bar, `PaginationFooter`, `AddWorkflow` modal).
- `frontend/src/routes/_layout/workflow.$workflowId.tsx` — full-height editor page
  (`h-screen`, `dark:bg-chat-bg`), no page-level scrolling; panels scroll internally.

### 8.3 Components (`frontend/src/components/Workflows/`)

| File | Responsibility |
|---|---|
| `WorkflowEditor.tsx` | owns graph state, dirty flag, save/run mutations, wires panels |
| `WorkflowCanvas.tsx` | React Flow canvas; `nodes`/`edges` adapters; connect/select/delete; `MiniMap`, `Controls`, `Background` |
| `CodeNode.tsx` | custom node card: name, run status colour, declared input → output summary, code preview, one source + one target handle |
| `NodeInspector.tsx` | tabbed right panel: **Code** (mode, timeout, disabled, CodeMirror editor) and **Contract** (see next row) |
| `FieldContractEditor.tsx` | Input/Output contract builder: one row per field (name, type, required-or-default, description), add/remove, raw-JSON escape hatch |
| `RunPanel.tsx` | Run button, per-node status timeline, logs, pretty-printed output items, validation warnings |
| `AddWorkflow.tsx` | create modal (name + description) |
| `types.ts` | `GraphNode`, `GraphEdge`, `RunResult` frontend types |
| `useWorkflowGraph.ts` | load/save/dirty logic + react-query keys (`["workflow", id]`) |

### 8.4 State & persistence

- Load: `WorkflowsService.readWorkflow({ id })` → hydrate React Flow nodes/edges.
- Local edits are optimistic; a `dirty` flag drives an explicit **Save** button and a
  `beforeunload` guard (autosave-on-debounce is a later nicety).
- Save: `WorkflowsService.updateWorkflowGraph({ id, requestBody: { nodes, edges } })`
  (names after `npm run generate-client`) → replace local state with the response, clear dirty.
- A save that fails type-checking returns `400` with per-edge reasons; mark those edges as errors
  and open the first offending node's Contract tab rather than showing a generic toast.
- Run: `WorkflowsService.runWorkflow({ id, requestBody: { items } })` → populate `RunPanel`;
  invalidate `["workflow-runs", id]`.
- On run, colour nodes by their `WorkflowRunNode.status`; clicking a node shows its
  input/output/logs in the inspector's "Last run" tab, with any `warn`-mode validation messages
  listed next to the declared contract.

### 8.5 Generated client

1. Backend running, then refresh `frontend/openapi.json` from `/api/v1/openapi.json`.
2. `cd frontend && npm run generate-client` (openapi-ts, `legacy/axios`, class-per-tag).
3. The `workflows` tag produces `WorkflowsService` — exactly why every route keeps a distinct tag.

### 8.6 Navigation

Add to `topMenuItems` in `frontend/src/components/Common/SidebarItems.tsx`:

```ts
{ icon: FiCode, label: "Workflows", path: "/workflows" },
```

---

## 9. File-by-file change map

| Action | Path |
|---|---|
| modify | `app/models.py` — workflow models, `User.workflows` relationship |
| add | `app/api/routes/workflows.py` |
| modify | `app/api/main.py` — register router |
| modify | `main.py` — SPA fallback routes for `/workflows`, `/workflow/{id}` |
| add | `app/services/__init__.py`, `app/services/workflow/{__init__,graph,engine,types}.py` — `types.py` owns contract validation + edge compatibility (§6) |
| add | `app/services/workflow/runners/runner_python.py` |
| add | `app/alembic/versions/<rev>_add_code_node_workflows.py` |
| modify | `requirements.txt` — plan: no changes |
| modify | `frontend/package.json` — xyflow + codemirror deps |
| add | `frontend/src/routes/_layout/workflows.tsx`, `frontend/src/routes/_layout/workflow.$workflowId.tsx` |
| add | `frontend/src/components/Workflows/*` |
| modify | `frontend/src/components/Common/SidebarItems.tsx` |
| regenerate | `frontend/openapi.json`, `frontend/src/client/*` |
| add | `app/tests/test_workflow_graph.py`, `test_workflow_types.py`, `test_workflow_runner.py`, `test_workflow_api.py` |
| update | `README.md` roadmap checkbox; `docs/homepage.md` if it lists features |

---

## 10. Milestones

**M0 — schema & CRUD (backend only).**
Models (already written and verified) + migration + `/workflows` CRUD + `PUT /graph` with DAG
**and type-compatibility** validation.
*Done when:* curl can create a workflow, save 2 nodes + 1 edge, and `GET` returns the exact code and
canonical contracts back; saving an edge whose source output doesn't satisfy the target input is
rejected with a per-edge reason.

**M1 — engine + Python runner.**
`graph.py`, `engine.py`, `types.py`, `python_runner.py`, `POST /run` and single-node run.
*Done when:* a 3-node Python DAG (`split → transform → aggregate`) with declared contracts executes,
both run rows and per-node I/O are persisted, and an item violating a contract fails with
`item N: field 'x' expected float, got str` under `strict` and merely logs under `warn`.

**M2 — editor UI.**
Routes, list page, canvas, CodeNode, inspector with Code + Contract tabs, Save/Run.
*Done when:* a user can build a typed graph in the browser, get a locatable error on an
incompatible connection, save, reload, and see contracts and code intact.

**M3 — run visibility + polish.**
`RunPanel`, node status colouring, logs and output inspection, run history list, empty/loading
states, error surfacing, keyboard shortcuts (Save, Run), output-size caps, run pruning, code-size
limits.

---

## 11. Testing

- **Unit (pytest, no DB):** Kahn validation (cycle, missing endpoint, no entry node, duplicate key);
  runner protocol round-trip; sentinel parsing when user code prints JSON; timeout produces a clean
  error and kills the process group.
- **Model layer (already verified manually, needs to be locked in as tests):** `required` derives
  from `default`; unknown types, unknown spec keys, explicit `required`+`default`, and bad
  `type_enforcement` are all rejected; shorthand `{"q": "str"}` canonicalises; a create payload
  persists through `WorkflowNode.model_validate` with a server-generated id.
- **Type system (`test_workflow_types.py`):** every row of the §6.4 compatibility table, including
  the `Any` asymmetry, `int → float` widening, and required-in-target/optional-in-source; runtime
  strictness (`"10"` must **not** satisfy `int`); `warn`/`off` behaviour.
- **Runner contract:** one test per mode (`runOnceForAllItems`, `runOnceForEachItem`), plus
  disabled-node pass-through and `onError`.
- **API (TestClient + test DB):** CRUD, `PUT /graph` upsert/replace semantics, owner scoping,
  run persistence, 400 on a cyclic graph, and 400 listing incompatible edges.
- **Frontend (Playwright, existing setup in `frontend/tests`):** create workflow → add two code nodes →
  declare contracts → connect → save → reload → run → assert per-node success badges and that an
  incompatible connection is flagged before saving.

---

## 12. Execution notes

The user's code is trusted, so there is **no sandbox, no resource limits, and no isolation** in v1:
it runs as the API process user, with normal Python imports, in a subprocess purely so that a
timeout can be enforced and a crash can't take down the request handler. The only guardrails are
operational, not security: a per-node wall-clock timeout (default 30s), an output-items cap, and a
run history that can be pruned.

Consequence to keep in mind: the API is single-tenant and anyone who can reach the run endpoint can
execute arbitrary Python on the host. That's an accepted trade-off for v1.

---

## 13. n8n parity and interop (audit result, no work now)

Verified against n8n source (`WorkflowEntity`, `ExecutionEntity`, `INode` in `interfaces.ts`, and
the Python task runner), not just the docs. **We are not schema-compatible with n8n and should not
pretend to be.** What matches and what doesn't:

| Area | n8n | GenAlima | Same? |
|---|---|---|---|
| Item shape | `json`, `binary`, `pairedItem`, `error`, `index` | `json`, `binary`, `pairedItem` | ~ |
| Mode names | `runOnceForAllItems` / `runOnceForEachItem` | identical | ✅ |
| Node location | inside `nodes` JSON array on the workflow row | own `workflow_node` table | ❌ |
| Node identity | `name` is the connection key; `id` is informational | `id` UUID is the key; `key` is a stable label | ❌ (deliberate) |
| Code location | `parameters.jsCode` / `parameters.pythonCode` | top-level `code` column | ❌ (deliberate) |
| Connections | `{[nodeName]: {main: [[{node, type, index}]]}}` | edge rows with UUID endpoints + `*_handle` strings | ❌ (gap: no integer port index, no connection type) |
| Node runtime fields | `onError`, `retryOnFail`, `maxTries`, `waitBetweenTries`, `alwaysOutputData`, `executeOnce`, `credentials`, `webhookId`, `notesInFlow` | none (except `disabled`) | ❌ |
| Versioning | `versionId` + `workflow_history` table + `versionCounter` | `version` int only | ❌ |
| Workflow extras | `pinData`, `staticData`, `meta`, `triggerCount`, `isArchived`, folders | none | ❌ |
| Run storage | 1 row + blobs in `execution_data` (offloadable to fs/s3), integer id | `workflow_run` + `workflow_run_node` rows, UUID id | ❌ (deliberate) |
| Run extras | `retryOf`, `waitTill`, `deletedAt`, size accounting, tracing | none | ❌ |
| **Input/output types** | **none — a node's contract is implicit** | **strict declared contracts, enforced on edges and at run time** | ✅ **ours only** (§6) |

Known gap worth fixing before the connection model is frozen: n8n connections carry a **connection
type** (`main`, `ai_languageModel`, …) and an **integer port index**; our `source_handle` /
`target_handle` strings have nowhere to put either. Two strings can express `"main"` and later
`"true"`/`"false"` for an IF node, but not `{type, index}`. Revisit if IF-style or AI-port nodes
are ever added.

### Field mapping (for a future importer)

| n8n | GenAlima |
|---|---|
| `n8n-nodes-base.code`, `typeVersion: 2` | `type: "code"`, `type_version: 1` |
| `parameters.language: "pythonNative"` | `parameters.language: "python"` |
| `parameters.mode` | identical strings |
| `parameters.pythonCode` | `code` |
| `node.id`, `node.name`, `node.position [x,y]` | `id`, `name`, `(position_x, position_y)` |
| `connections[sourceName].main[0][].node` | `workflow_edge(source_node_id → target_node_id)` |
| `node.onError` | `parameters.onError` |
| `pairedItem`, `binary` | preserved as-is |

### Code translation (required, because of the §5.4 divergence)

An importer must rewrite the *code*, not just the fields:

| n8n Python | GenAlima |
|---|---|
| `_items` | `items` |
| `_item` | `item` |
| top-level `return X` | `result = X` |
| `_query` (tool calls only) | unsupported — reject with a clear error |

Code that only mutates `_items` in place and returns it translates mechanically. Anything else
(conditionals around `return`, early returns, nested functions) needs real analysis — so the
importer should parse and translate via `ast`, and **fail loudly** on constructs it can't rewrite
rather than emitting silently-wrong Python.

Deliberately **not** mapped: credentials, `pinData`, `staticData`, JavaScript code nodes
(rejected as unsupported language), `retryOnFail`/`maxTries`, workflows with `ai_*` connections.


---

## 14. Risks

| Risk | Mitigation |
|---|---|
| Editor state vs. server graph drift after concurrent saves | `version` column; reject `PUT /graph` when the client's `version` is stale (409) — decide in M2 |
| React Flow + Tailwind dark theme clash | scope canvas styles, reuse existing `dark:bg-chat-*` tokens |
| Large outputs bloating Postgres | cap item count/bytes per node; truncate persisted `output_items` and mark truncated |
| TanStack Router file-route naming pitfalls (`workflow.$workflowId.tsx`) | verify route tree generation during M2, not at the end |
| Generated client churn | regenerate only after the backend route set is stable for the milestone |
| Long-running node hangs the HTTP request | per-node subprocess timeout + process-group kill |
| Connection model can't express n8n port *type* + integer *index* (only `*_handle` strings) | fine for code-only graphs; revisit before IF-style or AI-port nodes (see §13) |
| Strict contracts reject legitimate graphs because a node passes through fields it doesn't declare | v1 checks only *declared* fields and ignores undeclared ones (§6.3); if that's too loose, add an explicit exact-shape flag rather than changing the default (§15) |
| Contract authoring becomes a chore that pushes users to leave contracts empty | empty contracts stay legal, and an "infer from last run" helper is the planned escape hatch (§6.5) |

---

## 15. Open questions

1. **Exact-shape contracts:** should a node be able to say "these are the *only* fields" (rejecting
   undeclared incoming fields), or is the current "declared fields are checked, extras pass
   through" rule the right default? Current plan: extras pass through.
2. **Save model:** explicit Save button (plan) vs. autosave-on-change?
3. **Where do graph runs get their first items?** Manual JSON input box (plan) vs. tied to a chat
   message / agent tool call.
4. **Should the run endpoint be async** (202 + poll `GET /runs/{id}`) once graphs get slow, or stay
   synchronous for now? (Plan: synchronous, since node timeouts bound latency.)
5. **Node type extensibility:** expose `type` in the UI now (disabled dropdown) or keep it fully
   internal until a second node type exists?
6. **Nested object contracts:** `dict` is currently an untyped JSON object, so a node cannot declare
   the shape of a nested object or a list of objects. Add a recursive `fields` key to
   `WorkflowFieldSpec` when a real use case appears, or keep contracts flat?
