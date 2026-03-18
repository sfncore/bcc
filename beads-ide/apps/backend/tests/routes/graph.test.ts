import type { GraphExportResult, GraphMetricsResult } from "@beads-ide/shared";
import { Hono } from "hono";
/**
 * Tests for graph routes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import * as cli from "../../src/cli.js";
import { graph } from "../../src/routes/graph.js";

// Create test app
const app = new Hono();
app.route("/api", graph);

describe("Graph Routes", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("GET /api/graph/metrics", () => {
    it("returns 503 when bv is not available", async () => {
      vi.spyOn(cli, "runCli").mockResolvedValue({
        stdout: "",
        stderr: "command not found",
        exitCode: 127,
      });

      const res = await app.request("/api/graph/metrics");
      expect(res.status).toBe(503);

      const body = (await res.json()) as GraphMetricsResult;
      expect(body.ok).toBe(false);
      if (!body.ok) {
        expect(body.code).toBe("BV_NOT_FOUND");
      }
    });

    it("returns 404 when no beads database exists", async () => {
      // First call: bv --help succeeds (bv is available)
      vi.spyOn(cli, "runCli").mockResolvedValueOnce({
        stdout: "bv help output",
        stderr: "",
        exitCode: 0,
      });

      // Second call: bvInsights fails with no beads error
      vi.spyOn(cli, "bvInsights").mockResolvedValue({
        stdout: "",
        stderr: "no beads JSONL file found",
        exitCode: 1,
      });

      const res = await app.request("/api/graph/metrics");
      expect(res.status).toBe(404);

      const body = (await res.json()) as GraphMetricsResult;
      expect(body.ok).toBe(false);
      if (!body.ok) {
        expect(body.code).toBe("NO_BEADS");
      }
    });

    it("returns metrics on success", async () => {
      const mockInsights = {
        generated_at: "2026-02-22T00:00:00Z",
        data_hash: "abc123",
        Influencers: [{ id: "bcc-1", title: "Test", score: 0.5 }],
        Bottlenecks: [{ id: "bcc-2", title: "Bottleneck", score: 0.3 }],
        Authorities: [],
        Hubs: [],
        Keystones: [],
        Cycles: [],
        Slack: {},
        Stats: { total_beads: 10, total_dependencies: 5, density: 0.1 },
        advanced_insights: {
          topological_sort: { order: ["bcc-1", "bcc-2"], levels: {} },
          critical_path: { length: 2, path: ["bcc-1", "bcc-2"] },
        },
      };

      vi.spyOn(cli, "runCli").mockResolvedValue({
        stdout: "bv help",
        stderr: "",
        exitCode: 0,
      });

      vi.spyOn(cli, "bvInsights").mockResolvedValue({
        stdout: JSON.stringify(mockInsights),
        stderr: "",
        exitCode: 0,
      });

      const res = await app.request("/api/graph/metrics");
      expect(res.status).toBe(200);

      const body = (await res.json()) as GraphMetricsResult;
      expect(body.ok).toBe(true);
      if (body.ok) {
        expect(body.metrics.pagerank).toHaveLength(1);
        expect(body.metrics.pagerank[0].id).toBe("bcc-1");
        expect(body.metrics.betweenness).toHaveLength(1);
        expect(body.metrics.stats.nodes).toBe(10);
        expect(body.metrics.density).toBe(0.1);
      }
    });

    it("returns 500 on parse error", async () => {
      vi.spyOn(cli, "runCli").mockResolvedValue({
        stdout: "bv help",
        stderr: "",
        exitCode: 0,
      });

      vi.spyOn(cli, "bvInsights").mockResolvedValue({
        stdout: "not valid json",
        stderr: "",
        exitCode: 0,
      });

      const res = await app.request("/api/graph/metrics");
      expect(res.status).toBe(500);

      const body = (await res.json()) as GraphMetricsResult;
      expect(body.ok).toBe(false);
      if (!body.ok) {
        expect(body.code).toBe("PARSE_ERROR");
      }
    });
  });

  describe("GET /api/graph/export", () => {
    it("returns 503 when bv is not available", async () => {
      vi.spyOn(cli, "runCli").mockResolvedValue({
        stdout: "",
        stderr: "command not found",
        exitCode: 127,
      });

      const res = await app.request("/api/graph/export");
      expect(res.status).toBe(503);

      const body = (await res.json()) as GraphExportResult;
      expect(body.ok).toBe(false);
      if (!body.ok) {
        expect(body.code).toBe("BV_NOT_FOUND");
      }
    });

    it("returns 400 for invalid format", async () => {
      vi.spyOn(cli, "runCli").mockResolvedValue({
        stdout: "bv help",
        stderr: "",
        exitCode: 0,
      });

      const res = await app.request("/api/graph/export?format=invalid");
      expect(res.status).toBe(400);

      const body = (await res.json()) as GraphExportResult;
      expect(body.ok).toBe(false);
      if (!body.ok) {
        expect(body.error).toContain("Invalid format");
      }
    });

    it("returns graph on success", async () => {
      const mockGraph = {
        generated_at: "2026-02-22T00:00:00Z",
        data_hash: "abc123",
        format: "json",
        nodes: [{ id: "bcc-1", title: "Test", status: "open" }],
        edges: [{ from: "bcc-1", to: "bcc-2", type: "blocks" }],
        stats: { nodes: 2, edges: 1, density: 0.5 },
      };

      vi.spyOn(cli, "runCli").mockResolvedValue({
        stdout: "bv help",
        stderr: "",
        exitCode: 0,
      });

      vi.spyOn(cli, "bvGraph").mockResolvedValue({
        stdout: JSON.stringify(mockGraph),
        stderr: "",
        exitCode: 0,
      });

      const res = await app.request("/api/graph/export");
      expect(res.status).toBe(200);

      const body = (await res.json()) as GraphExportResult;
      expect(body.ok).toBe(true);
      if (body.ok) {
        expect(body.graph.nodes).toHaveLength(1);
        expect(body.graph.edges).toHaveLength(1);
        expect(body.graph.format).toBe("json");
      }
    });

    it("supports different formats", async () => {
      const mockGraph = {
        generated_at: "2026-02-22T00:00:00Z",
        data_hash: "abc123",
        format: "mermaid",
        nodes: [],
        edges: [],
        stats: { nodes: 0, edges: 0, density: 0 },
      };

      vi.spyOn(cli, "runCli").mockResolvedValue({
        stdout: "bv help",
        stderr: "",
        exitCode: 0,
      });

      vi.spyOn(cli, "bvGraph").mockResolvedValue({
        stdout: JSON.stringify(mockGraph),
        stderr: "",
        exitCode: 0,
      });

      const res = await app.request("/api/graph/export?format=mermaid");
      expect(res.status).toBe(200);

      const body = (await res.json()) as GraphExportResult;
      expect(body.ok).toBe(true);
      if (body.ok) {
        expect(body.graph.format).toBe("mermaid");
      }
    });

    it("returns 404 when no beads database exists", async () => {
      vi.spyOn(cli, "runCli").mockResolvedValue({
        stdout: "bv help",
        stderr: "",
        exitCode: 0,
      });

      vi.spyOn(cli, "bvGraph").mockResolvedValue({
        stdout: "",
        stderr: "no beads JSONL file found",
        exitCode: 1,
      });

      const res = await app.request("/api/graph/export");
      expect(res.status).toBe(404);

      const body = (await res.json()) as GraphExportResult;
      expect(body.ok).toBe(false);
      if (!body.ok) {
        expect(body.code).toBe("NO_BEADS");
      }
    });
  });
});

describe("GraphMetrics Structure", () => {
  it("parses all 9 graph metrics correctly", async () => {
    const fullInsights = {
      generated_at: "2026-02-22T00:00:00Z",
      data_hash: "full123",
      Influencers: [
        { id: "bcc-1", title: "High PageRank", score: 0.8, rank: 1 },
        { id: "bcc-2", title: "Medium PageRank", score: 0.5, rank: 2 },
      ],
      Bottlenecks: [{ id: "bcc-3", title: "Critical Bottleneck", score: 0.9 }],
      Authorities: [{ id: "bcc-4", title: "Authority Node", score: 0.7 }],
      Hubs: [{ id: "bcc-5", title: "Hub Node", score: 0.6 }],
      Keystones: [{ id: "bcc-6", title: "Keystone", score: 0.85 }],
      Cycles: [
        ["bcc-7", "bcc-8", "bcc-7"],
        ["bcc-9", "bcc-10", "bcc-11", "bcc-9"],
      ],
      Slack: { "bcc-1": 0, "bcc-2": 1, "bcc-3": 2 },
      Stats: {
        total_beads: 20,
        total_dependencies: 30,
        density: 0.15,
        avg_degree: 3.0,
      },
      advanced_insights: {
        topological_sort: {
          order: ["bcc-1", "bcc-2", "bcc-3"],
          levels: { "bcc-1": 0, "bcc-2": 1, "bcc-3": 1 },
        },
        critical_path: {
          length: 5,
          path: ["bcc-1", "bcc-2", "bcc-3", "bcc-4", "bcc-5"],
        },
        degree_distribution: [
          { id: "bcc-1", title: "Node 1", inDegree: 2, outDegree: 3, totalDegree: 5 },
        ],
      },
      status: { healthy: true },
      usage_hints: ["Focus on bottlenecks first"],
    };

    vi.spyOn(cli, "runCli").mockResolvedValue({
      stdout: "bv help",
      stderr: "",
      exitCode: 0,
    });

    vi.spyOn(cli, "bvInsights").mockResolvedValue({
      stdout: JSON.stringify(fullInsights),
      stderr: "",
      exitCode: 0,
    });

    const res = await app.request("/api/graph/metrics");
    const body = (await res.json()) as GraphMetricsResult;

    expect(body.ok).toBe(true);
    if (!body.ok) return;
    const m = body.metrics;

    // 1. PageRank
    expect(m.pagerank).toHaveLength(2);
    expect(m.pagerank[0].score).toBe(0.8);

    // 2. Betweenness
    expect(m.betweenness).toHaveLength(1);
    expect(m.betweenness[0].title).toBe("Critical Bottleneck");

    // 3. HITS
    expect(m.hits.authorities).toHaveLength(1);
    expect(m.hits.hubs).toHaveLength(1);

    // 4. Critical path
    expect(m.criticalPath.length).toBe(5);
    expect(m.criticalPath.path).toHaveLength(5);

    // 5. Eigenvector
    expect(m.eigenvector).toHaveLength(1);
    expect(m.eigenvector[0].title).toBe("Keystone");

    // 6. Degree
    expect(m.degree).toHaveLength(1);
    expect(m.degree[0].totalDegree).toBe(5);

    // 7. Density
    expect(m.density).toBe(0.15);

    // 8. Cycles
    expect(m.cycles.count).toBe(2);
    expect(m.cycles.cycles).toHaveLength(2);

    // 9. Topological sort
    expect(m.topoSort.order).toHaveLength(3);
    expect(m.topoSort.levels).toHaveProperty("bcc-1", 0);

    // Stats
    expect(m.stats.nodes).toBe(20);
    expect(m.stats.edges).toBe(30);

    // Additional fields
    expect(m.usageHints).toContain("Focus on bottlenecks first");
  });
});
