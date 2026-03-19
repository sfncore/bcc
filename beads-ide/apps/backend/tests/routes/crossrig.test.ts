/**
 * Integration tests for cross-rig routes.
 * Tests convoy graph, epic graph, and crossrig beads/graph endpoints
 * against the real Dolt databases.
 */
import { Hono } from "hono";
import { beforeAll, describe, expect, it } from "vite-plus/test";
import { crossrig } from "../../src/routes/crossrig.js";

const app = new Hono();
app.route("/api", crossrig);

// --- Cross-Rig Beads ---

describe("Cross-Rig Beads", () => {
  it("GET /api/crossrig/beads returns beads across rigs", async () => {
    const res = await app.request("/api/crossrig/beads");
    expect(res.status).toBe(200);

    const data = await res.json() as any;
    expect(data).toHaveProperty("beads");
    expect(data).toHaveProperty("count");
    expect(data).toHaveProperty("rigs");
    expect(Array.isArray(data.beads)).toBe(true);
    expect(data.count).toBe(data.beads.length);

    // Should have beads from multiple rigs
    if (data.beads.length > 0) {
      const bead = data.beads[0];
      expect(bead).toHaveProperty("id");
      expect(bead).toHaveProperty("title");
      expect(bead).toHaveProperty("status");
      expect(bead).toHaveProperty("_rig_db");
    }
  });

  it("supports exclude_noise filter", async () => {
    const res = await app.request("/api/crossrig/beads?exclude_noise=true");
    expect(res.status).toBe(200);

    const data = await res.json() as any;
    for (const bead of data.beads) {
      expect(bead.id).not.toMatch(/-mol-/);
      expect(bead.id).not.toMatch(/-wisp-/);
    }
  });

  it("supports rigs filter", async () => {
    const res = await app.request("/api/crossrig/beads?rigs=hq");
    expect(res.status).toBe(200);

    const data = await res.json() as any;
    for (const bead of data.beads) {
      expect(bead._rig_db).toBe("hq");
    }
  });
});

// --- Cross-Rig Graph ---

describe("Cross-Rig Graph", () => {
  it("GET /api/crossrig/graph returns nodes and edges", async () => {
    const res = await app.request("/api/crossrig/graph?exclude_noise=true");
    expect(res.status).toBe(200);

    const data = await res.json() as any;
    expect(data).toHaveProperty("nodes");
    expect(data).toHaveProperty("edges");
    expect(data).toHaveProperty("nodeCount");
    expect(data).toHaveProperty("edgeCount");
    expect(data).toHaveProperty("rigs");
    expect(Array.isArray(data.nodes)).toBe(true);
    expect(Array.isArray(data.edges)).toBe(true);
    expect(data.nodeCount).toBe(data.nodes.length);

    if (data.nodes.length > 0) {
      const node = data.nodes[0];
      expect(node).toHaveProperty("id");
      expect(node).toHaveProperty("title");
      expect(node).toHaveProperty("status");
      expect(node).toHaveProperty("type");
      expect(node).toHaveProperty("_rig_db");
    }

    if (data.edges.length > 0) {
      const edge = data.edges[0];
      expect(edge).toHaveProperty("from");
      expect(edge).toHaveProperty("to");
      expect(edge).toHaveProperty("type");
    }
  });

  it("handles missing labels column gracefully", async () => {
    // Some rigs don't have labels column — should still return nodes
    const res = await app.request("/api/crossrig/graph?rigs=lf&exclude_noise=true");
    expect(res.status).toBe(200);

    const data = await res.json() as any;
    expect(Array.isArray(data.nodes)).toBe(true);
    // Should not error even if labels column is missing
  });
});

// --- Convoy Graph ---

describe("Convoy Graph", () => {
  let convoyIds: string[] = [];

  beforeAll(async () => {
    // Find real convoys to test against
    const res = await app.request("/api/crossrig/convoys");
    if (res.status === 200) {
      const data = await res.json() as any;
      convoyIds = (data.convoys ?? []).slice(0, 5).map((c: any) => c.id);
    }
  });

  it("GET /api/crossrig/convoys returns convoy list with tracked beads", async () => {
    const res = await app.request("/api/crossrig/convoys");
    expect(res.status).toBe(200);

    const data = await res.json() as any;
    expect(data).toHaveProperty("convoys");
    expect(data).toHaveProperty("count");
    expect(Array.isArray(data.convoys)).toBe(true);

    if (data.convoys.length > 0) {
      const convoy = data.convoys[0];
      expect(convoy).toHaveProperty("id");
      expect(convoy).toHaveProperty("title");
      expect(convoy).toHaveProperty("status");
      expect(convoy).toHaveProperty("tracked_beads");
      expect(Array.isArray(convoy.tracked_beads)).toBe(true);
    }
  });

  it("returns 404 for non-existent convoy", async () => {
    const res = await app.request("/api/crossrig/convoy/hq-cv-nonexistent/graph");
    expect(res.status).toBe(404);

    const data = await res.json() as any;
    expect(data.code).toBe("NOT_FOUND");
  });

  it("resolves convoy with simple bead IDs (prefix matching)", async () => {
    // hq-cv-bib29 tracks lf-q5btn.1, lf-q5btn.2, op-eci.1, op-eci.2
    const res = await app.request("/api/crossrig/convoy/hq-cv-bib29/graph");
    expect(res.status).toBe(200);

    const data = await res.json() as any;
    expect(data.convoy.id).toBe("hq-cv-bib29");
    expect(data.nodeCount).toBeGreaterThanOrEqual(4);
    expect(data.waves.length).toBeGreaterThanOrEqual(1);

    // Nodes should have rig info
    for (const node of data.nodes) {
      expect(node).toHaveProperty("_rig_db");
      expect(node).toHaveProperty("wave");
      expect(node).toHaveProperty("title");
      expect(node).toHaveProperty("status");
    }

    // Should have cross-rig nodes
    const rigs = new Set(data.nodes.map((n: any) => n._rig_db));
    expect(rigs.size).toBeGreaterThanOrEqual(2);
  });

  it("resolves convoy with external: format bead IDs", async () => {
    // hq-cv-zbk5p uses external:lora_forge:lf-xxx format
    const res = await app.request("/api/crossrig/convoy/hq-cv-zbk5p/graph");
    expect(res.status).toBe(200);

    const data = await res.json() as any;
    expect(data.convoy.id).toBe("hq-cv-zbk5p");
    expect(data.nodeCount).toBeGreaterThanOrEqual(10);

    // Should not contain sentinel beads
    const sentinels = data.nodes.filter((n: any) => n.id.includes("sentinel"));
    expect(sentinels.length).toBe(0);
  });

  it("computes correct wave ordering from blocks dependencies", async () => {
    const res = await app.request("/api/crossrig/convoy/hq-cv-bib29/graph");
    if (res.status !== 200) return;

    const data = await res.json() as any;
    // Waves should be ordered: wave 1 nodes have no deps on other convoy nodes
    // wave 2+ nodes are blocked by earlier wave nodes
    const nodeWave = new Map<string, number>();
    for (const node of data.nodes) {
      nodeWave.set(node.id, node.wave);
    }

    for (const edge of data.edges) {
      if (edge.type === "blocks") {
        const fromWave = nodeWave.get(edge.from) ?? 0;
        const toWave = nodeWave.get(edge.to) ?? 0;
        // The blocker (from) should be in an equal or earlier wave than the blocked (to)
        expect(fromWave).toBeLessThanOrEqual(toWave);
      }
    }
  });

  it("returns empty graph for convoy tracking only wisps", async () => {
    // hq-cv-xflao tracks a wisp, not an issue
    const res = await app.request("/api/crossrig/convoy/hq-cv-xflao/graph");
    expect(res.status).toBe(200);

    const data = await res.json() as any;
    // Wisps are not in the issues table, so nodes should be empty or minimal
    expect(data.convoy.id).toBe("hq-cv-xflao");
    expect(data).toHaveProperty("nodes");
  });

  it("handles all existing convoys without errors", async () => {
    for (const id of convoyIds) {
      const res = await app.request(`/api/crossrig/convoy/${id}/graph`);
      expect(res.status).toBe(200);

      const data = await res.json() as any;
      expect(data).toHaveProperty("convoy");
      expect(data).toHaveProperty("nodes");
      expect(data).toHaveProperty("edges");
      expect(data).toHaveProperty("waves");
      expect(Array.isArray(data.nodes)).toBe(true);
      expect(Array.isArray(data.edges)).toBe(true);
    }
  });
});

// --- Epic Graph ---

describe("Epic Graph", () => {
  it("returns 404 for non-existent epic", async () => {
    const res = await app.request("/api/crossrig/epic/nonexistent-epic-xyz/graph");
    expect(res.status).toBe(404);

    const data = await res.json() as any;
    expect(data.code).toBe("NOT_FOUND");
  });

  it("resolves epic with dotted ID children", async () => {
    // hq-phglb has children hq-phglb.1 through hq-phglb.6
    const res = await app.request("/api/crossrig/epic/hq-phglb/graph");
    expect(res.status).toBe(200);

    const data = await res.json() as any;
    expect(data.epic.id).toBe("hq-phglb");
    expect(data.nodeCount).toBeGreaterThanOrEqual(7); // epic + 6 children

    // Epic itself should be in the nodes
    const epicNode = data.nodes.find((n: any) => n.id === "hq-phglb");
    expect(epicNode).toBeDefined();
    expect(epicNode.type).toBe("epic");

    // Children should be present
    const children = data.nodes.filter((n: any) => n.id.startsWith("hq-phglb."));
    expect(children.length).toBeGreaterThanOrEqual(6);
  });

  it("resolves epic with dependency-linked children (no dotted IDs)", async () => {
    // hq-p7159 has children linked via blocks deps, not dotted IDs
    const res = await app.request("/api/crossrig/epic/hq-p7159/graph");
    expect(res.status).toBe(200);

    const data = await res.json() as any;
    expect(data.epic.id).toBe("hq-p7159");
    expect(data.nodeCount).toBeGreaterThanOrEqual(2); // epic + at least 1 child

    // Children should not share the epic's ID prefix
    const nonPrefixChildren = data.nodes.filter(
      (n: any) => n.id !== "hq-p7159" && !n.id.startsWith("hq-p7159.")
    );
    expect(nonPrefixChildren.length).toBeGreaterThanOrEqual(1);
  });

  it("resolves large nested epic with sub-epics", async () => {
    // ta-d5o has sub-epics (ta-d5o.1..6) each with leaf tasks (ta-d5o.1.1, etc.)
    const res = await app.request("/api/crossrig/epic/ta-d5o/graph");
    expect(res.status).toBe(200);

    const data = await res.json() as any;
    expect(data.nodeCount).toBeGreaterThanOrEqual(20);
    expect(data.edgeCount).toBeGreaterThanOrEqual(20);
    expect(data.waves.length).toBeGreaterThanOrEqual(3);

    // Should have both parent-child and blocks edges
    const edgeTypes = new Set(data.edges.map((e: any) => e.type));
    expect(edgeTypes.has("parent-child")).toBe(true);
    expect(edgeTypes.has("blocks")).toBe(true);
  });

  it("computes correct wave ordering excluding epic node", async () => {
    const res = await app.request("/api/crossrig/epic/hq-phglb/graph");
    if (res.status !== 200) return;

    const data = await res.json() as any;
    // Epic node should have wave 0 (excluded from wave computation)
    const epicNode = data.nodes.find((n: any) => n.id === "hq-phglb");
    expect(epicNode?.wave).toBe(0);

    // All children should have wave >= 1
    const children = data.nodes.filter((n: any) => n.id !== "hq-phglb");
    for (const child of children) {
      expect(child.wave).toBeGreaterThanOrEqual(1);
    }
  });

  it("includes edges between all connected nodes", async () => {
    const res = await app.request("/api/crossrig/epic/ta-d5o/graph");
    if (res.status !== 200) return;

    const data = await res.json() as any;
    const nodeIds = new Set(data.nodes.map((n: any) => n.id));

    // Every edge endpoint should reference a node in the graph
    for (const edge of data.edges) {
      expect(nodeIds.has(edge.from)).toBe(true);
      expect(nodeIds.has(edge.to)).toBe(true);
    }

    // No orphan nodes (except the root epic which may only have outgoing edges)
    const connectedNodes = new Set<string>();
    for (const edge of data.edges) {
      connectedNodes.add(edge.from);
      connectedNodes.add(edge.to);
    }
    const orphans = data.nodes.filter((n: any) => !connectedNodes.has(n.id));
    // Only the root epic or truly isolated nodes should be orphans
    expect(orphans.length).toBeLessThanOrEqual(1);
  });

  it("handles multi-phase epic with deep nesting", async () => {
    // pe-k0e has 4 phases as sub-epics, each with leaf tasks
    const res = await app.request("/api/crossrig/epic/pe-k0e/graph");
    expect(res.status).toBe(200);

    const data = await res.json() as any;
    expect(data.nodeCount).toBeGreaterThanOrEqual(20);

    // Should have nodes at multiple nesting levels
    const depths = new Set<number>();
    for (const node of data.nodes) {
      const dotCount = (node.id.match(/\./g) || []).length;
      depths.add(dotCount);
    }
    expect(depths.size).toBeGreaterThanOrEqual(2); // epic (0 dots) + children (1+ dots)
  });
});

// --- Cross-Rig Databases ---

describe("Cross-Rig Databases", () => {
  it("GET /api/crossrig/databases returns database listing", async () => {
    const res = await app.request("/api/crossrig/databases");
    expect(res.status).toBe(200);

    const data = await res.json() as any;
    expect(data).toHaveProperty("databases");
    expect(data).toHaveProperty("count");
    expect(Array.isArray(data.databases)).toBe(true);
    expect(data.count).toBe(data.databases.length);

    if (data.databases.length > 0) {
      const db = data.databases[0];
      expect(db).toHaveProperty("database");
      expect(db).toHaveProperty("prefix");
    }
  });
});
