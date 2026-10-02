import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import {
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
  type ReactFlowInstance,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
} from "@xyflow/react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  FiAlertTriangle,
  FiArrowLeft,
  FiCheckCircle,
  FiPlay,
  FiPlus,
  FiSave,
  FiUpload,
} from "react-icons/fi"
import { v4 as uuidv4 } from "uuid"

import { ApiError } from "../../client"
import useCustomToast from "../../hooks/useCustomToast"
import EdgeInspector from "./EdgeInspector"
import NodeInspector from "./NodeInspector"
import NodePalette from "./NodePalette"
import PublishDialog from "./PublishDialog"
import RunPanel from "./RunPanel"
import WorkflowCanvas from "./WorkflowCanvas"
import {
  ComponentsService,
  type WorkflowComponentPublic,
  type WorkflowItem,
  type WorkflowRunNodePublic,
  type WorkflowRunPublic,
  WorkflowsService,
} from "./api"
import {
  type CodeNode,
  type CodeNodeData,
  type InboundContribution,
  autoMapFields,
  boundaryCandidates,
  diffContract,
  edgeMapping,
  edgeMappingIssue,
  executionOrder,
  insertComponentGraph,
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
const DEFAULT_TRIGGER = JSON.stringify([{ json: {} }], null, 2)

/** One problem the issues button can jump to. */
interface GraphIssue {
  kind: "node" | "edge"
  id: string
  reason: string
}

/** Parse the trigger textarea; the error is shown under it. */
function parseTrigger(text: string): {
  items: WorkflowItem[] | null
  error: string | null
} {
  try {
    const value = JSON.parse(text)
    if (!Array.isArray(value))
      return { items: null, error: "Must be a JSON list of items." }
    const bad = value.findIndex(
      (item) =>
        typeof item !== "object" ||
        item === null ||
        typeof item.json !== "object",
    )
    if (bad >= 0)
      return { items: null, error: `Item ${bad} needs a "json" object.` }
    return { items: value as WorkflowItem[], error: null }
  } catch (error) {
    return { items: null, error: (error as Error).message }
  }
}

function readStoredBoolean(key: string, fallback: boolean): boolean {
  try {
    const stored = localStorage.getItem(key)
    return stored === null ? fallback : stored === "true"
  } catch {
    return fallback
  }
}

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
  const [runPanelOpen, setRunPanelOpen] = useState(() =>
    readStoredBoolean("workflow-run-panel-open", true),
  )
  const [currentRun, setCurrentRun] = useState<WorkflowRunPublic | null>(null)
  const [triggerText, setTriggerText] = useState(DEFAULT_TRIGGER)
  const [testResults, setTestResults] = useState<
    Record<string, WorkflowRunNodePublic>
  >({})
  const [issueCursor, setIssueCursor] = useState(-1)
  const [highlightedId, setHighlightedId] = useState<string | null>(null)
  const [isInserting, setIsInserting] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(() =>
    readStoredBoolean("workflow-palette-open", true),
  )
  const flow = useRef<ReactFlowInstance<CodeNode> | null>(null)
  const paletteSearch = useRef<HTMLInputElement>(null)
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

  useEffect(() => {
    try {
      localStorage.setItem("workflow-run-panel-open", String(runPanelOpen))
      localStorage.setItem("workflow-palette-open", String(paletteOpen))
    } catch {
      // Storage unavailable; the panel just reopens in its default state.
    }
  }, [runPanelOpen, paletteOpen])

  const { data, isPending, isError } = useQuery({
    queryKey: ["workflow", workflowId],
    queryFn: () => WorkflowsService.readWorkflow({ id: workflowId }),
  })

  const { data: runHistory } = useQuery({
    queryKey: ["workflow-runs", workflowId],
    queryFn: () => WorkflowsService.readRuns({ id: workflowId, limit: 20 }),
  })

  // Show the most recent full run on open, so the canvas reflects what last
  // happened. Node tests only cover one node, so they are not a useful default.
  const latestRunId = runHistory?.data.find((run) => run.mode === "manual")?.id
  const loadedLatest = useRef(false)
  useEffect(() => {
    if (loadedLatest.current || !latestRunId) return
    loadedLatest.current = true
    WorkflowsService.readRun({ id: workflowId, runId: latestRunId })
      .then((run) => {
        setCurrentRun((current) => current ?? run)
        setTriggerText(JSON.stringify(run.trigger_items, null, 2))
      })
      .catch(() => {
        // History is a convenience; the editor works without it.
      })
  }, [latestRunId, workflowId])

  const trigger = useMemo(() => parseTrigger(triggerText), [triggerText])

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

  // Node statuses from the full run on screen; node tests stay in the inspector.
  const runStatusByNode = useMemo(() => {
    const statuses = new Map<string, WorkflowRunNodePublic["status"]>()
    if (currentRun?.mode === "manual") {
      for (const result of currentRun.nodes)
        statuses.set(result.node_id, result.status)
    }
    return statuses
  }, [currentRun])

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
        const runStatus = runStatusByNode.get(node.id) ?? null
        const highlighted = node.id === highlightedId
        if (!reason && !boundary && !runStatus && !highlighted) return node
        return {
          ...node,
          data: {
            ...node.data,
            error: reason,
            boundary,
            runStatus,
            highlighted,
          },
        }
      }),
    [nodes, coverageByNode, boundaryIds, runStatusByNode, highlightedId],
  )

  // Per-edge faults: a dangling mapping reference or an incompatible pair.
  const edgeIssues = useMemo(() => {
    const byId = new Map(nodes.map((node) => [node.id, node]))
    const reasons = new Map<string, string>()
    for (const edge of edges) {
      const source = byId.get(edge.source)
      const target = byId.get(edge.target)
      const live =
        source && target
          ? edgeMappingIssue(source.data, target.data, edgeMapping(edge))
          : null
      const reason = edgeErrors[edge.id] ?? live
      if (reason) reasons.set(edge.id, reason)
    }
    return reasons
  }, [nodes, edges, edgeErrors])

  const decoratedEdges = useMemo(
    () =>
      edges.map((edge) => {
        const reason = edgeIssues.get(edge.id)
        if (!reason) return edge
        // Full reason on hover; a short label keeps the canvas readable.
        return {
          ...edge,
          style: { stroke: "#ef4444", strokeWidth: 2 },
          label: reason.length > 48 ? `${reason.slice(0, 45)}…` : reason,
          labelStyle: { fill: "#ef4444", fontSize: 10 },
          labelBgStyle: { fill: "transparent" },
          ariaLabel: reason,
        }
      }),
    [edges, edgeIssues],
  )

  // Everything wrong with the graph, in canvas order, for the issues button.
  const issues = useMemo<GraphIssue[]>(() => {
    const list: GraphIssue[] = []
    for (const node of executionOrder(nodes, edges)) {
      const reason = coverageByNode.get(node.id)
      if (reason) list.push({ kind: "node", id: node.id, reason })
      for (const edge of edges) {
        const edgeReason =
          edge.target === node.id ? edgeIssues.get(edge.id) : undefined
        if (edgeReason)
          list.push({ kind: "edge", id: edge.id, reason: edgeReason })
      }
    }
    return list
  }, [nodes, edges, coverageByNode, edgeIssues])

  const focusIssue = useCallback(
    (index: number) => {
      const issue = issues[index]
      if (!issue) return
      setIssueCursor(index)
      const byId = new Map(nodes.map((node) => [node.id, node]))
      let center: { x: number; y: number } | null = null
      if (issue.kind === "node") {
        setSelectedId(issue.id)
        setSelectedEdgeId(null)
        setHighlightedId(issue.id)
        const node = byId.get(issue.id)
        if (node) center = { x: node.position.x + 128, y: node.position.y + 70 }
      } else {
        setSelectedEdgeId(issue.id)
        setSelectedId(null)
        const edge = edges.find((candidate) => candidate.id === issue.id)
        const source = edge && byId.get(edge.source)
        const target = edge && byId.get(edge.target)
        setHighlightedId(target?.id ?? null)
        if (source && target) {
          center = {
            x: (source.position.x + target.position.x) / 2 + 128,
            y: (source.position.y + target.position.y) / 2 + 70,
          }
        }
      }
      if (center)
        flow.current?.setCenter(center.x, center.y, { zoom: 1, duration: 300 })
    },
    [issues, nodes, edges],
  )

  // The highlight ring is a pointer, not a state: let it fade.
  useEffect(() => {
    if (!highlightedId) return
    const timer = window.setTimeout(() => setHighlightedId(null), 1600)
    return () => window.clearTimeout(timer)
  }, [highlightedId])

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

  const onNodesChange = useCallback(
    (changes: NodeChange<CodeNode>[]) => {
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
    },
    [isFrozen],
  )

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
    // The canvas is narrow between the palette and inspector; keep the new
    // node in view. React Flow queues this until the node has been measured.
    flow.current?.fitView({ padding: 0.2, maxZoom: 1 })
  }, [isFrozen])

  const insertComponent = useCallback(
    async (
      component: WorkflowComponentPublic,
      position?: { x: number; y: number },
    ) => {
      if (isFrozen) return
      setIsInserting(true)
      try {
        const snapshot = await WorkflowsService.readWorkflow({
          id: component.snapshot_workflow_id,
        })
        const snapshotNodes = snapshot.nodes ?? []
        if (snapshotNodes.length === 0) {
          showToast(
            "Nothing to insert",
            `${component.name} has no nodes.`,
            "error",
          )
          return
        }
        const origin = position ??
          flow.current?.screenToFlowPosition({
            x: window.innerWidth / 2,
            y: window.innerHeight / 2,
          }) ?? { x: 80, y: 80 }
        const inserted = insertComponentGraph(
          nodes,
          snapshotNodes,
          snapshot.edges ?? [],
          origin,
          component.name,
        )
        setNodes((current) => [...current, ...inserted.nodes])
        setEdges((current) => [...current, ...inserted.edges])
        setSelectedId(inserted.nodes[0].id)
        setSelectedEdgeId(null)
        setDirty(true)
        showToast(
          "Component inserted",
          `${component.name} v${component.version} added as ${
            inserted.nodes.length
          } node${inserted.nodes.length === 1 ? "" : "s"}.`,
          "success",
        )
      } catch {
        showToast(
          "Could not insert",
          `${component.name} could not be loaded.`,
          "error",
        )
      } finally {
        setIsInserting(false)
      }
    },
    [isFrozen, nodes, showToast],
  )

  const insertComponentById = useCallback(
    async (componentId: string, position: { x: number; y: number }) => {
      try {
        const component = await ComponentsService.readComponent({
          id: componentId,
        })
        await insertComponent(component, position)
      } catch {
        showToast(
          "Could not insert",
          "That component is no longer available.",
          "error",
        )
      }
    },
    [insertComponent, showToast],
  )

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

  /** Save pending edits first: runs execute the saved graph. */
  const ensureSaved = useCallback(async () => {
    if (dirty && !isFrozen) await saveGraph.mutateAsync()
  }, [dirty, isFrozen, saveGraph])

  const runWorkflow = useMutation({
    mutationFn: async () => {
      await ensureSaved()
      return WorkflowsService.runWorkflow({
        id: workflowId,
        items: trigger.items ?? [{ json: {} }],
      })
    },
    onMutate: () => setRunPanelOpen(true),
    onSuccess: (run) => {
      setCurrentRun(run)
      queryClient.invalidateQueries({ queryKey: ["workflow-runs", workflowId] })
      queryClient.invalidateQueries({ queryKey: ["workflows"] })
      const failed = run.nodes.find((result) => result.status === "error")
      if (failed) setSelectedId(failed.node_id)
    },
    onError: (error) => {
      // A failed save already toasted its own reason.
      if (saveGraph.isError) return
      const detail =
        error instanceof ApiError
          ? ((error.body as { detail?: unknown })?.detail as
              | { message?: string }
              | string)
          : null
      const message =
        typeof detail === "string"
          ? detail
          : detail?.message ?? "The run could not start."
      showToast("Run failed", message, "error")
    },
  })

  const testNode = useMutation({
    mutationFn: async ({
      nodeId,
      items,
    }: { nodeId: string; items: WorkflowItem[] }) => {
      await ensureSaved()
      return WorkflowsService.runNode({ id: workflowId, nodeId, items })
    },
    onSuccess: (run, { nodeId }) => {
      const result = run.nodes[0]
      if (result)
        setTestResults((current) => ({ ...current, [nodeId]: result }))
      queryClient.invalidateQueries({ queryKey: ["workflow-runs", workflowId] })
    },
    onError: () => {
      if (!saveGraph.isError)
        showToast("Test failed", "The node could not be run.", "error")
    },
  })

  const selectRun = useCallback(
    (runId: string) => {
      WorkflowsService.readRun({ id: workflowId, runId })
        .then((run) => {
          setCurrentRun(run)
          setTriggerText(JSON.stringify(run.trigger_items, null, 2))
        })
        .catch(() => showToast("Could not load run", "Try again.", "error"))
    },
    [workflowId, showToast],
  )

  const orderedNodes = useMemo(
    () => executionOrder(nodes, edges),
    [nodes, edges],
  )

  const lastInputForSelected = useMemo(() => {
    if (!selectedId || !currentRun) return null
    return (
      currentRun.nodes.find((result) => result.node_id === selectedId)
        ?.input_items ?? null
    )
  }, [currentRun, selectedId])

  // Keyboard shortcuts: ⌘S save, ⌘↵ run, ⌘K search components.
  const shortcuts = useRef({
    save: () => {},
    run: () => {},
    search: () => {},
  })
  shortcuts.current = {
    save: () => {
      if (!isFrozen && dirty && !saveGraph.isPending) saveGraph.mutate()
    },
    run: () => {
      if (!runWorkflow.isPending && nodes.length > 0 && !trigger.error)
        runWorkflow.mutate()
    },
    search: () => {
      setPaletteOpen(true)
      // The input mounts with the open palette.
      window.requestAnimationFrame(() => paletteSearch.current?.focus())
    },
  }
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return
      const key = event.key.toLowerCase()
      if (key === "s") {
        event.preventDefault()
        shortcuts.current.save()
      } else if (key === "enter") {
        event.preventDefault()
        shortcuts.current.run()
      } else if (key === "k") {
        event.preventDefault()
        shortcuts.current.search()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

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
    <div className="flex h-screen w-full flex-col bg-gray-50 dark:bg-app-bg">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2 dark:border-app-border dark:bg-app-surface">
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
          <span className="flex-shrink-0 font-mono text-xs text-gray-400">
            v{data?.version ?? 1}
          </span>
          {dirty && !isFrozen && (
            <span className="flex flex-shrink-0 items-center space-x-1 text-xs text-amber-600 dark:text-amber-400">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              <span>unsaved changes</span>
            </span>
          )}
        </div>

        <div className="flex items-center space-x-2">
          {issues.length > 0 ? (
            <button
              type="button"
              data-testid="issues-button"
              onClick={() => focusIssue((issueCursor + 1) % issues.length)}
              title={
                issueCursor >= 0 && issues[issueCursor]
                  ? issues[issueCursor].reason
                  : "Jump to the next problem"
              }
              className="flex items-center space-x-1 rounded border border-red-200 px-2.5 py-1.5 text-sm text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40"
            >
              <FiAlertTriangle className="h-4 w-4" />
              <span>
                {issueCursor >= 0 && issueCursor < issues.length
                  ? `${issueCursor + 1}/${issues.length}`
                  : issues.length}{" "}
                {issues.length === 1 ? "issue" : "issues"}
              </span>
            </button>
          ) : (
            nodes.length > 0 && (
              <span
                className="flex items-center space-x-1 px-1 text-xs text-emerald-600 dark:text-emerald-400"
                title="Every connection satisfies its target's contract"
              >
                <FiCheckCircle className="h-3.5 w-3.5" />
                <span>Types OK</span>
              </span>
            )
          )}
          <button
            type="button"
            data-testid="run-workflow"
            onClick={() => runWorkflow.mutate()}
            disabled={
              runWorkflow.isPending ||
              nodes.length === 0 ||
              Boolean(trigger.error)
            }
            title="Run workflow (⌘↵)"
            className="flex items-center space-x-1 rounded border border-emerald-300 px-3 py-1.5 text-sm text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
          >
            <FiPlay className="h-4 w-4" />
            <span>{runWorkflow.isPending ? "Running…" : "Run"}</span>
          </button>
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
                title="Save (⌘S)"
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
        {!isFrozen && (
          <NodePalette
            open={paletteOpen}
            onToggle={() => setPaletteOpen((open) => !open)}
            onAddCodeNode={addNode}
            onInsertComponent={(component) => insertComponent(component)}
            searchRef={paletteSearch}
            busy={isInserting}
          />
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1">
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
              onInit={(instance) => {
                flow.current = instance
              }}
              onDropComponent={insertComponentById}
              readOnly={isFrozen}
            />
          </div>

          <RunPanel
            open={runPanelOpen}
            onToggle={() => setRunPanelOpen((open) => !open)}
            run={currentRun}
            history={runHistory?.data ?? []}
            onSelectRun={selectRun}
            orderedNodes={orderedNodes}
            selectedNodeId={selectedId}
            onSelectNode={(id) => {
              setSelectedId(id)
              setSelectedEdgeId(null)
              setHighlightedId(id)
            }}
            triggerText={triggerText}
            onTriggerTextChange={setTriggerText}
            triggerError={trigger.error}
            isRunning={runWorkflow.isPending}
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
          className="flex-shrink-0 overflow-hidden border-l border-gray-200 bg-white dark:border-app-border dark:bg-app-surface"
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
              onTest={(items) =>
                testNode.mutate({ nodeId: selectedNode.id, items })
              }
              isTesting={
                testNode.isPending &&
                testNode.variables?.nodeId === selectedNode.id
              }
              testResult={testResults[selectedNode.id] ?? null}
              lastInput={lastInputForSelected}
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
              <ul className="space-y-1 pt-2 text-left text-xs text-gray-400 dark:text-gray-500">
                <li>
                  <kbd className="rounded border px-1 dark:border-app-border">
                    ⌘S
                  </kbd>{" "}
                  save
                </li>
                <li>
                  <kbd className="rounded border px-1 dark:border-app-border">
                    ⌘↵
                  </kbd>{" "}
                  run
                </li>
                <li>
                  <kbd className="rounded border px-1 dark:border-app-border">
                    ⌘K
                  </kbd>{" "}
                  search components
                </li>
                <li>
                  <kbd className="rounded border px-1 dark:border-app-border">
                    Del
                  </kbd>{" "}
                  delete selection
                </li>
              </ul>
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
            queryClient.invalidateQueries({
              queryKey: ["workflow", workflowId],
            })
            queryClient.invalidateQueries({ queryKey: ["workflows"] })
          }}
        />
      )}
    </div>
  )
}

export default WorkflowEditor
