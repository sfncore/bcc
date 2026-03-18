import type { BeadApiError, BeadShowResponse, BeadsListResponse } from "@beads-ide/shared";
import { Hono } from "hono";
/**
 * Integration tests for bead routes.
 * Tests the actual API endpoints against the real bd CLI.
 */
import { beforeAll, describe, expect, it } from "vite-plus/test";
import { beads } from "../../src/routes/beads.js";

// Create test app with beads routes
const app = new Hono();
app.route("/api", beads);

describe("Bead Routes", () => {
  describe("GET /api/beads", () => {
    it("returns a list of beads from the database", async () => {
      const res = await app.request("/api/beads");
      expect(res.status).toBe(200);

      const data = (await res.json()) as BeadsListResponse;
      expect(data).toHaveProperty("beads");
      expect(data).toHaveProperty("count");
      expect(Array.isArray(data.beads)).toBe(true);
      expect(data.count).toBe(data.beads.length);

      // Verify bead structure if there are any beads
      if (data.beads.length > 0) {
        const bead = data.beads[0];
        expect(bead).toHaveProperty("id");
        expect(bead).toHaveProperty("title");
        expect(bead).toHaveProperty("status");
        expect(bead).toHaveProperty("priority");
        expect(bead).toHaveProperty("issue_type");
      }
    });

    it("supports status filter", async () => {
      const res = await app.request("/api/beads?status=open");
      expect(res.status).toBe(200);

      const data = (await res.json()) as BeadsListResponse;
      expect(Array.isArray(data.beads)).toBe(true);

      // All returned beads should have status=open
      for (const bead of data.beads) {
        expect(bead.status).toBe("open");
      }
    });

    it("supports type filter", async () => {
      const res = await app.request("/api/beads?type=task");
      expect(res.status).toBe(200);

      const data = (await res.json()) as BeadsListResponse;
      expect(Array.isArray(data.beads)).toBe(true);

      // All returned beads should have issue_type=task
      for (const bead of data.beads) {
        expect(bead.issue_type).toBe("task");
      }
    });
  });

  describe("GET /api/beads/:id", () => {
    let validBeadId: string | null = null;

    beforeAll(async () => {
      // Get a valid bead ID from the list
      const res = await app.request("/api/beads");
      if (res.status === 200) {
        const data = (await res.json()) as BeadsListResponse;
        if (data.beads.length > 0) {
          validBeadId = data.beads[0].id;
        }
      }
    });

    it("returns a single bead by ID", async () => {
      if (!validBeadId) {
        console.log("Skipping test: no beads in database");
        return;
      }

      const res = await app.request(`/api/beads/${validBeadId}`);
      expect(res.status).toBe(200);

      const data = (await res.json()) as BeadShowResponse;
      expect(data).toHaveProperty("bead");
      expect(data.bead.id).toBe(validBeadId);
      expect(data.bead).toHaveProperty("title");
      expect(data.bead).toHaveProperty("description");
      expect(data.bead).toHaveProperty("status");
    });

    it("returns 404 for non-existent bead", async () => {
      const res = await app.request("/api/beads/nonexistent-bead-xyz123");
      expect(res.status).toBe(404);

      const data = (await res.json()) as BeadApiError;
      expect(data).toHaveProperty("error");
      expect(data).toHaveProperty("code");
      expect(data.code).toBe("NOT_FOUND");
    });

    it("returns 400 for invalid bead ID format", async () => {
      const res = await app.request("/api/beads/invalid;injection");
      expect(res.status).toBe(400);

      const data = (await res.json()) as BeadApiError;
      expect(data).toHaveProperty("error");
      expect(data).toHaveProperty("code");
      expect(data.code).toBe("INVALID_ID");
    });

    it("rejects bead IDs with shell metacharacters", async () => {
      const dangerousIds = ["bcc$(whoami)", "bcc|cat", "bcc;rm", "bcc`id`"];

      for (const id of dangerousIds) {
        const res = await app.request(`/api/beads/${encodeURIComponent(id)}`);
        expect(res.status).toBe(400);

        const data = (await res.json()) as BeadApiError;
        expect(data.code).toBe("INVALID_ID");
      }
    });
  });
});

describe("Bead Data Structure", () => {
  it("returns proper bead fields for API consumption", async () => {
    const res = await app.request("/api/beads");
    if (res.status !== 200) return;

    const data = (await res.json()) as BeadsListResponse;
    if (data.beads.length === 0) return;

    const bead = data.beads[0];

    // Required fields
    expect(typeof bead.id).toBe("string");
    expect(typeof bead.title).toBe("string");
    expect(typeof bead.status).toBe("string");
    expect(typeof bead.priority).toBe("number");
    expect(typeof bead.issue_type).toBe("string");
    expect(typeof bead.created_at).toBe("string");
    expect(typeof bead.updated_at).toBe("string");

    // Count fields
    expect(typeof bead.dependency_count).toBe("number");
    expect(typeof bead.dependent_count).toBe("number");
    expect(typeof bead.comment_count).toBe("number");
  });
});
