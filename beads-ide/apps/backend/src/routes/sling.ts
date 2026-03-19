import type { SlingRequest, SlingResult } from '@beads-ide/shared'
/**
 * Sling routes for Beads IDE backend.
 * Provides API for slinging formulas to agents/crews via gt sling.
 */
import { Hono } from 'hono'
import { gtSling, validateFormulaName, validateSlingTarget } from '../cli.js'

const sling = new Hono()

  .post('/sling', async (c) => {
    try {
      const body = await c.req.json<SlingRequest>()

      if (!body.formula_path) {
        const result: SlingResult = {
          ok: false,
          error: 'formula_path is required',
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

      // Extract formula name from path for validation
      const formulaName = body.formula_path
        .replace(/\.formula\.(toml|json)$/, '')
        .replace(/^.*\//, '')

      try {
        validateFormulaName(formulaName)
      } catch (validationError) {
        const result: SlingResult = {
          ok: false,
          error: validationError instanceof Error ? validationError.message : 'Invalid formula name',
        }
        return c.json(result, 400)
      }

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
      const cliResult = await gtSling(body.formula_path, body.target, body.vars)

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
      // Expected format: "Slung formula to target, molecule: mol-xxx"
      const moleculeMatch = cliResult.stdout.match(/molecule[:\s]+([a-zA-Z0-9_.-]+)/i)
      const moleculeId = moleculeMatch?.[1]

      const result: SlingResult = {
        ok: true,
        molecule_id: moleculeId,
        target: body.target,
        formula: formulaName,
      }

      return c.json(result)
    } catch (error) {
      const result: SlingResult = {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
      return c.json(result, 500)
    }
  })

export { sling }
