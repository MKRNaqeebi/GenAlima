import { useState } from "react"
import CodeMirror from "@uiw/react-codemirror"
import { python } from "@codemirror/lang-python"
import { FiTrash2 } from "react-icons/fi"

import { useTheme } from "../../contexts/ThemeContext"
import FieldContractEditor from "./FieldContractEditor"
import {
  ENFORCEMENT_MODES,
  MODES,
  ON_ERROR,
  type CodeNode,
  type CodeNodeData,
} from "./types"

interface NodeInspectorProps {
  node: CodeNode
  onChange: (patch: Partial<CodeNodeData>) => void
  onDelete: () => void
}

type Tab = "code" | "input" | "output"

const inputClass =
  "w-full rounded border border-gray-300 bg-transparent px-2 py-1 text-sm text-gray-900 dark:border-gray-600 dark:text-white"

const NodeInspector = ({ node, onChange, onDelete }: NodeInspectorProps) => {
  const [tab, setTab] = useState<Tab>("code")
  const { isDark } = useTheme()
  const { data } = node

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
          Node settings
        </h2>
        <button
          type="button"
          onClick={onDelete}
          title="Delete node"
          className="rounded p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
        >
          <FiTrash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-3 border-b border-gray-200 px-4 py-3 dark:border-gray-700">
        <label className="block space-y-1">
          <span className="text-xs text-gray-500 dark:text-gray-400">Name</span>
          <input
            value={data.name}
            onChange={(event) => onChange({ name: event.target.value })}
            className={inputClass}
          />
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="block space-y-1">
            <span className="text-xs text-gray-500 dark:text-gray-400">Mode</span>
            <select
              value={data.mode}
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
            onChange={(event) => onChange({ disabled: event.target.checked })}
          />
          <span>Disabled (pass items through)</span>
        </label>
      </div>

      <div
        role="tablist"
        className="flex border-b border-gray-200 dark:border-gray-700"
      >
        {(["code", "input", "output"] as Tab[]).map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={tab === name}
            onClick={() => setTab(name)}
            className={`px-4 py-2 text-sm capitalize ${
              tab === name
                ? "border-b-2 border-blue-500 text-blue-600 dark:text-blue-400"
                : "text-gray-500 dark:text-gray-400"
            }`}
          >
            {name}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {tab === "code" ? (
          <CodeMirror
            value={data.code}
            height="100%"
            minHeight="320px"
            theme={isDark ? "dark" : "light"}
            extensions={[python()]}
            onChange={(value) => onChange({ code: value })}
          />
        ) : (
          <FieldContractEditor
            value={tab === "input" ? data.input : data.output}
            onChange={(next) =>
              onChange(tab === "input" ? { input: next } : { output: next })
            }
          />
        )}
      </div>
    </div>
  )
}

export default NodeInspector
