import { useEffect, useMemo, useRef, useState } from "react"
import { FiPlay, FiPlus, FiTrash2, FiX } from "react-icons/fi"

import type { WorkflowFieldSpec, WorkflowItem } from "./api"
import {
  type CodeNode,
  type FieldContract,
  isRequired,
  parseTriggerItems,
} from "./types"

interface RunInputDialogProps {
  /** The first node in execution order: its contract drives the form. */
  node: CodeNode | null
  /** Other entry nodes that receive the same items, named for the hint. */
  otherEntryNames: string[]
  /** What to prefill with, normally the trigger items of the run on screen. */
  initialItems: WorkflowItem[]
  isRunning: boolean
  onSubmit: (items: WorkflowItem[]) => void
  onClose: () => void
}

/** One item's fields as typed text, so a half-typed number never breaks state. */
type Draft = Record<string, string>

/** What an entry node receives when the caller supplies nothing. */
const DEFAULT_ITEMS: WorkflowItem[] = [{ json: {} }]

const inputClass =
  "w-full rounded border bg-transparent px-2 py-1 text-gray-900 focus:outline-none dark:text-white"

/* ------------------------------------------------------------ form values */

/** JSON type name of a value, mirroring `type_name` in the engine. */
function typeName(value: unknown): string {
  if (value === null) return "null"
  if (Array.isArray(value)) return "list"
  if (typeof value === "number")
    return Number.isInteger(value) ? "int" : "float"
  return typeof value
}

/** Mirror of `_scalar_ok` in the engine: one value against one declared type. */
function scalarOk(value: unknown, expected: string): boolean {
  if (expected === "Any") return true
  if (expected === "bool") return typeof value === "boolean"
  if (expected === "int")
    return typeof value === "number" && Number.isInteger(value)
  if (expected === "float") return typeof value === "number"
  if (expected === "str") return typeof value === "string"
  if (expected === "list") return Array.isArray(value)
  if (expected === "dict")
    return typeof value === "object" && value !== null && !Array.isArray(value)
  if (expected === "datetime") return typeof value === "string"
  return false
}

/** How a declared type reads inside an error message. */
function expectation(spec: WorkflowFieldSpec): string {
  const type = spec.type ?? "Any"
  if (type === "list" && spec.items) return `list of ${spec.items}`
  return type
}

/**
 * Turn one field's typed text into the value to send, or say why it cannot be.
 *
 * Mirrors the server's `_value_problem` so a bad value is caught in the dialog
 * instead of coming back as a failed node.
 */
function coerceField(
  spec: WorkflowFieldSpec,
  raw: string,
):
  | { value: unknown; error?: undefined }
  | { value?: undefined; error: string } {
  // An enum is rendered as a select, so `raw` holds the chosen option's index.
  if (spec.enum && spec.enum.length > 0) {
    const index = Number(raw)
    if (
      raw === "" ||
      !Number.isInteger(index) ||
      index < 0 ||
      index >= spec.enum.length
    ) {
      return { error: "Choose one of the listed values." }
    }
    return { value: spec.enum[index] }
  }

  const type = spec.type ?? "Any"

  if (type === "bool") {
    if (raw !== "true" && raw !== "false")
      return { error: "Choose true or false." }
    return { value: raw === "true" }
  }
  if (type === "int") {
    const parsed = Number(raw)
    if (raw.trim() === "" || !Number.isInteger(parsed)) {
      return { error: `Expected an integer, got ${JSON.stringify(raw)}.` }
    }
    return { value: parsed }
  }
  if (type === "float") {
    const parsed = Number(raw)
    if (raw.trim() === "" || Number.isNaN(parsed)) {
      return { error: `Expected a number, got ${JSON.stringify(raw)}.` }
    }
    return { value: parsed }
  }
  if (type === "str" || type === "datetime") return { value: raw }

  // list, dict and Any are typed as JSON.
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    return { error: `Expected ${type} as JSON: ${(error as Error).message}` }
  }
  if (!scalarOk(parsed, type)) {
    return { error: `Expected ${expectation(spec)}, got ${typeName(parsed)}.` }
  }
  if (type === "list" && spec.items) {
    const element = spec.items
    const elements = parsed as unknown[]
    const bad = elements.findIndex((value) => !scalarOk(value, element))
    if (bad >= 0) {
      return {
        error: `Expected ${expectation(spec)}, got ${typeName(
          elements[bad],
        )} at element ${bad}.`,
      }
    }
  }
  return { value: parsed }
}

/** The value a field starts with: what an earlier run sent, else its default. */
function seedValue(
  spec: WorkflowFieldSpec | undefined,
  json: Record<string, unknown>,
  field: string,
): unknown {
  if (json[field] !== undefined) return json[field]
  return spec?.default ?? undefined
}

/** Render one value as the text its widget edits. */
function toRaw(spec: WorkflowFieldSpec | undefined, value: unknown): string {
  if (value === undefined || value === null) return ""
  if (spec?.enum && spec.enum.length > 0) {
    const index = spec.enum.findIndex(
      (option) => JSON.stringify(option) === JSON.stringify(value),
    )
    return index >= 0 ? String(index) : ""
  }
  const type = spec?.type ?? "Any"
  if (type === "bool") return value === true ? "true" : "false"
  if (type === "str" || type === "datetime") return String(value)
  if (type === "int" || type === "float") return String(value)
  return JSON.stringify(value) ?? ""
}

/**
 * The form's field list: the declared contract first, then any key an earlier
 * run sent that the node no longer declares, so nothing is silently dropped.
 */
function formFields(contract: FieldContract, items: WorkflowItem[]): string[] {
  const names = Object.keys(contract)
  const seen = new Set(names)
  for (const item of items) {
    for (const key of Object.keys(item.json ?? {})) seen.add(key)
  }
  return [...seen]
}

/** A blank row, with declared defaults already filled in. */
function blankDraft(fields: string[], contract: FieldContract): Draft {
  const draft: Draft = {}
  for (const field of fields) {
    draft[field] = toRaw(contract[field], contract[field]?.default ?? undefined)
  }
  return draft
}

/** Rows to open the form with, one per item, prefilled from `items`. */
function seedDrafts(
  items: WorkflowItem[],
  fields: string[],
  contract: FieldContract,
): Draft[] {
  const source = items.length > 0 ? items : DEFAULT_ITEMS
  return source.map((item) => {
    const json = (item.json ?? {}) as Record<string, unknown>
    const draft: Draft = {}
    for (const field of fields) {
      draft[field] = toRaw(
        contract[field],
        seedValue(contract[field], json, field),
      )
    }
    return draft
  })
}

interface Conversion {
  items: WorkflowItem[]
  /** Row index -> field name -> message. */
  errors: Record<number, Record<string, string>>
  ok: boolean
}

/**
 * Build the items to run with, plus a message for every cell that cannot be
 * sent. A cell that fails keeps its typed text in `items` so switching to the
 * JSON view loses nothing.
 */
function toItems(
  drafts: Draft[],
  fields: string[],
  contract: FieldContract,
): Conversion {
  const errors: Record<number, Record<string, string>> = {}
  const items: WorkflowItem[] = []
  let ok = true

  drafts.forEach((draft, index) => {
    const json: Record<string, unknown> = {}
    const rowErrors: Record<string, string> = {}

    for (const field of fields) {
      const spec = contract[field]
      const raw = draft[field] ?? ""
      if (raw === "") {
        if (spec && isRequired(spec))
          rowErrors[field] = "This field is required."
        continue
      }
      // A field that survived from an earlier run with no declaration is Any.
      const result = coerceField(spec ?? { type: "Any" }, raw)
      if (result.error) {
        rowErrors[field] = result.error
        json[field] = raw
      } else {
        json[field] = result.value
      }
    }

    if (Object.keys(rowErrors).length > 0) {
      ok = false
      errors[index] = rowErrors
    }
    items.push({ json })
  })

  return { items, errors, ok }
}

/* ------------------------------------------------------------------ widgets */

function FieldWidget({
  id,
  testId,
  spec,
  value,
  invalid,
  autoFocus,
  onChange,
}: {
  id: string
  testId: string
  spec: WorkflowFieldSpec | undefined
  value: string
  invalid: boolean
  autoFocus: boolean
  onChange: (value: string) => void
}) {
  // Text size is per widget: a long JSON value wants a smaller mono font than a
  // one-line name, and two conflicting utilities would be resolved by CSS order.
  const className = `${inputClass} ${
    invalid ? "border-red-400" : "border-gray-300 dark:border-app-border"
  }`
  const type = spec?.type ?? "Any"

  if (spec?.enum && spec.enum.length > 0) {
    return (
      <select
        id={id}
        data-testid={testId}
        value={value}
        autoFocus={autoFocus}
        onChange={(event) => onChange(event.target.value)}
        className={`${className} text-sm`}
      >
        <option value="" className="text-black">
          Choose…
        </option>
        {spec.enum.map((option, index) => (
          <option
            key={JSON.stringify(option)}
            value={String(index)}
            className="text-black"
          >
            {option === null ? "null" : String(option)}
          </option>
        ))}
      </select>
    )
  }

  if (type === "bool") {
    return (
      <select
        id={id}
        data-testid={testId}
        value={value}
        autoFocus={autoFocus}
        onChange={(event) => onChange(event.target.value)}
        className={`${className} text-sm`}
      >
        <option value="" className="text-black">
          Not set
        </option>
        <option value="true" className="text-black">
          true
        </option>
        <option value="false" className="text-black">
          false
        </option>
      </select>
    )
  }

  // Numbers stay text inputs on purpose: the browser must not eat a value the
  // author is midway through typing, and validation is ours to explain.
  if (type === "int" || type === "float") {
    return (
      <input
        id={id}
        data-testid={testId}
        type="text"
        inputMode={type === "int" ? "numeric" : "decimal"}
        value={value}
        autoFocus={autoFocus}
        onChange={(event) => onChange(event.target.value)}
        className={`${className} text-sm`}
      />
    )
  }

  if (type === "str" || type === "datetime") {
    return (
      <input
        id={id}
        data-testid={testId}
        type="text"
        value={value}
        autoFocus={autoFocus}
        onChange={(event) => onChange(event.target.value)}
        className={`${className} text-sm`}
      />
    )
  }

  return (
    <textarea
      id={id}
      data-testid={testId}
      rows={2}
      spellCheck={false}
      value={value}
      autoFocus={autoFocus}
      onChange={(event) => onChange(event.target.value)}
      className={`${className} resize-y font-mono text-xs`}
    />
  )
}

/* ------------------------------------------------------------------- dialog */

/**
 * Asks for the input the first node receives, then runs the workflow.
 *
 * The form is built from that node's declared input contract so an author
 * supplies typed values rather than hand-written items; nodes with no contract
 * open in the JSON view, which stays available either way as the escape hatch
 * for arbitrary items.
 */
const RunInputDialog = ({
  node,
  otherEntryNames,
  initialItems,
  isRunning,
  onSubmit,
  onClose,
}: RunInputDialogProps) => {
  const contract = node?.data.input
  const baseFields = useMemo(
    () => formFields(contract ?? {}, initialItems),
    [contract, initialItems],
  )
  // Keys introduced through the JSON view, so toggling views is lossless.
  const [extraFields, setExtraFields] = useState<string[]>([])
  const fields = useMemo(
    () => [
      ...baseFields,
      ...extraFields.filter((name) => !baseFields.includes(name)),
    ],
    [baseFields, extraFields],
  )

  const [drafts, setDrafts] = useState<Draft[]>(() =>
    seedDrafts(initialItems, baseFields, contract ?? {}),
  )
  const [jsonText, setJsonText] = useState(() =>
    JSON.stringify(
      initialItems.length > 0 ? initialItems : DEFAULT_ITEMS,
      null,
      2,
    ),
  )
  const [mode, setMode] = useState<"fields" | "json">(
    baseFields.length > 0 ? "fields" : "json",
  )
  // Errors stay quiet until the author asks to run, so an empty required field
  // is not shouted about the moment the dialog opens.
  const [touched, setTouched] = useState(false)

  const jsonParsed = useMemo(() => parseTriggerItems(jsonText), [jsonText])
  const conversion = useMemo(
    () => toItems(drafts, fields, contract ?? {}),
    [drafts, fields, contract],
  )

  const submit = () => {
    setTouched(true)
    if (mode === "json") {
      if (jsonParsed.items) onSubmit(jsonParsed.items)
      return
    }
    if (conversion.ok) onSubmit(conversion.items)
  }

  const showFields = () => {
    const parsed = parseTriggerItems(jsonText)
    if (!parsed.items) return
    const extra = new Set(extraFields)
    for (const item of parsed.items) {
      for (const key of Object.keys(item.json ?? {})) {
        if (!fields.includes(key)) extra.add(key)
      }
    }
    const nextFields = [
      ...fields,
      ...[...extra].filter((name) => !fields.includes(name)),
    ]
    setExtraFields([...extra])
    setDrafts(seedDrafts(parsed.items, nextFields, contract ?? {}))
    setMode("fields")
  }

  const showJson = () => {
    const { items } = toItems(drafts, fields, contract ?? {})
    setJsonText(JSON.stringify(items, null, 2))
    setMode("json")
  }

  const updateField = (row: number, field: string, value: string) =>
    setDrafts((current) =>
      current.map((draft, index) =>
        index === row ? { ...draft, [field]: value } : draft,
      ),
    )

  const actions = useRef({ submit, isRunning, onClose })
  actions.current = { submit, isRunning, onClose }

  // A ref keeps one listener for the dialog's life, while always calling the
  // latest `submit`. ⌘↵ is also the editor's run shortcut; that one stands down
  // while this dialog is open, so the two never fire together.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const current = actions.current
      if (event.key === "Escape") {
        event.preventDefault()
        current.onClose()
      } else if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault()
        if (!current.isRunning) current.submit()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const rowErrors = (
    row: number,
    field: string,
    raw: string,
  ): string | null => {
    const message = conversion.errors[row]?.[field]
    if (!message) return null
    // Only "required" can be the fault of an empty cell; stay quiet about it
    // until the author has actually asked to run.
    if (!touched && raw === "") return null
    return message
  }

  const itemCount =
    mode === "fields" ? drafts.length : jsonParsed.items?.length ?? 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      // React Flow deletes the selected node on Backspace/Delete. It ignores
      // real inputs, but not a focused button, so keep those keys inside.
      onKeyDown={(event) => {
        if (event.key === "Backspace" || event.key === "Delete")
          event.stopPropagation()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="run-input-title"
        data-testid="run-input-dialog"
        className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-lg bg-white shadow-xl dark:bg-app-surface"
      >
        <div className="flex items-start justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
          <div className="min-w-0">
            <h2
              id="run-input-title"
              className="text-lg font-semibold text-gray-900 dark:text-white"
            >
              Run input
            </h2>
            <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-400">
              {node ? (
                <>
                  <span className="font-medium text-gray-800 dark:text-gray-200">
                    {node.data.name}
                  </span>{" "}
                  runs first and receives{" "}
                  {itemCount === 1 ? "this item" : "these items"}.
                </>
              ) : (
                <>The first node receives these items.</>
              )}
            </p>
            {otherEntryNames.length > 0 && (
              <p
                data-testid="run-input-other-entries"
                className="mt-0.5 text-xs text-amber-700 dark:text-amber-400"
              >
                {otherEntryNames.join(", ")}{" "}
                {otherEntryNames.length === 1 ? "is also" : "are also"} an entry
                node and receives the same items.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <FiX className="h-4 w-4" />
          </button>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (!isRunning) submit()
          }}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="flex flex-shrink-0 items-center space-x-2 border-b border-gray-200 px-4 py-2 dark:border-gray-700">
            <div className="flex rounded border border-gray-200 dark:border-gray-700">
              <button
                type="button"
                data-testid="run-input-mode-fields"
                onClick={showFields}
                disabled={mode === "json" && !jsonParsed.items}
                title={
                  jsonParsed.items
                    ? "Fill in the contract fields"
                    : "Fix the JSON below to switch back to fields"
                }
                className={`px-2.5 py-1 text-xs ${
                  mode === "fields"
                    ? "bg-gray-200 text-gray-900 dark:bg-app-hover dark:text-white"
                    : "text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-300 dark:hover:bg-app-hover"
                }`}
              >
                Fields
              </button>
              <button
                type="button"
                data-testid="run-input-mode-json"
                onClick={showJson}
                className={`px-2.5 py-1 text-xs ${
                  mode === "json"
                    ? "bg-gray-200 text-gray-900 dark:bg-app-hover dark:text-white"
                    : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-app-hover"
                }`}
              >
                JSON
              </button>
            </div>
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {mode === "fields"
                ? "Values for the fields this node declares."
                : "A JSON list of items, as the engine receives them."}
            </span>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {mode === "json" ? (
              <div className="flex h-full flex-col space-y-1">
                <label
                  htmlFor="run-input-json"
                  className="text-xs text-gray-500 dark:text-gray-400"
                >
                  Items ({itemCount})
                </label>
                <textarea
                  id="run-input-json"
                  data-testid="run-input-json"
                  value={jsonText}
                  autoFocus
                  spellCheck={false}
                  onChange={(event) => setJsonText(event.target.value)}
                  className={`min-h-[220px] flex-1 resize-y rounded border bg-transparent p-2 font-mono text-[11px] text-gray-800 focus:outline-none dark:text-gray-200 ${
                    jsonParsed.error
                      ? "border-red-400"
                      : "border-gray-200 focus:border-blue-500 dark:border-app-border"
                  }`}
                />
                {jsonParsed.error && (
                  <p
                    data-testid="run-input-json-error"
                    className="text-[11px] text-red-600 dark:text-red-400"
                  >
                    {jsonParsed.error}
                  </p>
                )}
              </div>
            ) : fields.length === 0 ? (
              <p className="rounded border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-600 dark:border-gray-600 dark:text-gray-400">
                {node?.data.name ?? "This node"} declares no input fields.
                Switch to JSON to send it whatever you like, or add fields on
                the node&apos;s Input tab.
              </p>
            ) : (
              drafts.map((draft, row) => (
                <div
                  key={row}
                  data-testid={`run-input-item-${row}`}
                  className="space-y-3 rounded border border-gray-200 px-3 py-3 dark:border-gray-700"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Item {row + 1}
                    </p>
                    {drafts.length > 1 && (
                      <button
                        type="button"
                        aria-label={`Remove item ${row + 1}`}
                        onClick={() =>
                          setDrafts((current) =>
                            current.filter((_, index) => index !== row),
                          )
                        }
                        className="rounded p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                      >
                        <FiTrash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  {fields.map((field, position) => {
                    const spec = contract?.[field]
                    const raw = draft[field] ?? ""
                    const message = rowErrors(row, field, raw)
                    const inputId = `run-input-${row}-${field}`
                    return (
                      <div key={field} className="space-y-1">
                        <label
                          htmlFor={inputId}
                          className="flex items-center space-x-1 text-xs text-gray-700 dark:text-gray-300"
                        >
                          <span className="font-mono">{field}</span>
                          <span className="text-gray-400 dark:text-gray-500">
                            {spec?.type ?? "Any"}
                          </span>
                          {spec && isRequired(spec) && (
                            <span
                              className="text-red-500"
                              title="Required by the input contract"
                            >
                              *
                            </span>
                          )}
                        </label>
                        {spec?.description && (
                          <p className="text-[11px] text-gray-400 dark:text-gray-500">
                            {spec.description}
                          </p>
                        )}
                        <FieldWidget
                          id={inputId}
                          testId={`run-input-field-${row}-${field}`}
                          spec={spec}
                          value={raw}
                          invalid={Boolean(message)}
                          autoFocus={row === 0 && position === 0}
                          onChange={(value) => updateField(row, field, value)}
                        />
                        {message && (
                          <p className="text-[11px] text-red-600 dark:text-red-400">
                            {message}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              ))
            )}

            {mode === "fields" && fields.length > 0 && (
              <button
                type="button"
                data-testid="run-input-add-item"
                onClick={() =>
                  setDrafts((current) => [
                    ...current,
                    blankDraft(fields, contract ?? {}),
                  ])
                }
                className="flex items-center space-x-1 rounded border border-dashed border-gray-300 px-2 py-1 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                <FiPlus className="h-4 w-4" />
                <span>Add item</span>
              </button>
            )}
          </div>

          <div className="flex flex-shrink-0 items-center justify-between border-t border-gray-200 px-4 py-3 dark:border-gray-700">
            <p className="text-xs text-gray-400 dark:text-gray-500">
              The graph is saved first if it has pending edits.
            </p>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                data-testid="run-input-submit"
                disabled={isRunning}
                title="Run workflow (⌘↵)"
                className="flex items-center space-x-1 rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <FiPlay className="h-4 w-4" />
                <span>{isRunning ? "Running…" : "Run workflow"}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

export default RunInputDialog
