import {
  Background,
  type Connection,
  Controls,
  type Edge,
  type EdgeChange,
  MiniMap,
  type NodeChange,
  ReactFlow,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { useMemo } from "react"
import "./WorkflowCanvas.css"

import CodeNodeComponent from "./CodeNodeComponent"
import type { CodeNode } from "./types"

interface WorkflowCanvasProps {
  nodes: CodeNode[]
  edges: Edge[]
  onNodesChange: (changes: NodeChange<CodeNode>[]) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  onConnect: (connection: Connection) => void
  onSelectNode: (nodeId: string | null) => void
  onSelectEdge: (edgeId: string) => void
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
  readOnly = false,
}: WorkflowCanvasProps) => {
  // Defined once so React Flow does not remount every node on each render.
  const nodeTypes = useMemo(() => ({ code: CodeNodeComponent }), [])

  return (
    <ReactFlow<CodeNode>
      className="workflow-canvas"
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onNodeClick={(_, node) => onSelectNode(node.id)}
      onEdgeClick={(_, edge) => onSelectEdge(edge.id)}
      onPaneClick={() => onSelectNode(null)}
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
      <MiniMap pannable zoomable />
    </ReactFlow>
  )
}

export default WorkflowCanvas
