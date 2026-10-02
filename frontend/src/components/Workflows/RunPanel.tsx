import { useMemo, useState } from "react"
import {
  FiCheck,
  FiChevronDown,
  FiChevronUp,
  FiLoader,
  FiMinus,
  FiX,
} from "react-icons/fi"

import type {
  RunStatus,
  WorkflowItem,
  WorkflowRunNodePublic,
  WorkflowRunPublic,
} from "./api"
import type { CodeNode, FieldContract } from "./types"

interface RunPanelProps {
  open: boolean
  onToggle: () => void
  /** The run being shown, with node results; null before the first run. */
  run: WorkflowRunPublic | null
  /** Recent runs for the history picker (no node results). */
  history: WorkflowRunPublic[]
  onSelectRun: (runId: string) => void
  /** Canvas nodes in execution order. */
  orderedNodes: CodeNode[]
  selectedNodeId: string | null
  onSelectNode: (nodeId: string) => void
  triggerText: string
  onTriggerTextChange: (text: string) => void
  /** Why the trigger JSON is unusable, or null when it parses. */
  triggerError: string | null
  isRunning: boolean
}

type DetailTab = "output" | "input" | "logs"

export function StatusIcon({ status }: { status: RunStatus | undefined }) {
  if (status === "success")
    return <FiCheck className="h-3.5 w-3.5 text-emerald-500" />
  if (status === "error") return <FiX className="h-3.5 w-3.5 text-red-500" />
  if (status === "running")
    return <FiLoader className="h-3.5 w-3.5 animate-spin text-blue-500" />
  if (status === "skipped")
    return <FiMinus className="h-3.5 w-3.5 text-gray-400" />
  return (
    <span className="inline-block h-2 w-2 rounded-full bg-gray-300 dark:bg-gray-600" />
  )
}

function typeName(value: unknown): string {
  if (value === null) return "null"
  if (Array.isArray(value)) return "list"
  if (typeof value === "number")
    return Number.isInteger(value) ? "int" : "float"
  if (typeof value === "string") return "str"
  if (typeof value === "boolean") return "bool"
  if (typeof value === "object") return "dict"
  return typeof value
}

/** Field -> observed types across the first items, for "declared vs actual". */
export function observedShape(items: WorkflowItem[]): Record<string, string> {
  const shape: Record<string, Set<string>> = {}
  for (const item of items.slice(0, 50)) {
    for (const [field, value] of Object.entries(item.json ?? {})) {
      if (!shape[field]) shape[field] = new Set()
      shape[field].add(typeName(value))
    }
  }
  return Object.fromEntries(
    Object.entries(shape).map(([field, types]) => [
      field,
      [...types].join(" | "),
    ]),
  )
}

function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return ""
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`
}

function formatTime(iso: string): string {
  // The API returns naive UTC timestamps.
  const date = new Date(iso.endsWith("Z") ? iso : `${iso}Z`)
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="overflow-auto whitespace-pre-wrap break-words rounded bg-gray-50 p-2 font-mono text-[11px] leading-relaxed text-gray-800 dark:bg-app-bg dark:text-gray-200">
      {JSON.stringify(value, null, 2)}
    </pre>
  )
}

/** Declared output contract next to the shape the node actually returned. */
function ShapeComparison({
  declared,
  items,
}: {
  declared: FieldContract
  items: WorkflowItem[]
}) {
  const actual = observedShape(items)
  const fields = [
    ...new Set([...Object.keys(declared), ...Object.keys(actual)]),
  ]
  if (fields.length === 0) return null
  return (
    <table className="mb-3 w-full text-left font-mono text-[11px]">
      <thead className="text-[10px] uppercase text-gray-400">
        <tr>
          <th className="py-1 font-medium">field</th>
          <th className="py-1 font-medium">declared</th>
          <th className="py-1 font-medium">returned</th>
        </tr>
      </thead>
      <tbody>
        {fields.map((field) => {
          const want = declared[field]?.type
          const got = actual[field]
          // JSON has no int/float distinction for whole numbers, so a float
          // field returning 120.0 is observed as int; int widens to float.
          const mismatch =
            want &&
            want !== "Any" &&
            got &&
            got
              .split(" | ")
              .some(
                (type) =>
                  type !== want && !(want === "float" && type === "int"),
              )
          return (
            <tr
              key={field}
              className="border-t border-gray-100 dark:border-app-border"
            >
              <td className="py-1 text-gray-700 dark:text-gray-200">{field}</td>
              <td className="py-1 text-violet-600 dark:text-violet-300">
                {want ?? "—"}
              </td>
              <td
                className={`py-1 ${
                  mismatch
                    ? "text-red-600 dark:text-red-400"
                    : got
                      ? "text-gray-600 dark:text-gray-300"
                      : "text-amber-600 dark:text-amber-400"
                }`}
              >
                {got ?? "missing"}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function NodeDetail({
  node,
  result,
  isNodeTest,
}: {
  node: CodeNode
  result: WorkflowRunNodePublic | undefined
  isNodeTest: boolean
}) {
  const [tab, setTab] = useState<DetailTab>("output")

  if (!result) {
    return (
      <p className="p-4 text-sm text-gray-500 dark:text-gray-400">
        {isNodeTest
          ? `This was a test of a single node; ${node.data.name} did not run.`
          : `${node.data.name} was not part of this run. It was probably added after it.`}
      </p>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-gray-200 px-3 dark:border-app-border">
        <div role="tablist" className="flex">
          {(["output", "input", "logs"] as DetailTab[]).map((name) => (
            <button
              key={name}
              type="button"
              role="tab"
              aria-selected={tab === name}
              onClick={() => setTab(name)}
              className={`px-3 py-1.5 text-xs capitalize ${
                tab === name
                  ? "border-b-2 border-blue-500 text-blue-600 dark:text-blue-400"
                  : "text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
              }`}
            >
              {name}
              {name === "output" && ` (${result.output_items.length})`}
              {name === "input" && ` (${result.input_items.length})`}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-gray-400">
          {formatDuration(result.duration_ms)}
        </span>
      </div>

      <div
        className="min-h-0 flex-1 overflow-y-auto p-3"
        data-testid="run-node-detail"
      >
        {result.error && (
          <pre
            data-testid="run-node-error"
            className="mb-3 whitespace-pre-wrap break-words rounded border border-red-200 bg-red-50 p-2 font-mono text-[11px] text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
          >
            {result.error}
          </pre>
        )}
        {result.status === "skipped" && (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Skipped because an earlier node failed.
          </p>
        )}
        {tab === "output" && result.status !== "skipped" && (
          <>
            <ShapeComparison
              declared={node.data.output}
              items={result.output_items}
            />
            <JsonBlock value={result.output_items} />
          </>
        )}
        {tab === "input" && result.status !== "skipped" && (
          <JsonBlock value={result.input_items} />
        )}
        {tab === "logs" &&
          (result.logs ? (
            <pre className="whitespace-pre-wrap break-words font-mono text-[11px] text-gray-700 dark:text-gray-300">
              {result.logs}
            </pre>
          ) : (
            <p className="text-sm text-gray-400">No output printed.</p>
          ))}
      </div>
    </div>
  )
}

/**
 * Bottom drawer: run the workflow, pick a past run, and inspect every node's
 * input, output, logs and error. Node statuses are also painted on the canvas
 * by the editor.
 */
const RunPanel = ({
  open,
  onToggle,
  run,
  history,
  onSelectRun,
  orderedNodes,
  selectedNodeId,
  onSelectNode,
  triggerText,
  onTriggerTextChange,
  triggerError,
  isRunning,
}: RunPanelProps) => {
  const [showTrigger, setShowTrigger] = useState(false)
  const results = useMemo(
    () => new Map((run?.nodes ?? []).map((result) => [result.node_id, result])),
    [run],
  )
  const focused =
    orderedNodes.find((node) => node.id === selectedNodeId) ??
    orderedNodes.find((node) => results.get(node.id)?.status === "error") ??
    orderedNodes[0]

  const totalMs = (run?.nodes ?? []).reduce(
    (sum, node) => sum + (node.duration_ms ?? 0),
    0,
  )

  return (
    <section
      data-testid="run-panel"
      className={`flex flex-shrink-0 flex-col border-t border-gray-200 bg-white dark:border-app-border dark:bg-app-surface ${
        open ? "h-72" : "h-9"
      }`}
    >
      <header className="flex h-9 flex-shrink-0 items-center justify-between px-3">
        <div className="flex min-w-0 items-center space-x-3 overflow-hidden">
          <button
            type="button"
            onClick={onToggle}
            className="flex items-center space-x-1 text-xs font-semibold uppercase tracking-wide text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
            aria-expanded={open}
          >
            {open ? (
              <FiChevronDown className="h-4 w-4" />
            ) : (
              <FiChevronUp className="h-4 w-4" />
            )}
            <span>Run</span>
          </button>
          {isRunning ? (
            <span className="flex items-center space-x-1 text-xs text-blue-600 dark:text-blue-400">
              <FiLoader className="h-3.5 w-3.5 animate-spin" />
              <span>Running…</span>
            </span>
          ) : run ? (
            <span
              data-testid="run-status"
              data-status={run.status}
              className={`flex items-center space-x-1 whitespace-nowrap text-xs ${
                run.status === "success"
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-red-600 dark:text-red-400"
              }`}
            >
              <StatusIcon status={run.status} />
              <span>
                {run.mode === "single_node" ? "Node test" : "Run"}{" "}
                {run.status === "success" ? "succeeded" : "failed"}
                {totalMs ? ` · ${formatDuration(totalMs)}` : ""}
              </span>
            </span>
          ) : (
            <span className="text-xs text-gray-400">Not run yet</span>
          )}
          {run?.error && open && (
            <span
              className="truncate text-xs text-red-600 dark:text-red-400"
              title={run.error}
            >
              {run.error}
            </span>
          )}
        </div>

        <div className="ml-3 flex flex-shrink-0 items-center space-x-2">
          {history.length > 0 && (
            <select
              aria-label="Run history"
              value={run?.id ?? ""}
              onChange={(event) => onSelectRun(event.target.value)}
              className="max-w-[220px] rounded border border-gray-200 bg-transparent px-1.5 py-0.5 text-xs text-gray-600 dark:border-app-border dark:text-gray-300"
            >
              {!history.some((entry) => entry.id === run?.id) && run && (
                <option value={run.id} className="text-black">
                  {formatTime(run.started_at)}
                </option>
              )}
              {history.map((entry) => (
                <option key={entry.id} value={entry.id} className="text-black">
                  {entry.status === "success" ? "✓" : "✗"}{" "}
                  {formatTime(entry.started_at)}
                  {entry.mode === "single_node" ? " · node test" : ""}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={() => {
              setShowTrigger((value) => !value)
              if (!open) onToggle()
            }}
            className={`rounded px-2 py-0.5 text-xs ${
              showTrigger
                ? "bg-gray-200 text-gray-900 dark:bg-app-hover dark:text-white"
                : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-app-hover"
            }`}
          >
            Trigger input
          </button>
        </div>
      </header>

      {open && (
        <div className="flex min-h-0 flex-1 border-t border-gray-200 dark:border-app-border">
          {showTrigger && (
            <div className="flex w-72 flex-shrink-0 flex-col border-r border-gray-200 p-2 dark:border-app-border">
              <label
                htmlFor="trigger-items"
                className="mb-1 text-[11px] text-gray-500 dark:text-gray-400"
              >
                Items entry nodes receive (JSON list of {"{"}"json": {"{…}"}
                {"}"})
              </label>
              <textarea
                id="trigger-items"
                data-testid="trigger-items"
                value={triggerText}
                onChange={(event) => onTriggerTextChange(event.target.value)}
                spellCheck={false}
                className={`min-h-0 flex-1 resize-none rounded border bg-transparent p-2 font-mono text-[11px] text-gray-800 focus:outline-none dark:text-gray-200 ${
                  triggerError
                    ? "border-red-400"
                    : "border-gray-200 focus:border-blue-500 dark:border-app-border"
                }`}
              />
              {triggerError && (
                <p className="mt-1 text-[11px] text-red-600">{triggerError}</p>
              )}
            </div>
          )}

          {orderedNodes.length === 0 ? (
            <p className="p-4 text-sm text-gray-500 dark:text-gray-400">
              Add a node, then press Run.
            </p>
          ) : !run ? (
            <p className="p-4 text-sm text-gray-500 dark:text-gray-400">
              Press Run (⌘↵) to execute the workflow. Pending edits are saved
              before it starts.
            </p>
          ) : (
            <>
              <ul
                data-testid="run-node-list"
                className="w-56 flex-shrink-0 overflow-y-auto border-r border-gray-200 py-1 dark:border-app-border"
              >
                {orderedNodes.map((node) => {
                  const result = results.get(node.id)
                  return (
                    <li key={node.id}>
                      <button
                        type="button"
                        onClick={() => onSelectNode(node.id)}
                        className={`flex w-full items-center justify-between space-x-2 px-3 py-1.5 text-left text-xs ${
                          focused?.id === node.id
                            ? "bg-gray-100 dark:bg-app-hover"
                            : "hover:bg-gray-50 dark:hover:bg-app-hover/60"
                        }`}
                      >
                        <span className="flex min-w-0 items-center space-x-2">
                          <StatusIcon status={result?.status} />
                          <span className="truncate text-gray-800 dark:text-gray-100">
                            {node.data.name}
                          </span>
                        </span>
                        <span className="flex-shrink-0 text-[10px] text-gray-400">
                          {formatDuration(result?.duration_ms)}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
              <div className="min-w-0 flex-1">
                {focused && (
                  <NodeDetail
                    key={`${run.id}-${focused.id}`}
                    node={focused}
                    result={results.get(focused.id)}
                    isNodeTest={run.mode === "single_node"}
                  />
                )}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  )
}

export default RunPanel
