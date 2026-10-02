import { useQuery } from "@tanstack/react-query"
import { type RefObject, useMemo, useState } from "react"
import {
  FiBox,
  FiChevronsLeft,
  FiChevronsRight,
  FiCode,
  FiPlus,
  FiSearch,
} from "react-icons/fi"

import { contractSummary, groupByName } from "./ComponentsList"
import { COMPONENT_DRAG_TYPE } from "./WorkflowCanvas"
import { ComponentsService, type WorkflowComponentPublic } from "./api"

interface NodePaletteProps {
  /** Collapsed to an icon rail to give the canvas room on small screens. */
  open: boolean
  onToggle: () => void
  onAddCodeNode: () => void
  onInsertComponent: (component: WorkflowComponentPublic) => void
  /** Lets the editor focus the search box from ⌘K. */
  searchRef: RefObject<HTMLInputElement>
  /** Component insertion in progress, so a slow fetch is not clicked twice. */
  busy?: boolean
}

/** One component group: newest version by default, older ones selectable. */
function ComponentItem({
  versions,
  onInsert,
  busy,
}: {
  versions: WorkflowComponentPublic[]
  onInsert: (component: WorkflowComponentPublic) => void
  busy?: boolean
}) {
  const [selectedId, setSelectedId] = useState(versions[0].id)
  const component =
    versions.find((version) => version.id === selectedId) ?? versions[0]

  return (
    <li
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData(COMPONENT_DRAG_TYPE, component.id)
        event.dataTransfer.effectAllowed = "copy"
      }}
      data-testid="palette-component"
      title={component.description ?? undefined}
      className="group cursor-grab rounded-md border border-transparent px-2 py-2 hover:border-gray-200 hover:bg-gray-50 active:cursor-grabbing dark:hover:border-app-border dark:hover:bg-app-hover"
    >
      <div className="flex items-center justify-between space-x-2">
        <div className="flex min-w-0 items-center space-x-2">
          <FiBox className="h-4 w-4 flex-shrink-0 text-violet-500" />
          <span className="truncate text-sm text-gray-800 dark:text-gray-100">
            {component.name}
          </span>
        </div>
        <div className="flex flex-shrink-0 items-center space-x-1">
          {versions.length > 1 ? (
            <select
              aria-label={`${component.name} version`}
              value={selectedId}
              onChange={(event) => setSelectedId(event.target.value)}
              className="rounded border border-gray-200 bg-transparent px-1 py-0.5 text-[11px] text-gray-600 dark:border-app-border dark:text-gray-300"
            >
              {versions.map((version) => (
                <option
                  key={version.id}
                  value={version.id}
                  className="text-black"
                >
                  v{version.version}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-[11px] text-gray-400">
              v{component.version}
            </span>
          )}
          <button
            type="button"
            title="Insert onto the canvas"
            disabled={busy}
            onClick={() => onInsert(component)}
            className="rounded p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700 disabled:opacity-40 dark:hover:bg-app-border dark:hover:text-white"
          >
            <FiPlus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="mt-1 truncate pl-6 font-mono text-[10px] text-gray-400 dark:text-gray-500">
        {contractSummary(component.input)} → {contractSummary(component.output)}
      </div>
    </li>
  )
}

/**
 * Left-hand palette: the code node plus every component the organization has
 * published. Components are dragged (or "+"-clicked) onto the canvas.
 */
const NodePalette = ({
  open,
  onToggle,
  onAddCodeNode,
  onInsertComponent,
  searchRef,
  busy,
}: NodePaletteProps) => {
  const [query, setQuery] = useState("")
  const { data, isPending } = useQuery({
    queryKey: ["components"],
    queryFn: () => ComponentsService.readComponents({ limit: 100 }),
  })

  const groups = useMemo(() => {
    const all = groupByName(data?.data ?? [])
    const needle = query.trim().toLowerCase()
    if (!needle) return all
    return all.filter(
      (group) =>
        group.name.toLowerCase().includes(needle) ||
        (group.versions[0].description ?? "").toLowerCase().includes(needle),
    )
  }, [data, query])

  if (!open) {
    return (
      <aside
        data-testid="node-palette"
        className="flex w-10 flex-shrink-0 flex-col items-center space-y-1 border-r border-gray-200 bg-white py-2 dark:border-app-border dark:bg-app-surface"
      >
        <button
          type="button"
          onClick={onToggle}
          title="Show palette"
          aria-label="Show palette"
          className="rounded p-1.5 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-app-hover"
        >
          <FiChevronsRight className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onAddCodeNode}
          title="Add Python code node"
          aria-label="Add Python code node"
          className="rounded p-1.5 text-emerald-600 hover:bg-gray-100 dark:hover:bg-app-hover"
        >
          <FiCode className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onToggle}
          title="Components (⌘K)"
          aria-label="Show components"
          className="rounded p-1.5 text-violet-500 hover:bg-gray-100 dark:hover:bg-app-hover"
        >
          <FiBox className="h-4 w-4" />
        </button>
      </aside>
    )
  }

  return (
    <aside
      data-testid="node-palette"
      className="flex w-60 flex-shrink-0 flex-col border-r border-gray-200 bg-white dark:border-app-border dark:bg-app-surface"
    >
      <div className="flex items-center space-x-1 border-b border-gray-200 p-3 dark:border-app-border">
        <div className="relative flex-1">
          <FiSearch className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search components"
            className="w-full rounded border border-gray-200 bg-transparent py-1.5 pl-7 pr-10 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none dark:border-app-border dark:text-white"
          />
          <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-gray-200 px-1 text-[10px] text-gray-400 dark:border-app-border">
            ⌘K
          </kbd>
        </div>
        <button
          type="button"
          onClick={onToggle}
          title="Hide palette"
          aria-label="Hide palette"
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-app-hover dark:hover:text-white"
        >
          <FiChevronsLeft className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        <h3 className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
          Nodes
        </h3>
        <button
          type="button"
          onClick={onAddCodeNode}
          data-testid="palette-add-code-node"
          className="flex w-full items-center space-x-2 rounded-md px-2 py-2 text-left text-sm text-gray-800 hover:bg-gray-50 dark:text-gray-100 dark:hover:bg-app-hover"
        >
          <FiCode className="h-4 w-4 text-emerald-600" />
          <span>Python code</span>
        </button>

        <h3 className="px-2 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
          Components
        </h3>
        {isPending ? (
          <p className="px-2 text-xs text-gray-400">Loading…</p>
        ) : groups.length === 0 ? (
          <p className="px-2 text-xs text-gray-400">
            {query.trim()
              ? "No matching components."
              : "Nothing published yet. Publish a workflow to reuse it here."}
          </p>
        ) : (
          <ul className="space-y-0.5">
            {groups.map((group) => (
              <ComponentItem
                key={group.name}
                versions={group.versions}
                onInsert={onInsertComponent}
                busy={busy}
              />
            ))}
          </ul>
        )}
      </div>

      <p className="border-t border-gray-200 px-3 py-2 text-[11px] text-gray-400 dark:border-app-border">
        Components are copied in as editable nodes.
      </p>
    </aside>
  )
}

export default NodePalette
