import { useMemo } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { FiBox, FiEye, FiTrash2 } from "react-icons/fi"

import useCustomToast from "../../hooks/useCustomToast"
import useAuth from "../../hooks/useAuth"
import {
  ComponentsService,
  type WorkflowComponentPublic,
} from "./api"

const PER_PAGE = 100

/** Contract as "name: type", or "anything" when nothing is declared. */
function contractSummary(contract: WorkflowComponentPublic["input"]): string {
  const entries = Object.entries(contract ?? {})
  if (entries.length === 0) return "anything"
  return entries.map(([name, spec]) => `${name}: ${spec.type ?? "Any"}`).join(", ")
}

/**
 * Group versions under their component name.
 *
 * The API returns every version as its own row, newest first, so the list shows
 * one card per name with its versions in the footer.
 */
function groupByName(
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

function ComponentCard({ versions }: { versions: WorkflowComponentPublic[] }) {
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

  return (
    <div
      data-testid="component-card"
      className="flex flex-col justify-between rounded-lg border border-gray-200 bg-white transition-all duration-200 hover:shadow-lg dark:border-gray-700 dark:bg-[#2f2f2f]"
    >
      <div className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex min-w-0 items-center space-x-3">
            <FiBox className="h-5 w-5 flex-shrink-0 text-purple-600" />
            <span className="truncate text-lg font-semibold text-gray-900 dark:text-white">
              {latest.name}
            </span>
          </div>
          <span className="flex-shrink-0 rounded bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
            v{latest.version}
          </span>
        </div>

        <p className="mt-2 line-clamp-2 text-sm text-gray-600 dark:text-gray-400">
          {latest.description || "No description"}
        </p>

        <dl className="mt-3 space-y-1 text-xs text-gray-500 dark:text-gray-400">
          <div className="truncate" title={contractSummary(latest.input)}>
            <dt className="inline text-gray-400 dark:text-gray-500">in </dt>
            <dd className="inline">{contractSummary(latest.input)}</dd>
          </div>
          <div className="truncate" title={contractSummary(latest.output)}>
            <dt className="inline text-gray-400 dark:text-gray-500">out </dt>
            <dd className="inline">{contractSummary(latest.output)}</dd>
          </div>
        </dl>
      </div>

      <div className="space-y-2 border-t border-gray-100 px-5 py-3 dark:border-gray-700">
        <button
          type="button"
          onClick={() =>
            navigate({
              to: "/workflow/$workflowId",
              params: { workflowId: latest.snapshot_workflow_id },
            })
          }
          className="flex w-full items-center justify-center space-x-1 rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
        >
          <FiEye className="h-4 w-4" />
          <span>View code</span>
        </button>

        {versions.length > 1 && (
          <ul
            data-testid="component-versions"
            className="space-y-1 pt-1 text-xs text-gray-500 dark:text-gray-400"
          >
            {versions.map((version) => (
              <li key={version.id} className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() =>
                    navigate({
                      to: "/workflow/$workflowId",
                      params: { workflowId: version.snapshot_workflow_id },
                    })
                  }
                  className="hover:text-blue-600 dark:hover:text-blue-400"
                >
                  v{version.version}
                  {version.release_notes ? ` — ${version.release_notes}` : ""}
                </button>
                {ownedByMe && (
                  <button
                    type="button"
                    title={`Delete v${version.version}`}
                    onClick={() => {
                      if (window.confirm(`Delete v${version.version}? This cannot be undone.`)) {
                        remove.mutate(version.id)
                      }
                    }}
                    className="rounded p-0.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    <FiTrash2 className="h-3 w-3" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

/**
 * Published components shared with the viewer's organization.
 *
 * Opening one reuses the workflow editor route, which detects `is_frozen` and
 * renders the snapshot read-only.
 */
const ComponentsList = () => {
  const { data, isPending } = useQuery({
    queryKey: ["components"],
    queryFn: () => ComponentsService.readComponents({ limit: PER_PAGE }),
  })

  const groups = useMemo(() => groupByName(data?.data ?? []), [data])

  if (isPending) {
    return (
      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="h-40 animate-pulse rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-[#2f2f2f]"
          />
        ))}
      </div>
    )
  }

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center space-y-4 py-16">
        <FiBox className="h-16 w-16 text-gray-400 dark:text-gray-600" />
        <h3 className="text-xl text-gray-900 dark:text-white">
          No published components yet
        </h3>
        <p className="text-gray-600 dark:text-gray-400">
          Open a workflow and press Publish to share it with your organization.
        </p>
      </div>
    )
  }

  return (
    <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {groups.map((group) => (
        <ComponentCard key={group.name} versions={group.versions} />
      ))}
    </div>
  )
}

export default ComponentsList
