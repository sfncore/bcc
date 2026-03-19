import type { BurnRequest, BurnResult, PourRequest, PourResult } from '@beads-ide/shared'
/**
 * Pour routes for Beads IDE backend.
 * Provides API for pouring formulas (instantiating molecules) and burning them (rollback).
 */
import { Hono } from 'hono'
import { bdBurn, bdPour, validateBeadId, validateProtoId } from '../cli.js'

const pour = new Hono()

  .post('/pour', async (c) => {
    try {
      const body = await c.req.json<PourRequest>()

      if (!body.proto_id) {
        const result: PourResult = {
          ok: false,
          error: 'proto_id is required',
        }
        return c.json(result, 400)
      }

      try {
        validateProtoId(body.proto_id)
      } catch (validationError) {
        const result: PourResult = {
          ok: false,
          error: validationError instanceof Error ? validationError.message : 'Invalid proto ID',
        }
        return c.json(result, 400)
      }

      // Run bd mol pour with JSON output
      const cliResult = await bdPour(body.proto_id, body.vars, {
        assignee: body.assignee,
        dryRun: body.dry_run,
      })

      if (cliResult.exitCode !== 0) {
        const result: PourResult = {
          ok: false,
          error: cliResult.stderr || 'Pour failed',
          stderr: cliResult.stderr,
          exit_code: cliResult.exitCode,
          dry_run: body.dry_run,
        }
        return c.json(result)
      }

      // Parse JSON output from pour
      try {
        const pourOutput = JSON.parse(cliResult.stdout)

        // Transform to PourResult format
        const result: PourResult = {
          ok: true,
          molecule_id: pourOutput.molecule_id || pourOutput.id,
          created_beads: pourOutput.created_beads || pourOutput.beads || [],
          bead_count: pourOutput.bead_count || pourOutput.count || 0,
          dry_run: body.dry_run,
        }

        return c.json(result)
      } catch (parseError) {
        // If JSON parsing fails but exit code was 0, try to extract info from output
        const result: PourResult = {
          ok: true,
          molecule_id: undefined,
          created_beads: [],
          bead_count: 0,
          stderr: cliResult.stdout,
          dry_run: body.dry_run,
        }
        return c.json(result)
      }
    } catch (error) {
      const result: PourResult = {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
      return c.json(result, 500)
    }
  })

  .post('/burn', async (c) => {
    try {
      const body = await c.req.json<BurnRequest>()

      if (!body.molecule_id) {
        const result: BurnResult = {
          ok: false,
          error: 'molecule_id is required',
        }
        return c.json(result, 400)
      }

      try {
        validateBeadId(body.molecule_id)
      } catch (validationError) {
        const result: BurnResult = {
          ok: false,
          error: validationError instanceof Error ? validationError.message : 'Invalid molecule ID',
        }
        return c.json(result, 400)
      }

      // Run bd mol burn with JSON output
      const cliResult = await bdBurn(body.molecule_id, {
        force: body.force,
        dryRun: body.dry_run,
      })

      if (cliResult.exitCode !== 0) {
        const result: BurnResult = {
          ok: false,
          error: cliResult.stderr || 'Burn failed',
          stderr: cliResult.stderr,
          exit_code: cliResult.exitCode,
          dry_run: body.dry_run,
        }
        return c.json(result)
      }

      // Parse JSON output from burn
      try {
        const burnOutput = JSON.parse(cliResult.stdout)

        const result: BurnResult = {
          ok: true,
          deleted_count: burnOutput.deleted_count || burnOutput.count || 0,
          dry_run: body.dry_run,
        }

        return c.json(result)
      } catch (parseError) {
        // If JSON parsing fails but exit code was 0, success with unknown count
        const result: BurnResult = {
          ok: true,
          deleted_count: undefined,
          dry_run: body.dry_run,
        }
        return c.json(result)
      }
    } catch (error) {
      const result: BurnResult = {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
      return c.json(result, 500)
    }
  })

export { pour }
