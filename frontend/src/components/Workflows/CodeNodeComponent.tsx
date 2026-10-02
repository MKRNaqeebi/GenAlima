import { Handle, type NodeProps, Position } from "@xyflow/react"
import {
  FiAlertTriangle,
  FiCheck,
  FiCode,
  FiLoader,
  FiMinus,
  FiSlash,
  FiX,
} from "react-icons/fi"

import type { RunStatus } from "./api"
import { type CodeNode, type FieldContract, isRequired } from "./types"

const MAX_FIELDS = 4

const STATUS_STYLE: Record<
  RunStatus,
  { label: string; icon: typeof FiCheck; className: string }
> = {
  success: {
    label: "success",
    icon: FiCheck,
    className:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  },
  error: {
    label: "failed",
    icon: FiX,
    className: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  },
  skipped: {
    label: "skipped",
    icon: FiMinus,
    className: "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300",
  },
  running: {
    label: "running",
    icon: FiLoader,
    className:
      "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  },
  pending: {
    label: "pending",
    icon: FiLoader,
    className: "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300",
  },
}

/** One side of the contract as "name: type" rows, so wiring is readable at a glance. */
function ContractRows({
  label,
  contract,
}: {
  label: string
  contract: FieldContract
}) {
  const entries = Object.entries(contract)
  return (
    <div>
      <div className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
        {label}
      </div>
      {entries.length === 0 ? (
        <div className="font-mono text-[11px] italic text-gray-400 dark:text-gray-500">
          untyped
        </div>
      ) : (
        <ul className="space-y-0.5 font-mono text-[11px]">
          {entries.slice(0, MAX_FIELDS).map(([name, spec]) => (
            <li key={name} className="flex justify-between space-x-2">
              <span className="truncate text-gray-700 dark:text-gray-200">
                {name}
                {!isRequired(spec) && (
                  <span className="text-gray-400 dark:text-gray-500">?</span>
                )}
              </span>
              <span className="flex-shrink-0 text-violet-600 dark:text-violet-300">
                {spec.type === "list" && spec.items
                  ? `list[${spec.items}]`
                  : spec.type ?? "Any"}
              </span>
            </li>
          ))}
          {entries.length > MAX_FIELDS && (
            <li className="text-gray-400 dark:text-gray-500">
              +{entries.length - MAX_FIELDS} more
            </li>
          )}
        </ul>
      )}
    </div>
  )
}

/**
 * A single code node on the canvas: typed contract, a code preview, its status
 * in the run being shown, and any wiring problem, so the graph is readable
 * without opening the inspector.
 */
const CodeNodeComponent = ({ data, selected }: NodeProps<CodeNode>) => {
  const firstLine = data.code.trim().split("\n")[0] ?? ""
  const status = data.runStatus ? STATUS_STYLE[data.runStatus] : null

  const border = data.error
    ? "border-red-500"
    : selected
      ? "border-blue-500"
      : data.runStatus === "error"
        ? "border-red-400"
        : data.runStatus === "success"
          ? "border-emerald-400 dark:border-emerald-600"
          : data.disabled
            ? "border-gray-300 opacity-70 dark:border-gray-600"
            : "border-gray-200 dark:border-app-border"

  return (
    <div
      data-testid={`code-node-${data.key}`}
      data-run-status={data.runStatus ?? undefined}
      className={`w-64 rounded-lg border-2 bg-white shadow-sm transition-all dark:bg-app-surface ${border} ${
        data.highlighted ? "ring-4 ring-amber-400/60" : ""
      }`}
    >
      <Handle
        id="main"
        type="target"
        position={Position.Left}
        className="!bg-gray-400"
      />

      <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2 dark:border-app-border">
        <div className="flex min-w-0 items-center space-x-2">
          {data.disabled ? (
            <FiSlash className="h-4 w-4 flex-shrink-0 text-gray-400" />
          ) : (
            <FiCode className="h-4 w-4 flex-shrink-0 text-emerald-600" />
          )}
          <span className="truncate text-sm font-semibold text-gray-900 dark:text-white">
            {data.name}
          </span>
        </div>
        <div className="ml-2 flex flex-shrink-0 items-center space-x-1">
          {data.boundary && (
            <span
              data-testid={`boundary-${data.boundary}`}
              title={
                data.boundary === "in"
                  ? "The component's input contract comes from this node"
                  : "The component's output contract comes from this node"
              }
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${
                data.boundary === "in"
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                  : "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300"
              }`}
            >
              {data.boundary === "in" ? "input" : "output"}
            </span>
          )}
          {status && (
            <span
              data-testid="node-run-status"
              title={`Last run: ${status.label}`}
              aria-label={`Last run: ${status.label}`}
              className={`flex items-center rounded p-0.5 ${status.className}`}
            >
              <status.icon className="h-3 w-3" />
            </span>
          )}
        </div>
      </div>

      <div className="space-y-2 px-3 py-2">
        <div className="grid grid-cols-2 gap-3">
          <ContractRows label="in" contract={data.input} />
          <ContractRows label="out" contract={data.output} />
        </div>
        {firstLine && (
          <div className="truncate rounded bg-gray-50 px-1.5 py-0.5 font-mono text-[11px] text-gray-500 dark:bg-app-bg dark:text-gray-400">
            {firstLine}
          </div>
        )}
        {data.error && (
          <div
            className="flex items-start space-x-1 text-[11px] font-medium text-red-600 dark:text-red-400"
            title={data.error}
          >
            <FiAlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0" />
            <span className="line-clamp-2">{data.error}</span>
          </div>
        )}
      </div>

      <Handle
        id="main"
        type="source"
        position={Position.Right}
        className="!bg-gray-400"
      />
    </div>
  )
}

export default CodeNodeComponent
