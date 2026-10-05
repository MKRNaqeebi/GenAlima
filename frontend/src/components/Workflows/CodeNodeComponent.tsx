import { Handle, type NodeProps, Position } from "@xyflow/react"

import ComponentIcon from "./ComponentIcon"
import { type CodeNode, nodeLabel } from "./types"

/**
 * A single code node on the canvas.
 *
 * Deliberately one line: the card says which node this is and which version of
 * it runs — `sum-two-number:1` — while the inspector holds the contracts, the
 * code and the settings. A node copied from a published component shows that
 * component's image before the label, or the shared default icon when the
 * publisher set none; a plain code node carries no mark. The border carries the
 * run and validation state (red for a failed run or a wiring fault, green for a
 * success, an amber ring when the issues list is pointing here), so a run stays
 * readable without opening anything.
 */
const CodeNodeComponent = ({ data, selected }: NodeProps<CodeNode>) => {
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
      // The fault the card no longer prints is still one hover away.
      title={data.error ?? undefined}
      className={`w-64 rounded-lg border-2 bg-white px-3 py-2 shadow-sm transition-all dark:bg-app-surface ${border} ${
        data.highlighted ? "ring-4 ring-amber-400/60" : ""
      }`}
    >
      <Handle
        id="main"
        type="target"
        position={Position.Left}
        className="!bg-gray-400"
      />
      <div className="flex min-w-0 items-center space-x-2">
        {data.component && (
          <ComponentIcon
            icon={data.component.icon}
            testId="node-icon"
            title={`Copied from ${data.component.name}:${data.component.version}`}
            className="h-4 w-4 flex-shrink-0 rounded object-contain"
          />
        )}
        <span className="truncate font-mono text-sm font-semibold text-gray-900 dark:text-white">
          {nodeLabel(data)}
        </span>
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
