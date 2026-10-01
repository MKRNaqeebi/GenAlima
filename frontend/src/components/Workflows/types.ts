import type { Edge, Node } from "@xyflow/react"
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
  /**
   * Live or last-save coverage fault for this node. Derived for rendering only:
   * it is not part of the save payload.
   */
  error?: string | null
  /**
   * Whether this node is the entry or exit of the graph being published.
   * Derived for rendering only: it is not part of the save payload.
   */
  boundary?: "in" | "out" | null
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
    position: {
      x: 80 + (index % 4) * 260,
      y: 80 + Math.floor(index / 4) * 200,
    },
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
    data: { mapping: edge.mapping ?? {} },
  }
}

/** The `{target_field: source_field}` mapping an edge carries, never null. */
export function edgeMapping(edge: Edge): Record<string, string> {
  const mapping = (
    edge.data as { mapping?: Record<string, string> } | undefined
  )?.mapping
  return mapping ?? {}
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
      mapping: edgeMapping(edge),
    })),
  }
}

/**
 * Client mirror of the server's strict edge rules (plan §6.4).
 *
 * Kept in sync deliberately: the server is the authority and still rejects a bad
 * save, but authors should not have to press Save to learn an edge is wrong.
 * Faults are split the way the server reports them: `edgeMappingIssue` blames
 * one edge, `nodeCoverageIssue` blames a target's coverage as a whole.
 */

/** Whether a target opted out of type checking or is disabled (pass-through). */
function skipsContractChecks(node: CodeNodeData): boolean {
  return node.disabled || node.typeEnforcement === "off"
}

/**
 * Mirror of `WorkflowFieldSpec._resolve_required`: an unset `required` resolves
 * against the default, so a field just added in the editor (no `required` yet)
 * counts as required and its missing mapping is flagged before the first save.
 */
export function isRequired(spec: WorkflowFieldSpec): boolean {
  if (spec.required === undefined || spec.required === null) {
    return spec.default == null
  }
  return spec.required
}

/** Compatibility of one resolved source-field -> target-field pair. */
export function fieldIssue(
  field: string,
  source: WorkflowFieldSpec,
  target: WorkflowFieldSpec,
): string | null {
  const from = source.type ?? "Any"
  const to = target.type ?? "Any"

  if (to !== "Any") {
    if (from === "Any") {
      return `field '${field}': source type is 'Any' (undeclared) and cannot be proven to satisfy '${to}'`
    }
    if (from !== to && !(from === "int" && to === "float")) {
      return `field '${field}': source declares '${from}', target expects '${to}'`
    }
  }

  if (to === "list" && target.items && source.items !== target.items) {
    return `field '${field}': source list items are ${
      source.items ?? "unset"
    } but target expects '${target.items}'`
  }

  if (isRequired(target) && !isRequired(source)) {
    return `field '${field}' is required by the target but optional in the source`
  }
  return null
}

/** Faults of one edge's own mapping: dangling references and bad pairs. */
export function edgeMappingIssue(
  source: CodeNodeData,
  target: CodeNodeData,
  mapping: Record<string, string>,
): string | null {
  if (skipsContractChecks(target)) return null

  const problems: string[] = []
  for (const [targetField, sourceField] of Object.entries(mapping)) {
    const targetSpec = target.input[targetField]
    if (!targetSpec) {
      problems.push(
        `mapping names input field '${targetField}', which the target does not declare`,
      )
      continue
    }
    const sourceSpec = source.output[sourceField]
    if (!sourceSpec) {
      problems.push(
        `maps input '${targetField}' from '${sourceField}', which the source does not declare`,
      )
      continue
    }
    const issue = fieldIssue(targetField, sourceSpec, targetSpec)
    if (issue) problems.push(issue)
  }
  return problems.length > 0 ? problems.join("; ") : null
}

/** One inbound edge's contribution to a target's coverage. */
export interface InboundContribution {
  edgeId: string
  mapping: Record<string, string>
  source: CodeNodeData
}

/**
 * Faults of a target's coverage across every inbound edge: a required input no
 * edge maps, or an input two edges both map.
 */
export function nodeCoverageIssue(
  target: CodeNodeData,
  inbound: InboundContribution[],
): string | null {
  if (skipsContractChecks(target)) return null
  if (Object.keys(target.input).length === 0) return null

  const providers = new Map<string, string[]>()
  for (const { edgeId, mapping, source } of inbound) {
    for (const [targetField, sourceField] of Object.entries(mapping)) {
      if (!target.input[targetField]) continue
      if (!source.output[sourceField]) continue
      providers.set(targetField, [
        ...(providers.get(targetField) ?? []),
        edgeId,
      ])
    }
  }

  const problems: string[] = []
  for (const [field, spec] of Object.entries(target.input)) {
    const owners = providers.get(field) ?? []
    if (owners.length > 1) {
      problems.push(
        `input field '${field}' is provided by more than one incoming edge`,
      )
    } else if (owners.length === 0 && isRequired(spec)) {
      problems.push(
        `required input field '${field}' is not mapped from any upstream node`,
      )
    }
  }
  return problems.length > 0 ? problems.join("; ") : null
}

/** Map every target input field from a same-named source output field. */
export function autoMapFields(
  source: CodeNodeData,
  target: CodeNodeData,
): Record<string, string> {
  const mapping: Record<string, string> = {}
  for (const field of Object.keys(target.input)) {
    if (field in source.output) mapping[field] = field
  }
  return mapping
}

/** A contract key rename or removal, for keeping edge mappings in step. */
export interface ContractChange {
  renamed: Map<string, string>
  removed: string[]
}

/**
 * Detect field renames and removals between two versions of a contract.
 *
 * The editor commits one rename at a time, which shows up as one removed and
 * one added key; pairing them by position when the counts match recovers it.
 * An ambiguous change (unequal counts) is treated as removals only, so a stale
 * mapping surfaces as a visible dangling reference instead of a silent rewire.
 */
export function diffContract(
  before: FieldContract,
  after: FieldContract,
): ContractChange {
  const beforeKeys = Object.keys(before)
  const afterKeys = Object.keys(after)
  const removed = beforeKeys.filter((key) => !(key in after))
  const added = afterKeys.filter((key) => !(key in before))
  const renamed = new Map<string, string>()
  if (removed.length === added.length) {
    removed.forEach((from, index) => renamed.set(from, added[index]))
  }
  return { renamed, removed: removed.filter((key) => !renamed.has(key)) }
}

/**
 * Rewrite an edge's mapping after a field rename or removal on one endpoint.
 *
 * A renamed key is followed; a removed key drops its mapping entry rather than
 * leaving a dangling reference for the save to reject.
 */
export function remapEdgeAfterContractChange(
  edge: Edge,
  nodeId: string,
  change: ContractChange,
): Edge {
  const mapping = edgeMapping(edge)
  const next: Record<string, string> = {}
  let touched = false

  for (const [targetField, sourceField] of Object.entries(mapping)) {
    if (edge.target === nodeId) {
      const renamed = change.renamed.get(targetField)
      if (renamed !== undefined) {
        next[renamed] = sourceField
        touched = true
        continue
      }
      if (change.removed.includes(targetField)) {
        touched = true
        continue
      }
    }
    if (edge.source === nodeId) {
      const renamed = change.renamed.get(sourceField)
      if (renamed !== undefined) {
        next[targetField] = renamed
        touched = true
        continue
      }
      if (change.removed.includes(sourceField)) {
        touched = true
        continue
      }
    }
    next[targetField] = sourceField
  }

  if (!touched) return edge
  return { ...edge, data: { ...edge.data, mapping: next } }
}

/* ----------------------------------------------------------------- publish */

/**
 * Client mirror of the server's publish boundary rule.
 *
 * A component has no dedicated start/end node type: the entry is the single node
 * nothing flows into and the exit is the single node nothing flows out of. The
 * server is still the authority, but checking here means the author sees a
 * second entry node while wiring rather than after pressing Publish.
 */
export interface GraphBoundaries {
  entryId: string
  exitId: string
}

/** Ids of every node with no inbound (entry) or no outbound (exit) edge. */
export function boundaryCandidates(
  nodes: CodeNode[],
  edges: Edge[],
): { entries: string[]; exits: string[] } {
  const indegree = new Map<string, number>(nodes.map((node) => [node.id, 0]))
  const outdegree = new Map<string, number>(nodes.map((node) => [node.id, 0]))

  for (const edge of edges) {
    if (outdegree.has(edge.source)) {
      outdegree.set(edge.source, (outdegree.get(edge.source) ?? 0) + 1)
    }
    if (indegree.has(edge.target)) {
      indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1)
    }
  }

  return {
    entries: nodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id),
    exits: nodes.filter((node) => outdegree.get(node.id) === 0).map((node) => node.id),
  }
}

/** The single entry and exit, or null when the graph does not have exactly one. */
export function publishShape(nodes: CodeNode[], edges: Edge[]): GraphBoundaries | null {
  if (nodes.length === 0) return null
  const { entries, exits } = boundaryCandidates(nodes, edges)
  if (entries.length !== 1 || exits.length !== 1) return null
  return { entryId: entries[0], exitId: exits[0] }
}

export interface PublishIssue {
  message: string
  nodeIds: string[]
}

/**
 * Why this graph cannot be published yet, or null when it can.
 *
 * Mirrors the server's `publish_shape` messages so the dialog and the API agree;
 * `nodeIds` lets the canvas point at the offending nodes.
 */
export function publishIssue(nodes: CodeNode[], edges: Edge[]): PublishIssue | null {
  if (nodes.length === 0) {
    return { message: "Add at least one node before publishing.", nodeIds: [] }
  }
  const { entries, exits } = boundaryCandidates(nodes, edges)
  if (entries.length !== 1) {
    return {
      message: `A component needs exactly one entry node (nothing flows into it); this graph has ${entries.length}.`,
      nodeIds: entries,
    }
  }
  if (exits.length !== 1) {
    return {
      message: `A component needs exactly one exit node (nothing flows out of it); this graph has ${exits.length}.`,
      nodeIds: exits,
    }
  }
  return null
}

/** Names of the boundary nodes, for the publish form's read-only preview. */
export function boundaryNodeNames(
  nodes: CodeNode[],
  shape: GraphBoundaries | null,
): { entry: string; exit: string } {
  if (!shape) return { entry: "—", exit: "—" }
  const byId = new Map(nodes.map((node) => [node.id, node.data.name]))
  return {
    entry: byId.get(shape.entryId) ?? "—",
    exit: byId.get(shape.exitId) ?? "—",
  }
}
