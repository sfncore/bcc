import type { SlingRequest, SlingResult } from '@beads-ide/shared'
/**
 * Hook for slinging formulas to agents/crews.
 * Provides state management for the sling dialog and API calls.
 * Shows toast notifications on failure with retry option.
 * Uses centralized API client for connection state tracking and error classification.
 */
import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { type ApiError, apiPost, showSlingError } from '../lib/api'

/** Return value of the sling hook */
export interface UseSlingReturn {
  /** Current sling result */
  result: SlingResult | null
  /** Whether a sling is in progress */
  isLoading: boolean
  /** Error from the last sling attempt */
  error: Error | null
  /** Execute the sling */
  sling: (request: SlingRequest) => Promise<SlingResult>
  /** Reset state */
  reset: () => void
}

/**
 * Hook for slinging formulas to agents/crews.
 *
 * @returns Sling state and controls
 */
export function useSling(): UseSlingReturn {
  const [result, setResult] = useState<SlingResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const sling = useCallback(async (request: SlingRequest): Promise<SlingResult> => {
    setIsLoading(true)
    setError(null)

    try {
      const { data, error: apiError } = await apiPost<SlingResult, SlingRequest>(
        '/api/sling',
        request
      )

      if (apiError) {
        const slingError = new Error(apiError.details || apiError.message)
        setError(slingError)
        // Use centralized sling error display with retry
        showSlingError(apiError, () => sling(request))
        const failedResult: SlingResult = {
          ok: false,
          error: apiError.message,
        }
        setResult(failedResult)
        return failedResult
      }

      const slingResult = data as SlingResult
      setResult(slingResult)

      if (!slingResult.ok) {
        const slingError = new Error(slingResult.error || 'Sling failed')
        setError(slingError)
        // Show toast with error details and retry option
        const errorObj: ApiError = {
          type: 'server',
          message: 'Sling failed',
          details: slingResult.stderr || slingResult.error || 'Unknown error',
          retryable: true,
        }
        showSlingError(errorObj, () => sling(request))
      }

      return slingResult
    } catch (err) {
      const slingError = err instanceof Error ? err : new Error(String(err))
      setError(slingError)
      toast.error('Sling request failed', {
        description: slingError.message,
        action: {
          label: 'Retry',
          onClick: () => sling(request),
        },
      })
      const failedResult: SlingResult = {
        ok: false,
        error: slingError.message,
      }
      setResult(failedResult)
      return failedResult
    } finally {
      setIsLoading(false)
    }
  }, [])

  const reset = useCallback(() => {
    setResult(null)
    setError(null)
    setIsLoading(false)
  }, [])

  return { result, isLoading, error, sling, reset }
}
