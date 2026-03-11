/**
 * Hook for fetching a single bead by ID.
 * Uses centralized API client for connection state tracking and error classification.
 */
import type { BeadFull, BeadShowResponse } from '@beads-ide/shared'
import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../lib/api'

/** Return value of the useBead hook */
export interface UseBeadReturn {
  /** The fetched bead, or null if not loaded */
  bead: BeadFull | null
  /** Whether the bead is currently loading */
  isLoading: boolean
  /** Error from the last fetch attempt */
  error: Error | null
  /** Manually refresh the bead */
  refresh: () => void
}

/**
 * Hook for fetching a single bead by ID.
 * Automatically fetches when beadId changes.
 *
 * @param beadId - The ID of the bead to fetch, or null to clear
 * @returns Bead data, loading state, error, and refresh function
 */
export function useBead(beadId: string | null): UseBeadReturn {
  const [bead, setBead] = useState<BeadFull | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const doFetch = useCallback(async () => {
    if (!beadId) {
      setBead(null)
      setIsLoading(false)
      setError(null)
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const { data, error: apiError } = await apiFetch<BeadShowResponse>(
        `/api/beads/${encodeURIComponent(beadId)}`
      )

      if (apiError) {
        const message =
          apiError.status === 404
            ? `Bead '${beadId}' not found`
            : apiError.details || apiError.message
        throw new Error(message)
      }

      setBead(data?.bead ?? null)
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)))
      setBead(null)
    } finally {
      setIsLoading(false)
    }
  }, [beadId])

  // Fetch when beadId changes
  useEffect(() => {
    doFetch()
  }, [doFetch])

  return {
    bead,
    isLoading,
    error,
    refresh: doFetch,
  }
}
