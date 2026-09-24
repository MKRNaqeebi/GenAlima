import { Handle, Position, type NodeProps } from "@xyflow/react"
import { FiCode, FiSlash } from "react-icons/fi"

import type { CodeNode } from "./types"

function contractSummary(contract: Record<string, { type?: string }>): string {
  const entries = Object.entries(contract)
  if (entries.length === 0) return "any"
  return entries.map(([name, spec]) => `${name}: ${spec.type ?? "Any"}`).join(", ")
}

/**
 * A single code node on the canvas: contract summary, a code preview and the
 * run/enforcement state, so the graph is readable without opening the inspector.
 */
const CodeNodeComponent = ({ data, selected }: NodeProps<CodeNode>) => {
  const firstLine = data.code.trim().split("\n")[0] ?? ""
  return (
    <div
      className={`w-60 rounded-lg border-2 bg-white shadow-sm transition-colors dark:bg-[#2f2f2f] ${
        selected
          ? "border-blue-500"
          : data.disabled
            ? "border-gray-300 opacity-70 dark:border-gray-600"
            : "border-gray-200 dark:border-gray-700"
      }`}
    >
      <Handle type="target" position={Position.Left} className="!bg-gray-400" />

      <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2 dark:border-gray-700">
        <div className="flex min-w-0 items-center space-x-2">
          {data.disabled ? (
            <FiSlash className="h-4 w-4 flex-shrink-0 text-gray-400" />
          ) : (
            <FiCode className="h-4 w-4 flex-shrink-0 text-green-600" />
          )}
          <span className="truncate text-sm font-semibold text-gray-900 dark:text-white">
            {data.name}
          </span>
        </div>
        <span className="ml-2 flex-shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] uppercase text-gray-500 dark:bg-gray-700 dark:text-gray-300">
          {data.language}
        </span>
      </div>

      <div className="space-y-1 px-3 py-2 text-xs text-gray-600 dark:text-gray-400">
        <div className="truncate" title={contractSummary(data.input)}>
          <span className="text-gray-400 dark:text-gray-500">in </span>
          {contractSummary(data.input)}
        </div>
        <div className="truncate" title={contractSummary(data.output)}>
          <span className="text-gray-400 dark:text-gray-500">out </span>
          {contractSummary(data.output)}
        </div>
        {firstLine && (
          <div className="truncate rounded bg-gray-50 px-1 py-0.5 font-mono text-[11px] text-gray-500 dark:bg-gray-800 dark:text-gray-400">
            {firstLine}
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Right} className="!bg-gray-400" />
    </div>
  )
}

export default CodeNodeComponent
