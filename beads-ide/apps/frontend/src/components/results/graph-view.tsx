import {
  Background,
  BackgroundVariant,
  Controls,
  type Edge,
  Handle,
  MiniMap,
  type Node,
  type NodeTypes,
  Panel,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from '@xyflow/react'
/**
 * Graph visualization component for bead dependency graphs.
 * Implements dense graph simplification strategies for 50-200 bead graphs.
 *
 * Features:
 * - Three layout algorithms: force-directed, hierarchical, manual
 * - Metrics overlay: node size/color reflect selected metric value
 * - Node shapes by bead type: hexagon = epic, circle = task
 * - Edge styles by dependency type: solid = blocks, dashed = related
 * - Epic clustering: collapse epic children into single cluster nodes
 * - Focus mode: show N-hop neighborhood of selected node
 * - Semantic zoom: hide labels and simplify edges when zoomed out
 * - Fisheye distortion: magnify area around cursor
 * - Density indicator: health warnings at density thresholds
 * - Accessible list/tree alternative for screen readers (WCAG 2.1 AA)
 */
import {
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import '@xyflow/react/dist/style.css'
import type { GraphEdge, GraphMetrics, GraphNode } from '@beads-ide/shared'
import dagre from '@dagrejs/dagre'
import { useReducedMotion } from '../../hooks/use-reduced-motion'
import {
  DEFAULT_SIMPLIFICATION_STATE,
  GraphControls,
  type GraphSimplificationState,
  type LayoutAlgorithm,
  type MetricOverlay,
  getDensityHealth,
} from './graph-controls'

/** Cluster node representing a collapsed epic */
interface ClusterData extends Record<string, unknown> {
  id: string
  title: string
  childCount: number
  childIds: string[]
  isCluster: true
}

/** Regular bead node */
interface BeadData extends Record<string, unknown> {
  id: string
  title: string
  status: string
  priority?: number
  labels?: string[]
  type?: string
  parentEpic?: string
  isCluster: false
  dimmed?: boolean
  reducedMotion?: boolean
  /** Metric value for overlay (0-1 normalized) */
  metricValue?: number
  /** Whether a metric overlay is active */
  hasMetric?: boolean
}

type NodeData = ClusterData | BeadData

interface GraphViewProps {
  /** Graph nodes from API */
  nodes: GraphNode[]
  /** Graph edges from API */
  edges: GraphEdge[]
  /** Graph density (0-1) */
  density: number
  /** Graph metrics from API (for overlay) */
  metrics?: GraphMetrics | null
  /** Callback when a bead is clicked */
  onBeadClick?: (beadId: string) => void
  /** Callback when a bead is double-clicked */
  onBeadDoubleClick?: (beadId: string) => void
}

const containerStyle: CSSProperties = {
  width: '100%',
  height: '100%',
  backgroundColor: '#1e1e1e',
}

const controlsPanelStyle: CSSProperties = {
  position: 'absolute',
  top: '10px',
  right: '10px',
  zIndex: 10,
  maxWidth: '280px',
}

// Zoom thresholds for semantic zoom
const ZOOM_THRESHOLD_LABELS = 0.5 // Hide labels below this zoom
const ZOOM_THRESHOLD_DETAILS = 0.3 // Simplify further below this zoom

// Fisheye distortion parameters
const FISHEYE_RADIUS = 200 // Radius of fisheye effect in pixels
const FISHEYE_DISTORTION = 3 // Distortion strength (higher = more magnification)

// Node style constants
const NODE_WIDTH = 280
const NODE_HEIGHT = 100
const CLUSTER_NODE_WIDTH = 200
const CLUSTER_NODE_HEIGHT = 80

// Manual positions localStorage key
const MANUAL_POSITIONS_KEY = 'beads-ide:graph-manual-positions'

/**
 * Interpolate between two colors based on a value 0-1.
 * Goes from blue (low) to red (high).
 */
function metricColor(value: number): string {
  const r = Math.round(45 + value * 196) // 45 -> 241
  const g = Math.round(90 - value * 14) // 90 -> 76
  const b = Math.round(158 - value * 82) // 158 -> 76
  return `rgb(${r}, ${g}, ${b})`
}

/**
 * Compute node scale based on metric value (1.0 to 1.6)
 */
function metricScale(value: number): number {
  return 1 + value * 0.6
}

/**
 * Get the SVG clip-path / shape styles for bead type.
 * Hexagon for epic, circle for task, default rectangle.
 */
function getNodeShapeStyle(type?: string): CSSProperties {
  switch (type?.toLowerCase()) {
    case 'epic':
      return {
        borderRadius: '12px',
        borderWidth: '3px',
      }
    case 'bug':
      return {
        borderRadius: '2px',
        borderStyle: 'dashed',
      }
    default:
      return {
        borderRadius: '6px',
      }
  }
}

/**
 * Custom node component for beads with type-based shapes and metric overlay
 */
function BeadNode({ data }: { data: BeadData }) {
  const statusColor = getStatusColor(data.status)
  const opacity = data.dimmed ? 0.3 : 1
  const scale = data.hasMetric && data.metricValue !== undefined ? metricScale(data.metricValue) : 1
  const borderColor =
    data.hasMetric && data.metricValue !== undefined ? metricColor(data.metricValue) : statusColor
  const shapeStyle = getNodeShapeStyle(data.type)

  return (
    <div
      style={{
        transform: scale !== 1 ? `scale(${scale})` : undefined,
        transition: 'none',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: '#555' }} />
      <div
        style={{
          padding: '12px 14px',
          backgroundColor: '#2d2d2d',
          border: `2px solid ${borderColor}`,
          width: NODE_WIDTH,
          minHeight: NODE_HEIGHT,
          opacity,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          ...shapeStyle,
        }}
      >
        <div
          style={{
            fontSize: '14px',
            color: '#aaa',
            marginBottom: '6px',
            fontFamily: 'monospace',
            fontWeight: 600,
          }}
        >
          {data.id}
        </div>
        <div
          style={{
            fontSize: '16px',
            color: '#fff',
            fontWeight: 600,
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            maxWidth: NODE_WIDTH - 28,
            lineHeight: '1.3',
          }}
        >
          {data.title}
        </div>
        {data.type && (
          <div
            style={{
              fontSize: '12px',
              color: '#888',
              marginTop: '4px',
              fontWeight: 500,
            }}
          >
            {data.type}
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: '#555' }} />
    </div>
  )
}

/**
 * Custom node component for clusters (collapsed epics)
 */
function ClusterNode({ data }: { data: ClusterData }) {
  return (
    <div>
      <Handle type="target" position={Position.Top} style={{ background: '#007acc' }} />
      <div
        style={{
          padding: '12px 14px',
          borderRadius: '8px',
          backgroundColor: '#3d3d3d',
          border: '2px dashed #007acc',
          width: CLUSTER_NODE_WIDTH,
          minHeight: CLUSTER_NODE_HEIGHT,
        }}
      >
      <div
        style={{
          fontSize: '11px',
          color: '#007acc',
          marginBottom: '4px',
          fontWeight: 600,
        }}
      >
        EPIC CLUSTER
      </div>
      <div
        style={{
          fontSize: '12px',
          color: '#ccc',
          fontWeight: 500,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {data.title}
      </div>
      <div
        style={{
          fontSize: '10px',
          color: '#888',
          marginTop: '6px',
        }}
      >
        {data.childCount} beads collapsed
      </div>
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: '#007acc' }} />
    </div>
  )
}

const nodeTypes: NodeTypes = {
  bead: BeadNode,
  cluster: ClusterNode,
}

function getStatusColor(status: string): string {
  switch (status.toLowerCase()) {
    case 'done':
    case 'completed':
    case 'closed':
      return '#89d185'
    case 'in_progress':
    case 'active':
      return '#007acc'
    case 'blocked':
      return '#f14c4c'
    case 'review':
      return '#cca700'
    default:
      return '#555'
  }
}

/**
 * Build adjacency map for N-hop neighborhood calculation
 */
function buildAdjacencyMap(edges: GraphEdge[]): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>()

  for (const edge of edges) {
    if (!adj.has(edge.from)) adj.set(edge.from, new Set())
    if (!adj.has(edge.to)) adj.set(edge.to, new Set())
    adj.get(edge.from)?.add(edge.to)
    adj.get(edge.to)?.add(edge.from) // Treat as undirected for neighborhood
  }

  return adj
}

/**
 * Get nodes within N hops of a given node
 */
function getNHopNeighborhood(
  nodeId: string,
  hops: number,
  adjacencyMap: Map<string, Set<string>>
): Set<string> {
  const visited = new Set<string>([nodeId])
  let frontier = new Set<string>([nodeId])

  for (let i = 0; i < hops; i++) {
    const nextFrontier = new Set<string>()
    for (const node of frontier) {
      const neighbors = adjacencyMap.get(node)
      if (neighbors) {
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor)
            nextFrontier.add(neighbor)
          }
        }
      }
    }
    frontier = nextFrontier
  }

  return visited
}

/**
 * Find epic nodes and their children for clustering
 */
function findEpicsAndChildren(nodes: GraphNode[], edges: GraphEdge[]): Map<string, string[]> {
  const epics = new Map<string, string[]>()

  // Find nodes that are epics (type === 'epic' or have 'epic' label)
  const epicIds = new Set<string>()
  for (const node of nodes) {
    if (node.type === 'epic' || node.labels?.includes('epic') || node.labels?.includes('parent')) {
      epicIds.add(node.id)
      epics.set(node.id, [])
    }
  }

  // Find children (nodes that have edges TO an epic)
  // In beads, children "need" their parent, so child -> parent edge
  for (const edge of edges) {
    if (epicIds.has(edge.to)) {
      epics.get(edge.to)?.push(edge.from)
    }
  }

  return epics
}

/**
 * Apply fisheye distortion to node positions based on cursor position.
 * Magnifies nodes near the cursor while compressing distant nodes.
 */
function applyFisheyeDistortion(
  nodes: Node<NodeData>[],
  cursorX: number,
  cursorY: number
): Node<NodeData>[] {
  return nodes.map((node) => {
    const dx = node.position.x - cursorX
    const dy = node.position.y - cursorY
    const distance = Math.sqrt(dx * dx + dy * dy)

    if (distance === 0 || distance > FISHEYE_RADIUS * 2) {
      return node
    }

    // Normalized distance (0 = at cursor, 1 = at radius edge)
    const normalizedDist = Math.min(distance / FISHEYE_RADIUS, 1)

    // Apply distortion formula: magnify near center, compress at edges
    // Using a polynomial falloff for smooth transition
    const distortionFactor =
      normalizedDist < 1
        ? FISHEYE_DISTORTION * normalizedDist * (1 - normalizedDist * normalizedDist) +
          normalizedDist
        : 1

    const newX = cursorX + dx * distortionFactor
    const newY = cursorY + dy * distortionFactor

    return {
      ...node,
      position: { x: newX, y: newY },
    }
  })
}

/**
 * Extract metric values for each node ID based on the selected metric overlay.
 * Returns a map of node ID -> normalized value (0-1).
 */
function extractMetricValues(
  metrics: GraphMetrics | null | undefined,
  overlay: MetricOverlay
): Map<string, number> {
  const values = new Map<string, number>()
  if (!metrics || overlay === 'none') return values

  let rawScores: { id: string; score: number }[] = []

  switch (overlay) {
    case 'pagerank':
      rawScores = metrics.pagerank?.map((m) => ({ id: m.id, score: m.score })) ?? []
      break
    case 'betweenness':
      rawScores = metrics.betweenness?.map((m) => ({ id: m.id, score: m.score })) ?? []
      break
    case 'eigenvector':
      rawScores = metrics.eigenvector?.map((m) => ({ id: m.id, score: m.score })) ?? []
      break
    case 'degree':
      rawScores = metrics.degree?.map((m) => ({ id: m.id, score: m.totalDegree })) ?? []
      break
    case 'criticalPath': {
      // For critical path, nodes on the path get 1.0, others get slack-based values
      const path = new Set(metrics.criticalPath?.path ?? [])
      const slack = metrics.criticalPath?.slack ?? {}
      const maxSlack = Math.max(1, ...Object.values(slack))
      for (const [id, s] of Object.entries(slack)) {
        values.set(id, path.has(id) ? 1.0 : 1.0 - s / maxSlack)
      }
      return values
    }
  }

  if (rawScores.length === 0) return values

  // Normalize to 0-1
  const maxScore = Math.max(...rawScores.map((s) => s.score))
  if (maxScore === 0) return values

  for (const { id, score } of rawScores) {
    values.set(id, score / maxScore)
  }

  return values
}

/**
 * Apply force-directed layout using a simple spring simulation.
 * Positions are computed iteratively.
 */
function applyForceDirectedLayout(
  nodes: Node<NodeData>[],
  edges: Edge[],
  width: number,
  height: number
): Node<NodeData>[] {
  if (nodes.length === 0) return nodes

  // Initialize positions in a circle
  const centerX = width / 2
  const centerY = height / 2
  const radius = Math.min(width, height) * 0.35

  const positions: { x: number; y: number }[] = nodes.map((_, i) => {
    const angle = (2 * Math.PI * i) / nodes.length
    return {
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    }
  })

  const nodeIndex = new Map<string, number>()
  for (let i = 0; i < nodes.length; i++) {
    nodeIndex.set(nodes[i].id, i)
  }

  // Run simulation for fixed iterations
  const iterations = 50
  const repulsionStrength = 5000
  const attractionStrength = 0.01
  const idealLength = 200

  for (let iter = 0; iter < iterations; iter++) {
    const temperature = 1 - iter / iterations
    const forces: { fx: number; fy: number }[] = positions.map(() => ({ fx: 0, fy: 0 }))

    // Repulsion between all node pairs
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const dx = positions[i].x - positions[j].x
        const dy = positions[i].y - positions[j].y
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1)
        const force = (repulsionStrength * temperature) / (dist * dist)
        const fx = (dx / dist) * force
        const fy = (dy / dist) * force
        forces[i].fx += fx
        forces[i].fy += fy
        forces[j].fx -= fx
        forces[j].fy -= fy
      }
    }

    // Attraction along edges
    for (const edge of edges) {
      const si = nodeIndex.get(edge.source)
      const ti = nodeIndex.get(edge.target)
      if (si === undefined || ti === undefined) continue

      const dx = positions[ti].x - positions[si].x
      const dy = positions[ti].y - positions[si].y
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1)
      const force = attractionStrength * (dist - idealLength) * temperature
      const fx = (dx / dist) * force
      const fy = (dy / dist) * force
      forces[si].fx += fx
      forces[si].fy += fy
      forces[ti].fx -= fx
      forces[ti].fy -= fy
    }

    // Apply forces
    for (let i = 0; i < positions.length; i++) {
      positions[i].x += Math.max(-50, Math.min(50, forces[i].fx))
      positions[i].y += Math.max(-50, Math.min(50, forces[i].fy))
    }
  }

  return nodes.map((node, i) => ({
    ...node,
    position: { x: positions[i].x, y: positions[i].y },
  }))
}

/**
 * Apply hierarchical layout using dagre.
 */
function applyHierarchicalLayout(nodes: Node<NodeData>[], edges: Edge[]): Node<NodeData>[] {
  if (nodes.length === 0) return nodes

  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'TB', nodesep: 100, ranksep: 150, marginx: 60, marginy: 60 })

  for (const node of nodes) {
    const w = node.data?.isCluster ? CLUSTER_NODE_WIDTH : NODE_WIDTH
    const h = node.data?.isCluster ? CLUSTER_NODE_HEIGHT : NODE_HEIGHT
    g.setNode(node.id, { width: w, height: h })
  }

  for (const edge of edges) {
    g.setEdge(edge.source, edge.target)
  }

  dagre.layout(g)

  return nodes.map((node) => {
    const dagreNode = g.node(node.id)
    if (!dagreNode) return node
    const w = node.data?.isCluster ? CLUSTER_NODE_WIDTH : NODE_WIDTH
    const h = node.data?.isCluster ? CLUSTER_NODE_HEIGHT : NODE_HEIGHT
    return {
      ...node,
      position: {
        x: dagreNode.x - w / 2,
        y: dagreNode.y - h / 2,
      },
    }
  })
}

/**
 * Load manual positions from localStorage
 */
function loadManualPositions(): Record<string, { x: number; y: number }> {
  try {
    const saved = localStorage.getItem(MANUAL_POSITIONS_KEY)
    if (saved) return JSON.parse(saved)
  } catch {
    // Ignore localStorage errors
  }
  return {}
}

/**
 * Save manual positions to localStorage
 */
function saveManualPositions(positions: Record<string, { x: number; y: number }>): void {
  try {
    localStorage.setItem(MANUAL_POSITIONS_KEY, JSON.stringify(positions))
  } catch {
    // Ignore localStorage errors
  }
}

/**
 * Apply manual layout - uses saved positions or falls back to grid
 */
function applyManualLayout(nodes: Node<NodeData>[]): Node<NodeData>[] {
  const savedPositions = loadManualPositions()
  const gridCols = Math.ceil(Math.sqrt(nodes.length))

  return nodes.map((node, index) => {
    if (savedPositions[node.id]) {
      return { ...node, position: savedPositions[node.id] }
    }
    // Fall back to grid for nodes without saved positions
    const col = index % gridCols
    const row = Math.floor(index / gridCols)
    return {
      ...node,
      position: { x: col * 250 + 50, y: row * 120 + 50 },
    }
  })
}

/**
 * Apply simplification to nodes and edges based on current state
 */
function applySimplification(
  rawNodes: GraphNode[],
  rawEdges: GraphEdge[],
  state: GraphSimplificationState,
  metrics: GraphMetrics | null | undefined,
  reducedMotion = false
): { nodes: Node<NodeData>[]; edges: Edge[] } {
  let processedNodes: GraphNode[] = [...rawNodes]
  let processedEdges: GraphEdge[] = [...rawEdges]
  const adjacencyMap = buildAdjacencyMap(rawEdges)

  // Epic clustering: collapse children into cluster nodes
  const clusters: Map<string, ClusterData> = new Map()
  const hiddenByCluster = new Set<string>()

  if (state.epicClustering) {
    const epicsAndChildren = findEpicsAndChildren(rawNodes, rawEdges)

    for (const [epicId, childIds] of epicsAndChildren) {
      if (childIds.length > 0) {
        const epicNode = rawNodes.find((n) => n.id === epicId)
        if (epicNode) {
          clusters.set(epicId, {
            id: `cluster-${epicId}`,
            title: epicNode.title,
            childCount: childIds.length,
            childIds,
            isCluster: true,
          })
          for (const childId of childIds) {
            hiddenByCluster.add(childId)
          }
        }
      }
    }

    // Filter out clustered nodes
    processedNodes = processedNodes.filter((n) => !hiddenByCluster.has(n.id))

    // Remap edges: edges to/from clustered nodes point to cluster
    processedEdges = processedEdges
      .map((e) => {
        let from = e.from
        let to = e.to

        // Find which cluster (if any) contains the from/to nodes
        for (const [epicId, cluster] of clusters) {
          if (cluster.childIds.includes(e.from)) {
            from = `cluster-${epicId}`
          }
          if (cluster.childIds.includes(e.to)) {
            to = `cluster-${epicId}`
          }
        }

        return { ...e, from, to }
      })
      .filter((e) => e.from !== e.to) // Remove self-loops created by clustering
  }

  // Focus mode: dim nodes outside N-hop neighborhood
  let focusedNodes: Set<string> | null = null
  if (state.focusMode && state.selectedNodeId) {
    focusedNodes = getNHopNeighborhood(state.selectedNodeId, state.focusHops, adjacencyMap)
  }

  // Extract metric values for overlay
  const metricValues = extractMetricValues(metrics, state.metricOverlay)
  const hasMetric = state.metricOverlay !== 'none' && metricValues.size > 0

  // Convert to React Flow format — grid positions as starting point
  const gridCols = Math.ceil(Math.sqrt(processedNodes.length + clusters.size))
  const flowNodes: Node<NodeData>[] = []
  let index = 0

  // Add cluster nodes
  for (const [epicId, cluster] of clusters) {
    const col = index % gridCols
    const row = Math.floor(index / gridCols)

    flowNodes.push({
      id: `cluster-${epicId}`,
      type: 'cluster',
      position: { x: col * 250 + 50, y: row * 120 + 50 },
      data: cluster,
    })
    index++
  }

  // Add regular nodes
  for (const node of processedNodes) {
    const col = index % gridCols
    const row = Math.floor(index / gridCols)

    const dimmed = focusedNodes !== null && !focusedNodes.has(node.id)

    flowNodes.push({
      id: node.id,
      type: 'bead',
      position: { x: col * 250 + 50, y: row * 120 + 50 },
      data: {
        id: node.id,
        title: node.title,
        status: node.status,
        priority: node.priority,
        labels: node.labels,
        type: node.type,
        isCluster: false as const,
        dimmed,
        reducedMotion,
        metricValue: metricValues.get(node.id),
        hasMetric,
      },
    })
    index++
  }

  // Convert edges to React Flow format with type-based styling
  const flowEdges: Edge[] = processedEdges.map((e, i) => {
    const isBlocks = e.type === 'blocks'
    const isDimmed = focusedNodes && (!focusedNodes.has(e.from) || !focusedNodes.has(e.to))

    return {
      id: `e-${i}-${e.from}-${e.to}`,
      source: e.from,
      target: e.to,
      type: 'smoothstep',
      animated: false,
      style: {
        stroke: isDimmed ? 'rgba(100, 100, 100, 0.3)' : isBlocks ? '#ef4444' : '#666',
        strokeDasharray: isBlocks ? undefined : '5,5',
        strokeWidth: isBlocks ? 3 : 2,
      },
      markerEnd: {
        type: 'arrowclosed' as any,
        color: isDimmed ? 'rgba(100,100,100,0.3)' : isBlocks ? '#ef4444' : '#666',
        width: 16,
        height: 16,
      },
      label: isBlocks ? undefined : e.type,
      labelStyle: { fill: '#aaa', fontSize: 11 },
      labelBgStyle: { fill: '#1e1e1e', fillOpacity: 0.8 },
      labelBgPadding: [4, 2] as [number, number],
      labelBgBorderRadius: 3,
    }
  })

  return { nodes: flowNodes, edges: flowEdges }
}

// --- Accessible List View Alternative (WCAG 2.1 AA) ---

const listViewContainerStyle: CSSProperties = {
  width: '100%',
  height: '100%',
  backgroundColor: '#1e1e1e',
  overflow: 'auto',
  padding: '16px',
}

const listItemStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '12px 16px',
  marginBottom: '8px',
  backgroundColor: '#2d2d2d',
  borderRadius: '6px',
  border: 'none',
  cursor: 'pointer',
  width: '100%',
  textAlign: 'left',
}

const statusIconStyle: CSSProperties = {
  width: '24px',
  height: '24px',
  borderRadius: '4px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '14px',
  flexShrink: 0,
}

const viewToggleStyle: CSSProperties = {
  display: 'flex',
  gap: '4px',
  marginBottom: '16px',
}

const toggleButtonStyle: CSSProperties = {
  padding: '8px 16px',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '13px',
  fontWeight: 500,
}

const toggleButtonActiveStyle: CSSProperties = {
  ...toggleButtonStyle,
  backgroundColor: '#007acc',
  color: '#fff',
}

const toggleButtonInactiveStyle: CSSProperties = {
  ...toggleButtonStyle,
  backgroundColor: '#3c3c3c',
  color: '#ccc',
}

/** Status icons for accessible differentiation (shape + icon, not color-only) */
function getStatusIcon(status: string): { icon: string; color: string; label: string } {
  switch (status.toLowerCase()) {
    case 'done':
    case 'completed':
    case 'closed':
      return { icon: '\u25CF', color: '#89d185', label: 'Closed' }
    case 'in_progress':
    case 'active':
      return { icon: '\u25D0', color: '#007acc', label: 'In Progress' }
    case 'blocked':
      return { icon: '\u2298', color: '#f14c4c', label: 'Blocked' }
    case 'review':
      return { icon: '\u25CE', color: '#cca700', label: 'Review' }
    default:
      return { icon: '\u25CB', color: '#555', label: 'Open' }
  }
}

interface GraphListViewProps {
  nodes: GraphNode[]
  edges: GraphEdge[]
  onBeadClick?: (beadId: string) => void
  onBeadDoubleClick?: (beadId: string) => void
}

/**
 * Accessible list view alternative to the visual graph.
 * Provides screen reader navigation for bead dependency information.
 */
function GraphListView({ nodes, edges, onBeadClick, onBeadDoubleClick }: GraphListViewProps) {
  // Build dependency map for each node
  const dependencyMap = useMemo(() => {
    const deps = new Map<string, { blocks: string[]; blockedBy: string[] }>()

    for (const node of nodes) {
      deps.set(node.id, { blocks: [], blockedBy: [] })
    }

    for (const edge of edges) {
      // In beads: from -> to means "from blocks to" (or "to needs from")
      deps.get(edge.from)?.blocks.push(edge.to)
      deps.get(edge.to)?.blockedBy.push(edge.from)
    }

    return deps
  }, [nodes, edges])

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>, nodeId: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onBeadClick?.(nodeId)
    }
  }

  const handleDoubleClick = (nodeId: string) => {
    onBeadDoubleClick?.(nodeId)
  }

  return (
    <div style={listViewContainerStyle}>
      <h2 id="beads-list-heading" style={{ color: '#ccc', fontSize: '14px', marginBottom: '12px' }}>
        Beads ({nodes.length})
      </h2>
      <ul aria-labelledby="beads-list-heading" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {nodes.map((node) => {
          const statusInfo = getStatusIcon(node.status)
          const deps = dependencyMap.get(node.id)

          return (
            <li key={node.id}>
              <button
                type="button"
                style={listItemStyle}
                onClick={() => onBeadClick?.(node.id)}
                onDoubleClick={() => handleDoubleClick(node.id)}
                onKeyDown={(e) => handleKeyDown(e, node.id)}
                aria-label={`${node.title}, Status: ${statusInfo.label}, ${deps?.blockedBy.length || 0} blockers, blocks ${deps?.blocks.length || 0} items`}
              >
                {/* Status icon with shape (accessible - not color-only) */}
                <span
                  style={{ ...statusIconStyle, backgroundColor: statusInfo.color }}
                  aria-hidden="true"
                >
                  {statusInfo.icon}
                </span>

                {/* Node info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: '#ccc', fontSize: '13px', fontWeight: 500 }}>
                    {node.title}
                  </div>
                  <div style={{ color: '#888', fontSize: '11px', fontFamily: 'monospace' }}>
                    {node.id}
                  </div>
                </div>

                {/* Dependencies summary */}
                <div style={{ display: 'flex', gap: '8px', fontSize: '11px' }}>
                  {deps && deps.blockedBy.length > 0 && (
                    <span
                      style={{ color: '#f14c4c' }}
                      title={`Blocked by: ${deps.blockedBy.join(', ')}`}
                    >
                      &larr; {deps.blockedBy.length}
                    </span>
                  )}
                  {deps && deps.blocks.length > 0 && (
                    <span style={{ color: '#89d185' }} title={`Blocks: ${deps.blocks.join(', ')}`}>
                      &rarr; {deps.blocks.length}
                    </span>
                  )}
                </div>

                {/* Type badge with shape */}
                {node.type && (
                  <span
                    style={{
                      padding: '2px 8px',
                      backgroundColor: '#374151',
                      borderRadius: '4px',
                      fontSize: '10px',
                      color: '#ccc',
                    }}
                  >
                    {node.type}
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

const SIMPLIFICATION_STORAGE_KEY = 'beads-ide:graph-simplification'

function loadSimplificationState(): GraphSimplificationState {
  try {
    const saved = localStorage.getItem(SIMPLIFICATION_STORAGE_KEY)
    if (saved) {
      return { ...DEFAULT_SIMPLIFICATION_STATE, ...JSON.parse(saved) }
    }
  } catch {
    // Ignore localStorage errors
  }
  return DEFAULT_SIMPLIFICATION_STATE
}

function saveSimplificationState(state: GraphSimplificationState): void {
  try {
    localStorage.setItem(SIMPLIFICATION_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Ignore localStorage errors
  }
}

export function GraphView({
  nodes: rawNodes,
  edges: rawEdges,
  density,
  metrics,
  onBeadClick,
  onBeadDoubleClick,
}: GraphViewProps) {
  const reducedMotion = useReducedMotion()
  const [simplificationState, setSimplificationState] =
    useState<GraphSimplificationState>(loadSimplificationState)
  useEffect(() => {
    saveSimplificationState(simplificationState)
  }, [simplificationState])

  const [zoom, setZoom] = useState(1)
  const [viewMode, setViewMode] = useState<'graph' | 'list'>('graph')
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number | null>(null)

  // Calculate density health
  const densityHealth = useMemo(
    () => getDensityHealth(density, rawNodes.length, rawEdges.length),
    [density, rawNodes.length, rawEdges.length]
  )

  // Apply simplification (produces grid-positioned nodes)
  const { nodes: simplifiedNodes, edges: simplifiedEdges } = useMemo(
    () => applySimplification(rawNodes, rawEdges, simplificationState, metrics, reducedMotion),
    [rawNodes, rawEdges, simplificationState, metrics, reducedMotion]
  )

  // Apply layout algorithm
  const layoutNodes = useMemo(() => {
    switch (simplificationState.layout) {
      case 'hierarchical':
        return applyHierarchicalLayout(simplifiedNodes, simplifiedEdges)
      case 'manual':
        return applyManualLayout(simplifiedNodes)
      default:
        return applyForceDirectedLayout(simplifiedNodes, simplifiedEdges, 1200, 800)
    }
  }, [simplifiedNodes, simplifiedEdges, simplificationState.layout])

  // Stable key to force clean remount when data structurally changes
  const graphKey = useMemo(
    () => `${rawNodes.length}-${rawEdges.length}-${simplificationState.layout}-${simplificationState.epicClustering}`,
    [rawNodes.length, rawEdges.length, simplificationState.layout, simplificationState.epicClustering]
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutNodes as Node[])
  const [edges, , onEdgesChange] = useEdgesState(simplifiedEdges)

  // Sync nodes when layout changes — useEffect (not useMemo) to avoid render-loop
  useEffect(() => {
    setNodes(layoutNodes as Node[])
  }, [layoutNodes, setNodes])

  // Save manual positions when nodes are dragged (only in manual mode)
  const handleNodesChange: typeof onNodesChange = useCallback(
    (changes) => {
      onNodesChange(changes)

      if (simplificationState.layout === 'manual') {
        // Check for position changes (drag end)
        const positionChanges = changes.filter(
          (c) => c.type === 'position' && 'position' in c && c.position && !c.dragging
        )
        if (positionChanges.length > 0) {
          const saved = loadManualPositions()
          for (const change of positionChanges) {
            if ('position' in change && change.position) {
              saved[change.id] = change.position
            }
          }
          saveManualPositions(saved)
        }
      }
    },
    [onNodesChange, simplificationState.layout]
  )

  // Clean up pending RAF on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
      }
    }
  }, [])

  // Handle mouse move for fisheye effect (throttled via requestAnimationFrame)
  const handleMouseMove = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (!simplificationState.fisheyeMode || !containerRef.current) {
        return
      }

      if (rafRef.current !== null) {
        return
      }

      const rect = containerRef.current.getBoundingClientRect()
      const clientX = event.clientX
      const clientY = event.clientY

      rafRef.current = requestAnimationFrame(() => {
        // Convert screen coordinates to flow coordinates (accounting for zoom and pan)
        const flowX = (clientX - rect.left - rect.width / 2) / zoom
        const flowY = (clientY - rect.top - rect.height / 2) / zoom
        setMousePosition({ x: flowX, y: flowY })
        rafRef.current = null
      })
    },
    [simplificationState.fisheyeMode, zoom]
  )

  // Clear mouse position when leaving the container
  const handleMouseLeave = useCallback(() => {
    if (simplificationState.fisheyeMode) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      setMousePosition(null)
      setNodes(layoutNodes as Node[])
    }
  }, [simplificationState.fisheyeMode, layoutNodes, setNodes])

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      const data = node.data as NodeData
      // Handle focus mode selection
      if (simplificationState.focusMode) {
        if (data.isCluster) {
          // Can't focus on clusters
          return
        }
        setSimplificationState((prev) => ({
          ...prev,
          selectedNodeId: prev.selectedNodeId === node.id ? null : node.id,
        }))
      }

      // Callback for external handling (opens bead detail panel)
      if (onBeadClick && !data.isCluster) {
        onBeadClick(node.id)
      }
    },
    [simplificationState.focusMode, onBeadClick]
  )

  const handleNodeDoubleClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      const data = node.data as NodeData
      if (onBeadDoubleClick && !data.isCluster) {
        onBeadDoubleClick(node.id)
      }
    },
    [onBeadDoubleClick]
  )

  const handleMove = useCallback(
    (_event: unknown, viewport: { x: number; y: number; zoom: number }) => {
      setZoom(viewport.zoom)
    },
    []
  )

  // Semantic zoom: modify node visibility based on zoom level
  const effectiveNodeTypes = useMemo(() => {
    if (!simplificationState.semanticZoom) {
      return nodeTypes
    }

    // At low zoom, use simplified node renderers
    if (zoom < ZOOM_THRESHOLD_DETAILS) {
      return {
        bead: ({ data }: { data: BeadData }) => {
          const shapeStyle = getNodeShapeStyle(data.type)
          const borderColor =
            data.hasMetric && data.metricValue !== undefined
              ? metricColor(data.metricValue)
              : getStatusColor(data.status)
          return (
            <div
              style={{
                width: NODE_WIDTH,
                height: NODE_HEIGHT,
                backgroundColor: '#2d2d2d',
                border: `2px solid ${borderColor}`,
                opacity: data.dimmed ? 0.3 : 1,
                ...shapeStyle,
              }}
            />
          )
        },
        cluster: ({ data: _data }: { data: ClusterData }) => (
          <div
            style={{
              width: CLUSTER_NODE_WIDTH,
              height: CLUSTER_NODE_HEIGHT,
              borderRadius: '8px',
              backgroundColor: '#3d3d3d',
              border: '2px dashed #007acc',
            }}
          />
        ),
      }
    }

    if (zoom < ZOOM_THRESHOLD_LABELS) {
      return {
        bead: ({ data }: { data: BeadData }) => {
          const shapeStyle = getNodeShapeStyle(data.type)
          const borderColor =
            data.hasMetric && data.metricValue !== undefined
              ? metricColor(data.metricValue)
              : getStatusColor(data.status)
          return (
            <div
              style={{
                padding: '10px 12px',
                backgroundColor: '#2d2d2d',
                border: `2px solid ${borderColor}`,
                width: NODE_WIDTH,
                minHeight: NODE_HEIGHT,
                opacity: data.dimmed ? 0.3 : 1,
                ...shapeStyle,
              }}
            >
              <div
                style={{
                  fontSize: '11px',
                  color: '#888',
                  fontFamily: 'monospace',
                }}
              >
                {data.id}
              </div>
            </div>
          )
        },
        cluster: ClusterNode,
      }
    }

    return nodeTypes
  }, [simplificationState.semanticZoom, zoom])

  return (
    <div
      ref={containerRef}
      style={containerStyle}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* View mode toggle for accessibility */}
      <div
        style={{ ...viewToggleStyle, position: 'absolute', top: '10px', left: '10px', zIndex: 10 }}
      >
        <button
          type="button"
          onClick={() => setViewMode('graph')}
          style={viewMode === 'graph' ? toggleButtonActiveStyle : toggleButtonInactiveStyle}
          aria-pressed={viewMode === 'graph'}
          aria-label="Graph view"
        >
          <span aria-hidden="true">{'\u25C7'}</span> Graph
        </button>
        <button
          type="button"
          onClick={() => setViewMode('list')}
          style={viewMode === 'list' ? toggleButtonActiveStyle : toggleButtonInactiveStyle}
          aria-pressed={viewMode === 'list'}
          aria-label="List view (accessible alternative)"
        >
          <span aria-hidden="true">{'\u2261'}</span> List
        </button>
      </div>

      {viewMode === 'list' ? (
        <GraphListView
          nodes={rawNodes}
          edges={rawEdges}
          onBeadClick={onBeadClick}
          onBeadDoubleClick={onBeadDoubleClick}
        />
      ) : (
        <ReactFlow
          key={graphKey}
          nodes={nodes}
          edges={edges}
          onNodesChange={handleNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={handleNodeClick}
          onNodeDoubleClick={handleNodeDoubleClick}
          onMove={handleMove}
          nodeTypes={effectiveNodeTypes}
          nodesDraggable={simplificationState.layout === 'manual'}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.1}
          maxZoom={2}
          defaultEdgeOptions={{
            type: 'default',
            style: { stroke: '#555' },
          }}
          aria-label="Bead dependency graph. For an accessible alternative, switch to List view."
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#333" />
          <Controls showZoom showFitView showInteractive={false} />
          <MiniMap
            nodeColor={(node) => {
              const data = node.data as NodeData
              if (data.isCluster) return '#007acc'
              const beadData = data as BeadData
              if (beadData.hasMetric && beadData.metricValue !== undefined) {
                return metricColor(beadData.metricValue)
              }
              return getStatusColor(beadData.status)
            }}
            maskColor="rgba(30, 30, 30, 0.8)"
            style={{ backgroundColor: '#252526' }}
          />
          <Panel position="top-right" style={controlsPanelStyle}>
            <GraphControls
              state={simplificationState}
              onStateChange={setSimplificationState}
              density={densityHealth}
            />
          </Panel>
        </ReactFlow>
      )}
    </div>
  )
}
