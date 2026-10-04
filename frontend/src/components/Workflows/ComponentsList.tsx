import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { useMemo } from "react"
import { FiBox, FiEye, FiTrash2 } from "react-icons/fi"

import useAuth from "../../hooks/useAuth"
import useCustomToast from "../../hooks/useCustomToast"
import { relativeTime } from "../../utils"
import { ComponentsService, type WorkflowComponentPublic } from "./api"

const PER_PAGE = 100

/** Contract as "name: type", or "anything" when nothing is declared. */
export function contractSummary(
  contract: WorkflowComponentPublic["input"],
): string {
  const entries = Object.entries(contract ?? {})
  if (entries.length === 0) return "anything"
  return entries
    .map(([name, spec]) => `${name}: ${spec.type ?? "Any"}`)
    .join(", ")
}

/**
 * Group versions under their component name.
 *
 * The API returns every version as its own row, newest first, so the list shows
 * one row per name with its versions in the version column.
 */
export function groupByName(
  components: WorkflowComponentPublic[],
): { name: string; versions: WorkflowComponentPublic[] }[] {
  const groups = new Map<string, WorkflowComponentPublic[]>()
  for (const component of components) {
    const key = component.name.trim().toLowerCase()
    const bucket = groups.get(key)
    if (bucket) bucket.push(component)
    else groups.set(key, [component])
  }
  return [...groups.values()].map((versions) => ({
    name: versions[0].name,
    versions: [...versions].sort((a, b) => b.version - a.version),
  }))
}

function ComponentRow({ versions }: { versions: WorkflowComponentPublic[] }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const showToast = useCustomToast()
  const { user } = useAuth()

  const latest = versions[0]
  const ownedByMe = !user || user.id === latest.owner_id

  const remove = useMutation({
    mutationFn: (id: string) => ComponentsService.deleteComponent({ id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["components"] })
      showToast("Deleted", "Component version removed.", "success")
    },
    onError: () =>
      showToast("Error", "Could not delete this component version.", "error"),
  })

  const openVersion = (version: WorkflowComponentPublic) =>
    navigate({
      to: "/workflow/$workflowId",
      params: { workflowId: version.snapshot_workflow_id },
    })

  return (
    <tr
      data-testid="component-row"
      tabIndex={0}
      onClick={() => openVersion(latest)}
      onKeyDown={(event) => {
        if (event.key === "Enter" && event.target === event.currentTarget)
          openVersion(latest)
      }}
      className="cursor-pointer border-t border-gray-100 focus:bg-gray-50 focus:outline-none dark:focus:bg-app-hover/50 hover:bg-gray-50 dark:border-app-border dark:hover:bg-app-hover/50"
    >
      <td className="max-w-0 py-2.5 pl-4 pr-3">
        <div className="truncate font-medium text-gray-900 dark:text-white">
          {latest.name}
        </div>
        <div className="truncate text-xs text-gray-500 dark:text-gray-400">
          {latest.description || "No description"}
        </div>
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-xs">
        <div className="flex items-center space-x-1">
          {versions.map((version) => (
            <button
              key={version.id}
              type="button"
              title={version.release_notes || `View v${version.version}`}
              onClick={(event) => {
                event.stopPropagation()
                openVersion(version)
              }}
              className={`rounded px-1.5 py-0.5 font-mono font-medium ${
                version.id === latest.id
                  ? "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300"
                  : "text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-app-hover"
              }`}
            >
              v{version.version}
            </button>
          ))}
        </div>
      </td>
      <td className="max-w-0 px-3 py-2.5">
        <div
          className="truncate font-mono text-xs text-gray-500 dark:text-gray-400"
          title={contractSummary(latest.input)}
        >
          {contractSummary(latest.input)}
        </div>
      </td>
      <td className="max-w-0 px-3 py-2.5">
        <div
          className="truncate font-mono text-xs text-gray-500 dark:text-gray-400"
          title={contractSummary(latest.output)}
        >
          {contractSummary(latest.output)}
        </div>
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-gray-500 dark:text-gray-400">
        {relativeTime(latest.created_at)}
      </td>
      <td className="whitespace-nowrap py-2.5 pl-3 pr-4 text-right">
        <div className="flex items-center justify-end space-x-1">
          <button
            type="button"
            title="View code"
            aria-label={`View ${latest.name}`}
            onClick={(event) => {
              event.stopPropagation()
              openVersion(latest)
            }}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-blue-600 dark:hover:bg-app-hover"
          >
            <FiEye className="h-4 w-4" />
          </button>
          {ownedByMe && (
            <button
              type="button"
              title={`Delete v${latest.version}`}
              aria-label={`Delete ${latest.name} v${latest.version}`}
              onClick={(event) => {
                event.stopPropagation()
                if (
                  window.confirm(
                    `Delete "${latest.name}" v${latest.version}? This cannot be undone.`,
                  )
                ) {
                  remove.mutate(latest.id)
                }
              }}
              className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
            >
              <FiTrash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}

/**
 * Published components shared with the viewer's organization.
 *
 * Opening one reuses the workflow editor route, which detects `is_frozen` and
 * renders the snapshot read-only.
 */
const ComponentsList = ({ searchQuery = "" }: { searchQuery?: string }) => {
  const { data, isPending } = useQuery({
    queryKey: ["components"],
    queryFn: () => ComponentsService.readComponents({ limit: PER_PAGE }),
  })

  const groups = useMemo(() => groupByName(data?.data ?? []), [data])

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return groups
    const query = searchQuery.toLowerCase()
    return groups.filter(
      (group) =>
        group.name.toLowerCase().includes(query) ||
        (group.versions[0].description ?? "").toLowerCase().includes(query),
    )
  }, [groups, searchQuery])

  if (isPending) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className="h-12 animate-pulse rounded bg-white dark:bg-app-surface"
          />
        ))}
      </div>
    )
  }

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center space-y-3 py-16">
        <FiBox className="h-12 w-12 text-gray-400 dark:text-gray-600" />
        <h3 className="text-lg text-gray-900 dark:text-white">
          {searchQuery.trim()
            ? "No matching components"
            : "No published components yet"}
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {searchQuery.trim()
            ? "Try a different search."
            : "Open a workflow and press Publish to share it with your organization."}
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-app-border dark:bg-app-surface">
      <table className="w-full table-fixed text-left text-sm">
        <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500 dark:bg-app-bg/40 dark:text-gray-400">
          <tr>
            <th className="py-2 pl-4 pr-3 font-medium">Name</th>
            <th className="w-40 px-3 py-2 font-medium">Versions</th>
            <th className="w-52 px-3 py-2 font-medium">Input</th>
            <th className="w-52 px-3 py-2 font-medium">Output</th>
            <th className="w-28 px-3 py-2 font-medium">Published</th>
            <th className="w-20 py-2 pl-3 pr-4">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((group) => (
            <ComponentRow key={group.name} versions={group.versions} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default ComponentsList
