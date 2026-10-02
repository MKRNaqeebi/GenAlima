"""
Run one code node's Python in a subprocess.

This single module is both halves of one protocol:

* imported by the engine, it exposes :func:`run`, which spawns an isolated child
  (``python -I <this file>``), enforces the timeout on the whole process group,
  and parses the child's stdout;
* executed as a script by that spawn, it *is* the child: it reads one JSON
  request from stdin, ``{"code", "mode", "items", "nonce"}``, runs the node's
  code, and writes a sentinel line (prefix + nonce) followed by one JSON result.
  Anything printed before the sentinel (including output that bypassed ``print``)
  is logs, so user code may print arbitrary JSON without confusing the parent.

The subprocess exists so a timeout can be enforced and a crash cannot take the
request handler down with it; it is not a sandbox (see plan §12).

Because the same file is executed with ``-I``, everything at module level must
stay stdlib-only: an ``app`` import here would break the child, which runs with
the repository off ``sys.path``. The parent half needs nothing from the
application anyway.
"""
# Standard library imports
import contextlib
from dataclasses import dataclass, field
import datetime
import io
import json
import math
import os
from pathlib import Path
import secrets
import signal
import subprocess
import sys
import traceback
from typing import Any

# The runner is its own child script, so the two can never drift apart.
RUNNER_SCRIPT = Path(__file__).resolve()
# The parent appends a per-run nonce, so user output cannot forge a result.
SENTINEL_PREFIX = "__ALIMA_RESULT__"
# User code is compiled under this name, so tracebacks read as the node's.
USER_FILENAME = "<node>"
DEFAULT_TIMEOUT = 30
MAX_OUTPUT_ITEMS = 10_000
# The repo root, so installed packages and relative paths behave as in the API.
WORKING_DIRECTORY = Path(__file__).resolve().parents[4]


# ------------------------------------------------------------------ the parent
@dataclass
class RunnerResult:
    """
    What one execution produced. ``error`` is None on success.
    """

    output: list[dict[str, Any]] = field(default_factory=list)
    logs: str = ""
    error: str | None = None


def _kill_group(process: subprocess.Popen) -> None:
    """
    Kill the child and anything it spawned.

    ``subprocess.run(timeout=...)`` only kills the direct child, so a node that
    started its own subprocess would otherwise outlive the timeout.
    """
    try:
        os.killpg(process.pid, signal.SIGKILL)
    except (ProcessLookupError, PermissionError):
        process.kill()


def parse_output(stdout: str, stderr: str, returncode: int, sentinel: str) -> RunnerResult:
    """
    Split the child's stdout into logs and the sentinel's JSON result.

    The sentinel carries a random per-run nonce, so user code that prints the
    sentinel prefix cannot forge a result.
    """
    head, marker, tail = stdout.partition(sentinel)
    if not marker:
        detail = stderr.strip() or stdout.strip() or f"exit code {returncode}"
        return RunnerResult(logs=stdout, error=f"runner crashed: {detail}")

    try:
        payload = json.loads(tail.strip())
    except json.JSONDecodeError as exc:
        return RunnerResult(logs=head, error=f"runner returned malformed JSON: {exc}")

    logs = head.rstrip("\n") + (payload.get("logs") or "")
    if stderr.strip():
        logs = f"{logs}\n[stderr]\n{stderr.rstrip()}" if logs else f"[stderr]\n{stderr.rstrip()}"

    output = payload.get("output") or []
    error = payload.get("error")
    if error is None and len(output) > MAX_OUTPUT_ITEMS:
        error = f"node returned {len(output)} items; the limit is {MAX_OUTPUT_ITEMS}"
        output = []
    return RunnerResult(output=output, logs=logs.rstrip("\n"), error=error)


def run(
    code: str,
    mode: str,
    items: list[dict[str, Any]],
    timeout: float = DEFAULT_TIMEOUT,
) -> RunnerResult:
    """
    Execute ``code`` against ``items`` and return its output, logs and error.
    """
    nonce = secrets.token_hex(16)
    sentinel = SENTINEL_PREFIX + nonce
    request = json.dumps(
        {"code": code, "mode": mode, "items": items, "nonce": nonce}, default=str
    )
    process = subprocess.Popen(  # pylint: disable=consider-using-with
        [sys.executable, "-I", str(RUNNER_SCRIPT)],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        cwd=WORKING_DIRECTORY,
        start_new_session=True,
    )
    try:
        stdout, stderr = process.communicate(request, timeout=timeout)
    except subprocess.TimeoutExpired:
        _kill_group(process)
        stdout, _ = process.communicate()
        logs = stdout.partition(sentinel)[0]
        return RunnerResult(logs=logs, error=f"node timed out after {timeout:g}s")

    return parse_output(stdout, stderr, process.returncode, sentinel)


# ------------------------------------------------------------------- the child
class NodeCodeError(Exception):
    """
    The user's code ran but produced something a node may not return.
    """


def _as_item(value, where):
    """
    Normalize one returned value into an n8n-style item.

    A dict that already has ``json`` is an item; any other dict is treated as
    the item's ``json`` payload, which is what authors write most of the time.
    """
    if not isinstance(value, dict):
        raise NodeCodeError(f"{where} must be a dict, got {type(value).__name__}")
    if "json" in value:
        if not isinstance(value["json"], dict):
            raise NodeCodeError(
                f"{where}: 'json' must be a dict, got {type(value['json']).__name__}"
            )
        return value
    return {"json": value}


def _globals(extra):
    """
    The namespace user code runs in.
    """
    scope = {
        "__name__": "__node__",
        "__builtins__": __builtins__,
        "json": json,
        "math": math,
        "datetime": datetime,
        "result": None,
    }
    scope.update(extra)
    return scope


def _run_all(compiled, items):
    """
    runOnceForAllItems: ``items`` in scope, ``result`` must be a list.
    """
    scope = _globals({"items": items})
    exec(compiled, scope)  # pylint: disable=exec-used
    result = scope.get("result")
    if result is None:
        return []
    if not isinstance(result, list):
        raise NodeCodeError(
            f"'result' must be a list of items, got {type(result).__name__}"
        )
    return [_as_item(value, f"result[{index}]") for index, value in enumerate(result)]


def _run_each(compiled, items):
    """
    runOnceForEachItem: ``item`` in scope, ``result`` is one item or None.
    """
    output = []
    for index, item in enumerate(items):
        scope = _globals({"item": item, "index": index})
        exec(compiled, scope)  # pylint: disable=exec-used
        result = scope.get("result")
        if result is None:
            continue
        if isinstance(result, list):
            raise NodeCodeError(
                f"item {index}: 'result' must be one item in runOnceForEachItem mode, got a list"
            )
        produced = dict(_as_item(result, f"item {index}: 'result'"))
        produced.setdefault("pairedItem", {"item": index})
        output.append(produced)
    return output


def _user_traceback(exc):
    """
    The traceback trimmed to frames inside the user's code.
    """
    frames = [
        frame
        for frame in traceback.extract_tb(exc.__traceback__)
        if frame.filename == USER_FILENAME
    ]
    lines = ["Traceback (most recent call last):\n"]
    lines.extend(traceback.format_list(frames))
    lines.extend(traceback.format_exception_only(type(exc), exc))
    return "".join(lines).rstrip()


def main():
    """
    Read the request, run the code, write the sentinel and result.
    """
    request = json.loads(sys.stdin.read() or "{}")
    code = request.get("code") or ""
    mode = request.get("mode") or "runOnceForAllItems"
    items = request.get("items") or []
    # A per-run nonce the parent chose, so user output can never forge it.
    sentinel = SENTINEL_PREFIX + str(request.get("nonce") or "")

    captured = io.StringIO()
    response = {"output": [], "error": None}
    try:
        compiled = compile(code, USER_FILENAME, "exec")
        with contextlib.redirect_stdout(captured):
            if mode == "runOnceForEachItem":
                response["output"] = _run_each(compiled, items)
            else:
                response["output"] = _run_all(compiled, items)
    except NodeCodeError as exc:
        response["error"] = str(exc)
    except SyntaxError as exc:
        response["error"] = "".join(traceback.format_exception_only(type(exc), exc)).rstrip()
    except BaseException as exc:  # pylint: disable=broad-exception-caught
        response["error"] = _user_traceback(exc)

    response["logs"] = captured.getvalue()
    try:
        payload = json.dumps(response, default=str)
    except (TypeError, ValueError) as exc:
        payload = json.dumps(
            {"output": [], "error": f"result is not JSON-serializable: {exc}", "logs": response["logs"]}
        )
    sys.stdout.write("\n" + sentinel + payload + "\n")
    sys.stdout.flush()


if __name__ == "__main__":
    main()
