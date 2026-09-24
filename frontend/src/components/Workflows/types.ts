import type {
  Edge,
  Node,
} from "@xyflow/react"
import { v4 as uuidv4 } from "uuid"

import type {
  WorkflowEdgePublic,
  WorkflowFieldSpec,
  WorkflowGraphIn,
  WorkflowNodePublic,
} from "./api"

/** The closed field-type vocabulary, mirroring ALLOWED_FIELD_TYPES on the server. */
export const FIELD_TYPES = [
  "str",
  "int",
  "float",
  "bool",
  "list",
  "dict",
  "datetime",
  "Any",
] as const

export type FieldType = (typeof FIELD_TYPES)[number]

/** A node's input or output contract: field name -> Pydantic-style spec. */
export type FieldContract = Record<string, WorkflowFieldSpec>

/** Everything the canvas and inspector need to know about one code node. */
export interface CodeNodeData extends Record<string, unknown> {
  key: string
  name: string
  code: string
  input: FieldContract
  output: FieldContract
  typeEnforcement: string
  language: string
  mode: string
  timeout: number
  onError: string
  disabled: boolean
}

export type CodeNode = Node<CodeNodeData, "code">

export const DEFAULT_CODE = `result = []
for item in items:
    result.append({"json": {**item["json"]}})
`

export const ENFORCEMENT_MODES = ["strict", "warn", "off"] as const
export const MODES = ["runOnceForAllItems", "runOnceForEachItem"] as const
export const ON_ERROR = [
  "stopWorkflow",
  "continueRegularOutput",
  "continueErrorOutput",
] as const

/** Pick a node key that is unique inside the workflow. */
export function nextNodeKey(nodes: CodeNode[]): string {
  let highest = 0
  for (const node of nodes) {
    const match = /^code_(\d+)$/.exec(node.data.key)
    if (match) highest = Math.max(highest, Number(match[1]))
  }
  return `code_${highest + 1}`
}

export function newCodeNode(nodes: CodeNode[]): CodeNode {
  const index = nodes.length
  return {
    id: uuidv4(),
    type: "code",
    position: { x: 80 + (index % 4) * 260, y: 80 + Math.floor(index / 4) * 200 },
    data: {
      key: nextNodeKey(nodes),
      name: `Code ${index + 1}`,
      code: DEFAULT_CODE,
      input: {},
      output: {},
      typeEnforcement: "strict",
      language: "python",
      mode: "runOnceForAllItems",
      timeout: 30,
      onError: "stopWorkflow",
      disabled: false,
    },
  }
}

/** Server node -> React Flow node. */
export function toCanvasNode(node: WorkflowNodePublic): CodeNode {
  const params = (node.parameters ?? {}) as Record<string, unknown>
  return {
    id: node.id,
    type: "code",
    position: { x: node.position_x ?? 0, y: node.position_y ?? 0 },
    data: {
      key: node.key,
      name: node.name,
      code: node.code ?? "",
      input: (node.input ?? {}) as FieldContract,
      output: (node.output ?? {}) as FieldContract,
      typeEnforcement: node.type_enforcement ?? "strict",
      language: (params.language as string) ?? "python",
      mode: (params.mode as string) ?? "runOnceForAllItems",
      timeout: (params.timeout as number) ?? 30,
      onError: (params.onError as string) ?? "stopWorkflow",
      disabled: node.disabled ?? false,
    },
  }
}

/** Server edge -> React Flow edge. */
export function toCanvasEdge(edge: WorkflowEdgePublic): Edge {
  return {
    id: edge.id,
    source: edge.source_node_id,
    target: edge.target_node_id,
    sourceHandle: edge.source_handle ?? "main",
    targetHandle: edge.target_handle ?? "main",
  }
}

/** Canvas state -> the transactional save payload. */
export function toSavePayload(
  nodes: CodeNode[],
  edges: Edge[],
): WorkflowGraphIn {
  return {
    nodes: nodes.map((node) => ({
      id: node.id,
      key: node.data.key,
      name: node.data.name,
      type: "code",
      type_version: 1,
      position_x: node.position.x,
      position_y: node.position.y,
      disabled: node.data.disabled,
      code: node.data.code,
      input: node.data.input,
      output: node.data.output,
      type_enforcement: node.data.typeEnforcement,
      parameters: {
        language: node.data.language,
        mode: node.data.mode,
        timeout: node.data.timeout,
        onError: node.data.onError,
      },
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      source_node_id: edge.source,
      target_node_id: edge.target,
      source_handle: edge.sourceHandle ?? "main",
      target_handle: edge.targetHandle ?? "main",
    })),
  }
}

/**
 * Client mirror of the server's edge compatibility rules (§6.4 of the plan).
 *
 * Kept in sync deliberately: the server is the authority and still rejects a bad
 * save, but authors should not have to press Save to learn an edge is wrong.
 */
export function edgeIssue(source: CodeNodeData, target: CodeNodeData): string | null {
  if (target.disabled || target.typeEnforcement === "off") return null

  const required = Object.entries(target.input).filter(([, spec]) => spec.required)
  if (Object.keys(target.input).length === 0) return null
  if (Object.keys(source.output).length === 0) {
    return required.length
      ? `source declares no output, but target requires: ${required
          .map(([name]) => name)
          .join(", ")}`
      : null
  }

  const problems: string[] = []
  for (const [name, spec] of Object.entries(target.input)) {
    const provided = source.output[name]
    if (!provided) {
      if (spec.required) {
        problems.push(`field '${name}' is required by the target but not provided`)
      }
      continue
    }
    const from = provided.type ?? "Any"
    const to = spec.type ?? "Any"
    if (to !== "Any" && from !== to && !(from === "int" && to === "float")) {
      problems.push(`field '${name}': source declares '${from}', target expects '${to}'`)
      continue
    }
    if (spec.required && provided.required === false && provided.default == null) {
      problems.push(`field '${name}' is optional in the source but required by the target`)
    }
  }
  return problems.length > 0 ? problems.join("; ") : null
}
