import type { BeadApiError, BeadFull, BeadShowResponse, BeadsListResponse } from '@beads-ide/shared'
/**
 * Bead routes for Beads IDE backend.
 * Proxies bd CLI commands to expose bead data to the frontend.
 */
import { Hono } from 'hono'
import { runCli, validateBeadId } from '../cli.js'

/**
 * Parse bd JSON output into BeadFull array.
 * Handles potential parsing errors gracefully.
 */
function parseBeadList(stdout: string): BeadFull[] {
  if (!stdout.trim()) {
    return []
  }
  try {
    const parsed = JSON.parse(stdout)
    if (Array.isArray(parsed)) {
      return parsed as BeadFull[]
    }
    return []
  } catch {
    throw new Error('Failed to parse bead list JSON')
  }
}

/**
 * Parse bd show JSON output into BeadFull.
 * bd show returns an array with a single bead.
 */
function parseBeadShow(stdout: string): BeadFull | null {
  if (!stdout.trim()) {
    return null
  }
  try {
    const parsed = JSON.parse(stdout)
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed[0] as BeadFull
    }
    return null
  } catch {
    throw new Error('Failed to parse bead JSON')
  }
}

/**
 * Build bd list arguments from query parameters.
 * Supported filters: status, type, priority, assignee, owner, labels
 */
function buildListArgs(query: Record<string, string | string[] | undefined>): string[] {
  const args: string[] = ['list', '--json']

  // Status filter
  if (query.status && typeof query.status === 'string') {
    args.push('--status', query.status)
  }

  // Type filter
  if (query.type && typeof query.type === 'string') {
    args.push('--type', query.type)
  }

  // Assignee filter
  if (query.assignee && typeof query.assignee === 'string') {
    args.push('--assignee', query.assignee)
  }

  // Owner filter
  if (query.owner && typeof query.owner === 'string') {
    args.push('--owner', query.owner)
  }

  // Priority filter (as string since query params are strings)
  if (query.priority && typeof query.priority === 'string') {
    args.push('--priority', query.priority)
  }

  // Labels filter (can be repeated)
  if (query.labels) {
    const labels = Array.isArray(query.labels) ? query.labels : [query.labels]
    for (const label of labels) {
      args.push('--label', label)
    }
  }

  return args
}

/**
 * Create error response helper.
 */
function errorResponse(error: string, code: string, details?: string): BeadApiError {
  return { error, code, details }
}

const beads = new Hono()

  .get('/beads', async (c) => {
    try {
      const query = c.req.query()
      const args = buildListArgs(query)

      const result = await runCli('bd', args)

      if (result.exitCode !== 0) {
        const errMessage = result.stderr.trim() || 'bd list command failed'
        return c.json(errorResponse('Command failed', 'BD_ERROR', errMessage), 500)
      }

      const beadsList = parseBeadList(result.stdout)

      const response: BeadsListResponse = {
        beads: beadsList,
        count: beadsList.length,
      }

      return c.json(response)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return c.json(errorResponse('Internal server error', 'INTERNAL_ERROR', message), 500)
    }
  })

  .get('/beads/:id', async (c) => {
    const id = c.req.param('id')

    try {
      // Validate bead ID for safety
      validateBeadId(id)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid bead ID'
      return c.json(errorResponse('Invalid bead ID', 'INVALID_ID', message), 400)
    }

    try {
      const result = await runCli('bd', ['show', id, '--json'])

      if (result.exitCode !== 0) {
        // Check if it's a "not found" error (bd returns JSON with error field)
        const output = result.stdout.trim() || result.stderr.trim()
        if (
          output.includes('not found') ||
          output.includes('no issue found') ||
          output.includes('no issues found') ||
          output.includes('No bead')
        ) {
          return c.json(errorResponse('Bead not found', 'NOT_FOUND', `Bead '${id}' not found`), 404)
        }

        const errMessage = result.stderr.trim() || result.stdout.trim() || 'bd show command failed'
        return c.json(errorResponse('Command failed', 'BD_ERROR', errMessage), 500)
      }

      const bead = parseBeadShow(result.stdout)

      if (!bead) {
        return c.json(errorResponse('Bead not found', 'NOT_FOUND', `Bead '${id}' not found`), 404)
      }

      const response: BeadShowResponse = {
        bead,
      }

      return c.json(response)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return c.json(errorResponse('Internal server error', 'INTERNAL_ERROR', message), 500)
    }
  })

export { beads }
