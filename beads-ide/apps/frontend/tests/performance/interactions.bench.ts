/**
 * Graph Interaction Performance Benchmarks
 *
 * Validates performance targets from the spec:
 * - Pan latency <100ms
 * - Zoom latency <100ms
 * - Drag latency <100ms
 *
 * These benchmarks simulate the computational overhead of interaction handlers,
 * measuring the time to process viewport/position transformations.
 *
 * Note: Full interaction benchmarks require browser automation (Playwright).
 * These benchmarks validate the data transformation layer meets targets.
 */
import { bench, describe, expect } from "vite-plus/test";
import { generateSyntheticGraph, measureTimeSync } from "../../src/lib/graph-benchmark";

/** Performance threshold for interactions (100ms) */
const INTERACTION_THRESHOLD_MS = 100;

/** Standard test graph size for interaction benchmarks */
const TEST_NODE_COUNT = 200;

describe("Interaction Performance", () => {
  // Pre-generate graph data for consistent benchmarking
  const graph = generateSyntheticGraph(TEST_NODE_COUNT);
  const nodes = graph.nodes.map((node) => ({
    id: node.id,
    position: { x: node.x ?? 0, y: node.y ?? 0 },
    data: { label: node.label },
  }));

  describe("Pan Operations", () => {
    /**
     * Simulates viewport pan by transforming all node positions.
     * This represents the computational work needed to update node positions
     * during a pan operation.
     */
    const simulatePan = (deltaX: number, deltaY: number) => {
      return nodes.map((node) => ({
        ...node,
        position: {
          x: node.position.x + deltaX,
          y: node.position.y + deltaY,
        },
      }));
    };

    bench("pan operation (200 nodes)", () => {
      const { timeMs } = measureTimeSync(() => simulatePan(100, 100));
      expect(timeMs).toBeLessThan(INTERACTION_THRESHOLD_MS);
    });

    bench("rapid pan sequence (10 operations)", () => {
      const { timeMs } = measureTimeSync(() => {
        for (let i = 0; i < 10; i++) {
          simulatePan(10 * i, 10 * i);
        }
      });
      expect(timeMs).toBeLessThan(INTERACTION_THRESHOLD_MS);
    });
  });

  describe("Zoom Operations", () => {
    /**
     * Simulates zoom by scaling all node positions around a center point.
     */
    const simulateZoom = (scale: number, centerX: number, centerY: number) => {
      return nodes.map((node) => ({
        ...node,
        position: {
          x: centerX + (node.position.x - centerX) * scale,
          y: centerY + (node.position.y - centerY) * scale,
        },
      }));
    };

    bench("zoom in (200 nodes)", () => {
      const { timeMs } = measureTimeSync(() => simulateZoom(1.5, 500, 500));
      expect(timeMs).toBeLessThan(INTERACTION_THRESHOLD_MS);
    });

    bench("zoom out (200 nodes)", () => {
      const { timeMs } = measureTimeSync(() => simulateZoom(0.5, 500, 500));
      expect(timeMs).toBeLessThan(INTERACTION_THRESHOLD_MS);
    });

    bench("rapid zoom sequence (10 operations)", () => {
      const { timeMs } = measureTimeSync(() => {
        for (let i = 0; i < 10; i++) {
          const scale = 1 + i * 0.1;
          simulateZoom(scale, 500, 500);
        }
      });
      expect(timeMs).toBeLessThan(INTERACTION_THRESHOLD_MS);
    });
  });

  describe("Drag Operations", () => {
    /**
     * Simulates node drag by updating a single node's position.
     * This is the fastest operation since it only affects one node.
     */
    const simulateDrag = (nodeIndex: number, newX: number, newY: number) => {
      return nodes.map((node, index) =>
        index === nodeIndex ? { ...node, position: { x: newX, y: newY } } : node,
      );
    };

    bench("single node drag (200 node graph)", () => {
      const { timeMs } = measureTimeSync(() => simulateDrag(0, 200, 200));
      expect(timeMs).toBeLessThan(INTERACTION_THRESHOLD_MS);
    });

    bench("drag path (20 position updates)", () => {
      const { timeMs } = measureTimeSync(() => {
        for (let i = 0; i < 20; i++) {
          simulateDrag(0, 100 + i * 5, 100 + i * 5);
        }
      });
      expect(timeMs).toBeLessThan(INTERACTION_THRESHOLD_MS);
    });

    bench("multi-node selection drag (10 nodes)", () => {
      const { timeMs } = measureTimeSync(() => {
        const selectedIndices = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
        const deltaX = 100;
        const deltaY = 100;
        return nodes.map((node, index) =>
          selectedIndices.includes(index)
            ? {
                ...node,
                position: {
                  x: node.position.x + deltaX,
                  y: node.position.y + deltaY,
                },
              }
            : node,
        );
      });
      expect(timeMs).toBeLessThan(INTERACTION_THRESHOLD_MS);
    });
  });
});

describe("Combined Interaction Stress Test", () => {
  bench("mixed operations (pan + zoom + drag)", () => {
    const graph = generateSyntheticGraph(TEST_NODE_COUNT);
    let currentNodes = graph.nodes.map((node) => ({
      id: node.id,
      position: { x: node.x ?? 0, y: node.y ?? 0 },
    }));

    const { timeMs } = measureTimeSync(() => {
      // Simulate a typical user interaction sequence
      for (let i = 0; i < 5; i++) {
        // Pan
        currentNodes = currentNodes.map((node) => ({
          ...node,
          position: { x: node.position.x + 10, y: node.position.y + 10 },
        }));

        // Zoom
        currentNodes = currentNodes.map((node) => ({
          ...node,
          position: { x: node.position.x * 1.1, y: node.position.y * 1.1 },
        }));

        // Drag a node
        currentNodes = currentNodes.map((node, index) =>
          index === i ? { ...node, position: { x: 200, y: 200 } } : node,
        );
      }
    });

    expect(timeMs).toBeLessThan(INTERACTION_THRESHOLD_MS);
  });
});
