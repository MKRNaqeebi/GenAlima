import {
  Background,
  type Connection,
  Controls,
  type Edge,
  type EdgeChange,
  MiniMap,
  type NodeChange,
  ReactFlow,
  type ReactFlowInstance,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { type DragEvent, useMemo, useRef } from "react"
import "./WorkflowCanvas.css"

import { useTheme } from "../../contexts/ThemeContext"
import CodeNodeComponent from "./CodeNodeComponent"
import type { CodeNode } from "./types"

/** Drag payload type for a component dragged out of the palette. */
export const COMPONENT_DRAG_TYPE = "application/x-genalima-component"

interface WorkflowCanvasProps {
  nodes: CodeNode[]
  edges: Edge[]
  onNodesChange: (changes: NodeChange<CodeNode>[]) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  onConnect: (connection: Connection) => void
  onSelectNode: (nodeId: string | null) => void
  onSelectEdge: (edgeId: string) => void
  /** Hands the editor the instance so it can focus nodes and place drops. */
  onInit?: (instance: ReactFlowInstance<CodeNode>) => void
  /** A palette component dropped at a flow-space position. */
  onDropComponent?: (
    componentId: string,
    position: { x: number; y: number },
  ) => void
  /** A published snapshot: still selectable for inspection, never editable. */
  readOnly?: boolean
}

const WorkflowCanvas = ({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onSelectNode,
  onSelectEdge,
  onInit,
  onDropComponent,
  readOnly = false,
}: WorkflowCanvasProps) => {
  // Defined once so React Flow does not remount every node on each render.
  const nodeTypes = useMemo(() => ({ code: CodeNodeComponent }), [])
  const instance = useRef<ReactFlowInstance<CodeNode> | null>(null)
  const { isDark } = useTheme()

  const onDragOver = (event: DragEvent) => {
    if (readOnly || !event.dataTransfer.types.includes(COMPONENT_DRAG_TYPE))
      return
    event.preventDefault()
    event.dataTransfer.dropEffect = "copy"
  }

  const onDrop = (event: DragEvent) => {
    const componentId = event.dataTransfer.getData(COMPONENT_DRAG_TYPE)
    if (readOnly || !componentId || !instance.current || !onDropComponent)
      return
    event.preventDefault()
    onDropComponent(
      componentId,
      instance.current.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      }),
    )
  }

  return (
    <ReactFlow<CodeNode>
      className="workflow-canvas"
      // Themes the background, controls and minimap with the app.
      colorMode={isDark ? "dark" : "light"}
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onNodeClick={(_, node) => onSelectNode(node.id)}
      onEdgeClick={(_, edge) => onSelectEdge(edge.id)}
      onPaneClick={() => onSelectNode(null)}
      onInit={(flow) => {
        instance.current = flow
        onInit?.(flow)
      }}
      onDragOver={onDragOver}
      onDrop={onDrop}
      // Snapping: a drop within this many pixels of a handle still connects.
      connectionRadius={32}
      deleteKeyCode={readOnly ? null : ["Backspace", "Delete"]}
      nodesDraggable={!readOnly}
      nodesConnectable={!readOnly}
      edgesReconnectable={!readOnly}
      fitView
      proOptions={{ hideAttribution: true }}
    >
      <Background />
      <Controls />
      {/* Kept small: the canvas sits between the palette and the inspector. */}
      <MiniMap pannable zoomable style={{ width: 140, height: 90 }} />
    </ReactFlow>
  )
}

export default WorkflowCanvas
