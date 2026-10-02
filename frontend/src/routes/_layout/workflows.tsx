import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import {
  FiCheck,
  FiCode,
  FiPlus,
  FiSearch,
  FiTrash2,
  FiX,
} from "react-icons/fi"
import { z } from "zod"

import { PaginationFooter } from "../../components/Common/PaginationFooter.tsx"
import AddWorkflow from "../../components/Workflows/AddWorkflow"
import {
  type WorkflowSummaryPublic,
  WorkflowsService,
} from "../../components/Workflows/api"
import useCustomToast from "../../hooks/useCustomToast"

const workflowsSearchSchema = z.object({
  page: z.number().catch(1),
})

export const Route = createFileRoute("/_layout/workflows")({
  component: Workflows,
  validateSearch: (search) => workflowsSearchSchema.parse(search),
})

const PER_PAGE = 25

function getWorkflowsQueryOptions({ page }: { page: number }) {
  return {
    queryFn: () =>
      WorkflowsService.readWorkflows({
        skip: (page - 1) * PER_PAGE,
        limit: PER_PAGE,
      }),
    queryKey: ["workflows", { page }],
  }
}

function StatusPill({ status }: { status?: string | null }) {
  if (!status) return <span className="text-gray-400">never run</span>
  const ok = status === "success"
  return (
    <span
      className={`inline-flex items-center space-x-1 rounded px-1.5 py-0.5 text-xs font-medium ${
        ok
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
          : status === "running"
            ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
            : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
      }`}
    >
      {ok ? (
        <FiCheck className="h-3 w-3" />
      ) : status === "running" ? null : (
        <FiX className="h-3 w-3" />
      )}
      <span>{ok ? "passed" : status === "running" ? "running" : "failed"}</span>
    </span>
  )
}

/** "3 min ago" for recent times, a date otherwise. API times are naive UTC. */
function relativeTime(iso?: string | null): string {
  if (!iso) return "—"
  const date = new Date(iso.endsWith("Z") ? iso : `${iso}Z`)
  const seconds = Math.round((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return "just now"
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`
  if (seconds < 7 * 86400) return `${Math.floor(seconds / 86400)} d ago`
  return date.toLocaleDateString()
}

function WorkflowRow({ workflow }: { workflow: WorkflowSummaryPublic }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const showToast = useCustomToast()

  const removeWorkflow = useMutation({
    mutationFn: () => WorkflowsService.deleteWorkflow({ id: workflow.id ?? "" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflows"] })
      showToast("Deleted", "Workflow removed.", "success")
    },
    onError: () => showToast("Error", "Could not delete the workflow.", "error"),
  })

  const open = () =>
    navigate({
      to: "/workflow/$workflowId",
      params: { workflowId: workflow.id ?? "" },
    })

  return (
    <tr
      data-testid="workflow-row"
      tabIndex={0}
      onClick={open}
      onKeyDown={(event) => {
        if (event.key === "Enter" && event.target === event.currentTarget)
          open()
      }}
      className="cursor-pointer border-t border-gray-100 focus:bg-gray-50 focus:outline-none dark:focus:bg-app-hover/50 hover:bg-gray-50 dark:border-app-border dark:hover:bg-app-hover/50"
    >
      <td className="max-w-0 py-2.5 pl-4 pr-3">
        <div className="truncate font-medium text-gray-900 dark:text-white">
          {workflow.name}
        </div>
        <div className="truncate text-xs text-gray-500 dark:text-gray-400">
          {workflow.description || "No description"}
        </div>
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-gray-500 dark:text-gray-400">
        v{workflow.version ?? 1}
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-xs">
        <StatusPill status={workflow.last_run_status} />
        {workflow.last_run_at && (
          <span className="ml-2 text-gray-400">
            {relativeTime(workflow.last_run_at)}
          </span>
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-xs">
        {workflow.published_version ? (
          <span className="rounded bg-violet-100 px-1.5 py-0.5 font-medium text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
            v{workflow.published_version}
          </span>
        ) : (
          <span className="text-gray-400">—</span>
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-gray-500 dark:text-gray-400">
        {relativeTime(workflow.updated_at)}
      </td>
      <td className="py-2.5 pl-3 pr-4 text-right">
        <button
          type="button"
          title="Delete workflow"
          aria-label={`Delete ${workflow.name}`}
          onClick={(event) => {
            event.stopPropagation()
            if (
              window.confirm(
                `Delete "${workflow.name}"? This cannot be undone.`,
              )
            ) {
              removeWorkflow.mutate()
            }
          }}
          className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
        >
          <FiTrash2 className="h-4 w-4" />
        </button>
      </td>
    </tr>
  )
}

function WorkflowsGrid({ searchQuery }: { searchQuery: string }) {
  const { page } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const setPage = (page: number) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    navigate({ search: (prev: any) => ({ ...prev, page }) })

  const { data, isPending, isPlaceholderData } = useQuery({
    ...getWorkflowsQueryOptions({ page }),
    placeholderData: (prevData) => prevData,
  })

  const workflows = data?.data ?? []
  const hasNextPage = !isPlaceholderData && workflows.length === PER_PAGE
  const hasPreviousPage = page > 1

  const filtered = workflows.filter((workflow) => {
    if (!searchQuery.trim()) return true
    const query = searchQuery.toLowerCase()
    return (
      workflow.name.toLowerCase().includes(query) ||
      (workflow.description ?? "").toLowerCase().includes(query)
    )
  })

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
        <FiCode className="h-12 w-12 text-gray-400 dark:text-gray-600" />
        <h3 className="text-lg text-gray-900 dark:text-white">
          {searchQuery.trim() ? "No matching workflows" : "No workflows yet"}
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {searchQuery.trim()
            ? "Try a different search."
            : "Create a workflow to start wiring code nodes together."}
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-app-border dark:bg-app-surface">
        <table className="w-full table-fixed text-left text-sm">
          <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500 dark:bg-app-bg/40 dark:text-gray-400">
            <tr>
              <th className="py-2 pl-4 pr-3 font-medium">Name</th>
              <th className="w-20 px-3 py-2 font-medium">Version</th>
              <th className="w-48 px-3 py-2 font-medium">Last run</th>
              <th className="w-28 px-3 py-2 font-medium">Published</th>
              <th className="w-28 px-3 py-2 font-medium">Updated</th>
              <th className="w-14 py-2 pl-3 pr-4">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((workflow) => (
              <WorkflowRow key={workflow.id} workflow={workflow} />
            ))}
          </tbody>
        </table>
      </div>

      <PaginationFooter
        page={page}
        onChangePage={setPage}
        hasNextPage={hasNextPage}
        hasPreviousPage={hasPreviousPage}
      />
    </>
  )
}

function Workflows() {
  const [searchQuery, setSearchQuery] = useState("")
  const [isAddOpen, setIsAddOpen] = useState(false)

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-gray-50 transition-colors dark:bg-app-bg">
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col overflow-hidden px-8 pt-8">
        <div className="mb-5 flex flex-shrink-0 items-end justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
              Workflows
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Graphs of typed Python code nodes. Run them here, publish them as
              components.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsAddOpen(true)}
            className="flex items-center space-x-2 rounded-md bg-blue-600 px-3 py-2 text-sm text-white transition-colors hover:bg-blue-700"
          >
            <FiPlus className="h-4 w-4" />
            <span>New workflow</span>
          </button>
        </div>

        <div className="relative mb-4 flex-shrink-0">
          <FiSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search workflows..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="block w-full rounded-md border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:outline-none dark:border-app-border dark:bg-app-surface dark:text-white dark:placeholder-gray-400"
          />
        </div>

        <div className="flex-1 overflow-y-auto pb-8">
          <WorkflowsGrid searchQuery={searchQuery} />
        </div>

        <AddWorkflow isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} />
      </div>
    </div>
  )
}
