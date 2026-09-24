import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { FiX } from "react-icons/fi"

import { WorkflowsService } from "./api"
import useCustomToast from "../../hooks/useCustomToast"

interface AddWorkflowProps {
  isOpen: boolean
  onClose: () => void
}

const AddWorkflow = ({ isOpen, onClose }: AddWorkflowProps) => {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const showToast = useCustomToast()

  const createWorkflow = useMutation({
    mutationFn: () =>
      WorkflowsService.createWorkflow({
        requestBody: { name: name.trim(), description: description.trim() || null },
      }),
    onSuccess: (workflow) => {
      queryClient.invalidateQueries({ queryKey: ["workflows"] })
      setName("")
      setDescription("")
      onClose()
      if (workflow.id) {
        navigate({
          to: "/workflow/$workflowId",
          params: { workflowId: workflow.id },
        })
      }
    },
    onError: () => showToast("Error", "Could not create the workflow.", "error"),
  })

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl dark:bg-[#2f2f2f]">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            New workflow
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <FiX className="h-4 w-4" />
          </button>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (name.trim()) createWorkflow.mutate()
          }}
          className="space-y-4 px-4 py-4"
        >
          <label className="block space-y-1">
            <span className="text-sm text-gray-700 dark:text-gray-300">Name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
              placeholder="Daily report"
              className="w-full rounded border border-gray-300 bg-transparent px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:text-white"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-sm text-gray-700 dark:text-gray-300">
              Description
            </span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              placeholder="What does this workflow do?"
              className="w-full rounded border border-gray-300 bg-transparent px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:text-white"
            />
          </label>

          <div className="flex justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || createWorkflow.isPending}
              className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {createWorkflow.isPending ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default AddWorkflow
