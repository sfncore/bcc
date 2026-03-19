/**
 * Cross-rig bead routes for Beads IDE backend.
 * Queries multiple Dolt databases directly via SQL to provide
 * a unified view of beads and wisps across all rigs.
 */
import { Hono } from 'hono'
import mysql from 'mysql2/promise'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { getWorkspaceRoot } from '../config.js'

const DOLT_HOST = process.env.DOLT_HOST ?? '127.0.0.1'
const DOLT_PORT = Number(process.env.DOLT_PORT ?? '3307')
const DOLT_USER = process.env.DOLT_USER ?? 'root'

/** System databases to skip */
const SKIP_DBS = new Set(['information_schema', 'mysql'])

/**
 * Parse routes.jsonl to get prefix-to-database mapping.
 */
function loadRoutes(): Map<string, string> {
  const routes = new Map<string, string>()
  const root = getWorkspaceRoot()
  const routesFile = resolve(root, '.beads', 'routes.jsonl')

  try {
    const lines = readFileSync(routesFile, 'utf-8').split('\n').filter(Boolean)
    for (const line of lines) {
      const route = JSON.parse(line)
      if (route.prefix) {
        const dbName = route.prefix.replace(/-$/, '')
        routes.set(dbName, route.path)
      }
    }
  } catch {
    // Routes file not found or unreadable
  }

  return routes
}

async function getConnection(database: string) {
  return mysql.createConnection({
    host: DOLT_HOST,
    port: DOLT_PORT,
    user: DOLT_USER,
    database,
  })
}

async function hasTable(conn: mysql.Connection, tableName: string): Promise<boolean> {
  try {
    const [rows] = await conn.query(`SHOW TABLES LIKE '${tableName}'`)
    return (rows as any[]).length > 0
  } catch {
    return false
  }
}

/**
 * Build WHERE clause from query params.
 * Supports: status, type, assignee, priority, wisp_type, convoy, parent, search
 */
function buildWhereClause(query: Record<string, string | string[] | undefined>): string {
  const conditions: string[] = []

  if (query.status && typeof query.status === 'string') {
    conditions.push(`status = '${query.status.replace(/'/g, "''")}'`)
  }
  if (query.type && typeof query.type === 'string') {
    conditions.push(`issue_type = '${query.type.replace(/'/g, "''")}'`)
  }
  if (query.assignee && typeof query.assignee === 'string') {
    conditions.push(`assignee = '${query.assignee.replace(/'/g, "''")}'`)
  }
  if (query.priority && typeof query.priority === 'string') {
    conditions.push(`priority = ${parseInt(query.priority, 10)}`)
  }
  if (query.wisp_type && typeof query.wisp_type === 'string') {
    conditions.push(`wisp_type = '${query.wisp_type.replace(/'/g, "''")}'`)
  }
  // Convoy filter: only convoy-type issues
  if (query.convoy === 'true') {
    conditions.push(`issue_type = 'convoy'`)
  }
  // Exclude convoys
  if (query.convoy === 'false') {
    conditions.push(`issue_type != 'convoy'`)
  }
  // Parent filter: issues with a specific parent
  if (query.parent && typeof query.parent === 'string') {
    conditions.push(`id LIKE '${query.parent.replace(/'/g, "''")}%'`)
  }
  // Text search in title
  if (query.search && typeof query.search === 'string') {
    conditions.push(`title LIKE '%${query.search.replace(/'/g, "''").replace(/%/g, '\\%')}%'`)
  }
  // Exclude ephemeral/mol/wisp noise
  if (query.exclude_noise === 'true') {
    conditions.push(`id NOT LIKE '%-mol-%'`)
    conditions.push(`id NOT LIKE '%-wisp-%'`)
  }

  return conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : ''
}

/**
 * Get list of rig databases (cached per request).
 */
async function getRigDatabases(rigsFilter?: string[]): Promise<string[]> {
  const masterConn = await getConnection('information_schema')
  const [dbRows] = await masterConn.query('SELECT SCHEMA_NAME FROM SCHEMATA')
  await masterConn.end()

  return (dbRows as any[])
    .map((r: any) => r.SCHEMA_NAME)
    .filter((db: string) => !SKIP_DBS.has(db))
    .filter((db: string) => !rigsFilter || rigsFilter.includes(db))
}

/**
 * Query a table across multiple databases.
 */
async function queryAcrossRigs(
  databases: string[],
  tableName: string,
  whereClause: string,
  limit?: number,
): Promise<{ rows: any[]; rigStats: Record<string, number> }> {
  const allRows: any[] = []
  const rigStats: Record<string, number> = {}

  for (const db of databases) {
    let conn: mysql.Connection | null = null
    try {
      conn = await getConnection(db)
      if (!(await hasTable(conn, tableName))) {
        await conn.end()
        continue
      }

      const query = `SELECT * FROM ${tableName}${whereClause} ORDER BY updated_at DESC`
      const [rows] = await conn.query(query)
      const tagged = (rows as any[]).map((row: any) => ({
        ...row,
        _rig_db: db,
        _source: tableName,
      }))

      allRows.push(...tagged)
      rigStats[db] = tagged.length
      await conn.end()
    } catch {
      if (conn) await conn.end().catch(() => {})
    }
  }

  if (limit && allRows.length > limit) {
    return { rows: allRows.slice(0, limit), rigStats }
  }

  return { rows: allRows, rigStats }
}

const crossrig = new Hono()

  .get('/crossrig/beads', async (c) => {
    const query = c.req.query()
    const rigsFilter = query.rigs?.split(',')
    const limit = query.limit ? parseInt(query.limit, 10) : undefined

    try {
      const databases = await getRigDatabases(rigsFilter)
      const whereClause = buildWhereClause(query)
      const { rows, rigStats } = await queryAcrossRigs(databases, 'issues', whereClause, limit)

      return c.json({
        beads: rows,
        count: rows.length,
        rigs: rigStats,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return c.json({ error: 'Cross-rig query failed', code: 'CROSSRIG_ERROR', details: message }, 500)
    }
  })

  .get('/crossrig/convoys', async (c) => {
    const query = c.req.query()
    const limit = query.limit ? parseInt(query.limit, 10) : undefined

    try {
      const conn = await getConnection('hq')
      let sql = "SELECT * FROM issues WHERE issue_type = 'convoy'"

      if (query.status && typeof query.status === 'string') {
        sql += ` AND status = '${query.status.replace(/'/g, "''")}'`
      }
      if (query.search && typeof query.search === 'string') {
        sql += ` AND title LIKE '%${query.search.replace(/'/g, "''").replace(/%/g, '\\%')}%'`
      }

      sql += ' ORDER BY updated_at DESC'
      if (limit) sql += ` LIMIT ${limit}`

      const [rows] = await conn.query(sql)

      // For each convoy, get its tracked beads via dependencies
      const convoys = []
      for (const convoy of rows as any[]) {
        const [deps] = await conn.query(
          "SELECT depends_on_id, type FROM dependencies WHERE issue_id = ?",
          [convoy.id],
        )
        convoys.push({
          ...convoy,
          _rig_db: 'hq',
          tracked_beads: (deps as any[]).map((d: any) => ({
            id: d.depends_on_id,
            dep_type: d.type,
          })),
        })
      }

      await conn.end()

      return c.json({
        convoys,
        count: convoys.length,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return c.json({ error: 'Convoy query failed', code: 'CROSSRIG_ERROR', details: message }, 500)
    }
  })

  .get('/crossrig/wisps', async (c) => {
    const query = c.req.query()
    const rigsFilter = query.rigs?.split(',')
    const limit = query.limit ? parseInt(query.limit, 10) : undefined

    try {
      const databases = await getRigDatabases(rigsFilter)
      const whereClause = buildWhereClause(query)
      const { rows, rigStats } = await queryAcrossRigs(databases, 'wisps', whereClause, limit)

      return c.json({
        wisps: rows,
        count: rows.length,
        rigs: rigStats,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return c.json({ error: 'Cross-rig wisps query failed', code: 'CROSSRIG_ERROR', details: message }, 500)
    }
  })

  .get('/crossrig/all', async (c) => {
    const query = c.req.query()
    const rigsFilter = query.rigs?.split(',')
    const limit = query.limit ? parseInt(query.limit, 10) : undefined

    try {
      const databases = await getRigDatabases(rigsFilter)
      const whereClause = buildWhereClause(query)

      const [issuesResult, wispsResult] = await Promise.all([
        queryAcrossRigs(databases, 'issues', whereClause, undefined),
        queryAcrossRigs(databases, 'wisps', whereClause, undefined),
      ])

      const combined = [...issuesResult.rows, ...wispsResult.rows]
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())

      const limited = limit ? combined.slice(0, limit) : combined

      return c.json({
        items: limited,
        count: limited.length,
        issues_count: issuesResult.rows.length,
        wisps_count: wispsResult.rows.length,
        rigs: {
          issues: issuesResult.rigStats,
          wisps: wispsResult.rigStats,
        },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return c.json({ error: 'Cross-rig query failed', code: 'CROSSRIG_ERROR', details: message }, 500)
    }
  })

  .get('/crossrig/graph', async (c) => {
    const query = c.req.query()
    const rigsFilter = query.rigs?.split(',')
    const excludeNoise = query.exclude_noise === 'true'

    try {
      const databases = await getRigDatabases(rigsFilter)
      const nodes: any[] = []
      const edges: any[] = []
      const rigStats: Record<string, number> = {}

      for (const db of databases) {
        let conn: mysql.Connection | null = null
        try {
          conn = await getConnection(db)
          if (!(await hasTable(conn, 'issues'))) {
            await conn.end()
            continue
          }

          // Fetch issues
          let issuesSql = 'SELECT id, title, status, issue_type, priority, labels FROM issues'
          if (excludeNoise) {
            issuesSql += " WHERE id NOT LIKE '%-mol-%' AND id NOT LIKE '%-wisp-%'"
          }
          const [issueRows] = await conn.query(issuesSql)
          const issues = issueRows as any[]

          for (const issue of issues) {
            nodes.push({
              id: issue.id,
              title: issue.title,
              status: issue.status,
              type: issue.issue_type,
              priority: issue.priority,
              labels: issue.labels ? (typeof issue.labels === 'string' ? JSON.parse(issue.labels) : issue.labels) : [],
              _rig_db: db,
            })
          }
          rigStats[db] = issues.length

          // Fetch dependencies
          if (await hasTable(conn, 'dependencies')) {
            const [depRows] = await conn.query('SELECT issue_id, depends_on_id, type FROM dependencies')
            for (const dep of depRows as any[]) {
              edges.push({
                from: dep.depends_on_id,
                to: dep.issue_id,
                type: dep.type,
                _rig_db: db,
              })
            }
          }

          await conn.end()
        } catch {
          if (conn) await conn.end().catch(() => {})
        }
      }

      return c.json({
        nodes,
        edges,
        nodeCount: nodes.length,
        edgeCount: edges.length,
        rigs: rigStats,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return c.json({ error: 'Cross-rig graph query failed', code: 'CROSSRIG_ERROR', details: message }, 500)
    }
  })

  .get('/crossrig/databases', async (c) => {
    try {
      const databases = await getRigDatabases()
      const routes = loadRoutes()
      const result: any[] = []

      for (const db of databases) {
        let conn: mysql.Connection | null = null
        try {
          conn = await getConnection(db)
          const hasIssues = await hasTable(conn, 'issues')
          const hasWisps = await hasTable(conn, 'wisps')

          if (!hasIssues && !hasWisps) {
            await conn.end()
            continue
          }

          const entry: any = {
            database: db,
            prefix: `${db}-`,
            path: routes.get(db) ?? null,
          }

          if (hasIssues) {
            const [countRows] = await conn.query(
              'SELECT COUNT(*) as total, SUM(CASE WHEN status = "open" THEN 1 ELSE 0 END) as open_count, SUM(CASE WHEN status = "in_progress" THEN 1 ELSE 0 END) as in_progress_count FROM issues',
            )
            const counts = (countRows as any[])[0]
            entry.issues = { total: counts.total, open: counts.open_count, in_progress: counts.in_progress_count }
          }

          if (hasWisps) {
            const [wispRows] = await conn.query(
              'SELECT COUNT(*) as total, SUM(CASE WHEN status = "open" THEN 1 ELSE 0 END) as open_count FROM wisps',
            )
            const wispCounts = (wispRows as any[])[0]
            entry.wisps = { total: wispCounts.total, open: wispCounts.open_count }
          }

          result.push(entry)
          await conn.end()
        } catch {
          if (conn) await conn.end().catch(() => {})
        }
      }

      return c.json({ databases: result, count: result.length })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return c.json({ error: 'Database listing failed', code: 'CROSSRIG_ERROR', details: message }, 500)
    }
  })

export { crossrig }
