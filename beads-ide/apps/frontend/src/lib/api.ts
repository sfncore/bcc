/**
 * Centralized API client with connection error detection and offline mode signaling.
 * All fetch errors flow through this module which returns ApiResponse<T> with { data, error } envelope.
 */
import { toast } from 'sonner'

/** API base URL - Vite proxy in dev, direct API subdomain in production */
export const API_BASE = import.meta.env.PROD
  ? 'https://api-bcc.startupfactory.services'
  : ''

/** Connection state for the backend */
export type ConnectionState = 'connected' | 'disconnected' | 'degraded'

/** Error types for categorizing failures */
export type ApiErrorType =
  | 'network' // Backend not running / network error
  | 'server' // 5xx errors
  | 'client' // 4xx errors
  | 'timeout' // Request timeout
  | 'parse' // JSON parse error
  | 'unknown'

/** Structured API error with categorization */
export interface ApiError {
  type: ApiErrorType
  message: string
  status?: number
  details?: string
  retryable: boolean
}

/** API response envelope - always returns either data or error */
export interface ApiResponse<T> {
  data: T | null
  error: ApiError | null
}

/** Connection state subscribers */
type ConnectionStateListener = (state: ConnectionState) => void
const connectionListeners = new Set<ConnectionStateListener>()
let currentConnectionState: ConnectionState = 'connected'

/**
 * Subscribe to connection state changes.
 * Returns unsubscribe function.
 */
export function onConnectionStateChange(listener: ConnectionStateListener): () => void {
  connectionListeners.add(listener)
  // Immediately notify with current state
  listener(currentConnectionState)
  return () => connectionListeners.delete(listener)
}

/**
 * Get current connection state.
 */
export function getConnectionState(): ConnectionState {
  return currentConnectionState
}

/**
 * Update connection state and notify subscribers.
 */
function setConnectionState(state: ConnectionState): void {
  if (state !== currentConnectionState) {
    currentConnectionState = state
    for (const listener of connectionListeners) {
      listener(state)
    }
  }
}

/**
 * Classify an error into an ApiError type.
 */
function classifyError(error: unknown, response?: Response): ApiError {
  // Network errors (backend not running)
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return {
      type: 'network',
      message: 'Cannot connect to backend server',
      details: 'The backend server is not running or unreachable.',
      retryable: true,
    }
  }

  // Timeout
  if (error instanceof DOMException && error.name === 'AbortError') {
    return {
      type: 'timeout',
      message: 'Request timed out',
      details: 'The server took too long to respond.',
      retryable: true,
    }
  }

  // HTTP errors with response
  if (response) {
    const status = response.status

    if (status >= 500) {
      return {
        type: 'server',
        message: `Server error (${status})`,
        status,
        details: 'The server encountered an internal error.',
        retryable: true,
      }
    }

    if (status >= 400) {
      return {
        type: 'client',
        message: `Request failed (${status})`,
        status,
        retryable: false,
      }
    }
  }

  // Parse errors
  if (error instanceof SyntaxError) {
    return {
      type: 'parse',
      message: 'Invalid response format',
      details: 'The server returned invalid JSON.',
      retryable: false,
    }
  }

  // Unknown errors
  return {
    type: 'unknown',
    message: error instanceof Error ? error.message : 'An unknown error occurred',
    retryable: false,
  }
}

/** Options for API requests */
export interface FetchOptions extends RequestInit {
  /** Timeout in milliseconds (default: 30000) */
  timeout?: number
  /** Show toast on error (default: false) */
  showToast?: boolean
  /** Custom toast message */
  toastMessage?: string
}

/**
 * Make an API request with error handling.
 * Returns ApiResponse<T> envelope - never throws.
 *
 * @example
 * const { data, error } = await apiFetch<Formula[]>('/api/formulas');
 * if (error) {
 *   // Handle error
 *   return;
 * }
 * // Use data
 */
export async function apiFetch<T>(
  endpoint: string,
  options: FetchOptions = {}
): Promise<ApiResponse<T>> {
  const { timeout = 30000, showToast = false, toastMessage, ...fetchOptions } = options

  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  let response: Response | undefined

  try {
    response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    // Connection successful
    setConnectionState('connected')

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      const error = classifyError(null, response)
      error.details = text || error.details

      if (showToast) {
        toast.error(toastMessage || error.message)
      }

      return { data: null, error }
    }

    const data = await response.json()

    // Handle backend error envelope (if backend returns { ok: false, error: ... })
    if (data && typeof data === 'object' && 'ok' in data && !data.ok) {
      const error: ApiError = {
        type: 'server',
        message: data.error || 'Operation failed',
        details: data.stderr,
        retryable: false,
      }

      if (showToast) {
        toast.error(toastMessage || error.message)
      }

      return { data: null, error }
    }

    return { data: data as T, error: null }
  } catch (err) {
    clearTimeout(timeoutId)

    const error = classifyError(err, response)

    // Network errors indicate disconnected state
    if (error.type === 'network') {
      setConnectionState('disconnected')
    }

    if (showToast) {
      toast.error(toastMessage || error.message)
    }

    return { data: null, error }
  }
}

/**
 * Check if the backend is reachable.
 * Updates connection state based on result.
 */
export async function checkHealth(): Promise<boolean> {
  const { error } = await apiFetch<{ status: string }>('/api/health', {
    timeout: 5000,
  })

  if (error) {
    setConnectionState(error.type === 'network' ? 'disconnected' : 'degraded')
    return false
  }

  setConnectionState('connected')
  return true
}

/**
 * Convenience method for POST requests.
 */
export async function apiPost<T, B = unknown>(
  endpoint: string,
  body: B,
  options: FetchOptions = {}
): Promise<ApiResponse<T>> {
  return apiFetch<T>(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    body: JSON.stringify(body),
    ...options,
  })
}

/**
 * Convenience method for PUT requests.
 */
export async function apiPut<T, B = unknown>(
  endpoint: string,
  body: B,
  options: FetchOptions = {}
): Promise<ApiResponse<T>> {
  return apiFetch<T>(endpoint, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    body: JSON.stringify(body),
    ...options,
  })
}

/** Response from formula save endpoint */
export interface FormulaSaveResponse {
  ok: boolean
  name: string
  path: string
}

/**
 * Save formula content to disk.
 * Calls PUT /api/formulas/:name with the content.
 *
 * @param name - Formula name (without extension)
 * @param content - Formula TOML content
 * @throws Error if save fails
 */
export async function saveFormula(name: string, content: string): Promise<void> {
  const { error } = await apiPut<FormulaSaveResponse>(`/api/formulas/${encodeURIComponent(name)}`, {
    content,
  })

  if (error) {
    throw new Error(error.details || error.message)
  }
}

/**
 * Show a toast for sling failures with retry option.
 */
export function showSlingError(error: ApiError, onRetry?: () => void): void {
  if (onRetry && error.retryable) {
    toast.error(error.message, {
      description: error.details,
      action: {
        label: 'Retry',
        onClick: onRetry,
      },
    })
  } else {
    toast.error(error.message, {
      description: error.details,
    })
  }
}
