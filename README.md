# GenAlima

GenAlima is a visual builder for **typed Python workflows**. You wire code nodes into a graph,
declare what each node takes in and gives back, run the graph, and publish it as a versioned
**component** your organization can drop into other workflows.

It borrows n8n's Code-node model (a DAG of nodes passing lists of `{"json": {...}}` items) and adds
the one thing n8n does not have: every node can declare a strict input and output contract, so a
bad connection is caught while you wire it instead of when the next node crashes.

## What you can do

- **Build** — drag Python code nodes onto a canvas and connect them. Each connection maps which
  output field feeds which input field.
- **Type** — declare contracts per node (`str`, `int`, `float`, `bool`, `list`, `dict`,
  `datetime`, `Any`). Incompatible connections turn red on the canvas, and the **issues** button
  in the top bar jumps to each one. The server rejects a graph that does not type-check.
- **Run** — run the whole graph (⌘↵) or test one node from the inspector. The run panel shows
  every node's status, timing, input, output, logs, and the declared output next to the shape the
  node actually returned. Past runs stay in a history picker.
- **Publish** — publish a graph with exactly one entry and one exit node as a component version.
  Components appear in the editor palette (⌘K) and are copied onto the canvas as editable nodes.

## Code node contract

```python
# runOnceForAllItems: `items` is in scope; assign a list to `result`
result = [{"json": {**item["json"], "ok": True}} for item in items]

# runOnceForEachItem: `item` is in scope; assign one item, or None to drop it
result = {"json": {"total": item["json"]["price"] * item["json"]["qty"]}}
```

A returned dict without a `json` key is wrapped for you. `print()` output shows up in the node's
logs. Each node runs in a subprocess with a timeout (30s by default). It is **not a sandbox**: code
runs with the API process's permissions, so only give workflow access to people you trust. See
[docs/code-node-workflows-plan.md](docs/code-node-workflows-plan.md) for the full design.

## Quick start

Prerequisites: Python 3.11+, Node.js 18+, PostgreSQL 14+.

```bash
# Backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # set POSTGRES_*, SECRET_KEY, FIRST_SUPERUSER*
alembic upgrade head
python main.py                # http://localhost:8000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev                   # http://localhost:5173
```

API docs are at `http://localhost:8000/docs` once the backend is running.

## Project structure

```
app/
  api/routes/workflows.py     CRUD, graph save, run, run history, publish
  api/routes/components.py    published component versions
  services/workflow/
    graph.py                  DAG validation and topological order
    types.py                  contract checks (save time and run time)
    engine.py                 graph execution and onError policies
    runners/                  Python subprocess runner
    publish.py                snapshot planning for components
  models.py                   SQLModel tables and API schemas
  alembic/                    migrations
frontend/src/
  components/Workflows/       canvas, palette, inspector, run panel, publish dialog
  routes/                     /workflows, /workflow/$id, /components
```

## Key endpoints

| Method | Path | Purpose |
|---|---|---|
| `PUT` | `/api/v1/workflows/{id}/graph` | save the graph; 400 lists every bad node and edge |
| `POST` | `/api/v1/workflows/{id}/run` | run the saved graph with `{"items": [...]}` |
| `POST` | `/api/v1/workflows/{id}/nodes/{node_id}/run` | test one node |
| `GET` | `/api/v1/workflows/{id}/runs` | run history, newest first |
| `GET` | `/api/v1/workflows/{id}/runs/{run_id}` | one run with per-node results |
| `POST` | `/api/v1/workflows/{id}/publish` | publish as a component version |
| `GET` | `/api/v1/components/` | components shared with your organization |

## Development

```bash
pytest                                     # backend unit tests
cd frontend && npx tsc -p tsconfig.build.json --noEmit
cd frontend && npx playwright test         # end-to-end (needs both servers running)
alembic revision --autogenerate -m "..."   # new migration
```

Issues: [GitHub Issues](https://github.com/MKRNaqeebi/GenAlima/issues)
