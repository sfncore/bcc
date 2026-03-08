import type { FormulaVariable, ProtoBead } from '@beads-ide/shared'
import dagre from '@dagrejs/dagre'
import {
  Background,
  BackgroundVariant,
  Controls,
  type Edge,
  Handle,
  MiniMap,
  type Node,
  type NodeProps,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from '@xyflow/react'
/**
 * Visual formula builder component.
 * DAG visualization of formula steps using React Flow.
 * Clicking on a step node opens the StepEditorPanel for editing.
 * Steps from expansion formulas are grouped in container nodes.
 *
 * Keyboard navigation:
 * - Arrow keys: Navigate DAG (Up=parent, Down=child, Left/Right=siblings)
 * - Enter: Open panel for selected step
 * - Escape: Deselect current step
 */
import { type CSSProperties, useCallback, useEffect, useMemo, useRef } from 'react'
import { useReducedMotion } from '../../hooks/use-reduced-motion'

import '@xyflow/react/dist/style.css'

// --- Types ---

interface StepNodeData extends Record<string, unknown> {
  id: string
  title: string
  description: string
  priority: number
  variables: string[]
  isSelected?: boolean
  isBottleneck: boolean // Blocks 2+ downstream steps
  isGate: boolean // Needs 2+ upstream steps
  needsCount: number
  blocksCount: number
  reducedMotion: boolean
}

interface GroupNodeData extends Record<string, unknown> {
  label: string
  stepCount: number
}

// --- Layout Utilities ---

const NODE_WIDTH = 220
const NODE_HEIGHT = 80
const GROUP_PADDING = 20
const GROUP_HEADER_HEIGHT = 36

/**
 * Compute hierarchical layout using dagre.
 */
function layoutNodes(nodes: Node<StepNodeData>[], edges: Edge[]): Node<StepNodeData>[] {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 80 })

  for (const node of nodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT })
  }

  for (const edge of edges) {
    g.setEdge(edge.source, edge.target)
  }

  dagre.layout(g)

  return nodes.map((node) => {
    const position = g.node(node.id)
    return {
      ...node,
      position: {
        x: position.x - NODE_WIDTH / 2,
        y: position.y - NODE_HEIGHT / 2,
      },
    }
  })
}

/**
 * Extract expansion group prefix from step ID.
 * e.g., "step-1-beads-creation.load-inputs" → "step-1-beads-creation"
 * Returns null if no prefix (no dot in ID).
 */
function getGroupPrefix(stepId: string): string | null {
  const dotIndex = stepId.indexOf('.')
  if (dotIndex === -1) return null
  return stepId.substring(0, dotIndex)
}

/**
 * Format group label from prefix.
 * e.g., "step-1-beads-creation" → "Step 1: Beads Creation"
 */
function formatGroupLabel(prefix: string): string {
  // Match pattern like "step-1-beads-creation" or "step-2-beads-review"
  const match = prefix.match(/^step-(\d+)-(.+)$/)
  if (match) {
    const stepNum = match[1]
    const name = match[2]
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
    return `Step ${stepNum}: ${name}`
  }
  // Fallback: just capitalize
  return prefix
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

// --- Group colors and border styles for visual distinction ---
// Border styles cycle for color-blind accessibility
const GROUP_COLORS = [
  { bg: 'rgba(99, 102, 241, 0.08)', border: '#6366f1', borderStyle: 'dashed' }, // Indigo
  { bg: 'rgba(16, 185, 129, 0.08)', border: '#10b981', borderStyle: 'solid' }, // Emerald
  { bg: 'rgba(245, 158, 11, 0.08)', border: '#f59e0b', borderStyle: 'dotted' }, // Amber
  { bg: 'rgba(239, 68, 68, 0.08)', border: '#ef4444', borderStyle: 'double' }, // Red
  { bg: 'rgba(168, 85, 247, 0.08)', border: '#a855f7', borderStyle: 'solid' }, // Purple (thicker)
  { bg: 'rgba(14, 165, 233, 0.08)', border: '#0ea5e9', borderStyle: 'dashed' }, // Sky
] as const

// --- Styles ---

const nodeContainerStyle = (
  isSelected: boolean,
  isBottleneck: boolean,
  isGate: boolean,
  reducedMotion = false
): CSSProperties => ({
  backgroundColor: isSelected
    ? 'rgba(59, 130, 246, 0.15)'
    : isBottleneck
      ? 'rgba(239, 68, 68, 0.1)'
      : isGate
        ? 'rgba(245, 158, 11, 0.1)'
        : '#1e293b',
  border: isSelected
    ? '2px solid #3b82f6'
    : isBottleneck
      ? '2px solid #ef4444'
      : isGate
        ? '2px solid #f59e0b'
        : '1px solid #475569',
  borderRadius: '8px',
  padding: isSelected || isBottleneck || isGate ? '11px 13px' : '12px 14px',
  minWidth: `${NODE_WIDTH}px`,
  cursor: 'pointer',
  boxShadow: isSelected
    ? '0 0 0 2px rgba(59, 130, 246, 0.3)'
    : isBottleneck
      ? '0 0 0 2px rgba(239, 68, 68, 0.2)'
      : isGate
        ? '0 0 0 2px rgba(245, 158, 11, 0.2)'
        : 'none',
  transition: reducedMotion ? 'none' : 'border-color 0.15s ease, box-shadow 0.15s ease',
})

const nodeTitleStyle: CSSProperties = {
  fontSize: '13px',
  fontWeight: 600,
  color: '#e2e8f0',
  marginBottom: '4px',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const nodeIdStyle: CSSProperties = {
  fontSize: '11px',
  fontFamily: 'monospace',
  color: '#94a3b8',
}

const variablePortStyle: CSSProperties = {
  position: 'absolute',
  left: '-8px',
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  top: '50%',
  transform: 'translateY(-50%)',
}

const variableChipStyle: CSSProperties = {
  fontSize: '9px',
  fontFamily: 'monospace',
  backgroundColor: '#3b82f6',
  color: '#ffffff',
  padding: '2px 6px',
  borderRadius: '4px',
  whiteSpace: 'nowrap',
}

const emptyStateStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  color: '#6b7280',
  fontSize: '14px',
  fontStyle: 'italic',
}

const badgeRowStyle: CSSProperties = {
  display: 'flex',
  gap: '4px',
  flexWrap: 'wrap',
  marginTop: '6px',
}

const badgeStyle = (type: 'blocks' | 'needs' | 'gate'): CSSProperties => ({
  fontSize: '9px',
  fontFamily: 'monospace',
  padding: '2px 5px',
  borderRadius: '4px',
  backgroundColor:
    type === 'blocks'
      ? 'rgba(239, 68, 68, 0.2)'
      : type === 'gate'
        ? 'rgba(245, 158, 11, 0.2)'
        : 'rgba(107, 114, 128, 0.2)',
  color: type === 'blocks' ? '#fca5a5' : type === 'gate' ? '#fcd34d' : '#9ca3af',
})

const legendOverlayStyle: CSSProperties = {
  position: 'absolute',
  top: '12px',
  right: '12px',
  display: 'flex',
  gap: '12px',
  backgroundColor: 'rgba(15, 23, 42, 0.9)',
  padding: '8px 12px',
  borderRadius: '6px',
  border: '1px solid #334155',
  zIndex: 10,
}

const legendItemStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  fontSize: '11px',
  color: '#9ca3af',
}

const legendDotStyle = (color: string): CSSProperties => ({
  width: '8px',
  height: '8px',
  borderRadius: '50%',
  backgroundColor: color,
})

// --- Custom Node Components ---

function StepNode({ data }: NodeProps<Node<StepNodeData>>) {
  const handleColor = data.isBottleneck ? '#ef4444' : data.isGate ? '#f59e0b' : '#6366f1'

  return (
    <div style={nodeContainerStyle(data.isSelected ?? false, data.isBottleneck, data.isGate, data.reducedMotion)}>
      {/* Target handle (incoming edges) */}
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: handleColor, border: 'none', width: 8, height: 8 }}
      />

      {/* Variable input ports */}
      {data.variables.length > 0 && (
        <div style={variablePortStyle}>
          {data.variables.map((varName) => (
            <div key={varName} style={variableChipStyle}>
              ${varName}
            </div>
          ))}
        </div>
      )}

      {/* Node content */}
      <div style={nodeTitleStyle} title={data.title}>
        {data.title}
      </div>
      <div style={nodeIdStyle}>{data.id}</div>

      {/* Badges showing input/output relationships */}
      <div style={badgeRowStyle}>
        {data.isGate && <span style={badgeStyle('gate')}>{data.needsCount} inputs</span>}
        {data.isBottleneck && <span style={badgeStyle('blocks')}>blocks {data.blocksCount}</span>}
        {!data.isGate && !data.isBottleneck && data.needsCount > 0 && (
          <span style={badgeStyle('needs')}>1 input</span>
        )}
        {!data.isGate && !data.isBottleneck && data.blocksCount === 1 && (
          <span style={badgeStyle('needs')}>1 output</span>
        )}
      </div>

      {/* Source handle (outgoing edges) */}
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: handleColor, border: 'none', width: 8, height: 8 }}
      />
    </div>
  )
}

function GroupNode({ data }: NodeProps<Node<GroupNodeData & { colorIndex: number }>>) {
  const color = GROUP_COLORS[data.colorIndex % GROUP_COLORS.length]
  // Vary border width for additional distinction (double style needs 3px minimum)
  const borderWidth =
    color.borderStyle === 'double' ? '3px' : color.borderStyle === 'dotted' ? '2px' : '1px'

  return (
    <div
      style={{
        backgroundColor: color.bg,
        border: `${borderWidth} ${color.borderStyle} ${color.border}`,
        borderRadius: '12px',
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          padding: '8px 12px',
          fontSize: '12px',
          fontWeight: 600,
          color: color.border,
          borderBottom: `${borderWidth} ${color.borderStyle} ${color.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span>
          <span
            style={{
              backgroundColor: color.border,
              color: '#0f172a',
              padding: '1px 5px',
              borderRadius: '4px',
              fontSize: '10px',
              fontWeight: 700,
              marginRight: '8px',
            }}
          >
            #{data.colorIndex + 1}
          </span>
          {data.label}
        </span>
        <span
          style={{
            fontSize: '10px',
            fontWeight: 400,
            color: '#94a3b8',
          }}
        >
          {data.stepCount} steps
        </span>
      </div>
    </div>
  )
}

const nodeTypes = { step: StepNode, group: GroupNode }

// --- Main Component ---

export interface VisualBuilderProps {
  /** Formula steps (proto beads) to visualize */
  steps: ProtoBead[]
  /** Variable definitions (used to detect which vars are used in steps) */
  vars?: Record<string, FormulaVariable>
  /** Callback when a step node is clicked (single-click selects) */
  onStepSelect?: (stepId: string | null) => void
  /** Callback when a step node is double-clicked (opens step editor panel) */
  onStepOpen?: (stepId: string) => void
  /** ID of the currently selected step */
  selectedStepId?: string | null
}

/**
 * Extracts variable references from text using ${var} syntax.
 */
function extractVariables(text: string): string[] {
  const matches = text.match(/\$\{([^}]+)\}/g)
  if (!matches) return []
  return matches.map((m) => m.slice(2, -1))
}

/**
 * Visual formula builder displaying steps as a DAG.
 * Clicking a step opens the StepEditorPanel for editing.
 * Steps from expansion formulas are grouped in container nodes.
 */
export function VisualBuilder({
  steps,
  vars: _vars,
  onStepSelect,
  onStepOpen,
  selectedStepId,
}: VisualBuilderProps) {
  const reducedMotion = useReducedMotion()

  // Convert steps to React Flow nodes and edges
  const { initialNodes, initialEdges } = useMemo(() => {
    if (!steps || steps.length === 0) {
      return { initialNodes: [], initialEdges: [] }
    }

    // First, identify expansion groups
    const groupPrefixes = new Map<string, number>() // prefix -> color index
    let colorIndex = 0
    for (const step of steps) {
      const prefix = getGroupPrefix(step.id)
      if (prefix && !groupPrefixes.has(prefix)) {
        groupPrefixes.set(prefix, colorIndex++)
      }
    }

    // Build reverse dependency map (what does each step block?)
    const blocksMap = new Map<string, string[]>()
    for (const step of steps) {
      blocksMap.set(step.id, [])
    }
    for (const step of steps) {
      if (step.needs) {
        for (const needId of step.needs) {
          const blocks = blocksMap.get(needId)
          if (blocks) {
            blocks.push(step.id)
          }
        }
      }
    }

    // Create step nodes with bottleneck/gate detection
    const stepNodes: Node<StepNodeData>[] = steps.map((step) => {
      const titleVars = extractVariables(step.title)
      const descVars = extractVariables(step.description)
      const allVars = [...new Set([...titleVars, ...descVars])]
      const blocks = blocksMap.get(step.id) ?? []
      const needsCount = step.needs?.length ?? 0

      return {
        id: step.id,
        type: 'step',
        position: { x: 0, y: 0 },
        data: {
          id: step.id,
          title: step.title,
          description: step.description,
          priority: step.priority,
          variables: allVars,
          isSelected: step.id === selectedStepId,
          isBottleneck: blocks.length >= 2,
          isGate: needsCount >= 2,
          needsCount,
          blocksCount: blocks.length,
          reducedMotion,
        },
      }
    })

    // Create edges from needs dependencies
    const edges: Edge[] = []
    for (const step of steps) {
      if (step.needs && step.needs.length > 0) {
        for (const needId of step.needs) {
          // Check if this is a cross-group edge
          const sourceGroup = getGroupPrefix(needId)
          const targetGroup = getGroupPrefix(step.id)
          const isCrossGroup = sourceGroup !== targetGroup

          // Hide cross-group edges by default, reveal when selected step is involved
          const isSelectedInvolved = selectedStepId === needId || selectedStepId === step.id
          const hideCrossGroup = isCrossGroup && !isSelectedInvolved

          edges.push({
            id: `${needId}->${step.id}`,
            source: needId,
            target: step.id,
            hidden: hideCrossGroup,
            style: {
              stroke: isCrossGroup ? '#f59e0b' : '#6366f1',
              strokeWidth: isCrossGroup ? 3 : 2,
              strokeDasharray: isCrossGroup ? '5,5' : undefined,
            },
            animated: isCrossGroup && !reducedMotion,
          })
        }
      }
    }

    // Apply dagre layout to step nodes
    const layoutedStepNodes = layoutNodes(stepNodes, edges)

    // If no groups, return step nodes directly
    if (groupPrefixes.size === 0) {
      return { initialNodes: layoutedStepNodes, initialEdges: edges }
    }

    // Calculate bounding boxes for each group
    const groupBounds = new Map<
      string,
      { minX: number; minY: number; maxX: number; maxY: number; steps: number }
    >()

    for (const node of layoutedStepNodes) {
      const prefix = getGroupPrefix(node.id)
      if (!prefix) continue

      const bounds = groupBounds.get(prefix) || {
        minX: Number.POSITIVE_INFINITY,
        minY: Number.POSITIVE_INFINITY,
        maxX: Number.NEGATIVE_INFINITY,
        maxY: Number.NEGATIVE_INFINITY,
        steps: 0,
      }

      bounds.minX = Math.min(bounds.minX, node.position.x)
      bounds.minY = Math.min(bounds.minY, node.position.y)
      bounds.maxX = Math.max(bounds.maxX, node.position.x + NODE_WIDTH)
      bounds.maxY = Math.max(bounds.maxY, node.position.y + NODE_HEIGHT)
      bounds.steps++

      groupBounds.set(prefix, bounds)
    }

    // Create group nodes
    const groupNodes: Node<GroupNodeData & { colorIndex: number }>[] = []
    for (const [prefix, bounds] of groupBounds) {
      const groupColorIndex = groupPrefixes.get(prefix) ?? 0
      groupNodes.push({
        id: `group-${prefix}`,
        type: 'group',
        position: {
          x: bounds.minX - GROUP_PADDING,
          y: bounds.minY - GROUP_PADDING - GROUP_HEADER_HEIGHT,
        },
        style: {
          width: bounds.maxX - bounds.minX + GROUP_PADDING * 2,
          height: bounds.maxY - bounds.minY + GROUP_PADDING * 2 + GROUP_HEADER_HEIGHT,
          zIndex: -1,
        },
        data: {
          label: formatGroupLabel(prefix),
          stepCount: bounds.steps,
          colorIndex: groupColorIndex,
        },
        selectable: false,
        draggable: false,
      })
    }

    // Combine group nodes (first, so they're behind) and step nodes
    const allNodes = [...groupNodes, ...layoutedStepNodes] as Node[]

    return { initialNodes: allNodes, initialEdges: edges }
  }, [steps, selectedStepId, reducedMotion])

  const [nodes, , onNodesChange] = useNodesState(initialNodes)
  const [edges, , onEdgesChange] = useEdgesState(initialEdges)

  // No-op for read-only mode
  const onConnect = useCallback(() => {}, [])

  // Handle single-click - select the step (only for step nodes)
  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (node.type === 'group') return // Ignore group clicks
      if (onStepSelect) {
        onStepSelect(node.id)
      }
    },
    [onStepSelect]
  )

  // Handle double-click - open step editor panel (only for step nodes)
  const handleNodeDoubleClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (node.type === 'group') return // Ignore group clicks
      if (onStepOpen) {
        onStepOpen(node.id)
      }
    },
    [onStepOpen]
  )

  // Handle pane click - deselect
  const handlePaneClick = useCallback(() => {
    if (onStepSelect && selectedStepId) {
      onStepSelect(null)
    }
  }, [onStepSelect, selectedStepId])

  // Container ref for keyboard focus
  const containerRef = useRef<HTMLDivElement>(null)

  // Build adjacency maps for DAG navigation
  const dagAdjacency = useMemo(() => {
    const stepNodes = nodes.filter((n) => n.type === 'step')
    const stepIds = stepNodes.map((n) => n.id)
    const nodeById = new Map(stepNodes.map((n) => [n.id, n]))

    // Parents: nodes that this node depends on (upstream)
    const parents = new Map<string, string[]>()
    // Children: nodes that depend on this node (downstream)
    const children = new Map<string, string[]>()
    // Siblings: nodes at similar Y position (same rank in layout)
    const siblings = new Map<string, { left: string[]; right: string[] }>()

    for (const id of stepIds) {
      parents.set(id, [])
      children.set(id, [])
    }

    // Build parent/child relationships from edges
    for (const edge of edges) {
      const parentList = parents.get(edge.target)
      if (parentList) parentList.push(edge.source)
      const childList = children.get(edge.source)
      if (childList) childList.push(edge.target)
    }

    // Build sibling relationships based on Y position (within threshold)
    const Y_THRESHOLD = NODE_HEIGHT * 0.5
    for (const node of stepNodes) {
      const nodeY = node.position.y
      const nodeX = node.position.x
      const leftSiblings: string[] = []
      const rightSiblings: string[] = []

      for (const other of stepNodes) {
        if (other.id === node.id) continue
        if (Math.abs(other.position.y - nodeY) <= Y_THRESHOLD) {
          if (other.position.x < nodeX) {
            leftSiblings.push(other.id)
          } else {
            rightSiblings.push(other.id)
          }
        }
      }

      // Sort by distance (closest first)
      leftSiblings.sort((a, b) => {
        const aX = nodeById.get(a)?.position.x ?? 0
        const bX = nodeById.get(b)?.position.x ?? 0
        return bX - aX // Closest left = largest X
      })
      rightSiblings.sort((a, b) => {
        const aX = nodeById.get(a)?.position.x ?? 0
        const bX = nodeById.get(b)?.position.x ?? 0
        return aX - bX // Closest right = smallest X
      })

      siblings.set(node.id, { left: leftSiblings, right: rightSiblings })
    }

    return { parents, children, siblings, stepIds }
  }, [nodes, edges])

  // Keyboard navigation handler
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const { parents, children, siblings, stepIds } = dagAdjacency
      if (stepIds.length === 0) return

      // If no selection, arrow keys select first node
      if (!selectedStepId) {
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
          event.preventDefault()
          if (onStepSelect) {
            onStepSelect(stepIds[0])
          }
        }
        return
      }

      let nextId: string | null = null

      switch (event.key) {
        case 'ArrowUp': {
          // Navigate to parent (upstream dependency)
          const parentIds = parents.get(selectedStepId) ?? []
          if (parentIds.length > 0) {
            nextId = parentIds[0]
          }
          break
        }
        case 'ArrowDown': {
          // Navigate to child (downstream dependent)
          const childIds = children.get(selectedStepId) ?? []
          if (childIds.length > 0) {
            nextId = childIds[0]
          }
          break
        }
        case 'ArrowLeft': {
          // Navigate to left sibling
          const sibs = siblings.get(selectedStepId)
          if (sibs && sibs.left.length > 0) {
            nextId = sibs.left[0]
          }
          break
        }
        case 'ArrowRight': {
          // Navigate to right sibling
          const sibs = siblings.get(selectedStepId)
          if (sibs && sibs.right.length > 0) {
            nextId = sibs.right[0]
          }
          break
        }
        case 'Enter': {
          // Enter opens the step editor panel for the selected step
          event.preventDefault()
          if (onStepOpen && selectedStepId) {
            onStepOpen(selectedStepId)
          }
          return
        }
        case 'Escape': {
          // Deselect
          event.preventDefault()
          if (onStepSelect) {
            onStepSelect(null)
          }
          return
        }
        default:
          return
      }

      if (nextId && nextId !== selectedStepId) {
        event.preventDefault()
        if (onStepSelect) {
          onStepSelect(nextId)
        }
      }
    },
    [dagAdjacency, selectedStepId, onStepSelect, onStepOpen]
  )

  // Count bottlenecks and gates for legend
  const bottleneckCount = useMemo(() => {
    return nodes.filter((n) => n.type === 'step' && (n.data as StepNodeData)?.isBottleneck).length
  }, [nodes])

  const gateCount = useMemo(() => {
    return nodes.filter((n) => n.type === 'step' && (n.data as StepNodeData)?.isGate).length
  }, [nodes])

  if (!steps || steps.length === 0) {
    return <div style={emptyStateStyle}>No steps to display</div>
  }

  return (
    <div
      ref={containerRef}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: role="application" is interactive with keyboard handlers
      tabIndex={0}
      style={{
        width: '100%',
        height: '100%',
        minHeight: '400px',
        position: 'relative',
        outline: 'none',
      }}
      role="application"
      aria-label="Formula steps DAG. Use arrow keys to navigate, Enter to select, Escape to deselect."
      onKeyDown={handleKeyDown as unknown as React.KeyboardEventHandler<HTMLDivElement>}
    >
      {/* Legend overlay */}
      <div style={legendOverlayStyle}>
        <div style={legendItemStyle}>
          <div style={legendDotStyle('#ef4444')} />
          <span>Bottleneck ({bottleneckCount})</span>
        </div>
        <div style={legendItemStyle}>
          <div style={legendDotStyle('#f59e0b')} />
          <span>Gate ({gateCount})</span>
        </div>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={handleNodeClick}
        onNodeDoubleClick={handleNodeDoubleClick}
        onPaneClick={handlePaneClick}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={true}
        zoomOnScroll={true}
        panOnScroll={false}
        panOnDrag={true}
        style={{ backgroundColor: '#0f172a' }}
        aria-label="Formula steps graph. Shows dependencies between steps as a directed acyclic graph."
      >
        <Controls
          showZoom={true}
          showFitView={true}
          showInteractive={false}
          position="bottom-left"
        />
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#334155" />
        <MiniMap
          nodeColor={(node) => {
            if (node.type === 'group') return 'transparent'
            const data = node.data as StepNodeData | undefined
            if (data?.isBottleneck) return '#ef4444'
            if (data?.isGate) return '#f59e0b'
            return '#1e293b'
          }}
          maskColor="rgba(15, 23, 42, 0.8)"
          style={{ backgroundColor: '#1e293b' }}
        />
      </ReactFlow>
    </div>
  )
}
