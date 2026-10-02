import { useMutation } from "@tanstack/react-query"
import type { Edge } from "@xyflow/react"
import { useMemo, useState } from "react"
import { FiUpload, FiX } from "react-icons/fi"

import { ApiError } from "../../client"
import useCustomToast from "../../hooks/useCustomToast"
import { type WorkflowComponentPublic, WorkflowsService } from "./api"
import {
  type CodeNode,
  type FieldContract,
  boundaryNodeNames,
  publishIssue,
  publishShape,
  toSavePayload,
} from "./types"

interface PublishDialogProps {
  workflowId: string
  defaultName: string
  defaultDescription: string
  nodes: CodeNode[]
  edges: Edge[]
  onClose: () => void
  onPublished: (component: WorkflowComponentPublic) => void
}

interface VersionConflict {
  message: string
  existingVersions: number[]
  suggestedVersion: number | null
}

const inputClass =
  "w-full rounded border border-gray-300 bg-transparent px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:text-white"

/** One contract as "name: type", or "anything" when nothing is declared. */
function contractSummary(contract: FieldContract): string {
  const entries = Object.entries(contract)
  if (entries.length === 0) return "anything (no fields declared)"
  return entries
    .map(([name, spec]) => `${name}: ${spec.type ?? "Any"}`)
    .join(", ")
}

/** Turn a 409 body into the versions the author may pick from instead. */
function parseConflict(error: unknown): VersionConflict | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null
  const detail = (error.body as { detail?: unknown } | undefined)?.detail
  if (!detail || typeof detail !== "object") {
    return {
      message: error.message,
      existingVersions: [],
      suggestedVersion: null,
    }
  }
  const shaped = detail as {
    message?: string
    existing_versions?: number[]
    suggested_version?: number
  }
  return {
    message: shaped.message ?? "That version already exists",
    existingVersions: shaped.existing_versions ?? [],
    suggestedVersion: shaped.suggested_version ?? null,
  }
}

/**
 * Publish form: names the reusable component and confirms its boundary.
 *
 * The input and output contracts are shown read-only because they are derived
 * from the entry and exit nodes rather than chosen here; to change them the
 * author edits those nodes and publishes another version.
 */
const PublishDialog = ({
  workflowId,
  defaultName,
  defaultDescription,
  nodes,
  edges,
  onClose,
  onPublished,
}: PublishDialogProps) => {
  const showToast = useCustomToast()
  const [name, setName] = useState(defaultName)
  const [version, setVersion] = useState(1)
  const [description, setDescription] = useState(defaultDescription)
  const [releaseNotes, setReleaseNotes] = useState("")
  const [conflict, setConflict] = useState<VersionConflict | null>(null)

  const shape = useMemo(() => publishShape(nodes, edges), [nodes, edges])
  const issue = useMemo(() => publishIssue(nodes, edges), [nodes, edges])
  const names = useMemo(() => boundaryNodeNames(nodes, shape), [nodes, shape])

  const contracts = useMemo(() => {
    const byId = new Map(nodes.map((node) => [node.id, node.data]))
    return {
      input: shape ? byId.get(shape.entryId)?.input ?? {} : {},
      output: shape ? byId.get(shape.exitId)?.output ?? {} : {},
    }
  }, [nodes, shape])

  const publish = useMutation({
    mutationFn: () =>
      WorkflowsService.publishWorkflow({
        id: workflowId,
        requestBody: {
          name: name.trim(),
          version,
          description: description.trim() || null,
          release_notes: releaseNotes.trim() || null,
          graph: toSavePayload(nodes, edges),
        },
      }),
    onSuccess: (component) => {
      showToast(
        "Published",
        `${component.name} v${component.version} is now available to your organization.`,
        "success",
      )
      onPublished(component)
    },
    onError: (error) => {
      const found = parseConflict(error)
      if (found) {
        setConflict(found)
        if (found.suggestedVersion) setVersion(found.suggestedVersion)
        return
      }
      setConflict(null)
      const detail = (error as ApiError).body as
        | { detail?: { message?: string } | string }
        | undefined
      const message =
        typeof detail?.detail === "string"
          ? detail.detail
          : detail?.detail?.message ?? "The workflow could not be published."
      showToast("Could not publish", message, "error")
    },
  })

  const canSubmit = name.trim().length > 0 && version >= 1 && !issue

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-lg bg-white shadow-xl dark:bg-app-surface">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Publish as component
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
            if (canSubmit) publish.mutate()
          }}
          className="flex-1 space-y-4 overflow-y-auto px-4 py-4"
        >
          {issue && (
            <div
              data-testid="publish-blocker"
              className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200"
            >
              {issue.message}
            </div>
          )}

          <label className="block space-y-1">
            <span className="text-sm text-gray-700 dark:text-gray-300">
              Component name
            </span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
              placeholder="Daily report"
              className={inputClass}
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Version
              </span>
              <input
                type="number"
                min={1}
                step={1}
                value={version}
                onChange={(event) => {
                  setConflict(null)
                  setVersion(
                    Math.max(1, Math.floor(Number(event.target.value) || 1)),
                  )
                }}
                className={inputClass}
              />
            </label>

            <label className="block space-y-1">
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Description
              </span>
              <input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className={inputClass}
              />
            </label>
          </div>

          <label className="block space-y-1">
            <span className="text-sm text-gray-700 dark:text-gray-300">
              Release notes
            </span>
            <textarea
              value={releaseNotes}
              onChange={(event) => setReleaseNotes(event.target.value)}
              rows={2}
              placeholder="What changed in this version?"
              className={inputClass}
            />
          </label>

          <div className="space-y-2 rounded border border-gray-200 px-3 py-2 dark:border-gray-700">
            <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
              Component interface
            </p>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              <span className="text-gray-500 dark:text-gray-400">
                Input from{" "}
              </span>
              {names.entry}
              <span className="text-gray-500 dark:text-gray-400"> → </span>
              {contractSummary(contracts.input)}
            </p>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              <span className="text-gray-500 dark:text-gray-400">
                Output from{" "}
              </span>
              {names.exit}
              <span className="text-gray-500 dark:text-gray-400"> → </span>
              {contractSummary(contracts.output)}
            </p>
          </div>

          {conflict && (
            <div
              data-testid="publish-conflict"
              className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/20 dark:text-red-200"
            >
              <p>{conflict.message}</p>
              {conflict.existingVersions.length > 0 && (
                <p className="mt-1">
                  Existing versions: {conflict.existingVersions.join(", ")}.
                  Choose a different version.
                </p>
              )}
            </div>
          )}

          <div className="flex justify-end space-x-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit || publish.isPending}
              className="flex items-center space-x-1 rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FiUpload className="h-4 w-4" />
              <span>{publish.isPending ? "Publishing…" : "Publish"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default PublishDialog
