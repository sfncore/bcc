import type { BurnRequest, BurnResult, PourRequest, PourResult } from '@beads-ide/shared'
/**
 * Hook for pouring formulas and managing molecule lifecycle.
 * Provides pour (create) and burn (rollback) operations.
 * Uses centralized API client for connection state tracking and error classification.
 */
import { useCallback, useState } from 'react'
import { apiPost } from '../lib/api'

/** Return value of the pour hook */
export interface UsePourReturn {
  /** Pour a formula to create real beads */
  pour: (request: Omit<PourRequest, 'dry_run'>) => Promise<PourResult>
  /** Preview what would be created (dry run) */
  preview: (request: Omit<PourRequest, 'dry_run'>) => Promise<PourResult>
  /** Burn (delete) a molecule - rollback operation */
  burn: (moleculeId: string, force?: boolean) => Promise<BurnResult>
  /** Whether an operation is in progress */
  isLoading: boolean
  /** Last operation result */
  result: PourResult | BurnResult | null
  /** Error from the last operation */
  error: Error | null
  /** Clear the last result/error */
  reset: () => void
}

/**
 * Hook for pouring formulas and managing molecule lifecycle.
 *
 * @returns Pour operations, state, and error handling
 */
export function usePour(): UsePourReturn {
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<PourResult | BurnResult | null>(null)
  const [error, setError] = useState<Error | null>(null)

  const pour = useCallback(async (request: Omit<PourRequest, 'dry_run'>): Promise<PourResult> => {
    setIsLoading(true)
    setError(null)

    try {
      const fullRequest: PourRequest = { ...request, dry_run: false }
      const { data, error: apiError } = await apiPost<PourResult, PourRequest>(
        '/api/pour',
        fullRequest
      )

      if (apiError) {
        const pourError = new Error(apiError.details || apiError.message)
        setError(pourError)
        throw pourError
      }

      const pourResult = data as PourResult
      setResult(pourResult)
      return pourResult
    } catch (err) {
      const pourError = err instanceof Error ? err : new Error(String(err))
      setError(pourError)
      throw pourError
    } finally {
      setIsLoading(false)
    }
  }, [])

  const preview = useCallback(
    async (request: Omit<PourRequest, 'dry_run'>): Promise<PourResult> => {
      setIsLoading(true)
      setError(null)

      try {
        const fullRequest: PourRequest = { ...request, dry_run: true }
        const { data, error: apiError } = await apiPost<PourResult, PourRequest>(
          '/api/pour',
          fullRequest
        )

        if (apiError) {
          const pourError = new Error(apiError.details || apiError.message)
          setError(pourError)
          throw pourError
        }

        const pourResult = data as PourResult
        setResult(pourResult)
        return pourResult
      } catch (err) {
        const pourError = err instanceof Error ? err : new Error(String(err))
        setError(pourError)
        throw pourError
      } finally {
        setIsLoading(false)
      }
    },
    []
  )

  const burn = useCallback(async (moleculeId: string, force = false): Promise<BurnResult> => {
    setIsLoading(true)
    setError(null)

    try {
      const burnRequest: BurnRequest = {
        molecule_id: moleculeId,
        force,
        dry_run: false,
      }
      const { data, error: apiError } = await apiPost<BurnResult, BurnRequest>(
        '/api/burn',
        burnRequest
      )

      if (apiError) {
        const burnError = new Error(apiError.details || apiError.message)
        setError(burnError)
        throw burnError
      }

      const burnResult = data as BurnResult
      setResult(burnResult)
      return burnResult
    } catch (err) {
      const burnError = err instanceof Error ? err : new Error(String(err))
      setError(burnError)
      throw burnError
    } finally {
      setIsLoading(false)
    }
  }, [])

  const reset = useCallback(() => {
    setResult(null)
    setError(null)
  }, [])

  return {
    pour,
    preview,
    burn,
    isLoading,
    result,
    error,
    reset,
  }
}
