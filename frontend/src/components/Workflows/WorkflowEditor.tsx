import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import {
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
} from "@xyflow/react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { FiArrowLeft, FiPlus, FiSave, FiUpload } from "react-icons/fi"
import { v4 as uuidv4 } from "uuid"

import { ApiError } from "../../client"
import useCustomToast from "../../hooks/useCustomToast"
import EdgeInspector from "./EdgeInspector"
import NodeInspector from "./NodeInspector"
import PublishDialog from "./PublishDialog"
import WorkflowCanvas from "./WorkflowCanvas"
import { WorkflowsService } from "./api"
import {
  type CodeNode,
  type CodeNodeData,
  type InboundContribution,
  autoMapFields,
  boundaryCandidates,
  diffContract,
  edgeMapping,
  edgeMappingIssue,
  newCodeNode,
  nodeCoverageIssue,
  remapEdgeAfterContractChange,
  toCanvasEdge,
  toCanvasNode,
  toSavePayload,
} from "./types"

interface WorkflowEditorProps {
  workflowId: string
}

interface SaveProblem {
  message: string
  edges: Record<string, string>
  nodes: Record<string, string>
}

/** Turn a 400 from PUT /graph into something the canvas can highlight. */
function parseSaveError(error: unknown): SaveProblem {
  if (error instanceof ApiError) {
    const detail = (error.body as { detail?: unknown } | undefined)?.detail
    if (detail && typeof detail === "object") {
      const shaped = detail as {
        message?: string
        edges?: { edge_id: string; reason: string }[]
        nodes?: { node_id: string; reason: string }[]
      }
      const edges: Record<string, string> = {}
      for (const problem of shaped.edges ?? []) {
        edges[problem.edge_id] = problem.reason
      }
      const nodes: Record<string, string> = {}
      for (const problem of shaped.nodes ?? []) {
        nodes[problem.node_id] = problem.reason
      }
      return {
        message: shaped.message ?? "The graph was rejected",
        edges,
        nodes,
      }
    }
    return { message: error.message, edges: {}, nodes: {} }
  }
  return { message: "The graph was rejected", edges: {}, nodes: {} }
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
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [name, setName] = useState("")
  const [edgeErrors, setEdgeErrors] = useState<Record<string, string>>({})
  const [nodeErrors, setNodeErrors] = useState<Record<string, string>>({})
  const [resizing, setResizing] = useState(false)
  const [isPublishOpen, setIsPublishOpen] = useState(false)
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

  // A published snapshot is readable by the whole organization but never
  // editable: changes belong in the source workflow and ship as a new version.
  const isFrozen = data?.is_frozen === true

  // Which nodes form the component boundary, so the interface the publish form
  // will use is visible on the canvas before it is opened.
  const boundaryIds = useMemo(() => {
    const { entries, exits } = boundaryCandidates(nodes, edges)
    return {
      entry: entries.length === 1 ? entries[0] : null,
      exit: exits.length === 1 ? exits[0] : null,
    }
  }, [nodes, edges])

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedId) ?? null,
    [nodes, selectedId],
  )

  const selectedEdge = useMemo(
    () => edges.find((edge) => edge.id === selectedEdgeId) ?? null,
    [edges, selectedEdgeId],
  )

  const selectedEdgeSource = useMemo(
    () =>
      selectedEdge
        ? nodes.find((node) => node.id === selectedEdge.source) ?? null
        : null,
    [nodes, selectedEdge],
  )

  const selectedEdgeTarget = useMemo(
    () =>
      selectedEdge
        ? nodes.find((node) => node.id === selectedEdge.target) ?? null
        : null,
    [nodes, selectedEdge],
  )

  // A deleted edge (or one removed with its node) must not keep the inspector open.
  useEffect(() => {
    if (selectedEdgeId && !edges.some((edge) => edge.id === selectedEdgeId)) {
      setSelectedEdgeId(null)
    }
  }, [edges, selectedEdgeId])

  // Each target's inbound edges, so coverage can be judged per node rather than
  // per edge: one input field may be supplied by a different edge than another.
  const inboundByTarget = useMemo(() => {
    const byId = new Map(nodes.map((node) => [node.id, node]))
    const inbound = new Map<string, InboundContribution[]>()
    for (const edge of edges) {
      const source = byId.get(edge.source)
      if (!source) continue
      const contributions = inbound.get(edge.target) ?? []
      contributions.push({
        edgeId: edge.id,
        mapping: edgeMapping(edge),
        source: source.data,
      })
      inbound.set(edge.target, contributions)
    }
    return inbound
  }, [nodes, edges])

  // Live coverage feedback, plus whatever the last save complained about.
  const coverageByNode = useMemo(() => {
    const reasons = new Map<string, string>()
    for (const node of nodes) {
      const reason =
        nodeErrors[node.id] ??
        nodeCoverageIssue(node.data, inboundByTarget.get(node.id) ?? [])
      if (reason) reasons.set(node.id, reason)
    }
    return reasons
  }, [nodes, inboundByTarget, nodeErrors])

  const decoratedNodes = useMemo(
    () =>
      nodes.map((node) => {
        const reason = coverageByNode.get(node.id)
        const boundary =
          node.id === boundaryIds.entry
            ? ("in" as const)
            : node.id === boundaryIds.exit
              ? ("out" as const)
              : null
        if (!reason && !boundary) return node
        return { ...node, data: { ...node.data, error: reason, boundary } }
      }),
    [nodes, coverageByNode, boundaryIds],
  )

  // Per-edge faults: a dangling mapping reference or an incompatible pair.
  const decoratedEdges = useMemo(() => {
    const byId = new Map(nodes.map((node) => [node.id, node]))
    return edges.map((edge) => {
      const source = byId.get(edge.source)
      const target = byId.get(edge.target)
      const live =
        source && target
          ? edgeMappingIssue(source.data, target.data, edgeMapping(edge))
          : null
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

  // The edge inspector shows the worst thing it knows about the selected edge.
  const selectedEdgeIssue =
    selectedEdge && selectedEdgeSource && selectedEdgeTarget
      ? edgeErrors[selectedEdge.id] ??
        edgeMappingIssue(
          selectedEdgeSource.data,
          selectedEdgeTarget.data,
          edgeMapping(selectedEdge),
        ) ??
        coverageByNode.get(selectedEdgeTarget.id) ??
        null
      : null

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
    if (edited && !isFrozen) setDirty(true)
  }, [isFrozen])

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setEdges((current) => applyEdgeChanges(changes, current))
      if (!isFrozen && changes.some((change) => change.type !== "select")) {
        setDirty(true)
      }
    },
    [isFrozen],
  )

  const onConnect = useCallback(
    (connection: Connection) => {
      if (isFrozen) return
      if (connection.source === connection.target) return
      // Seed the mapping with the same-name pairs a bare connection used to
      // imply, so strict edges still "just work" until the author edits them.
      const source = nodes.find((node) => node.id === connection.source)
      const target = nodes.find((node) => node.id === connection.target)
      const mapping =
        source && target ? autoMapFields(source.data, target.data) : {}
      setEdges((current) =>
        addEdge({ ...connection, id: uuidv4(), data: { mapping } }, current),
      )
      setDirty(true)
    },
    [nodes, isFrozen],
  )

  const patchNode = useCallback(
    (id: string, patch: Partial<CodeNodeData>) => {
      if (isFrozen) return
      const node = nodes.find((candidate) => candidate.id === id)
      if (node) {
        // Follow field renames and drop mappings whose field was removed, so a
        // careful edit does not turn into a dangling reference on save.
        const inputChange = patch.input
          ? diffContract(node.data.input, patch.input)
          : null
        const outputChange = patch.output
          ? diffContract(node.data.output, patch.output)
          : null
        if (
          (inputChange &&
            (inputChange.renamed.size > 0 || inputChange.removed.length > 0)) ||
          (outputChange &&
            (outputChange.renamed.size > 0 || outputChange.removed.length > 0))
        ) {
          setEdges((current) =>
            current.map((edge) => {
              let next = edge
              if (inputChange) {
                next = remapEdgeAfterContractChange(next, id, inputChange)
              }
              if (outputChange) {
                next = remapEdgeAfterContractChange(next, id, outputChange)
              }
              return next
            }),
          )
          setEdgeErrors({})
          setNodeErrors({})
        }
      }
      setNodes((current) =>
        current.map((candidate) =>
          candidate.id === id
            ? { ...candidate, data: { ...candidate.data, ...patch } }
            : candidate,
        ),
      )
      setDirty(true)
    },
    [nodes, isFrozen],
  )

  const addNode = useCallback(() => {
    if (isFrozen) return
    setNodes((current) => {
      const node = newCodeNode(current)
      setSelectedId(node.id)
      return [...current, node]
    })
    setDirty(true)
  }, [isFrozen])

  const deleteNode = useCallback(
    (id: string) => {
      if (isFrozen) return
      setNodes((current) => current.filter((node) => node.id !== id))
      setEdges((current) =>
        current.filter((edge) => edge.source !== id && edge.target !== id),
      )
      setSelectedId(null)
      setDirty(true)
    },
    [isFrozen],
  )

  const updateEdgeMapping = useCallback(
    (edgeId: string, mapping: Record<string, string>) => {
      if (isFrozen) return
      setEdges((current) =>
        current.map((edge) =>
          edge.id === edgeId
            ? { ...edge, data: { ...edge.data, mapping } }
            : edge,
        ),
      )
      // The last save's complaint about this edge may no longer apply.
      setEdgeErrors((current) => {
        if (!(edgeId in current)) return current
        const next = { ...current }
        delete next[edgeId]
        return next
      })
      setDirty(true)
    },
    [isFrozen],
  )

  const deleteEdge = useCallback(
    (id: string) => {
      if (isFrozen) return
      setEdges((current) => current.filter((edge) => edge.id !== id))
      setSelectedEdgeId(null)
      setDirty(true)
    },
    [isFrozen],
  )

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
      setNodeErrors({})
      setDirty(false)
      queryClient.invalidateQueries({ queryKey: ["workflow", workflowId] })
      queryClient.invalidateQueries({ queryKey: ["workflows"] })
      showToast("Saved", `Workflow is at version ${graph.version}.`, "success")
    },
    onError: (error) => {
      const problem = parseSaveError(error)
      setEdgeErrors(problem.edges)
      setNodeErrors(problem.nodes)
      const detail =
        Object.values(problem.edges)[0] ?? Object.values(problem.nodes)[0]
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
              if (!isFrozen && data && name.trim() && name !== data.name)
                rename.mutate(name.trim())
            }}
            disabled={isFrozen}
            className="min-w-0 rounded border border-transparent bg-transparent px-2 py-1 text-lg font-semibold text-gray-900 hover:border-gray-300 focus:border-blue-500 focus:outline-none disabled:cursor-default dark:text-white dark:hover:border-gray-600"
          />
          {dirty && !isFrozen && (
            <span className="text-xs text-amber-600 dark:text-amber-400">
              unsaved changes
            </span>
          )}
        </div>

        <div className="flex items-center space-x-2">
          {isFrozen ? (
            <span
              data-testid="read-only-badge"
              className="rounded bg-gray-100 px-2 py-1 text-xs font-medium uppercase text-gray-600 dark:bg-gray-700 dark:text-gray-300"
            >
              Read-only snapshot
            </span>
          ) : (
            <>
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
                data-testid="publish-workflow"
                onClick={() => setIsPublishOpen(true)}
                className="flex items-center space-x-1 rounded border border-purple-300 px-3 py-1.5 text-sm text-purple-700 hover:bg-purple-50 dark:border-purple-700 dark:text-purple-300 dark:hover:bg-purple-900/20"
              >
                <FiUpload className="h-4 w-4" />
                <span>Publish</span>
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
            </>
          )}
        </div>
      </header>

      {isFrozen && (
        <div
          data-testid="read-only-banner"
          className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200"
        >
          Published snapshot, shared read-only with your organization. Open the
          source workflow to make changes and publish a new version.
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          <WorkflowCanvas
            nodes={decoratedNodes}
            edges={decoratedEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onSelectNode={(id) => {
              setSelectedId(id)
              setSelectedEdgeId(null)
            }}
            onSelectEdge={(id) => {
              setSelectedEdgeId(id)
              setSelectedId(null)
            }}
            readOnly={isFrozen}
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
              resizing
                ? "bg-white"
                : "bg-gray-400 group-hover:bg-white dark:bg-gray-500"
            }`}
          />
        </div>

        <aside
          style={{ width: inspectorWidth }}
          className="flex-shrink-0 overflow-hidden border-l border-gray-200 bg-white dark:border-gray-700 dark:bg-[#2f2f2f]"
          data-testid="node-inspector"
        >
          {selectedEdge && selectedEdgeSource && selectedEdgeTarget ? (
            <EdgeInspector
              source={selectedEdgeSource}
              target={selectedEdgeTarget}
              mapping={edgeMapping(selectedEdge)}
              issue={selectedEdgeIssue}
              onChange={(mapping) =>
                updateEdgeMapping(selectedEdge.id, mapping)
              }
              onDelete={() => deleteEdge(selectedEdge.id)}
              readOnly={isFrozen}
            />
          ) : selectedNode ? (
            <NodeInspector
              node={selectedNode}
              onChange={(patch) => patchNode(selectedNode.id, patch)}
              onDelete={() => deleteNode(selectedNode.id)}
              readOnly={isFrozen}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center space-y-2 px-6 text-center">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Select a node to edit its code and contracts.
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Drag from a node&apos;s right edge to another node&apos;s left
                edge to connect them, then click the connection to map which
                output field feeds which input field.
              </p>
            </div>
          )}
        </aside>
      </div>

      {isPublishOpen && !isFrozen && (
        <PublishDialog
          workflowId={workflowId}
          defaultName={name}
          defaultDescription={data?.description ?? ""}
          nodes={nodes}
          edges={edges}
          onClose={() => setIsPublishOpen(false)}
          onPublished={() => {
            setIsPublishOpen(false)
            // Publishing saved the canvas, so there is nothing unsaved left.
            setDirty(false)
            queryClient.invalidateQueries({ queryKey: ["components"] })
            queryClient.invalidateQueries({ queryKey: ["workflow", workflowId] })
            queryClient.invalidateQueries({ queryKey: ["workflows"] })
          }}
        />
      )}
    </div>
  )
}

export default WorkflowEditor
