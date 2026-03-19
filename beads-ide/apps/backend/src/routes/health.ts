/**
 * Health check routes for Beads IDE backend.
 */
import { Hono } from "hono";
import { runCli } from "../cli.js";
import { getConfig } from "../config.js";

export interface HealthResponse {
  ok: boolean;
  bd_version: string;
}

export interface ConfigResponse {
  formula_paths: string[];
  project_root: string;
  gt_root: string;
  bd_binary: string;
  gt_binary: string;
  bv_binary: string;
}

const health = new Hono()

  .get("/health", async (c) => {
    try {
      const result = await runCli("bd", ["--version"]);

      if (result.exitCode !== 0) {
        return c.json(
          {
            ok: false,
            bd_version: "",
            error: "bd CLI returned non-zero exit code",
          },
          503,
        );
      }

      // Parse version from output (typically "bd version X.Y.Z" or similar)
      const version = result.stdout.trim() || "unknown";

      const response: HealthResponse = {
        ok: true,
        bd_version: version,
      };

      return c.json(response);
    } catch (error) {
      return c.json(
        {
          ok: false,
          bd_version: "",
          error: error instanceof Error ? error.message : "Unknown error checking bd CLI",
        },
        503,
      );
    }
  })

  .get("/config", (c) => {
    const config = getConfig();

    const response: ConfigResponse = {
      formula_paths: config.formulaPaths,
      project_root: config.projectRoot,
      gt_root: process.env.GT_ROOT || "",
      bd_binary: config.bdBinary,
      gt_binary: config.gtBinary,
      bv_binary: config.bvBinary,
    };

    return c.json(response);
  });

export { health };
