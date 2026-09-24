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
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onNodeClick={(_, node) => onSelectNode(node.id)}
      onPaneClick={() => onSelectNode(null)}
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
