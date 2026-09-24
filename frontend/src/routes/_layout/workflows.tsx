import { useState } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { FiCode, FiPlus, FiSearch, FiTrash2 } from "react-icons/fi"
import { z } from "zod"

import { PaginationFooter } from "../../components/Common/PaginationFooter.tsx"
import AddWorkflow from "../../components/Workflows/AddWorkflow"
import {
  WorkflowsService,
  type WorkflowPublic,
} from "../../components/Workflows/api"
import useCustomToast from "../../hooks/useCustomToast"

const workflowsSearchSchema = z.object({
  page: z.number().catch(1),
})

export const Route = createFileRoute("/_layout/workflows")({
  component: Workflows,
  validateSearch: (search) => workflowsSearchSchema.parse(search),
})

const PER_PAGE = 12

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

function WorkflowCard({ workflow }: { workflow: WorkflowPublic }) {
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

  return (
    <div className="flex flex-col justify-between rounded-lg border border-gray-200 bg-white transition-all duration-200 hover:shadow-lg dark:border-gray-700 dark:bg-[#2f2f2f]">
      <div className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex min-w-0 items-center space-x-3">
            <FiCode className="h-5 w-5 flex-shrink-0 text-green-600" />
            <span className="truncate text-lg font-semibold text-gray-900 dark:text-white">
              {workflow.name}
            </span>
          </div>
          <button
            type="button"
            title="Delete workflow"
            onClick={() => {
              if (
                window.confirm(`Delete "${workflow.name}"? This cannot be undone.`)
              ) {
                removeWorkflow.mutate()
              }
            }}
            className="rounded p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            <FiTrash2 className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-2 line-clamp-2 text-sm text-gray-600 dark:text-gray-400">
          {workflow.description || "No description"}
        </p>

        <p className="mt-3 text-xs text-gray-400 dark:text-gray-500">
          version {workflow.version ?? 1}
          {workflow.active === false ? " · inactive" : ""}
        </p>
      </div>

      <div className="border-t border-gray-100 px-5 py-3 dark:border-gray-700">
        <button
          type="button"
          onClick={() =>
            navigate({
              to: "/workflow/$workflowId",
              params: { workflowId: workflow.id ?? "" },
            })
          }
          className="w-full rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
        >
          Open editor
        </button>
      </div>
    </div>
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

  return (
    <>
      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((workflow) => (
          <WorkflowCard key={workflow.id} workflow={workflow} />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="flex flex-col items-center space-y-4 py-16">
          <FiCode className="h-16 w-16 text-gray-400 dark:text-gray-600" />
          <h3 className="text-xl text-gray-900 dark:text-white">
            {searchQuery.trim() ? "No matching workflows" : "No workflows yet"}
          </h3>
          <p className="text-gray-600 dark:text-gray-400">
            {searchQuery.trim()
              ? "Try a different search."
              : "Create a workflow to start wiring code nodes together."}
          </p>
        </div>
      )}

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
    <div className="flex h-screen w-full flex-col overflow-hidden bg-gray-50 transition-colors dark:bg-chat-bg">
      <div className="flex w-full flex-1 flex-col overflow-hidden px-8 pt-8">
        <div className="mb-6 flex-shrink-0">
          <div className="flex flex-col items-start space-y-6">
            <div className="flex w-full items-start justify-between">
              <div className="flex flex-col items-start space-y-2">
                <div className="flex items-center space-x-3">
                  <FiCode className="h-8 w-8 text-green-600" />
                  <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                    Workflows
                  </h1>
                </div>
                <p className="text-lg text-gray-600 dark:text-gray-400">
                  Build graphs of typed Python code nodes
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsAddOpen(true)}
                className="flex items-center space-x-2 rounded-md bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
              >
                <FiPlus className="h-4 w-4" />
                <span>New workflow</span>
              </button>
            </div>

            <div className="w-full rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-[#2f2f2f]">
              <div className="p-4">
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <FiSearch className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                  </div>
                  <input
                    type="text"
                    placeholder="Search workflows..."
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    className="block w-full border-0 bg-transparent py-2 pl-10 pr-3 text-base text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-0 dark:text-white dark:placeholder-gray-400"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pb-8">
          <WorkflowsGrid searchQuery={searchQuery} />
        </div>

        <AddWorkflow isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} />
      </div>
    </div>
  )
}
