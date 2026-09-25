import { useEffect, useState } from "react"
import { FiPlus, FiTrash2 } from "react-icons/fi"

import { FIELD_TYPES, type FieldContract } from "./types"
import type { WorkflowFieldSpec } from "./api"

interface FieldContractEditorProps {
  value: FieldContract
  onChange: (next: FieldContract) => void
}

interface FieldRowProps {
  name: string
  spec: WorkflowFieldSpec
  autoFocus: boolean
  onRename: (from: string, to: string) => boolean
  onUpdate: (patch: Partial<WorkflowFieldSpec>) => void
  onRemove: () => void
}

const inputClass =
  "min-w-0 flex-1 rounded border border-gray-300 bg-transparent px-2 py-1 text-sm text-gray-900 dark:border-gray-600 dark:text-white"

/**
 * One field row.
 *
 * The name lives in local state and is committed on blur or Enter. Committing on
 * every keystroke used to rename the key of the enclosing record, which changed
 * this row's React key and remounted the input — so focus was lost after a
 * single character.
 */
const FieldRow = ({
  name,
  spec,
  autoFocus,
  onRename,
  onUpdate,
  onRemove,
}: FieldRowProps) => {
  const [draftName, setDraftName] = useState(name)

  // Keep in sync when the name changes from outside (a save round-trip).
  useEffect(() => setDraftName(name), [name])

  const commitName = () => {
    const next = draftName.trim()
    if (next === name) return
    if (!onRename(name, next)) setDraftName(name)
  }

  const isRequired = spec.required !== false
  const isList = (spec.type ?? "str") === "list"

  return (
    <div className="space-y-2 rounded-md border border-gray-200 p-2 dark:border-gray-700">
      <div className="flex items-center space-x-2">
        <input
          value={draftName}
          autoFocus={autoFocus}
          onChange={(event) => setDraftName(event.target.value)}
          onBlur={commitName}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur()
            if (event.key === "Escape") {
              setDraftName(name)
              event.currentTarget.blur()
            }
          }}
          placeholder="field name"
          className={inputClass}
        />
        <select
          value={spec.type ?? "str"}
          onChange={(event) => onUpdate({ type: event.target.value })}
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
          onClick={onRemove}
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
                ? onUpdate({ required: true, default: null })
                : onUpdate({ required: false })
            }
          />
          <span>required</span>
        </label>

        {!isRequired && (
          <label className="flex flex-1 items-center space-x-1">
            <span>default</span>
            <input
              defaultValue={spec.default == null ? "" : JSON.stringify(spec.default)}
              onBlur={(event) => {
                const raw = event.target.value.trim()
                if (raw === "") {
                  onUpdate({ default: null })
                  return
                }
                try {
                  onUpdate({ default: JSON.parse(raw) })
                } catch {
                  // Invalid JSON is not a default we can send to the server;
                  // leave the previous value untouched.
                }
              }}
              placeholder="JSON"
              className="min-w-0 flex-1 rounded border border-gray-300 bg-transparent px-1 py-0.5 text-xs text-gray-900 dark:border-gray-600 dark:text-white"
            />
          </label>
        )}
      </div>

      {isList && (
        <div className="flex items-center space-x-2 text-xs text-gray-600 dark:text-gray-400">
          <span>items</span>
          <select
            value={spec.items ?? ""}
            onChange={(event) => onUpdate({ items: event.target.value || null })}
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
}

/**
 * Builds a node's input/output contract as a list of Pydantic-style field specs.
 *
 * `required` follows Pydantic semantics: a field with a default is optional, so
 * the UI only exposes a default when "required" is unchecked.
 */
const FieldContractEditor = ({ value, onChange }: FieldContractEditorProps) => {
  const entries = Object.entries(value)
  const [lastAdded, setLastAdded] = useState<string | null>(null)

  const update = (name: string, patch: Partial<WorkflowFieldSpec>) => {
    onChange({ ...value, [name]: { ...value[name], ...patch } })
  }

  /** Returns false when the new name is unusable, so the row can revert. */
  const rename = (from: string, to: string): boolean => {
    const next = to.trim()
    if (!next || next === from) return false
    if (next in value) return false
    const renamed: FieldContract = {}
    for (const [key, spec] of entries) {
      renamed[key === from ? next : key] = spec
    }
    onChange(renamed)
    return true
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
    setLastAdded(candidate)
    onChange({ ...value, [candidate]: { type: "str" } })
  }

  return (
    <div className="space-y-3">
      {entries.length === 0 && (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No fields declared — this side accepts anything.
        </p>
      )}

      {entries.map(([name, spec]) => (
        <FieldRow
          key={name}
          name={name}
          spec={spec}
          autoFocus={name === lastAdded}
          onRename={rename}
          onUpdate={(patch) => update(name, patch)}
          onRemove={() => remove(name)}
        />
      ))}

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
