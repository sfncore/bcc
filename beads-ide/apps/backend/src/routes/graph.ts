import type {
  DegreeMetrics,
  GraphExport,
  GraphExportResult,
  GraphMetrics,
  GraphMetricsResult,
  RankedMetric,
} from '@beads-ide/shared'
/**
 * Graph routes for Beads IDE backend.
 * Proxies bv CLI commands to expose graph metrics and export data.
 */
import { Hono } from 'hono'
import { bvGraph, bvInsights, runCli } from '../cli.js'

/**
 * Check if bv binary is available.
 */
async function checkBvAvailable(): Promise<boolean> {
  try {
    const result = await runCli('bv', ['--help'])
    return result.exitCode === 0
  } catch {
    return false
  }
}

/**
 * Parse bv robot-insights output into GraphMetrics.
 * Maps the raw bv output fields to our normalized GraphMetrics structure.
 */
function parseInsightsToMetrics(raw: Record<string, unknown>): GraphMetrics {
  // Extract ranked lists with fallbacks
  const influencers = (raw.Influencers as RankedMetric[] | undefined) ?? []
  const bottlenecks = (raw.Bottlenecks as RankedMetric[] | undefined) ?? []
  const keystones = (raw.Keystones as RankedMetric[] | undefined) ?? []
  const authorities = (raw.Authorities as RankedMetric[] | undefined) ?? []
  const hubs = (raw.Hubs as RankedMetric[] | undefined) ?? []
  const rawCycles = (raw.Cycles as string[][] | undefined) ?? []
  const slack = (raw.Slack as Record<string, unknown> | undefined) ?? {}
  const stats = (raw.Stats as Record<string, unknown> | undefined) ?? {}
  const advancedInsights = (raw.advanced_insights as Record<string, unknown> | undefined) ?? {}

  // Extract degree metrics from stats or advanced_insights
  const degreeData = (advancedInsights.degree_distribution as DegreeMetrics[] | undefined) ?? []

  // Extract critical path info
  const criticalPathData = advancedInsights.critical_path as Record<string, unknown> | undefined
  const criticalPath = {
    length: (criticalPathData?.length as number) ?? 0,
    path: (criticalPathData?.path as string[]) ?? [],
    slack: (slack.values as Record<string, number>) ?? (slack as Record<string, number>),
  }

  // Extract topo sort
  const topoData = advancedInsights.topological_sort as Record<string, unknown> | undefined
  const topoSort = {
    order: (topoData?.order as string[]) ?? [],
    levels: (topoData?.levels as Record<string, number>) ?? {},
  }

  // Graph density
  const density = (stats.density as number) ?? (advancedInsights.density as number) ?? 0

  return {
    generated_at: (raw.generated_at as string) ?? new Date().toISOString(),
    data_hash: (raw.data_hash as string) ?? '',

    // 1. PageRank - using Influencers from bv
    pagerank: influencers,

    // 2. Betweenness centrality - using Bottlenecks from bv
    betweenness: bottlenecks,

    // 3. HITS scores
    hits: {
      authorities,
      hubs,
    },

    // 4. Critical path
    criticalPath,

    // 5. Eigenvector centrality - using Keystones from bv
    eigenvector: keystones,

    // 6. Degree metrics
    degree: degreeData,

    // 7. Graph density
    density,

    // 8. Cycle info
    cycles: {
      count: rawCycles.length,
      cycles: rawCycles,
    },

    // 9. Topological sort
    topoSort,

    // Additional info
    stats: {
      nodes: (stats.total_beads as number) ?? (stats.nodes as number) ?? 0,
      edges: (stats.total_dependencies as number) ?? (stats.edges as number) ?? 0,
      density,
      avgDegree: (stats.avg_degree as number) ?? undefined,
    },

    status: raw.status as Record<string, unknown> | undefined,
    usageHints: raw.usage_hints as string[] | undefined,
  }
}

/**
 * Parse bv robot-graph output into GraphExport.
 */
function parseGraphExport(raw: Record<string, unknown>): GraphExport {
  return {
    generated_at: (raw.generated_at as string) ?? new Date().toISOString(),
    data_hash: (raw.data_hash as string) ?? '',
    format: (raw.format as 'json' | 'dot' | 'mermaid') ?? 'json',
    nodes: (raw.nodes as GraphExport['nodes']) ?? [],
    edges: (raw.edges as GraphExport['edges']) ?? [],
    stats: {
      nodes: ((raw.stats as Record<string, unknown>)?.nodes as number) ?? 0,
      edges: ((raw.stats as Record<string, unknown>)?.edges as number) ?? 0,
      density: ((raw.stats as Record<string, unknown>)?.density as number) ?? 0,
    },
  }
}

const graph = new Hono()

  .get('/graph/metrics', async (c) => {
    // Check if bv is available
    const bvAvailable = await checkBvAvailable()
    if (!bvAvailable) {
      const errorResponse: GraphMetricsResult = {
        ok: false,
        error: 'bv binary not found or not executable',
        code: 'BV_NOT_FOUND',
      }
      return c.json(errorResponse, 503)
    }

    try {
      const result = await bvInsights()

      if (result.exitCode !== 0) {
        // Check for common error cases
        if (result.stderr.includes('no beads') || result.stderr.includes('not initialized')) {
          const errorResponse: GraphMetricsResult = {
            ok: false,
            error: 'No beads database found. Initialize with "bd init".',
            code: 'NO_BEADS',
          }
          return c.json(errorResponse, 404)
        }

        const errorResponse: GraphMetricsResult = {
          ok: false,
          error: result.stderr || 'bv command failed',
          code: 'BV_ERROR',
        }
        return c.json(errorResponse, 500)
      }

      // Parse JSON output
      let rawData: Record<string, unknown>
      try {
        rawData = JSON.parse(result.stdout)
      } catch (parseError) {
        const errorResponse: GraphMetricsResult = {
          ok: false,
          error: `Failed to parse bv output: ${parseError instanceof Error ? parseError.message : 'unknown error'}`,
          code: 'PARSE_ERROR',
        }
        return c.json(errorResponse, 500)
      }

      const metrics = parseInsightsToMetrics(rawData)
      const response: GraphMetricsResult = {
        ok: true,
        metrics,
      }

      return c.json(response)
    } catch (error) {
      const errorResponse: GraphMetricsResult = {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        code: 'BV_ERROR',
      }
      return c.json(errorResponse, 500)
    }
  })

  .get('/graph/export', async (c) => {
    // Check if bv is available
    const bvAvailable = await checkBvAvailable()
    if (!bvAvailable) {
      const errorResponse: GraphExportResult = {
        ok: false,
        error: 'bv binary not found or not executable',
        code: 'BV_NOT_FOUND',
      }
      return c.json(errorResponse, 503)
    }

    const format = c.req.query('format') ?? 'json'
    if (!['json', 'dot', 'mermaid'].includes(format)) {
      const errorResponse: GraphExportResult = {
        ok: false,
        error: `Invalid format: ${format}. Use json, dot, or mermaid.`,
        code: 'BV_ERROR',
      }
      return c.json(errorResponse, 400)
    }

    try {
      const result = await bvGraph(format as 'json' | 'dot' | 'mermaid')

      if (result.exitCode !== 0) {
        // Check for common error cases
        if (result.stderr.includes('no beads') || result.stderr.includes('not initialized')) {
          const errorResponse: GraphExportResult = {
            ok: false,
            error: 'No beads database found. Initialize with "bd init".',
            code: 'NO_BEADS',
          }
          return c.json(errorResponse, 404)
        }

        const errorResponse: GraphExportResult = {
          ok: false,
          error: result.stderr || 'bv command failed',
          code: 'BV_ERROR',
        }
        return c.json(errorResponse, 500)
      }

      // Parse JSON output
      let rawData: Record<string, unknown>
      try {
        rawData = JSON.parse(result.stdout)
      } catch (parseError) {
        const errorResponse: GraphExportResult = {
          ok: false,
          error: `Failed to parse bv output: ${parseError instanceof Error ? parseError.message : 'unknown error'}`,
          code: 'PARSE_ERROR',
        }
        return c.json(errorResponse, 500)
      }

      const graphExport = parseGraphExport(rawData)
      const response: GraphExportResult = {
        ok: true,
        graph: graphExport,
      }

      return c.json(response)
    } catch (error) {
      const errorResponse: GraphExportResult = {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        code: 'BV_ERROR',
      }
      return c.json(errorResponse, 500)
    }
  })

export { graph }
