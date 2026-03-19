import type { Placeholder } from '@beads-ide/shared'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { beads } from './routes/beads.js'
import { crossrig } from './routes/crossrig.js'
import { cook } from './routes/cook.js'
import { formulas } from './routes/formulas.js'
import { graph } from './routes/graph.js'
import { health } from './routes/health.js'
import { pour } from './routes/pour.js'
import { sling } from './routes/sling.js'
import { workspace } from './routes/workspace.js'

const app = new Hono()

// CORS for production frontend (Cloudflare Pages)
app.use('/api/*', cors({
  origin: ['https://bcc.startupfactory.services', 'http://127.0.0.1:5173'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowHeaders: ['Content-Type'],
}))

// Root endpoint
app.get('/', (c) => {
  const item: Placeholder = { id: 'beads-ide' }
  return c.json({ message: 'Beads IDE API', id: item.id })
})

// Register API routes — chained for Hono RPC type inference
const routes = app
  .route('/api', health)
  .route('/api', beads)
  .route('/api', graph)
  .route('/api', cook)
  .route('/api', formulas)
  .route('/api', sling)
  .route('/api', pour)
  .route('/api', workspace)
  .route('/api', crossrig)

// Export the app type for Hono RPC client (hc)
export type AppType = typeof routes

// Start server bound to localhost only (security requirement)
serve({
  fetch: app.fetch,
  hostname: '127.0.0.1',
  port: 3001,
})

console.log('Server running on http://127.0.0.1:3001')
