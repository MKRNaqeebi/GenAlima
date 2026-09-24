import { FiPlus, FiTrash2 } from "react-icons/fi"

import { FIELD_TYPES, type FieldContract } from "./types"

interface FieldContractEditorProps {
  value: FieldContract
  onChange: (next: FieldContract) => void
}

/**
 * Builds a node's input/output contract as a list of Pydantic-style field specs.
 *
 * `required` follows Pydantic semantics: a field with a default is optional, so
 * the UI only exposes a default when "required" is unchecked.
 */
const FieldContractEditor = ({ value, onChange }: FieldContractEditorProps) => {
  const entries = Object.entries(value)

  const update = (name: string, patch: Record<string, unknown>) => {
    onChange({ ...value, [name]: { ...value[name], ...patch } })
  }

  const rename = (from: string, to: string) => {
    if (from === to) return
    const next: FieldContract = {}
    for (const [key, spec] of entries) {
      next[key === from ? to : key] = spec
    }
    onChange(next)
  }

  const remove = (name: string) => {
    const next = { ...value }
    delete next[name]
    onChange(next)
  }

  const add = () => {
    let candidate = "field"
    let index = 1
    while (candidate in value) {
      index += 1
      candidate = `field${index}`
    }
    onChange({ ...value, [candidate]: { type: "str" } })
  }

  return (
    <div className="space-y-3">
      {entries.length === 0 && (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No fields declared — this side accepts anything.
        </p>
      )}

      {entries.map(([name, spec]) => {
        const isRequired = spec.required !== false
        return (
          <div
            key={name}
            className="space-y-2 rounded-md border border-gray-200 p-2 dark:border-gray-700"
          >
            <div className="flex items-center space-x-2">
              <input
                value={name}
                onChange={(event) => rename(name, event.target.value)}
                placeholder="field name"
                className="min-w-0 flex-1 rounded border border-gray-300 bg-transparent px-2 py-1 text-sm text-gray-900 dark:border-gray-600 dark:text-white"
              />
              <select
                value={spec.type ?? "str"}
                onChange={(event) => update(name, { type: event.target.value })}
                className="rounded border border-gray-300 bg-transparent px-1 py-1 text-sm text-gray-900 dark:border-gray-600 dark:text-white"
              >
                {FIELD_TYPES.map((type) => (
                  <option key={type} value={type} className="text-black">
                    {type}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => remove(name)}
                title="Remove field"
                className="rounded p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                <FiTrash2 className="h-4 w-4" />
              </button>
            </div>

            <div className="flex items-center space-x-3 text-xs text-gray-600 dark:text-gray-400">
              <label className="flex items-center space-x-1">
                <input
                  type="checkbox"
                  checked={isRequired}
                  onChange={(event) =>
                    event.target.checked
                      ? update(name, { required: true, default: null })
                      : update(name, { required: false })
                  }
                />
                <span>required</span>
              </label>

              {!isRequired && (
                <label className="flex flex-1 items-center space-x-1">
                  <span>default</span>
                  <input
                    defaultValue={
                      spec.default == null ? "" : JSON.stringify(spec.default)
                    }
                    onBlur={(event) => {
                      const raw = event.target.value.trim()
                      if (raw === "") {
                        update(name, { default: null })
                        return
                      }
                      try {
                        update(name, { default: JSON.parse(raw) })
                      } catch {
                        // Leave the previous value in place; invalid JSON is not a
                        // default we can send to the server.
                      }
                    }}
                    placeholder="JSON"
                    className="min-w-0 flex-1 rounded border border-gray-300 bg-transparent px-1 py-0.5 text-xs text-gray-900 dark:border-gray-600 dark:text-white"
                  />
                </label>
              )}
            </div>

            {(spec.type ?? "str") === "list" && (
              <div className="flex items-center space-x-2 text-xs text-gray-600 dark:text-gray-400">
                <span>items</span>
                <select
                  value={spec.items ?? ""}
                  onChange={(event) =>
                    update(name, { items: event.target.value || null })
                  }
                  className="rounded border border-gray-300 bg-transparent px-1 py-0.5 text-xs text-gray-900 dark:border-gray-600 dark:text-white"
                >
                  <option value="" className="text-black">
                    (unset)
                  </option>
                  {FIELD_TYPES.map((type) => (
                    <option key={type} value={type} className="text-black">
                      {type}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )
      })}

      <button
        type="button"
        onClick={add}
        className="flex items-center space-x-1 rounded border border-dashed border-gray-300 px-2 py-1 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
      >
        <FiPlus className="h-3 w-3" />
        <span>Add field</span>
      </button>
    </div>
  )
}

export default FieldContractEditor
