# GenAlima — Workflow Deployment to AWS Lambda Plan

> Status: **Draft for review**
> Scope: a **Deploy** button in the workflow editor that bundles a workflow's graph, node code and
> pip packages into a zip, creates or updates an AWS Lambda function from it, and wires the trigger
> the author chooses — HTTP API (x-api-key), cron (EventBridge), or none.
> Depends on: `docs/code-node-workflows-plan.md` (the engine), `docs/workflow-environment-variables-plan.md` (not yet implemented — see §12).
> Out of scope for v1: workflow variables reaching the Lambda, deploying *components*, JavaScript or other
> runtimes, Lambda Layers, provisioned concurrency, custom domains, rollback to a previous deployment.

---

## 1. Decisions taken (from review)

| Question | Decision |
|---|---|
| Where are pip packages declared? | **Workflow-level `settings.packages`** — one list per workflow, edited in the deploy dialog and persisted on the workflow. Matches the fact that a Lambda has exactly one dependency set. |
| How is the zip built? | **Plain `pip install --target`, then zip**, run on the API host. The API image is `python:3.11` Linux (`Dockerfile`), so the wheels are Linux wheels. No Docker-in-Docker, no cross-platform flags. §7 records the hazard this creates on a macOS dev host. |
| How does the backend authenticate to AWS? | **Platform-level settings** in `app/core/config.py` (`AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`). The app is single-tenant, so per-organization credentials would buy nothing but a new encrypted model. |
| Which triggers ship in v1? | **HTTP + cron + none.** HTTP is an API Gateway HTTP API requiring an `x-api-key`; cron is an EventBridge schedule with a timezone and an optional static payload. |
| Is deploy synchronous? | **No — async.** `POST` returns **202** with a `pending` row; the build runs in a background task; the dialog polls `GET /deployments/{id}` every 2s. A build takes 30–90s (pip install, `CreateFunction`, API Gateway) and a synchronous request would risk a proxy timeout. |
| Where does the Lambda execution role come from? | **Auto-created** (`genalima-workflow-lambda-role`, CloudWatch Logs permissions only), with `DEPLOY_LAMBDA_ROLE_ARN` overriding it. Makes the button work with no manual AWS setup. |
| One API Gateway per deployment, or one shared? | **One HTTP API per deployment.** `DELETE` then removes exactly what `POST` created, with no shared-resource races or slug collisions. |
| Does the S3 upload path ship in v1? | **Yes.** Any dependency set with `pandas`/`numpy`/`lxml` exceeds Lambda's 50 MB direct-upload limit, and a deployment path that cannot install them is not worth shipping. |
| Where is the HTTP API key enforced? | **In the handler**, against a `GENALIMA_API_KEY` Lambda environment variable. Avoids API Gateway usage-plan plumbing and, unlike a route-level setting, also protects `none`-trigger direct invokes. |

---

## 2. What the button does

One action, four steps:

```
Deploy click
  │
  ├─ 1. Freeze   snapshot the graph (plan_snapshot) → graph.json
  ├─ 2. Bundle   copy the stdlib-only runtime + handler.py + requirements.txt,
  │              pip install --target, zip
  ├─ 3. Publish  CreateFunction / UpdateFunctionCode  (ZipFile, or S3 past 50 MB)
  └─ 4. Wire     HTTP API + route + stage   |   EventBridge rule + target   |   nothing
```

The result is a self-contained artifact: it runs the **same** engine modules the API runs, with no
database and no SQLModel. Nothing is forked, so a deployed workflow cannot drift from the editor.

---

## 3. The one refactor that unblocks everything

The runtime is *almost* bundleable already. `graph.py` is stdlib-only, `python_runner.py` is
stdlib-only **by explicit design** (it is executed with `python -I`, see its module docstring), and
`engine.py` imports only those two plus `types.py`.

The single blocker is one line:

```python
# app/services/workflow/types.py:15 — today
from app.models import ALLOWED_FIELD_TYPES
```

`app.models` pulls in SQLModel and SQLAlchemy, so any bundle containing `types.py` drags the ORM in.

**Fix:** invert the dependency.

| File | Change |
|---|---|
| `app/services/workflow/types.py` | define `ALLOWED_FIELD_TYPES` here; delete the `app.models` import |
| `app/models.py:199` | `from app.services.workflow.types import ALLOWED_FIELD_TYPES` |

The import graph becomes `models → services.workflow.types → stdlib`. No cycle, and
`engine.py` + `graph.py` + `types.py` + `runners/python_runner.py` are thereafter stdlib-only and
copied into the zip **verbatim**.

### A happy accident worth noting

`python_runner.py:48` already computes its working directory as `Path(__file__).resolve().parents[4]`.
In the repository that is the repo root. Inside a Lambda zip at
`/var/task/app/services/workflow/runners/python_runner.py` it is `/var/task` — the function root,
which is exactly right, because Lambda puts the bundle root on `sys.path` and runs there anyway.
The runner's parent/child protocol therefore works unmodified in both places.

---

## 4. Bundle layout

```
deployment.zip
├── handler.py                      # static template, copied verbatim
├── graph.json                      # the frozen graph + trigger metadata
├── requirements.txt                # only when settings.packages is non-empty
├── <pip dependencies>              # pip install --target <bundle>, at the root
└── app/
    ├── __init__.py
    └── services/
        ├── __init__.py
        └── workflow/
            ├── __init__.py
            ├── engine.py
            ├── graph.py
            ├── types.py
            └── runners/
                ├── __init__.py
                └── python_runner.py
```

Every `__init__.py` above is empty or a docstring today, so copying the package tree is safe.

Dependencies are installed **at the bundle root**, which is the Lambda convention and what
`--target` does naturally. A dependency named `app` would shadow the runtime, so the package list is
validated and any normalized name of `app` is rejected at deploy time with a clear message.

`graph.json`:

```json
{
  "workflow_id": "…",
  "workflow_version": 4,
  "deployed_at": "2025-01-01T00:00:00Z",
  "trigger_type": "http",
  "nodes": [
    {
      "id": "…", "key": "…", "name": "…", "type": "code", "type_version": 1,
      "code": "…", "input": {}, "output": {},
      "type_enforcement": "strict", "parameters": {}, "disabled": false
    }
  ],
  "edges": [
    { "id": "…", "source_node_id": "…", "target_node_id": "…", "mapping": {} }
  ]
}
```

The node and edge dicts are exactly the shape `validate_and_order` and `execute_graph` already
consume, so no translation layer exists to get out of sync.

`graph.json` is built from the **frozen snapshot** rows rather than the live workflow, reusing
`plan_snapshot` and `publish_shape` from `app/services/workflow/publish.py`. A deployed artifact is
therefore immune to later edits, and re-deploying is the only way to change it — the same
immutability rule the component publishing path already follows.

---

## 5. `handler.py`

A static template copied verbatim into every bundle, so it is reviewed once rather than generated
per deployment:

```python
_GRAPH = json.load(open(os.path.join(os.path.dirname(__file__), "graph.json")))
_EXIT = publish_shape(_GRAPH["nodes"], _GRAPH["edges"]).exit_id

def handler(event, context):
    # 1. HTTP: constant-time compare of x-api-key against GENALIMA_API_KEY
    # 2. Build trigger items (table below)
    # 3. result = execute_graph(nodes, edges, trigger_items)
    # 4. HTTP → {statusCode, headers, body}; others → the run result dict
```

### Trigger items

| Trigger | Event shape | Items |
|---|---|---|
| HTTP | API Gateway payload 2.0; `body` base64-decoded when `isBase64Encoded` | JSON object → `[{"json": obj}]`; JSON array → one item per element |
| Cron | EventBridge scheduled event | the dialog's static payload, else `[{"json": {}}]` |
| None / direct | raw dict | passed through, else `[{"json": {}}]` |

Cron payloads are validated with the existing `validate_items(items, contract, label=…)` against the
entry node's declared contract — the same rule a manual run applies, so a bad payload is caught in
the dialog rather than at 03:00.

### Response

The HTTP response body is the **exit node's** output items, read out of `RunResult.nodes` by
matching `_EXIT` (the `publish_shape` exit id). A failed run returns HTTP 500 carrying the engine's
`error` string. For cron and direct invokes the run result dict is returned as-is; EventBridge
ignores it.

### Authentication

The handler compares the `x-api-key` header against `GENALIMA_API_KEY` from the Lambda environment
(Lambda encrypts environment variables at rest with KMS) using a constant-time comparison. The
plaintext key is returned **once**, in the response to the creating `POST`; the database stores only
its SHA-256. Rotation is a redeploy, which mints a new key.

Enforcing this in the handler rather than with an API Gateway usage plan keeps the deploy to one
fewer resource family, removes the key/usage-plan/stage association dance, and — the deciding
reason — also gates `none`-trigger functions invoked directly with `lambda:InvokeFunction`.

---

## 6. Trigger wiring

| Trigger | AWS resources | Stored on the row |
|---|---|---|
| **http** | `apigatewayv2.create_api` (payload format 2.0) → `create_integration` (AWS_PROXY) → `create_route` (`ANY /{slug}`) → `create_stage` (`$default`, autoDeploy) → `lambda.add_permission` (apigateway) | `api_id`, `endpoint_url`, `api_key_hash` |
| **cron** | `events.put_rule` (`ScheduleExpression`, `State=ENABLED`) → `events.put_targets` → `lambda.add_permission` (events) | `schedule_expression`, `schedule_timezone`, `cron_payload` |
| **none** | nothing beyond the function itself | `function_arn` |

Because a deployment owns its API outright, `DELETE` is exact and idempotent: it removes the
EventBridge rule and targets, then the HTTP API, then the function, then the log group, collecting a
per-resource outcome so a partial failure is reported rather than swallowed.

Changing the trigger type on redeploy tears down the previous trigger's resources before creating
the new ones — a workflow that moves from cron to HTTP must not leave a schedule firing.

---

## 7. Packaging

`app/services/deployment/packager.py` is deliberately **pure**: it plans a bundle as a list of
`(relative_path, bytes)` entries and never touches AWS. That makes the part most likely to be wrong
— what goes into the artifact — unit-testable in isolation, and it lets the high-value test in §10
build and execute a real bundle in a temp directory.

Steps:

1. `plan_bundle(snapshot, packages, trigger)` returns the runtime files, `handler.py`, `graph.json`
   and, when packages are present, a `requirements.txt`.
2. `write_bundle(directory, plan)` materialises it.
3. `install_packages(directory, packages)` runs
   `pip install --no-compile --target <directory> -r requirements.txt` under
   `DEPLOY_BUILD_TIMEOUT`, then prunes `__pycache__`, `*.pyc` and bundled `tests/` directories to
   keep the zip small.
4. `zip_bundle(directory)` produces bytes; `bundle_digest(bytes)` is a SHA-256 stored on the row, so
   a redeploy with an unchanged graph and package list can skip the rebuild.

### The wheel-platform guard

The decision in §1 to `pip install` on the API host is correct **only when that host is Linux**. On
a macOS dev machine the same command produces Darwin binaries and the deployed function fails at
import with an opaque `invalid ELF header`.

The mitigation is cheap and turns a confusing runtime failure into a build-time message: after
`install_packages`, scan the bundle for `*.so` files and reject any whose first bytes are not the
ELF magic `\x7fELF`, naming the offending package. The intended answer is to build inside the API's
own Linux container, which is also why the Lambda runtime is pinned to `python3.11` to match
`Dockerfile` exactly.

### Size

Lambda accepts a zip up to **50 MB** directly through `CreateFunction`/`UpdateFunctionCode`, and 250
MB unzipped. The packager measures the zip and:

- ≤ `DEPLOY_S3_DIRECT_LIMIT` (default 50 MB) → pass `ZipFile` bytes;
- above that → upload to `DEPLOY_S3_BUCKET` and pass `S3Bucket`/`S3Key`, so `pandas`-class
  deployments work;
- above `DEPLOY_MAX_ZIP_BYTES` → fail with the measured size and the largest contributors, rather
  than letting AWS return an opaque error.

---

## 8. Data model

One new table, `workflow_deployment`, recording what exists in AWS so it can be shown, redeployed
and torn down.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `workflow_id` | FK `workflow` CASCADE | the editable source |
| `owner_id` | FK `user` CASCADE | |
| `snapshot_workflow_id` | FK `workflow` CASCADE | the frozen graph actually deployed |
| `snapshot_version` | int | the source `version` at deploy time |
| `status` | str(16) | `pending` → `building` → `deploying` → `active`, or `failed` / `deleting` / `deleted` |
| `trigger_type` | str(8) | `http` / `cron` / `none` |
| `packages` | JSON | `list[str]`, frozen at deploy time |
| `runtime` | str(16) | `python3.11` |
| `region`, `function_name` (unique), `function_arn`, `role_arn`, `log_group` | str | the function's identity |
| `api_id`, `endpoint_url`, `api_key_hash` | str? | HTTP only; the hash is SHA-256 hex |
| `schedule_expression`, `schedule_timezone`, `cron_payload` | str? / JSON? | cron only |
| `code_sha256`, `zip_bytes` | str(64), int | skip-if-unchanged on redeploy |
| `last_error` | Text? | last failure, surfaced in the UI |
| `created_at`, `updated_at`, `deployed_at` | datetime | |

Migration `down_revision = "b0a12deb8b80"` (`add_workflow_variables`), index on
`(workflow_id, created_at)`.

`packages` is stored on the row as well as on the workflow because a deployment must remain
describable after the workflow's package list changes; the row is a record of what is deployed, not
a pointer to current intent.

### Why `is_frozen` is reused rather than a new snapshot mechanism

Publishing a component already deep-copies a graph into a `Workflow` row with `is_frozen=True` and
fresh ids (`plan_snapshot`). A deployment needs exactly the same thing, so it calls the same
function. The consequence is that deleting a deployment can cascade into deleting its snapshot, and
that a snapshot is never editable — both of which are the desired semantics here.

---

## 9. API surface

New router `app/api/routes/deployments.py`:

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/workflows/{id}/deployments` | Validate graph, packages and trigger; persist `pending`; enqueue the build; return **202** with the row (including the plaintext key **once**, for HTTP) |
| `GET` | `/workflows/{id}/deployments` | Deployment history for the editor |
| `GET` | `/deployments/{id}` | Poll status and `last_error` |
| `POST` | `/deployments/{id}/redeploy` | Rebuild and update the code; reconcile triggers |
| `DELETE` | `/deployments/{id}` | Best-effort teardown, per-resource outcome |
| `PUT` | `/workflows/{id}/packages` | Persist `settings.packages` without deploying |

The deploy request carries `packages` and the trigger configuration, so the dialog saves and deploys
in one action. `PUT /workflows/{id}/packages` exists separately so an author can record dependencies
without deploying.

Validation before the row is written: the graph must pass `validate_and_order` (as a save would), the
trigger config must be internally consistent (a cron expression with a timezone, a payload that
satisfies the entry contract), and the package list must be within `DEPLOY_MAX_PACKAGES` and free of
the `app` name collision.

### Why async, and its known limitation

A build is long enough that a synchronous request is a real hazard behind a proxy. The row is
written first and the work runs in a FastAPI `BackgroundTask`, so the client always has something to
poll.

The limitation is that a background task dies with the process: an API restart mid-build leaves a
row stuck in `pending` with a function that may be half-created. The mitigation is a reaper on read
— a `pending` row older than `DEPLOY_BUILD_TIMEOUT * 2` is reported as `failed` with "the server
restarted during deployment" rather than spinning forever. Redeploying is the recovery path, and
because the deploy is idempotent on `function_name` that is safe. A durable queue is the real fix
and is deferred; it is not needed while deployments are rare and manual.

---

## 10. Testing

The highest-value test is the last one, because it validates the artifact rather than the code:

1. **Artifact smoke test.** Build a bundle into a temp directory, insert it on `sys.path`, import
   `handler`, invoke it with a fake API Gateway payload, and assert the exit node's items come back.
   This proves the zip is genuinely self-contained and fails the moment anything reintroduces an
   `app.models` dependency into the runtime — exactly the coupling that exists today (§3).
2. **Packager units.** The file list is as specified; `graph.json` round-trips through
   `execute_graph`; the zip opens and contains no `__pycache__`; `bundle_digest` is stable across
   runs; an `app`-named package is rejected; a non-ELF `.so` is rejected.
3. **Trigger shaping.** Payload 2.0 as object and as array, base64 bodies, cron with and without a
   payload, direct invoke.
4. **API key.** Correct key passes; wrong and missing keys return 401; the comparison is
   constant-time.
5. **AWS.** `botocore.Stubber` over fake clients asserting the call shapes for `create_function`,
   `put_rule`, `create_api` and the teardown ordering. No real AWS in CI.
6. **Regression.** `app/tests/test_workflow_*.py` stay green after the §3 refactor; `test_workflow_types.py`
   is the one that most directly covers the moved constant.

---

## 11. File-by-file change map

| File | Change |
|---|---|
| `app/services/workflow/types.py` | own `ALLOWED_FIELD_TYPES`; drop the `app.models` import |
| `app/models.py` | import the constant from `types.py`; add `WorkflowDeployment*`, `WorkflowPackagesIn`, `WorkflowDeployIn` |
| `app/core/config.py` | `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `DEPLOY_ENABLED`, `DEPLOY_LAMBDA_ROLE_ARN`, `DEPLOY_LAMBDA_RUNTIME`, `DEPLOY_S3_BUCKET`, `DEPLOY_S3_DIRECT_LIMIT`, `DEPLOY_BUILD_TIMEOUT`, `DEPLOY_MAX_PACKAGES`, `DEPLOY_MAX_ZIP_BYTES` |
| `requirements.txt` | add `boto3` |
| `app/services/deployment/packager.py` | **new**, pure: `plan_bundle`, `write_bundle`, `install_packages`, `zip_bundle`, `bundle_digest`, the ELF guard |
| `app/services/deployment/runtime/handler.py` | **new**, static template |
| `app/services/deployment/aws.py` | **new**, thin boto3 wrapper (lambda / apigatewayv2 / events / iam / s3) with an injectable session |
| `app/services/deployment/deployer.py` | **new**, orchestration: `deploy`, `redeploy`, `destroy`, trigger reconcilers, role resolution |
| `app/api/routes/deployments.py` | **new**, the routes above |
| `app/api/main.py` | include the router |
| `app/alembic/versions/<rev>_add_workflow_deployment.py` | **new**, the table |
| `frontend/src/components/Workflows/DeployDialog.tsx` | **new**, trigger radio + conditional fields, package editor, progress, one-time key |
| `frontend/src/components/Workflows/api.ts` | deployment types and service methods |
| `frontend/src/components/Workflows/WorkflowEditor.tsx` | Deploy button beside Publish (disabled when `isFrozen`), plus a "Deployed · HTTP · active" strip |
| `frontend/src/components/Workflows/types.ts` | `packages` on the workflow settings type |
| `app/tests/test_workflow_deployment_*.py` | **new**, per §10 |
| `docs/workflow-deployment-plan.md` | this document |

---

## 12. Risks

| Risk | Mitigation |
|---|---|
| **A macOS dev host produces Darwin wheels for a Linux Lambda.** The largest real hazard, because §1 chose to install on the API host | Build inside the Linux container; the ELF guard (§7) fails the build with a named package instead of failing at import in the cloud; the Lambda runtime is pinned to match `Dockerfile` |
| zip over Lambda's 50 MB direct limit | S3 upload path, with an explicit failure past `DEPLOY_MAX_ZIP_BYTES` |
| `pip install` executes arbitrary `setup.py` on the API host | The same trusted-tenant tradeoff already accepted for code execution (`code-node-workflows-plan.md` §12); the package list is length-capped and validated, and this is not a new class of exposure |
| An API restart mid-build strands a `pending` row | The stale-`pending` reaper (§9); redeploy is safe because deployment is idempotent on `function_name` |
| **Workflow variables are model-only today.** `WorkflowVariable` exists (`app/models.py:351`) but has no routes and no runtime injection, so a deployed Lambda receives **no** workflow variables | Out of scope for v1 and stated plainly. The seam is a single function (`_graph_from_snapshot` → environment dict) so the environment-variables feature can fill it in without reshaping the bundle |
| Lambda's 15-minute ceiling versus per-node timeouts | Function timeout = sum of node timeouts + margin, capped at 900s |
| No reserved concurrency | A slow workflow can scale out and cost money; `ReservedConcurrentExecutions` is a later config knob |
| Partial teardown failure leaves orphaned AWS resources | Per-resource outcomes in the `DELETE` response, and the row is only marked `deleted` when every resource is gone |
| Cold starts with heavy dependencies | `zip_bytes` is surfaced in the UI; provisioned concurrency is a documented later option |
| Secrets in the bundle | `graph.json` carries no variable values, only the graph; the API key lives in the Lambda environment, not the zip |

---

## 13. Milestones

| # | Milestone | Contents | AWS needed? |
|---|---|---|---|
| M1 | **Groundwork** | §3 type inversion; `settings.packages` validation + `PUT /workflows/{id}/packages`; `config.py` settings; the migration | No |
| M2 | **Packager** | `packager.py`, `handler.py` template, `graph.json` serialization, ELF guard, the artifact smoke test | No |
| M3 | **AWS layer** | `aws.py`, `deployer.py`, trigger wiring, role resolution, S3 fallback | Mocked in tests |
| M4 | **API + UI** | `deployments.py`, `DeployDialog.tsx`, the button, polling, the reaper | Manual |
| M5 | **Verification** | Full lint and test run, docs | Real, once |

M1 and M2 are independently useful and carry no AWS risk, so they can land and be reviewed before
any credential exists.

---

## 14. Deferred, with the door left open

- **Workflow variables reaching the Lambda.** Blocked on `workflow-environment-variables-plan.md`.
  The handler seam is a single `os.environ` update, and values would travel as Lambda environment
  variables (or Secrets Manager past the 4 KB environment limit).
- **Deploying a published component.** Nearly free later: a component's snapshot is already a
  `Workflow` row, so it is the same bundling path with a different source.
- **Rollback to a previous deployment.** The row already carries `code_sha256` and a snapshot, so a
  rollback is an `UpdateFunctionCode` from retained bytes — the missing piece is zip retention.
- **A durable deploy queue**, replacing the `BackgroundTask`.
- **Lambda Layers**, if redeploy latency from reinstalling dependencies becomes annoying.
- **One shared API Gateway**, if per-deployment APIs prove noisy to manage.
