import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import type {
  CookResult,
  Formula,
  FormulaApiError,
  FormulaCookRequest,
  FormulaListError,
  FormulaListResponse,
  FormulaReadResponse,
  FormulaSlingRequest,
  FormulaWriteRequest,
  FormulaWriteResponse,
  SlingResult,
} from '@beads-ide/shared'
/**
 * Formula routes for Beads IDE backend.
 * Provides API for discovering, reading, writing, cooking, and slinging formulas.
 */
import { Hono } from 'hono'
import { bdCook, gtSling, validateFormulaName, validateSlingTarget } from '../cli.js'
import { getConfig } from '../config.js'

/**
 * Generate a human-readable label for a search path.
 */
function getSearchPathLabel(searchPath: string, projectRoot: string): string {
  const home = homedir()
  const gtRoot = process.env.GT_ROOT

  // Check known paths and return friendly labels
  if (searchPath === resolve(projectRoot, 'formulas')) {
    return 'Project formulas'
  }
  if (searchPath === resolve(projectRoot, '.beads', 'formulas')) {
    return 'Project .beads'
  }
  if (searchPath === resolve(home, '.beads', 'formulas')) {
    return 'User formulas'
  }
  if (gtRoot && searchPath === resolve(gtRoot, '.beads', 'formulas')) {
    return 'Gas Town formulas'
  }

  // Fallback: use relative path or basename
  if (searchPath.startsWith(projectRoot)) {
    return searchPath.slice(projectRoot.length + 1)
  }
  if (searchPath.startsWith(home)) {
    return `~${searchPath.slice(home.length)}`
  }

  return basename(searchPath)
}

/**
 * Discover formula files in a directory.
 * Returns array of formula names (without .formula.toml extension).
 */
function discoverFormulasInPath(searchPath: string, projectRoot: string): Formula[] {
  const formulaList: Formula[] = []
  const searchPathLabel = getSearchPathLabel(searchPath, projectRoot)

  try {
    const entries = readdirSync(searchPath)

    for (const entry of entries) {
      // Match .formula.toml or .formula.json files
      if (entry.endsWith('.formula.toml') || entry.endsWith('.formula.json')) {
        const fullPath = join(searchPath, entry)
        const stat = statSync(fullPath)

        if (stat.isFile()) {
          // Extract name without extension
          const name = entry.replace(/\.formula\.(toml|json)$/, '')

          formulaList.push({
            name,
            path: fullPath,
            searchPath,
            searchPathLabel,
          })
        }
      }
    }
  } catch {
    // Directory doesn't exist or can't be read - skip silently
  }

  return formulaList
}

/**
 * Find a formula by name across all search paths.
 * Returns the first match found.
 */
function findFormulaByName(name: string): Formula | null {
  const config = getConfig()

  for (const searchPath of config.formulaPaths) {
    // Check for .formula.toml first, then .formula.json
    for (const ext of ['.formula.toml', '.formula.json']) {
      const fullPath = join(searchPath, `${name}${ext}`)
      try {
        const stat = statSync(fullPath)
        if (stat.isFile()) {
          return {
            name,
            path: fullPath,
            searchPath,
            searchPathLabel: getSearchPathLabel(searchPath, config.projectRoot),
          }
        }
      } catch {
        // File doesn't exist, continue searching
      }
    }
  }

  return null
}

/**
 * Create error response helper.
 */
function errorResponse(error: string, code: FormulaApiError['code']): FormulaApiError {
  return { ok: false, error, code }
}

const formulas = new Hono()

  .get('/formulas', (c) => {
    try {
      const config = getConfig()
      const allFormulas: Formula[] = []

      // Collect formulas from all search paths
      for (const searchPath of config.formulaPaths) {
        const pathFormulas = discoverFormulasInPath(searchPath, config.projectRoot)
        allFormulas.push(...pathFormulas)
      }

      // Sort by name for consistent ordering
      allFormulas.sort((a, b) => a.name.localeCompare(b.name))

      const response: FormulaListResponse = {
        ok: true,
        formulas: allFormulas,
        count: allFormulas.length,
        searchPaths: config.formulaPaths,
      }

      return c.json(response)
    } catch (error) {
      const response: FormulaListError = {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
      return c.json(response, 500)
    }
  })

  .get('/formulas/:name', async (c) => {
    const name = c.req.param('name')

    // Validate formula name
    try {
      validateFormulaName(name)
    } catch (validationError) {
      return c.json(
        errorResponse(
          validationError instanceof Error ? validationError.message : 'Invalid formula name',
          'INVALID_NAME'
        ),
        400
      )
    }

    // Find formula across search paths
    const formula = findFormulaByName(name)
    if (!formula) {
      return c.json(errorResponse(`Formula '${name}' not found`, 'NOT_FOUND'), 404)
    }

    // Read formula content
    let content: string
    try {
      content = readFileSync(formula.path, 'utf-8')
    } catch (error) {
      return c.json(
        errorResponse(
          `Failed to read formula: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'NOT_FOUND'
        ),
        404
      )
    }

    // Try to parse formula structure using bd cook --compile
    let parsed: FormulaReadResponse['parsed']
    try {
      const cookResult = await bdCook(formula.path)
      if (cookResult.exitCode === 0) {
        const cookOutput = JSON.parse(cookResult.stdout)
        parsed = {
          name: cookOutput.formula || name,
          version: cookOutput.version,
          type: cookOutput.type,
          phase: cookOutput.phase,
          vars: cookOutput.vars,
          steps: cookOutput.steps,
        }
      }
    } catch {
      // Parsing failed, return content without parsed structure
    }

    const response: FormulaReadResponse = {
      ok: true,
      name: formula.name,
      path: formula.path,
      content,
      parsed,
    }

    return c.json(response)
  })

  .put('/formulas/:name', async (c) => {
    const name = c.req.param('name')

    // Validate formula name
    try {
      validateFormulaName(name)
    } catch (validationError) {
      return c.json(
        errorResponse(
          validationError instanceof Error ? validationError.message : 'Invalid formula name',
          'INVALID_NAME'
        ),
        400
      )
    }

    // Parse request body
    let body: FormulaWriteRequest
    try {
      body = await c.req.json<FormulaWriteRequest>()
    } catch {
      return c.json(errorResponse('Invalid JSON body', 'VALIDATION_ERROR'), 400)
    }

    if (!body.content || typeof body.content !== 'string') {
      return c.json(
        errorResponse('content is required and must be a string', 'VALIDATION_ERROR'),
        400
      )
    }

    // Find existing formula to determine path
    const formula = findFormulaByName(name)
    let targetPath: string

    if (formula) {
      // Update existing formula
      targetPath = formula.path
    } else {
      // Create new formula in first search path
      const config = getConfig()
      if (config.formulaPaths.length === 0) {
        return c.json(errorResponse('No formula search paths configured', 'WRITE_ERROR'), 500)
      }
      // Determine extension based on content type (default to TOML)
      const ext = body.content.trim().startsWith('{') ? '.formula.json' : '.formula.toml'
      targetPath = join(config.formulaPaths[0], `${name}${ext}`)
    }

    // Write the formula
    try {
      writeFileSync(targetPath, body.content, 'utf-8')
    } catch (error) {
      return c.json(
        errorResponse(
          `Failed to write formula: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'WRITE_ERROR'
        ),
        500
      )
    }

    const response: FormulaWriteResponse = {
      ok: true,
      name,
      path: targetPath,
    }

    return c.json(response)
  })

  .post('/formulas/:name/cook', async (c) => {
    const name = c.req.param('name')

    // Validate formula name
    try {
      validateFormulaName(name)
    } catch (validationError) {
      const result: CookResult = {
        ok: false,
        error: validationError instanceof Error ? validationError.message : 'Invalid formula name',
      }
      return c.json(result, 400)
    }

    // Find formula
    const formula = findFormulaByName(name)
    if (!formula) {
      const result: CookResult = {
        ok: false,
        error: `Formula '${name}' not found`,
      }
      return c.json(result, 404)
    }

    // Parse optional vars from body
    let vars: Record<string, string> | undefined
    try {
      const body = await c.req.json<FormulaCookRequest>()
      vars = body.vars
    } catch {
      // No body or invalid JSON - proceed without vars
    }

    // Run bd cook
    const cliResult = await bdCook(formula.path, vars)

    if (cliResult.exitCode !== 0) {
      // Parse unbound variables from error message if present
      const unboundMatch = cliResult.stderr.match(/Missing: ([^\n]+)/)
      const unboundVars = unboundMatch ? unboundMatch[1].split(', ').map((v) => v.trim()) : undefined

      const result: CookResult = {
        ok: false,
        error: cliResult.stderr || 'Cook failed',
        stderr: cliResult.stderr,
        exit_code: cliResult.exitCode,
        unbound_vars: unboundVars,
      }
      return c.json(result)
    }

    // Parse JSON output from cook
    try {
      const cookOutput = JSON.parse(cliResult.stdout)

      const result: CookResult = {
        ok: true,
        formula: cookOutput.formula,
        version: cookOutput.version,
        type: cookOutput.type,
        phase: cookOutput.phase,
        vars: cookOutput.vars,
        steps: cookOutput.steps,
        source: cookOutput.source,
      }

      return c.json(result)
    } catch {
      const result: CookResult = {
        ok: false,
        error: 'Failed to parse cook output',
        stderr: cliResult.stdout,
        exit_code: 0,
      }
      return c.json(result, 500)
    }
  })

  .post('/formulas/:name/sling', async (c) => {
    const name = c.req.param('name')

    // Validate formula name
    try {
      validateFormulaName(name)
    } catch (validationError) {
      const result: SlingResult = {
        ok: false,
        error: validationError instanceof Error ? validationError.message : 'Invalid formula name',
      }
      return c.json(result, 400)
    }

    // Find formula
    const formula = findFormulaByName(name)
    if (!formula) {
      const result: SlingResult = {
        ok: false,
        error: `Formula '${name}' not found`,
      }
      return c.json(result, 404)
    }

    // Parse body
    let body: FormulaSlingRequest
    try {
      body = await c.req.json<FormulaSlingRequest>()
    } catch {
      const result: SlingResult = {
        ok: false,
        error: 'Invalid JSON body',
      }
      return c.json(result, 400)
    }

    if (!body.target) {
      const result: SlingResult = {
        ok: false,
        error: 'target is required',
      }
      return c.json(result, 400)
    }

    // Validate target
    try {
      validateSlingTarget(body.target)
    } catch (validationError) {
      const result: SlingResult = {
        ok: false,
        error: validationError instanceof Error ? validationError.message : 'Invalid target',
      }
      return c.json(result, 400)
    }

    // Run gt sling
    const cliResult = await gtSling(formula.path, body.target, body.vars)

    if (cliResult.exitCode !== 0) {
      const result: SlingResult = {
        ok: false,
        error: cliResult.stderr || 'Sling failed',
        stderr: cliResult.stderr,
        exit_code: cliResult.exitCode,
      }
      return c.json(result)
    }

    // Parse output for molecule ID
    const moleculeMatch = cliResult.stdout.match(/molecule[:\s]+([a-zA-Z0-9_.-]+)/i)
    const moleculeId = moleculeMatch?.[1]

    const result: SlingResult = {
      ok: true,
      molecule_id: moleculeId,
      target: body.target,
      formula: name,
    }

    return c.json(result)
  })

export { formulas }
