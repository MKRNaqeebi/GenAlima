#!/usr/bin/env bash
#
# End-to-end check of the genalima CLI against a live API.
#
# Every step below is a real request against a real database, so the script
# creates its own workflow and component, names them with the process id, and
# deletes both on the way out (including on failure, via the trap).
#
# Usage:
#
#   GENALIMA_SERVER_URL=http://localhost:8000 \
#   GENALIMA_EMAIL=admin@example.com \
#   GENALIMA_PASSWORD=... \
#   scripts/cli-e2e.sh
#
# or, when you already hold a token:
#
#   GENALIMA_SERVER_URL=... GENALIMA_TOKEN=... scripts/cli-e2e.sh
#
# Optional: GENALIMA_BIN=/path/to/genalima (defaults to `genalima` on PATH, then
# a local debug/release build).
#
# The CLI's own credentials are isolated in a temporary GENALIMA_HOME, so the
# script never touches your real ~/.config/genalima.

set -euo pipefail

: "${GENALIMA_SERVER_URL:?set GENALIMA_SERVER_URL, e.g. http://localhost:8000}"
export GENALIMA_SERVER_URL

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ -z "${GENALIMA_BIN:-}" ]; then
  if command -v genalima >/dev/null 2>&1; then
    GENALIMA_BIN=genalima
  elif [ -x "$REPO_ROOT/cli/target/release/genalima" ]; then
    GENALIMA_BIN="$REPO_ROOT/cli/target/release/genalima"
  elif [ -x "$REPO_ROOT/cli/target/debug/genalima" ]; then
    GENALIMA_BIN="$REPO_ROOT/cli/target/debug/genalima"
  else
    echo "no genalima binary found; build one with: (cd cli && cargo build)" >&2
    exit 2
  fi
fi

# A JSON reader for the few assertions that need a field out of an envelope.
PY="${GENALIMA_PY:-}"
if [ -z "$PY" ]; then
  if command -v python3 >/dev/null 2>&1; then
    PY=python3
  elif [ -x "$REPO_ROOT/.venv/bin/python" ]; then
    PY="$REPO_ROOT/.venv/bin/python"
  else
    echo "no python3 found; set GENALIMA_PY" >&2
    exit 2
  fi
fi

WORK="$(mktemp -d)"
export GENALIMA_HOME="$WORK/home"
export NO_COLOR=1
mkdir -p "$GENALIMA_HOME" "$WORK/first" "$WORK/second"

NAME="CLI e2e $$"
WORKFLOW_ID=""
COMPONENT_ID=""

step() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }

cleanup() {
  status=$?
  if [ -n "$COMPONENT_ID" ]; then
    step "cleanup: deleting component $COMPONENT_ID"
    "$GENALIMA_BIN" component delete "$COMPONENT_ID" --yes >/dev/null 2>&1 || true
  fi
  if [ -n "$WORKFLOW_ID" ]; then
    step "cleanup: deleting workflow $WORKFLOW_ID"
    "$GENALIMA_BIN" workflow delete "$WORKFLOW_ID" --yes >/dev/null 2>&1 || true
  fi
  rm -rf "$WORK"
  exit $status
}
trap cleanup EXIT

# expect_exit WANT COMMAND... — assert a stable exit code.
expect_exit() {
  want="$1"; shift
  set +e
  "$@" >/dev/null 2>&1
  got=$?
  set -e
  [ "$got" = "$want" ] || fail "expected exit $want from '$*', got $got"
}

if [ -z "${GENALIMA_TOKEN:-}" ]; then
  : "${GENALIMA_EMAIL:?set GENALIMA_EMAIL and GENALIMA_PASSWORD, or GENALIMA_TOKEN}"
  : "${GENALIMA_PASSWORD:?set GENALIMA_EMAIL and GENALIMA_PASSWORD, or GENALIMA_TOKEN}"
  step "login as $GENALIMA_EMAIL"
  printf '%s' "$GENALIMA_PASSWORD" | "$GENALIMA_BIN" login --email "$GENALIMA_EMAIL" --password-stdin
fi

step "doctor"
"$GENALIMA_BIN" doctor

step "whoami"
"$GENALIMA_BIN" whoami

cd "$WORK/first"

step "init: a publishable two-node workflow"
"$GENALIMA_BIN" workflow init "$NAME" --template component
"$GENALIMA_BIN" workflow validate --for-publish --order
"$GENALIMA_BIN" workflow fmt

step "push: create it on the server"
if ! PUSH="$("$GENALIMA_BIN" --json workflow push)"; then
  printf '%s\n' "$PUSH"
  fail "push failed"
fi
WORKFLOW_ID="$(printf '%s' "$PUSH" | "$PY" -c 'import json,sys; print(json.load(sys.stdin)["data"]["id"])')"
[ -n "$WORKFLOW_ID" ] || fail "push did not return an id"
echo "workflow id: $WORKFLOW_ID"

step "push again: a no-op"
"$GENALIMA_BIN" workflow diff
"$GENALIMA_BIN" workflow push

step "run the saved graph"
"$GENALIMA_BIN" workflow run --items-json '[{"json": {"payload": {"n": 1}}}]'

step "test one node"
"$GENALIMA_BIN" workflow test-node code_1 --items-json '[{"json": {"payload": {"n": 1}}}]'

step "run history"
"$GENALIMA_BIN" workflow runs --limit 5

step "publish v1"
if ! PUBLISH="$("$GENALIMA_BIN" --json workflow publish --name "$NAME" --version auto)"; then
  printf '%s\n' "$PUBLISH"
  fail "publish failed (a 500 here usually means the server schema is behind: alembic upgrade head)"
fi
COMPONENT_ID="$(printf '%s' "$PUBLISH" | "$PY" -c 'import json,sys; print(json.load(sys.stdin)["data"]["id"])')"
echo "component id: $COMPONENT_ID"

step "re-publishing the same version is a conflict (exit 6)"
expect_exit 6 "$GENALIMA_BIN" workflow publish --name "$NAME" --version 1

step "component list / show / graph"
"$GENALIMA_BIN" component list --name "$NAME"
"$GENALIMA_BIN" component show "$NAME@1"
"$GENALIMA_BIN" component graph "$NAME@1"

step "insert the component into a second workflow"
cd "$WORK/second"
"$GENALIMA_BIN" workflow init "CLI e2e target $$"
"$GENALIMA_BIN" component insert "$NAME@1"
"$GENALIMA_BIN" workflow validate
"$GENALIMA_BIN" workflow list --local

step "a rejected graph is exit 3 locally and 7 from the server (--force skips the pre-flight)"
"$PY" - "$WORK/second/workflow.json" <<'PY'
import json, sys
path = sys.argv[1]
doc = json.load(open(path))
doc["nodes"].append(dict(doc["nodes"][0], id="aaaaaaaa-0000-4000-8000-00000000000a", key="code_1"))
json.dump(doc, open(path, "w"), indent=2)
PY
expect_exit 3 "$GENALIMA_BIN" workflow validate
expect_exit 3 "$GENALIMA_BIN" workflow push
expect_exit 7 "$GENALIMA_BIN" workflow push --force

step "the variables router is absent, so the CLI says so (exit 5)"
expect_exit 5 "$GENALIMA_BIN" variable list "$WORKFLOW_ID"

printf '\n\033[32mall e2e steps passed\033[0m\n'
