import type { CookRequest, CookResult } from '@beads-ide/shared'
/**
 * Cook routes for Beads IDE backend.
 * Provides API for cooking formulas and getting proto bead previews.
 */
import { Hono } from 'hono'
import { bdCook, validateFormulaName } from '../cli.js'

const cook = new Hono()

  .post('/cook', async (c) => {
    try {
      const body = await c.req.json<CookRequest>()

      if (!body.formula_path) {
        const result: CookResult = {
          ok: false,
          error: 'formula_path is required',
        }
        return c.json(result, 400)
      }

      // Extract formula name from path for validation
      const formulaName = body.formula_path
        .replace(/\.formula\.(toml|json)$/, '')
        .replace(/^.*\//, '')

      try {
        validateFormulaName(formulaName)
      } catch (validationError) {
        const result: CookResult = {
          ok: false,
          error: validationError instanceof Error ? validationError.message : 'Invalid formula name',
        }
        return c.json(result, 400)
      }

      // Run bd cook with JSON output
      const cliResult = await bdCook(body.formula_path, body.vars)

      if (cliResult.exitCode !== 0) {
        // Parse unbound variables from error message if present
        const unboundMatch = cliResult.stderr.match(/Missing: ([^\n]+)/)
        const unboundVars = unboundMatch
          ? unboundMatch[1].split(', ').map((v) => v.trim())
          : undefined

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

        // Transform to CookResult format
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
      } catch (parseError) {
        const result: CookResult = {
          ok: false,
          error: 'Failed to parse cook output',
          stderr: cliResult.stdout,
          exit_code: 0,
        }
        return c.json(result, 500)
      }
    } catch (error) {
      const result: CookResult = {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
      return c.json(result, 500)
    }
  })

export { cook }
