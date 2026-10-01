import { FiTrash2 } from "react-icons/fi"

import { type CodeNode, autoMapFields, fieldIssue } from "./types"

interface EdgeInspectorProps {
  source: CodeNode
  target: CodeNode
  mapping: Record<string, string>
  issue: string | null
  onChange: (mapping: Record<string, string>) => void
  onDelete: () => void
}

const selectClass =
  "min-w-0 flex-1 rounded border border-gray-300 bg-transparent px-2 py-1 text-sm text-gray-900 dark:border-gray-600 dark:text-white"

/**
 * Field mapping for one connection.
 *
 * Strict: a target input only receives a value when a row maps it from a source
 * output field. Every target input field gets a row, so nothing can be silently
 * unmapped — an uncovered required field is flagged on the node itself.
 */
const EdgeInspector = ({
  source,
  target,
  mapping,
  issue,
  onChange,
  onDelete,
}: EdgeInspectorProps) => {
  const targetFields = Object.entries(target.data.input)
  const sourceFields = Object.keys(source.data.output)

  const setField = (field: string, sourceField: string) => {
    const next = { ...mapping }
    if (sourceField) {
      next[field] = sourceField
    } else {
      delete next[field]
    }
    onChange(next)
  }

  return (
    <div className="flex h-full flex-col" data-testid="edge-inspector">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
          Connection
        </h2>
        <button
          type="button"
          onClick={onDelete}
          title="Delete connection"
          className="rounded p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
        >
          <FiTrash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-700">
        <p className="truncate text-sm text-gray-900 dark:text-white">
          <span className="font-medium">{source.data.name}</span>
          <span className="mx-1 text-gray-400">→</span>
          <span className="font-medium">{target.data.name}</span>
        </p>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Which output field feeds which input field.
        </p>
      </div>

      <div className="flex items-center space-x-2 border-b border-gray-200 px-4 py-2 dark:border-gray-700">
        <button
          type="button"
          onClick={() => onChange(autoMapFields(source.data, target.data))}
          className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          Auto-map by name
        </button>
        <button
          type="button"
          onClick={() => onChange({})}
          className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          Clear
        </button>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
        {targetFields.length === 0 && (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            The target declares no input fields, so this connection carries
            nothing. Declare inputs on {target.data.name} to map them.
          </p>
        )}

        {targetFields.length > 0 && sourceFields.length === 0 && (
          <p className="text-sm text-amber-600 dark:text-amber-400">
            {source.data.name} declares no output fields, so there is nothing to
            map. Declare outputs on the source node first.
          </p>
        )}

        {targetFields.map(([field, targetSpec]) => {
          const sourceField = mapping[field]
          const sourceSpec = sourceField
            ? source.data.output[sourceField]
            : undefined
          const rowIssue =
            sourceSpec && targetSpec
              ? fieldIssue(field, sourceSpec, targetSpec)
              : null
          const missing = Boolean(sourceField) && !sourceSpec

          return (
            <div
              key={field}
              className={`space-y-1 rounded-md border p-2 ${
                rowIssue || missing
                  ? "border-red-300 dark:border-red-800"
                  : "border-gray-200 dark:border-gray-700"
              }`}
            >
              <div className="flex items-center space-x-2">
                <span className="truncate text-sm text-gray-900 dark:text-white">
                  {field}
                </span>
                <span className="flex-shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] uppercase text-gray-500 dark:bg-gray-700 dark:text-gray-300">
                  {targetSpec.type ?? "Any"}
                </span>
              </div>

              <div className="flex items-center space-x-2">
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  from
                </span>
                <select
                  value={sourceField ?? ""}
                  onChange={(event) => setField(field, event.target.value)}
                  className={selectClass}
                  aria-label={`source field for ${field}`}
                >
                  <option value="" className="text-black">
                    — not mapped —
                  </option>
                  {sourceFields.map((name) => (
                    <option key={name} value={name} className="text-black">
                      {name} ({source.data.output[name].type ?? "Any"})
                    </option>
                  ))}
                  {missing && (
                    <option value={sourceField} className="text-black">
                      {sourceField} (missing)
                    </option>
                  )}
                </select>
              </div>

              {(rowIssue || missing) && (
                <p className="text-xs text-red-600 dark:text-red-400">
                  {missing
                    ? `${source.data.name} does not declare an output field '${sourceField}'`
                    : rowIssue}
                </p>
              )}
            </div>
          )
        })}
      </div>

      {issue && (
        <div className="border-t border-red-200 bg-red-50 px-4 py-3 dark:border-red-900 dark:bg-red-900/20">
          <p className="text-xs text-red-700 dark:text-red-300">{issue}</p>
        </div>
      )}
    </div>
  )
}

export default EdgeInspector
