/**
 * Filter/Search Performance Benchmarks
 *
 * Validates performance targets from the spec:
 * - Search/filter <100ms for 200 beads (client-side)
 *
 * These benchmarks measure the time to filter graph data based on
 * various criteria (label text, node properties, edge relationships).
 */
import { bench, describe, expect } from "vite-plus/test";
import { generateSyntheticGraph, measureTimeSync } from "../../src/lib/graph-benchmark";

/** Performance threshold for filter operations (100ms) */
const FILTER_THRESHOLD_MS = 100;

/** Standard test graph size for filter benchmarks */
const TEST_NODE_COUNT = 200;

describe("Filter Performance", () => {
  // Pre-generate graph data with richer labels for search testing
  const graph = generateSyntheticGraph(TEST_NODE_COUNT);
  const nodes = graph.nodes.map((node, index) => ({
    id: node.id,
    label: node.label,
    type: ["task", "bug", "epic", "story"][index % 4],
    status: ["open", "in_progress", "closed"][index % 3],
    priority: ["P0", "P1", "P2", "P3"][index % 4],
    tags: [`tag-${index % 10}`, `category-${index % 5}`],
    position: { x: node.x ?? 0, y: node.y ?? 0 },
  }));

  describe("Text Search", () => {
    bench("search by label substring (200 nodes)", () => {
      const searchTerm = "Node 1"; // Matches Node 1, 10-19, 100-199
      const { timeMs } = measureTimeSync(() => {
        return nodes.filter((node) => node.label.toLowerCase().includes(searchTerm.toLowerCase()));
      });
      expect(timeMs).toBeLessThan(FILTER_THRESHOLD_MS);
    });

    bench("search by exact label (200 nodes)", () => {
      const searchTerm = "Node 50";
      const { timeMs } = measureTimeSync(() => {
        return nodes.filter((node) => node.label === searchTerm);
      });
      expect(timeMs).toBeLessThan(FILTER_THRESHOLD_MS);
    });

    bench("search with regex pattern (200 nodes)", () => {
      const pattern = /Node \d{2}$/; // Matches 2-digit node numbers
      const { timeMs } = measureTimeSync(() => {
        return nodes.filter((node) => pattern.test(node.label));
      });
      expect(timeMs).toBeLessThan(FILTER_THRESHOLD_MS);
    });
  });

  describe("Property Filters", () => {
    bench("filter by type (200 nodes)", () => {
      const { timeMs } = measureTimeSync(() => {
        return nodes.filter((node) => node.type === "bug");
      });
      expect(timeMs).toBeLessThan(FILTER_THRESHOLD_MS);
    });

    bench("filter by status (200 nodes)", () => {
      const { timeMs } = measureTimeSync(() => {
        return nodes.filter((node) => node.status === "open");
      });
      expect(timeMs).toBeLessThan(FILTER_THRESHOLD_MS);
    });

    bench("filter by multiple properties (200 nodes)", () => {
      const { timeMs } = measureTimeSync(() => {
        return nodes.filter(
          (node) =>
            node.type === "task" &&
            node.status === "in_progress" &&
            (node.priority === "P0" || node.priority === "P1"),
        );
      });
      expect(timeMs).toBeLessThan(FILTER_THRESHOLD_MS);
    });

    bench("filter by tag membership (200 nodes)", () => {
      const targetTag = "tag-5";
      const { timeMs } = measureTimeSync(() => {
        return nodes.filter((node) => node.tags.includes(targetTag));
      });
      expect(timeMs).toBeLessThan(FILTER_THRESHOLD_MS);
    });
  });

  describe("Combined Search + Filter", () => {
    bench("text search + type filter (200 nodes)", () => {
      const searchTerm = "Node";
      const filterType = "bug";
      const { timeMs } = measureTimeSync(() => {
        return nodes.filter(
          (node) =>
            node.label.toLowerCase().includes(searchTerm.toLowerCase()) && node.type === filterType,
        );
      });
      expect(timeMs).toBeLessThan(FILTER_THRESHOLD_MS);
    });

    bench("complex query (search + multiple filters)", () => {
      const { timeMs } = measureTimeSync(() => {
        const searchTerm = "1";
        const allowedTypes = ["task", "bug"];
        const allowedStatuses = ["open", "in_progress"];
        const requiredTag = "tag-";

        return nodes.filter(
          (node) =>
            node.label.includes(searchTerm) &&
            allowedTypes.includes(node.type) &&
            allowedStatuses.includes(node.status) &&
            node.tags.some((tag) => tag.startsWith(requiredTag)),
        );
      });
      expect(timeMs).toBeLessThan(FILTER_THRESHOLD_MS);
    });
  });

  describe("Edge Filtering", () => {
    bench("filter edges by source node (200 nodes, ~300 edges)", () => {
      const targetSourceId = "node-50";
      const { timeMs } = measureTimeSync(() => {
        return graph.edges.filter((edge) => edge.source === targetSourceId);
      });
      expect(timeMs).toBeLessThan(FILTER_THRESHOLD_MS);
    });

    bench("filter edges by endpoint (source OR target)", () => {
      const targetNodeId = "node-50";
      const { timeMs } = measureTimeSync(() => {
        return graph.edges.filter(
          (edge) => edge.source === targetNodeId || edge.target === targetNodeId,
        );
      });
      expect(timeMs).toBeLessThan(FILTER_THRESHOLD_MS);
    });

    bench("find all connected nodes (graph traversal)", () => {
      const startNodeId = "node-0";
      const { timeMs } = measureTimeSync(() => {
        const connected = new Set<string>([startNodeId]);
        const queue = [startNodeId];

        while (queue.length > 0) {
          const current = queue.shift();
          if (current === undefined) continue;
          for (const edge of graph.edges) {
            if (edge.source === current && !connected.has(edge.target)) {
              connected.add(edge.target);
              queue.push(edge.target);
            }
            if (edge.target === current && !connected.has(edge.source)) {
              connected.add(edge.source);
              queue.push(edge.source);
            }
          }
        }

        return connected;
      });
      expect(timeMs).toBeLessThan(FILTER_THRESHOLD_MS);
    });
  });
});

describe("Filter Result Processing", () => {
  const graph = generateSyntheticGraph(TEST_NODE_COUNT);
  const nodes = graph.nodes;

  bench("filter + sort results (200 nodes)", () => {
    const { timeMs } = measureTimeSync(() => {
      const filtered = nodes.filter((node) => node.label.includes("1"));
      return filtered.sort((a, b) => a.label.localeCompare(b.label));
    });
    expect(timeMs).toBeLessThan(FILTER_THRESHOLD_MS);
  });

  bench("filter + group by first digit (200 nodes)", () => {
    const { timeMs } = measureTimeSync(() => {
      const filtered = nodes.filter((node) => node.label.includes("Node"));
      const groups: Record<string, typeof filtered> = {};

      for (const node of filtered) {
        const match = node.label.match(/Node (\d)/);
        const key = match ? match[1] : "other";
        if (!groups[key]) groups[key] = [];
        groups[key].push(node);
      }

      return groups;
    });
    expect(timeMs).toBeLessThan(FILTER_THRESHOLD_MS);
  });
});
