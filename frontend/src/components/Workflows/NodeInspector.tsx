import { python } from "@codemirror/lang-python"
import CodeMirror from "@uiw/react-codemirror"
import { useEffect, useState } from "react"
import { FiPlay, FiTrash2 } from "react-icons/fi"

import { useTheme } from "../../contexts/ThemeContext"
import FieldContractEditor from "./FieldContractEditor"
import { StatusIcon, observedShape } from "./RunPanel"
import type { WorkflowItem, WorkflowRunNodePublic } from "./api"
import {
  type CodeNode,
  type CodeNodeData,
  ENFORCEMENT_MODES,
  MODES,
  ON_ERROR,
} from "./types"

interface NodeInspectorProps {
  node: CodeNode
  onChange: (patch: Partial<CodeNodeData>) => void
  onDelete: () => void
  /** Run this node alone against `items` (the editor saves first if needed). */
  onTest?: (items: WorkflowItem[]) => void
  isTesting?: boolean
  /** The latest single-node test of this node, if any. */
  testResult?: WorkflowRunNodePublic | null
  /** Items this node received in the run on screen, to seed the test input. */
  lastInput?: WorkflowItem[] | null
  /** A published snapshot: shown for inspection, but nothing may change. */
  readOnly?: boolean
}

type Tab = "code" | "input" | "output" | "settings" | "test"

const TABS: Tab[] = ["code", "input", "output", "settings", "test"]

const inputClass =
  "w-full rounded border border-gray-300 bg-transparent px-2 py-1 text-sm text-gray-900 disabled:opacity-60 dark:border-app-border dark:text-white"

function Settings({
  data,
  onChange,
  readOnly,
}: {
  data: CodeNodeData
  onChange: (patch: Partial<CodeNodeData>) => void
  readOnly: boolean
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1">
          <span className="text-xs text-gray-500 dark:text-gray-400">Mode</span>
          <select
            value={data.mode}
            disabled={readOnly}
            onChange={(event) => onChange({ mode: event.target.value })}
            className={inputClass}
          >
            {MODES.map((mode) => (
              <option key={mode} value={mode} className="text-black">
                {mode}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Timeout (s)
          </span>
          <input
            type="number"
            min={1}
            value={data.timeout}
            disabled={readOnly}
            onChange={(event) =>
              onChange({ timeout: Number(event.target.value) || 30 })
            }
            className={inputClass}
          />
        </label>

        <label className="block space-y-1">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Type enforcement
          </span>
          <select
            value={data.typeEnforcement}
            disabled={readOnly}
            onChange={(event) =>
              onChange({ typeEnforcement: event.target.value })
            }
            className={inputClass}
          >
            {ENFORCEMENT_MODES.map((mode) => (
              <option key={mode} value={mode} className="text-black">
                {mode}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            On error
          </span>
          <select
            value={data.onError}
            disabled={readOnly}
            onChange={(event) => onChange({ onError: event.target.value })}
            className={inputClass}
          >
            {ON_ERROR.map((mode) => (
              <option key={mode} value={mode} className="text-black">
                {mode}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex items-center space-x-2 text-sm text-gray-700 dark:text-gray-300">
        <input
          type="checkbox"
          checked={data.disabled}
          disabled={readOnly}
          onChange={(event) => onChange({ disabled: event.target.checked })}
        />
        <span>Disabled (pass items through)</span>
      </label>

      <dl className="space-y-2 text-xs text-gray-500 dark:text-gray-400">
        <div>
          <dt className="font-medium text-gray-700 dark:text-gray-300">Mode</dt>
          <dd>
            <code>runOnceForAllItems</code>: <code>items</code> is in scope,
            assign a list to <code>result</code>.{" "}
            <code>runOnceForEachItem</code>: <code>item</code> is in scope,
            assign one item (or None to drop it).
          </dd>
        </div>
        <div>
          <dt className="font-medium text-gray-700 dark:text-gray-300">
            Type enforcement
          </dt>
          <dd>
            <code>strict</code> fails the node on a contract mismatch,{" "}
            <code>warn</code> logs it, <code>off</code> skips checks.
          </dd>
        </div>
        <div>
          <dt className="font-medium text-gray-700 dark:text-gray-300">Key</dt>
          <dd className="font-mono">{data.key}</dd>
        </div>
      </dl>
    </div>
  )
}

function TestPane({
  onTest,
  isTesting,
  testResult,
  lastInput,
  readOnly,
}: {
  onTest?: (items: WorkflowItem[]) => void
  isTesting: boolean
  testResult: WorkflowRunNodePublic | null | undefined
  lastInput: WorkflowItem[] | null | undefined
  readOnly: boolean
}) {
  const seed = JSON.stringify(
    lastInput && lastInput.length > 0 ? lastInput : [{ json: {} }],
    null,
    2,
  )
  const [text, setText] = useState(seed)
  // A new run on screen re-seeds the test input from that run.
  useEffect(() => setText(seed), [seed])

  let parsed: WorkflowItem[] | null = null
  let parseError: string | null = null
  try {
    const value = JSON.parse(text)
    if (!Array.isArray(value)) parseError = "Must be a JSON list of items."
    else parsed = value
  } catch (error) {
    parseError = (error as Error).message
  }

  return (
    <div className="flex h-full flex-col space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500 dark:text-gray-400">
          Input items {lastInput ? "(from the run on screen)" : ""}
        </span>
        <button
          type="button"
          data-testid="test-node"
          disabled={!onTest || isTesting || !parsed}
          onClick={() => parsed && onTest?.(parsed)}
          title={
            readOnly
              ? "Run this snapshot node"
              : "Saves unsaved changes, then runs only this node"
          }
          className="flex items-center space-x-1 rounded bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <FiPlay className="h-3 w-3" />
          <span>{isTesting ? "Running…" : "Test node"}</span>
        </button>
      </div>
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        spellCheck={false}
        aria-label="Test input items"
        className={`h-40 flex-shrink-0 resize-y rounded border bg-transparent p-2 font-mono text-[11px] text-gray-800 focus:outline-none dark:text-gray-200 ${
          parseError
            ? "border-red-400"
            : "border-gray-200 focus:border-blue-500 dark:border-app-border"
        }`}
      />
      {parseError && <p className="text-[11px] text-red-600">{parseError}</p>}

      {testResult && (
        <div
          className="min-h-0 flex-1 space-y-2 overflow-y-auto"
          data-testid="test-result"
        >
          <div className="flex items-center space-x-1 text-xs text-gray-600 dark:text-gray-300">
            <StatusIcon status={testResult.status} />
            <span>
              {testResult.status === "success" ? "Succeeded" : "Failed"}
              {testResult.duration_ms != null
                ? ` in ${testResult.duration_ms} ms`
                : ""}
            </span>
          </div>
          {testResult.error && (
            <pre className="whitespace-pre-wrap break-words rounded border border-red-200 bg-red-50 p-2 font-mono text-[11px] text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              {testResult.error}
            </pre>
          )}
          {testResult.logs && (
            <pre className="whitespace-pre-wrap break-words rounded bg-gray-50 p-2 font-mono text-[11px] text-gray-600 dark:bg-app-bg dark:text-gray-300">
              {testResult.logs}
            </pre>
          )}
          {testResult.status === "success" && (
            <>
              <p className="font-mono text-[11px] text-gray-500 dark:text-gray-400">
                returned:{" "}
                {Object.entries(observedShape(testResult.output_items))
                  .map(([field, type]) => `${field}: ${type}`)
                  .join(", ") || "no fields"}
              </p>
              <pre className="whitespace-pre-wrap break-words rounded bg-gray-50 p-2 font-mono text-[11px] text-gray-800 dark:bg-app-bg dark:text-gray-200">
                {JSON.stringify(testResult.output_items, null, 2)}
              </pre>
            </>
          )}
        </div>
      )}
    </div>
  )
}

const NodeInspector = ({
  node,
  onChange,
  onDelete,
  onTest,
  isTesting = false,
  testResult,
  lastInput,
  readOnly = false,
}: NodeInspectorProps) => {
  const [tab, setTab] = useState<Tab>("code")
  const { isDark } = useTheme()
  const { data } = node

  const counts: Partial<Record<Tab, number>> = {
    input: Object.keys(data.input).length,
    output: Object.keys(data.output).length,
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center space-x-2 border-b border-gray-200 px-3 py-2 dark:border-app-border">
        <input
          value={data.name}
          aria-label="Node name"
          disabled={readOnly}
          onChange={(event) => onChange({ name: event.target.value })}
          className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1.5 py-1 text-sm font-semibold text-gray-900 hover:border-gray-300 focus:border-blue-500 focus:outline-none disabled:opacity-100 dark:text-white dark:hover:border-app-border"
        />
        {!readOnly && (
          <button
            type="button"
            onClick={onDelete}
            title="Delete node"
            className="rounded p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            <FiTrash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      <div
        role="tablist"
        className="flex border-b border-gray-200 px-1 dark:border-app-border"
      >
        {TABS.map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={tab === name}
            onClick={() => setTab(name)}
            className={`px-3 py-2 text-xs capitalize ${
              tab === name
                ? "border-b-2 border-blue-500 text-blue-600 dark:text-blue-400"
                : "text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
            }`}
          >
            {name}
            {counts[name] ? (
              <span
                aria-hidden
                className="ml-1 rounded bg-gray-100 px-1 text-[10px] text-gray-500 dark:bg-app-hover dark:text-gray-300"
              >
                {counts[name]}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <div
        className={`min-h-0 flex-1 ${
          tab === "code" ? "" : "overflow-y-auto px-4 py-3"
        }`}
      >
        {tab === "code" && (
          <CodeMirror
            value={data.code}
            height="100%"
            className="h-full text-[13px]"
            theme={isDark ? "dark" : "light"}
            extensions={[python()]}
            editable={!readOnly}
            onChange={(value) => onChange({ code: value })}
          />
        )}
        {(tab === "input" || tab === "output") && (
          <FieldContractEditor
            value={tab === "input" ? data.input : data.output}
            onChange={(next) =>
              onChange(tab === "input" ? { input: next } : { output: next })
            }
            readOnly={readOnly}
          />
        )}
        {tab === "settings" && (
          <Settings data={data} onChange={onChange} readOnly={readOnly} />
        )}
        {tab === "test" && (
          <TestPane
            onTest={onTest}
            isTesting={isTesting}
            testResult={testResult}
            lastInput={lastInput}
            readOnly={readOnly}
          />
        )}
      </div>
    </div>
  )
}

export default NodeInspector
