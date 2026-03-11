import type { CookRequest, CookResult } from '@beads-ide/shared'
/**
 * Hook for cooking formulas with debounced triggering.
 * Re-cooks automatically when inputs change.
 * Uses centralized API client for connection state tracking and error classification.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { apiPost } from '../lib/api'

/** Configuration for the cook hook */
export interface UseCookOptions {
  /** Debounce delay in milliseconds (default: 500) */
  debounceMs?: number
  /** Cooking mode: compile (keep placeholders) or runtime (substitute vars) */
  mode?: 'compile' | 'runtime'
  /** Variable substitutions */
  vars?: Record<string, string>
}

/** Return value of the cook hook */
export interface UseCookReturn {
  /** Current cook result */
  result: CookResult | null
  /** Whether a cook is in progress */
  isLoading: boolean
  /** Error from the last cook attempt */
  error: Error | null
  /** Manually trigger a cook */
  cook: () => void
}

/**
 * Hook for cooking formulas with automatic debounced re-cooking.
 *
 * @param formulaPath - Path to the formula file
 * @param options - Configuration options
 * @returns Cook result, loading state, error, and manual cook trigger
 */
export function useCook(formulaPath: string | null, options: UseCookOptions = {}): UseCookReturn {
  const { debounceMs = 500, mode = 'compile', vars } = options

  const [result, setResult] = useState<CookResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  // Track the latest request to avoid race conditions
  const requestIdRef = useRef(0)
  const timeoutRef = useRef<number | undefined>(undefined)

  const doCook = useCallback(async () => {
    if (!formulaPath) {
      setResult(null)
      return
    }

    const requestId = ++requestIdRef.current
    setIsLoading(true)
    setError(null)

    try {
      const request: CookRequest = {
        formula_path: formulaPath,
        mode,
        vars,
      }
      const { data, error: apiError } = await apiPost<CookResult, CookRequest>(
        '/api/cook',
        request
      )

      // Only update if this is still the latest request
      if (requestId === requestIdRef.current) {
        if (apiError) {
          setError(new Error(apiError.details || apiError.message))
          setResult(null)
        } else {
          setResult(data)
          setError(null)
        }
      }
    } catch (err) {
      if (requestId === requestIdRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)))
        setResult(null)
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false)
      }
    }
  }, [formulaPath, mode, vars])

  // Debounced auto-cook on input changes
  useEffect(() => {
    if (!formulaPath) {
      setResult(null)
      return
    }

    // Clear any pending debounce
    if (timeoutRef.current !== undefined) {
      clearTimeout(timeoutRef.current)
    }

    // Schedule debounced cook
    timeoutRef.current = window.setTimeout(() => {
      doCook()
    }, debounceMs)

    return () => {
      if (timeoutRef.current !== undefined) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [formulaPath, debounceMs, doCook])

  // Manual cook trigger (no debounce)
  const cook = useCallback(() => {
    if (timeoutRef.current !== undefined) {
      clearTimeout(timeoutRef.current)
    }
    doCook()
  }, [doCook])

  return { result, isLoading, error, cook }
}
