/**
 * Hook for fetching beads list from GET /api/beads.
 */
import type { BeadFull, BeadsListResponse } from '@beads-ide/shared'
import { useCallback, useEffect, useState } from 'react'

/** Filter parameters for bead queries */
export interface BeadFilters {
  status?: string
  type?: string
  priority?: string
  labels?: string[]
}

/** Return value of the useBeads hook */
export interface UseBeadsReturn {
  beads: BeadFull[]
  count: number
  isLoading: boolean
  error: Error | null
  refresh: () => void
}

const API_BASE = '' // Use relative URLs for Vite proxy

/**
 * Build query string from filter params.
 */
function buildQueryString(filters: BeadFilters): string {
  const params = new URLSearchParams()

  if (filters.status) params.set('status', filters.status)
  if (filters.type) params.set('type', filters.type)
  if (filters.priority) params.set('priority', filters.priority)
  if (filters.labels) {
    for (const label of filters.labels) {
      params.append('labels', label)
    }
  }

  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

/**
 * Fetch beads from the backend API.
 */
async function fetchBeads(filters: BeadFilters): Promise<BeadsListResponse> {
  const qs = buildQueryString(filters)
  const response = await fetch(`${API_BASE}/api/beads${qs}`)

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Failed to fetch beads: ${response.status} ${text}`)
  }

  return (await response.json()) as BeadsListResponse
}

/**
 * Hook for fetching a filtered list of beads.
 * Automatically refetches when filters change.
 */
export function useBeads(filters: BeadFilters = {}): UseBeadsReturn {
  const [beads, setBeads] = useState<BeadFull[]>([])
  const [count, setCount] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  // Serialize filters for dependency tracking
  const filterKey = JSON.stringify(filters)

  const doFetch = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const result = await fetchBeads(filters)
      setBeads(result.beads)
      setCount(result.count)
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)))
      setBeads([])
      setCount(0)
    } finally {
      setIsLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey])

  useEffect(() => {
    doFetch()
  }, [doFetch])

  return {
    beads,
    count,
    isLoading,
    error,
    refresh: doFetch,
  }
}
