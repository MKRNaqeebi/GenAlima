import { useMemo } from "react"
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
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
}

const WorkflowCanvas = ({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onSelectNode,
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
      onPaneClick={() => onSelectNode(null)}
      // Snapping: a drop within this many pixels of a handle still connects.
      connectionRadius={32}
      deleteKeyCode={["Backspace", "Delete"]}
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
