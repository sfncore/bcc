import {
  Background,
  BackgroundVariant,
  Controls,
  type Edge,
  MiniMap,
  type Node,
  type NodeTypes,
  type OnEdgesChange,
  type OnNodesChange,
  Panel,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from '@xyflow/react'
/**
 * Graph visualization component for bead dependency graphs.
 * Implements dense graph simplification strategies for 50-200 bead graphs.
 *
 * Features:
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
import type { GraphEdge, GraphNode } from '@beads-ide/shared'
import {
  DEFAULT_SIMPLIFICATION_STATE,
  GraphControls,
  type GraphSimplificationState,
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
}

type NodeData = ClusterData | BeadData

interface GraphViewProps {
  /** Graph nodes from API */
  nodes: GraphNode[]
  /** Graph edges from API */
  edges: GraphEdge[]
  /** Graph density (0-1) */
  density: number
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
const NODE_WIDTH = 180
const NODE_HEIGHT = 60
const CLUSTER_NODE_WIDTH = 200
const CLUSTER_NODE_HEIGHT = 80

/**
 * Custom node component for beads
 */
function BeadNode({ data }: { data: BeadData }) {
  const statusColor = getStatusColor(data.status)
  const opacity = data.dimmed ? 0.3 : 1

  return (
    <div
      style={{
        padding: '10px 12px',
        borderRadius: '6px',
        backgroundColor: '#2d2d2d',
        border: `2px solid ${statusColor}`,
        width: NODE_WIDTH,
        minHeight: NODE_HEIGHT,
        opacity,
        transition: 'opacity 0.2s ease',
      }}
    >
      <div
        style={{
          fontSize: '11px',
          color: '#888',
          marginBottom: '4px',
          fontFamily: 'monospace',
        }}
      >
        {data.id}
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
      {data.type && (
        <div
          style={{
            fontSize: '10px',
            color: '#666',
            marginTop: '4px',
          }}
        >
          {data.type}
        </div>
      )}
    </div>
  )
}

/**
 * Custom node component for clusters (collapsed epics)
 */
function ClusterNode({ data }: { data: ClusterData }) {
  return (
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
 * Apply simplification to nodes and edges based on current state
 */
function applySimplification(
  rawNodes: GraphNode[],
  rawEdges: GraphEdge[],
  state: GraphSimplificationState
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

  // Convert to React Flow format
  const nodeIdToIndex = new Map<string, number>()
  const gridCols = Math.ceil(Math.sqrt(processedNodes.length + clusters.size))

  // Position nodes in a grid layout (simple default)
  const flowNodes: Node<NodeData>[] = []
  let index = 0

  // Add cluster nodes
  for (const [epicId, cluster] of clusters) {
    const col = index % gridCols
    const row = Math.floor(index / gridCols)
    nodeIdToIndex.set(`cluster-${epicId}`, index)

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
    nodeIdToIndex.set(node.id, index)

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
      },
    })
    index++
  }

  // Convert edges to React Flow format
  const flowEdges: Edge[] = processedEdges.map((e, i) => ({
    id: `e-${i}-${e.from}-${e.to}`,
    source: e.from,
    target: e.to,
    type: 'default',
    animated: e.type === 'blocks',
    style: {
      stroke:
        focusedNodes && (!focusedNodes.has(e.from) || !focusedNodes.has(e.to))
          ? 'rgba(100, 100, 100, 0.3)'
          : '#555',
    },
  }))

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
      return { icon: '●', color: '#89d185', label: 'Closed' }
    case 'in_progress':
    case 'active':
      return { icon: '◐', color: '#007acc', label: 'In Progress' }
    case 'blocked':
      return { icon: '⊘', color: '#f14c4c', label: 'Blocked' }
    case 'review':
      return { icon: '◎', color: '#cca700', label: 'Review' }
    default:
      return { icon: '○', color: '#555', label: 'Open' }
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
                      ← {deps.blockedBy.length}
                    </span>
                  )}
                  {deps && deps.blocks.length > 0 && (
                    <span style={{ color: '#89d185' }} title={`Blocks: ${deps.blocks.join(', ')}`}>
                      → {deps.blocks.length}
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

export function GraphView({
  nodes: rawNodes,
  edges: rawEdges,
  density,
  onBeadClick,
  onBeadDoubleClick,
}: GraphViewProps) {
  const [simplificationState, setSimplificationState] = useState<GraphSimplificationState>(
    DEFAULT_SIMPLIFICATION_STATE
  )
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

  // Apply simplification
  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => applySimplification(rawNodes, rawEdges, simplificationState),
    [rawNodes, rawEdges, simplificationState]
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes as Node[])
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  // Update nodes when simplification changes
  useMemo(() => {
    setNodes(initialNodes as Node[])
    setEdges(initialEdges)
  }, [initialNodes, initialEdges, setNodes, setEdges])

  // Apply fisheye distortion when enabled and mouse is moving
  useEffect(() => {
    if (simplificationState.fisheyeMode && mousePosition) {
      const distortedNodes = applyFisheyeDistortion(
        initialNodes as Node<NodeData>[],
        mousePosition.x,
        mousePosition.y
      )
      setNodes(distortedNodes as Node[])
    } else if (!simplificationState.fisheyeMode) {
      // Reset to original positions when fisheye disabled
      setNodes(initialNodes as Node[])
    }
  }, [simplificationState.fisheyeMode, mousePosition, initialNodes, setNodes])

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
      setNodes(initialNodes as Node[])
    }
  }, [simplificationState.fisheyeMode, initialNodes, setNodes])

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

      // Callback for external handling
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
        bead: ({ data }: { data: BeadData }) => (
          <div
            style={{
              width: NODE_WIDTH,
              height: NODE_HEIGHT,
              borderRadius: '6px',
              backgroundColor: '#2d2d2d',
              border: `2px solid ${getStatusColor(data.status)}`,
              opacity: data.dimmed ? 0.3 : 1,
            }}
          />
        ),
        cluster: ({ data }: { data: ClusterData }) => (
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
        bead: ({ data }: { data: BeadData }) => (
          <div
            style={{
              padding: '10px 12px',
              borderRadius: '6px',
              backgroundColor: '#2d2d2d',
              border: `2px solid ${getStatusColor(data.status)}`,
              width: NODE_WIDTH,
              minHeight: NODE_HEIGHT,
              opacity: data.dimmed ? 0.3 : 1,
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
        ),
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
          <span aria-hidden="true">◇</span> Graph
        </button>
        <button
          type="button"
          onClick={() => setViewMode('list')}
          style={viewMode === 'list' ? toggleButtonActiveStyle : toggleButtonInactiveStyle}
          aria-pressed={viewMode === 'list'}
          aria-label="List view (accessible alternative)"
        >
          <span aria-hidden="true">≡</span> List
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
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={handleNodeClick}
          onNodeDoubleClick={handleNodeDoubleClick}
          onMove={handleMove}
          nodeTypes={effectiveNodeTypes}
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
              return getStatusColor((data as BeadData).status)
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
