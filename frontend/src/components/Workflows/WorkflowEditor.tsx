import { useCallback, useEffect, useMemo, useState } from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
} from "@xyflow/react"
import { FiArrowLeft, FiPlus, FiSave } from "react-icons/fi"
import { v4 as uuidv4 } from "uuid"

import { ApiError } from "../../client"
import useCustomToast from "../../hooks/useCustomToast"
import { WorkflowsService } from "./api"
import NodeInspector from "./NodeInspector"
import WorkflowCanvas from "./WorkflowCanvas"
import {
  edgeIssue,
  newCodeNode,
  toCanvasEdge,
  toCanvasNode,
  toSavePayload,
  type CodeNode,
  type CodeNodeData,
} from "./types"

interface WorkflowEditorProps {
  workflowId: string
}

interface SaveProblem {
  message: string
  edges: Record<string, string>
}

/** Turn a 400 from PUT /graph into something the canvas can highlight. */
function parseSaveError(error: unknown): SaveProblem {
  if (error instanceof ApiError) {
    const detail = (error.body as { detail?: unknown } | undefined)?.detail
    if (detail && typeof detail === "object") {
      const shaped = detail as {
        message?: string
        edges?: { edge_id: string; reason: string }[]
      }
      const edges: Record<string, string> = {}
      for (const problem of shaped.edges ?? []) {
        edges[problem.edge_id] = problem.reason
      }
      return {
        message: shaped.message ?? "The graph was rejected",
        edges,
      }
    }
    return { message: error.message, edges: {} }
  }
  return { message: "The graph was rejected", edges: {} }
}

const INSPECTOR_DEFAULT_WIDTH = 380
const INSPECTOR_MIN_WIDTH = 320
const INSPECTOR_MAX_WIDTH = 820

const WorkflowEditor = ({ workflowId }: WorkflowEditorProps) => {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const showToast = useCustomToast()

  const [nodes, setNodes] = useState<CodeNode[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [name, setName] = useState("")
  const [edgeErrors, setEdgeErrors] = useState<Record<string, string>>({})
  const [resizing, setResizing] = useState(false)
  const [inspectorWidth, setInspectorWidth] = useState(() => {
    const stored = Number(localStorage.getItem("workflow-inspector-width"))
    return stored >= INSPECTOR_MIN_WIDTH && stored <= INSPECTOR_MAX_WIDTH
      ? stored
      : INSPECTOR_DEFAULT_WIDTH
  })

  // Drag the panel's left edge to widen it over the canvas.
  useEffect(() => {
    if (!resizing) return
    const onMove = (event: MouseEvent) => {
      const next = window.innerWidth - event.clientX
      setInspectorWidth(
        Math.min(INSPECTOR_MAX_WIDTH, Math.max(INSPECTOR_MIN_WIDTH, next)),
      )
    }
    const onUp = () => setResizing(false)
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
    document.body.style.userSelect = "none"
    document.body.style.cursor = "col-resize"
    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
      document.body.style.userSelect = ""
      document.body.style.cursor = ""
    }
  }, [resizing])

  useEffect(() => {
    try {
      localStorage.setItem("workflow-inspector-width", String(inspectorWidth))
    } catch {
      // Private mode or a blocked storage backend; the width just won't persist.
    }
  }, [inspectorWidth])


  const { data, isPending, isError } = useQuery({
    queryKey: ["workflow", workflowId],
    queryFn: () => WorkflowsService.readWorkflow({ id: workflowId }),
  })

  // Hydrate the canvas whenever the server copy changes.
  useEffect(() => {
    if (!data) return
    setNodes((data.nodes ?? []).map(toCanvasNode))
    setEdges((data.edges ?? []).map(toCanvasEdge))
    setName(data.name)
    setDirty(false)
  }, [data])

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedId) ?? null,
    [nodes, selectedId],
  )

  // Live compatibility feedback, plus whatever the last save complained about.
  const decoratedEdges = useMemo(() => {
    const byId = new Map(nodes.map((node) => [node.id, node]))
    return edges.map((edge) => {
      const source = byId.get(edge.source)
      const target = byId.get(edge.target)
      const live =
        source && target ? edgeIssue(source.data, target.data) : null
      const reason = edgeErrors[edge.id] ?? live
      if (!reason) return edge
      return {
        ...edge,
        style: { stroke: "#ef4444", strokeWidth: 2 },
        label: reason,
        labelStyle: { fill: "#ef4444", fontSize: 10 },
        labelBgStyle: { fill: "transparent" },
      }
    })
  }, [nodes, edges, edgeErrors])

  const onNodesChange = useCallback((changes: NodeChange<CodeNode>[]) => {
    setNodes((current) => applyNodeChanges(changes, current))
    // React Flow emits "dimensions" (and "select") changes on its own — on mount
    // and while measuring. Only real edits should mark the graph dirty, or a
    // freshly opened workflow would immediately look unsaved.
    const edited = changes.some(
      (change) =>
        change.type === "position" ||
        change.type === "add" ||
        change.type === "remove" ||
        change.type === "replace",
    )
    if (edited) setDirty(true)
  }, [])

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((current) => applyEdgeChanges(changes, current))
    if (changes.some((change) => change.type !== "select")) setDirty(true)
  }, [])

  const onConnect = useCallback((connection: Connection) => {
    if (connection.source === connection.target) return
    setEdges((current) =>
      addEdge({ ...connection, id: uuidv4() }, current),
    )
    setDirty(true)
  }, [])

  const patchNode = useCallback((id: string, patch: Partial<CodeNodeData>) => {
    setNodes((current) =>
      current.map((node) =>
        node.id === id ? { ...node, data: { ...node.data, ...patch } } : node,
      ),
    )
    setDirty(true)
  }, [])

  const addNode = useCallback(() => {
    setNodes((current) => {
      const node = newCodeNode(current)
      setSelectedId(node.id)
      return [...current, node]
    })
    setDirty(true)
  }, [])

  const deleteNode = useCallback((id: string) => {
    setNodes((current) => current.filter((node) => node.id !== id))
    setEdges((current) =>
      current.filter((edge) => edge.source !== id && edge.target !== id),
    )
    setSelectedId(null)
    setDirty(true)
  }, [])

  const saveGraph = useMutation({
    mutationFn: () =>
      WorkflowsService.updateWorkflowGraph({
        id: workflowId,
        requestBody: toSavePayload(nodes, edges),
      }),
    onSuccess: (graph) => {
      setNodes(graph.nodes.map(toCanvasNode))
      setEdges(graph.edges.map(toCanvasEdge))
      setEdgeErrors({})
      setDirty(false)
      queryClient.invalidateQueries({ queryKey: ["workflow", workflowId] })
      queryClient.invalidateQueries({ queryKey: ["workflows"] })
      showToast("Saved", `Workflow is at version ${graph.version}.`, "success")
    },
    onError: (error) => {
      const problem = parseSaveError(error)
      setEdgeErrors(problem.edges)
      const detail = Object.values(problem.edges)[0]
      showToast("Could not save", detail ?? problem.message, "error")
    },
  })

  const rename = useMutation({
    mutationFn: (newName: string) =>
      WorkflowsService.updateWorkflow({
        id: workflowId,
        requestBody: { name: newName },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflow", workflowId] })
      queryClient.invalidateQueries({ queryKey: ["workflows"] })
    },
    onError: () => showToast("Could not rename", "Try again.", "error"),
  })

  if (isPending) {
    return (
      <div className="flex h-screen items-center justify-center text-gray-500 dark:text-gray-400">
        Loading workflow…
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex h-screen flex-col items-center justify-center space-y-4">
        <p className="text-gray-700 dark:text-gray-300">
          This workflow could not be loaded.
        </p>
        <button
          type="button"
          onClick={() => navigate({ to: "/workflows" })}
          className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
        >
          Back to workflows
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-screen w-full flex-col bg-gray-50 dark:bg-chat-bg">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2 dark:border-gray-700 dark:bg-[#2f2f2f]">
        <div className="flex min-w-0 items-center space-x-3">
          <Link
            to="/workflows"
            className="flex items-center space-x-1 text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
          >
            <FiArrowLeft className="h-4 w-4" />
            <span>Workflows</span>
          </Link>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => {
              if (data && name.trim() && name !== data.name) rename.mutate(name.trim())
            }}
            className="min-w-0 rounded border border-transparent bg-transparent px-2 py-1 text-lg font-semibold text-gray-900 hover:border-gray-300 focus:border-blue-500 focus:outline-none dark:text-white dark:hover:border-gray-600"
          />
          {dirty && (
            <span className="text-xs text-amber-600 dark:text-amber-400">
              unsaved changes
            </span>
          )}
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={addNode}
            className="flex items-center space-x-1 rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            <FiPlus className="h-4 w-4" />
            <span>Add code node</span>
          </button>
          <button
            type="button"
            onClick={() => saveGraph.mutate()}
            disabled={!dirty || saveGraph.isPending}
            className="flex items-center space-x-1 rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FiSave className="h-4 w-4" />
            <span>{saveGraph.isPending ? "Saving…" : "Save"}</span>
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          <WorkflowCanvas
            nodes={nodes}
            edges={decoratedEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onSelectNode={setSelectedId}
          />
        </div>

        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize node settings"
          title="Drag to resize the node settings panel (double-click to reset)"
          onMouseDown={() => setResizing(true)}
          onDoubleClick={() => setInspectorWidth(INSPECTOR_DEFAULT_WIDTH)}
          data-testid="inspector-resize-handle"
          className={`group flex w-1.5 flex-shrink-0 cursor-col-resize items-center justify-center transition-colors ${
            resizing
              ? "bg-blue-500"
              : "bg-gray-200 hover:bg-blue-400 dark:bg-gray-700 dark:hover:bg-blue-500"
          }`}
        >
          <div
            className={`h-8 w-0.5 rounded ${
              resizing ? "bg-white" : "bg-gray-400 group-hover:bg-white dark:bg-gray-500"
            }`}
          />
        </div>

        <aside
          style={{ width: inspectorWidth }}
          className="flex-shrink-0 overflow-hidden border-l border-gray-200 bg-white dark:border-gray-700 dark:bg-[#2f2f2f]"
          data-testid="node-inspector"
        >
          {selectedNode ? (
            <NodeInspector
              node={selectedNode}
              onChange={(patch) => patchNode(selectedNode.id, patch)}
              onDelete={() => deleteNode(selectedNode.id)}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center space-y-2 px-6 text-center">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Select a node to edit its code and contracts.
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Drag from a node&apos;s right edge to another node&apos;s left
                edge to connect them.
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

export default WorkflowEditor
