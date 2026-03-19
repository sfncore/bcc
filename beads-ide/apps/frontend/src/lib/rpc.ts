/**
 * Hono RPC client for type-safe API calls.
 *
 * Provides a typed client generated from the backend's AppType.
 * Response types are automatically inferred from route handlers.
 *
 * Usage:
 *   import { api } from '@/lib/rpc'
 *   const res = await api.beads.$get()
 *   const data = await res.json() // fully typed
 *
 * For query params (GET routes):
 *   const res = await api.beads.$get({ query: { status: 'open' } })
 *
 * For body (POST/PUT routes):
 *   const res = await api.sling.$post({ json: { formula_path: '...', target: '...' } })
 */
import type { AppType } from '@beads-ide/backend'
import { hc } from 'hono/client'
export type { InferResponseType, InferRequestType } from 'hono/client'

// Vite proxy in dev, direct API subdomain in production
const baseUrl = import.meta.env.PROD
  ? 'https://api-bcc.startupfactory.services'
  : ''

export const client = hc<AppType>(baseUrl)

// Convenience: direct access to /api/* routes
export const api = client.api
