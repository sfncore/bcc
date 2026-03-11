/**
 * Hook for fetching graph data and metrics from the backend API.
 * Provides nodes, edges, and the 9 graph metrics for visualization.
 * Uses centralized API client for connection state tracking and error classification.
 */
import type {
  GraphEdge,
  GraphExport,
  GraphExportResult,
  GraphMetrics,
  GraphMetricsResult,
  GraphNode,
} from '@beads-ide/shared'
import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../lib/api'

/** Graph data state */
export interface GraphData {
  /** Graph nodes */
  nodes: GraphNode[]
  /** Graph edges */
  edges: GraphEdge[]
  /** Graph density (0-1) */
  density: number
  /** Node count */
  nodeCount: number
  /** Edge count */
  edgeCount: number
}

/** Return value of the useGraph hook */
export interface UseGraphReturn {
  /** Graph data (nodes, edges, density) */
  graph: GraphData | null
  /** Graph metrics from bv robot-insights */
  metrics: GraphMetrics | null
  /** Whether graph data is loading */
  isLoadingGraph: boolean
  /** Whether metrics are loading */
  isLoadingMetrics: boolean
  /** Error from the last graph fetch */
  graphError: Error | null
  /** Error from the last metrics fetch */
  metricsError: Error | null
  /** Refresh both graph and metrics */
  refresh: () => void
  /** Refresh only graph data */
  refreshGraph: () => void
  /** Refresh only metrics */
  refreshMetrics: () => void
}

/**
 * Fetch graph export data from the backend.
 */
async function fetchGraphExport(): Promise<GraphExport> {
  const { data, error: apiError } = await apiFetch<GraphExportResult>('/api/graph/export')

  if (apiError) {
    throw new Error(apiError.details || apiError.message)
  }

  const result = data as GraphExportResult
  if (!result.ok) {
    throw new Error(result.error || 'Failed to fetch graph export')
  }

  return result.graph
}

/**
 * Fetch graph metrics from the backend.
 */
async function fetchGraphMetrics(): Promise<GraphMetrics> {
  const { data, error: apiError } = await apiFetch<GraphMetricsResult>('/api/graph/metrics')

  if (apiError) {
    throw new Error(apiError.details || apiError.message)
  }

  const result = data as GraphMetricsResult
  if (!result.ok) {
    throw new Error(result.error || 'Failed to fetch graph metrics')
  }

  return result.metrics
}

/**
 * Hook for fetching graph data and metrics.
 * Automatically fetches on mount.
 *
 * @returns Graph data, metrics, loading states, errors, and refresh functions
 */
export function useGraph(): UseGraphReturn {
  const [graph, setGraph] = useState<GraphData | null>(null)
  const [metrics, setMetrics] = useState<GraphMetrics | null>(null)
  const [isLoadingGraph, setIsLoadingGraph] = useState(false)
  const [isLoadingMetrics, setIsLoadingMetrics] = useState(false)
  const [graphError, setGraphError] = useState<Error | null>(null)
  const [metricsError, setMetricsError] = useState<Error | null>(null)

  const doFetchGraph = useCallback(async () => {
    setIsLoadingGraph(true)
    setGraphError(null)

    try {
      const graphExport = await fetchGraphExport()
      setGraph({
        nodes: graphExport.nodes,
        edges: graphExport.edges,
        density: graphExport.stats.density ?? 0,
        nodeCount: graphExport.stats.nodes ?? graphExport.nodes.length,
        edgeCount: graphExport.stats.edges ?? graphExport.edges.length,
      })
    } catch (err) {
      setGraphError(err instanceof Error ? err : new Error(String(err)))
      setGraph(null)
    } finally {
      setIsLoadingGraph(false)
    }
  }, [])

  const doFetchMetrics = useCallback(async () => {
    setIsLoadingMetrics(true)
    setMetricsError(null)

    try {
      const metricsData = await fetchGraphMetrics()
      setMetrics(metricsData)
    } catch (err) {
      setMetricsError(err instanceof Error ? err : new Error(String(err)))
      setMetrics(null)
    } finally {
      setIsLoadingMetrics(false)
    }
  }, [])

  const refresh = useCallback(() => {
    doFetchGraph()
    doFetchMetrics()
  }, [doFetchGraph, doFetchMetrics])

  // Initial fetch on mount
  useEffect(() => {
    refresh()
  }, [refresh])

  return {
    graph,
    metrics,
    isLoadingGraph,
    isLoadingMetrics,
    graphError,
    metricsError,
    refresh,
    refreshGraph: doFetchGraph,
    refreshMetrics: doFetchMetrics,
  }
}
