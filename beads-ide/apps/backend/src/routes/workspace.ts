import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import type {
  TreeError,
  TreeNode,
  TreeResponse,
  WorkspaceError,
  WorkspaceInitRequest,
  WorkspaceInitResponse,
  WorkspaceOpenRequest,
  WorkspaceOpenResponse,
  WorkspaceStateResponse,
} from '@beads-ide/shared'
import { Hono } from 'hono'
import { getConfig, getFormulaSearchPaths, getWorkspaceRoot, setWorkspaceRoot } from '../config.js'

const NODE_LIMIT = 500

/**
 * Directories to skip during tree scanning.
 */
const PRUNE_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  'dist',
  '__pycache__',
  '.venv',
  'target',
])

/**
 * Count formula files in search paths.
 */
function countFormulas(searchPaths: string[]): number {
  let count = 0
  for (const searchPath of searchPaths) {
    try {
      const entries = readdirSync(searchPath)
      for (const entry of entries) {
        if (entry.endsWith('.formula.toml') || entry.endsWith('.formula.json')) {
          count++
        }
      }
    } catch {
      // Directory doesn't exist or can't be read
    }
  }
  return count
}

/**
 * Recursively scan a directory into a tree structure.
 * Prunes empty directories and respects node limit.
 */
async function scanTree(dirPath: string, counter: { count: number }): Promise<TreeNode[]> {
  if (counter.count >= NODE_LIMIT) return []

  let entries: string[]
  try {
    entries = await readdir(dirPath)
  } catch {
    return []
  }

  entries.sort()
  const nodes: TreeNode[] = []

  for (const entry of entries) {
    if (counter.count >= NODE_LIMIT) break
    if (PRUNE_DIRS.has(entry) || entry.startsWith('.')) continue

    const fullPath = join(dirPath, entry)
    let entryStat: Awaited<ReturnType<typeof stat>> | null = null
    try {
      entryStat = await stat(fullPath)
    } catch {
      continue
    }

    if (entryStat.isDirectory()) {
      const children = await scanTree(fullPath, counter)
      // Prune empty directories
      if (children.length > 0) {
        counter.count++
        nodes.push({
          name: entry,
          path: fullPath,
          type: 'directory',
          children,
        })
      }
    } else if (entry.endsWith('.formula.toml') || entry.endsWith('.formula.json')) {
      counter.count++
      nodes.push({
        name: entry,
        path: fullPath,
        type: 'formula',
        formulaName: entry.replace(/\.formula\.(toml|json)$/, ''),
      })
    }
  }

  return nodes
}

/**
 * Browse entry for directory listing.
 */
interface BrowseEntry {
  name: string
  path: string
  type: 'directory' | 'file'
}

const workspace = new Hono()

  .get('/workspace', (c) => {
    try {
      const config = getConfig()
      const root = getWorkspaceRoot()

      // Check if we have a valid workspace root with .beads/
      if (!existsSync(resolve(root, '.beads'))) {
        const response: WorkspaceError = {
          ok: false,
          error: 'No workspace root configured',
          code: 'NO_ROOT',
        }
        return c.json(response, 200)
      }

      const response: WorkspaceStateResponse = {
        ok: true,
        root,
        formulaCount: countFormulas(config.formulaPaths),
        searchPaths: config.formulaPaths,
      }
      return c.json(response)
    } catch (error) {
      const response: WorkspaceError = {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        code: 'READ_ERROR',
      }
      return c.json(response, 500)
    }
  })

  .post('/workspace/open', async (c) => {
    let body: WorkspaceOpenRequest
    try {
      body = await c.req.json<WorkspaceOpenRequest>()
    } catch {
      const response: WorkspaceError = {
        ok: false,
        error: 'Invalid JSON body',
        code: 'NOT_FOUND',
      }
      return c.json(response, 400)
    }

    if (!body.path || typeof body.path !== 'string') {
      const response: WorkspaceError = {
        ok: false,
        error: 'path is required and must be a string',
        code: 'NOT_FOUND',
      }
      return c.json(response, 400)
    }

    const resolvedPath = resolve(body.path)

    // Validate path exists and is a directory
    try {
      const pathStat = statSync(resolvedPath)
      if (!pathStat.isDirectory()) {
        const response: WorkspaceError = {
          ok: false,
          error: `Path is not a directory: ${resolvedPath}`,
          code: 'NOT_DIRECTORY',
        }
        return c.json(response, 400)
      }
    } catch {
      const response: WorkspaceError = {
        ok: false,
        error: `Path not found: ${resolvedPath}`,
        code: 'NOT_FOUND',
      }
      return c.json(response, 400)
    }

    // Auto-create .beads/ if missing
    const beadsDir = resolve(resolvedPath, '.beads')
    if (!existsSync(beadsDir)) {
      try {
        mkdirSync(beadsDir, { recursive: true })
      } catch (error) {
        const response: WorkspaceError = {
          ok: false,
          error: `Failed to create .beads directory: ${error instanceof Error ? error.message : 'Unknown error'}`,
          code: 'WRITE_ERROR',
        }
        return c.json(response, 500)
      }
    }

    // Set workspace root (also clears config cache)
    setWorkspaceRoot(resolvedPath)

    const searchPaths = getFormulaSearchPaths(resolvedPath)
    const response: WorkspaceOpenResponse = {
      ok: true,
      root: resolvedPath,
      formulaCount: countFormulas(searchPaths),
    }
    return c.json(response)
  })

  .post('/workspace/init', async (c) => {
    let body: WorkspaceInitRequest
    try {
      body = await c.req.json<WorkspaceInitRequest>()
    } catch {
      const response: WorkspaceError = {
        ok: false,
        error: 'Invalid JSON body',
        code: 'NOT_FOUND',
      }
      return c.json(response, 400)
    }

    if (!body.path || typeof body.path !== 'string') {
      const response: WorkspaceError = {
        ok: false,
        error: 'path is required and must be a string',
        code: 'NOT_FOUND',
      }
      return c.json(response, 400)
    }

    const resolvedPath = resolve(body.path)

    // Validate path exists and is a directory
    try {
      const pathStat = statSync(resolvedPath)
      if (!pathStat.isDirectory()) {
        const response: WorkspaceError = {
          ok: false,
          error: `Path is not a directory: ${resolvedPath}`,
          code: 'NOT_DIRECTORY',
        }
        return c.json(response, 400)
      }
    } catch {
      const response: WorkspaceError = {
        ok: false,
        error: `Path not found: ${resolvedPath}`,
        code: 'NOT_FOUND',
      }
      return c.json(response, 400)
    }

    // Check if already initialized
    const beadsDir = resolve(resolvedPath, '.beads')
    if (existsSync(beadsDir)) {
      const response: WorkspaceError = {
        ok: false,
        error: `Workspace already initialized at: ${resolvedPath}`,
        code: 'ALREADY_INITIALIZED',
      }
      return c.json(response, 400)
    }

    const created: string[] = []

    try {
      // Create .beads/
      mkdirSync(beadsDir, { recursive: true })
      created.push(beadsDir)

      // Create .beads/formulas/
      const formulasDir = resolve(beadsDir, 'formulas')
      mkdirSync(formulasDir, { recursive: true })
      created.push(formulasDir)

      // Create formulas/ at project root
      const rootFormulasDir = resolve(resolvedPath, 'formulas')
      if (!existsSync(rootFormulasDir)) {
        mkdirSync(rootFormulasDir, { recursive: true })
        created.push(rootFormulasDir)
      }

      // Write blank template formula
      const blankFormulaPath = resolve(formulasDir, 'blank.formula.toml')
      const blankTemplate = `[formula]
name = "blank"
version = 1
type = "workflow"

[steps.step-1]
title = "Step 1"
description = "First step"
priority = 1
`
      writeFileSync(blankFormulaPath, blankTemplate, 'utf-8')
      created.push(blankFormulaPath)
    } catch (error) {
      const response: WorkspaceError = {
        ok: false,
        error: `Failed to initialize workspace: ${error instanceof Error ? error.message : 'Unknown error'}`,
        code: 'WRITE_ERROR',
      }
      return c.json(response, 500)
    }

    // Set workspace root
    setWorkspaceRoot(resolvedPath)

    const response: WorkspaceInitResponse = {
      ok: true,
      root: resolvedPath,
      created,
    }
    return c.json(response)
  })

  .get('/tree', async (c) => {
    const root = getWorkspaceRoot()

    if (!existsSync(root)) {
      const response: TreeError = {
        ok: false,
        error: 'Workspace root not found',
        code: 'NOT_FOUND',
      }
      return c.json(response, 404)
    }

    try {
      const counter = { count: 0 }
      const nodes = await scanTree(root, counter)

      const response: TreeResponse = {
        ok: true,
        root,
        nodes,
        totalCount: counter.count,
        truncated: counter.count >= NODE_LIMIT,
      }
      return c.json(response)
    } catch (error) {
      const response: TreeError = {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        code: 'READ_ERROR',
      }
      return c.json(response, 500)
    }
  })

  .get('/browse', (c) => {
    const queryPath = c.req.query('path')
    const browsePath = queryPath ? resolve(queryPath) : getWorkspaceRoot()

    if (!existsSync(browsePath)) {
      return c.json({ ok: false, error: `Path not found: ${browsePath}`, code: 'NOT_FOUND' }, 404)
    }

    try {
      const pathStat = statSync(browsePath)
      if (!pathStat.isDirectory()) {
        return c.json(
          { ok: false, error: `Path is not a directory: ${browsePath}`, code: 'NOT_DIRECTORY' },
          400
        )
      }

      const entries = readdirSync(browsePath)
      entries.sort()

      const items: BrowseEntry[] = []
      for (const entry of entries) {
        if (entry.startsWith('.') && entry !== '.beads') continue
        const fullPath = join(browsePath, entry)
        try {
          const entryStat = statSync(fullPath)
          items.push({
            name: entry,
            path: fullPath,
            type: entryStat.isDirectory() ? 'directory' : 'file',
          })
        } catch {
          // Skip entries we can't stat
        }
      }

      // Sort directories first, then files
      items.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
        return a.name.localeCompare(b.name)
      })

      return c.json({
        ok: true,
        path: browsePath,
        parent: browsePath !== '/' ? resolve(browsePath, '..') : null,
        entries: items,
      })
    } catch (error) {
      return c.json(
        {
          ok: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          code: 'READ_ERROR',
        },
        500
      )
    }
  })

export { workspace }
