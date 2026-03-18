/**
 * Tests for wave computation.
 */
import { describe, expect, it } from "vite-plus/test";
import { WORKFLOW_DEP_TYPES, computeWaves, isWorkflowDep } from "../src/wave.js";
import {
  allWorkflowTypes,
  complexDag,
  diamondPattern,
  disconnected,
  generateLargeLinearChain,
  generateWideDag,
  linearChain,
  mixedCycle,
  mixedDepTypes,
  simpleCycle,
} from "./fixtures/index.js";

describe("isWorkflowDep", () => {
  it("returns true for workflow dependency types", () => {
    expect(isWorkflowDep("blocks")).toBe(true);
    expect(isWorkflowDep("parent-child")).toBe(true);
    expect(isWorkflowDep("conditional-blocks")).toBe(true);
    expect(isWorkflowDep("waits-for")).toBe(true);
  });

  it("returns false for non-workflow dependency types", () => {
    expect(isWorkflowDep("references")).toBe(false);
    expect(isWorkflowDep("related-to")).toBe(false);
    expect(isWorkflowDep("mentions")).toBe(false);
    expect(isWorkflowDep("")).toBe(false);
  });
});

describe("computeWaves", () => {
  describe("empty input", () => {
    it("returns empty waves for empty input", () => {
      const result = computeWaves([]);
      expect(result.waves).toEqual([]);
      expect(result.cycles).toEqual([]);
      expect(result.hasCycles).toBe(false);
    });
  });

  describe("single bead", () => {
    it("handles single bead with no dependencies", () => {
      const result = computeWaves([{ id: "A", dependencies: [] }]);
      expect(result.waves).toHaveLength(1);
      expect(result.waves[0].level).toBe(0);
      expect(result.waves[0].beadIds).toEqual(["A"]);
      expect(result.hasCycles).toBe(false);
    });
  });

  describe("linear chain", () => {
    it("produces 3 waves for A->B->C", () => {
      const result = computeWaves(linearChain);

      expect(result.waves).toHaveLength(3);
      expect(result.waves[0].beadIds).toEqual(["A"]);
      expect(result.waves[1].beadIds).toEqual(["B"]);
      expect(result.waves[2].beadIds).toEqual(["C"]);
      expect(result.hasCycles).toBe(false);
    });
  });

  describe("diamond pattern", () => {
    it("produces correct parallelism (B and C in same wave)", () => {
      const result = computeWaves(diamondPattern);

      expect(result.waves).toHaveLength(3);
      expect(result.waves[0].beadIds).toEqual(["A"]);
      expect(result.waves[1].beadIds).toEqual(["B", "C"]);
      expect(result.waves[2].beadIds).toEqual(["D"]);
      expect(result.hasCycles).toBe(false);
    });
  });

  describe("cycle detection", () => {
    it("detects simple cycle and returns cycle members", () => {
      const result = computeWaves(simpleCycle);

      expect(result.waves).toHaveLength(0);
      expect(result.hasCycles).toBe(true);
      expect(result.cycles).toHaveLength(1);
      expect(result.cycles[0].sort()).toEqual(["A", "B", "C"]);
    });

    it("handles mixed cycle with valid prefix", () => {
      const result = computeWaves(mixedCycle);

      // D should be in wave 0, but A, B, C form a cycle
      expect(result.waves).toHaveLength(1);
      expect(result.waves[0].beadIds).toEqual(["D"]);
      expect(result.hasCycles).toBe(true);
      expect(result.cycles).toHaveLength(1);
      expect(result.cycles[0].sort()).toEqual(["A", "B", "C"]);
    });
  });

  describe("disconnected components", () => {
    it("handles disconnected components in parallel", () => {
      const result = computeWaves(disconnected);

      expect(result.waves).toHaveLength(2);
      expect(result.waves[0].beadIds).toEqual(["A", "C"]);
      expect(result.waves[1].beadIds).toEqual(["B", "D"]);
      expect(result.hasCycles).toBe(false);
    });
  });

  describe("complex DAG", () => {
    it("correctly computes waves for complex DAG", () => {
      const result = computeWaves(complexDag);

      expect(result.waves).toHaveLength(4);
      expect(result.waves[0].beadIds).toEqual(["A"]);
      expect(result.waves[1].beadIds).toEqual(["B", "C", "D"]);
      expect(result.waves[2].beadIds).toEqual(["E", "F"]);
      expect(result.waves[3].beadIds).toEqual(["G"]);
      expect(result.hasCycles).toBe(false);
    });
  });

  describe("dependency type filtering", () => {
    it("only considers workflow dependency types", () => {
      const result = computeWaves(mixedDepTypes);

      // C has a 'references' dependency which is non-workflow
      // So A and C should be in wave 0, B in wave 1
      expect(result.waves).toHaveLength(2);
      expect(result.waves[0].beadIds).toEqual(["A", "C"]);
      expect(result.waves[1].beadIds).toEqual(["B"]);
      expect(result.hasCycles).toBe(false);
    });

    it("handles all workflow dependency types", () => {
      const result = computeWaves(allWorkflowTypes);

      expect(result.waves).toHaveLength(5);
      expect(result.waves[0].beadIds).toEqual(["A"]);
      expect(result.waves[1].beadIds).toEqual(["B"]);
      expect(result.waves[2].beadIds).toEqual(["C"]);
      expect(result.waves[3].beadIds).toEqual(["D"]);
      expect(result.waves[4].beadIds).toEqual(["E"]);
      expect(result.hasCycles).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("handles beads with undefined dependencies", () => {
      const result = computeWaves([{ id: "A" }, { id: "B" }]);

      expect(result.waves).toHaveLength(1);
      expect(result.waves[0].beadIds).toEqual(["A", "B"]);
      expect(result.hasCycles).toBe(false);
    });

    it("ignores dependencies to beads not in the input set", () => {
      const result = computeWaves([
        { id: "A", dependencies: [] },
        {
          id: "B",
          dependencies: [
            { source: "A", target: "B", type: "blocks" },
            { source: "MISSING", target: "B", type: "blocks" },
          ],
        },
      ]);

      expect(result.waves).toHaveLength(2);
      expect(result.waves[0].beadIds).toEqual(["A"]);
      expect(result.waves[1].beadIds).toEqual(["B"]);
      expect(result.hasCycles).toBe(false);
    });

    it("handles duplicate dependencies gracefully", () => {
      const result = computeWaves([
        { id: "A", dependencies: [] },
        {
          id: "B",
          dependencies: [
            { source: "A", target: "B", type: "blocks" },
            { source: "A", target: "B", type: "blocks" },
          ],
        },
      ]);

      expect(result.waves).toHaveLength(2);
      expect(result.hasCycles).toBe(false);
    });
  });

  describe("performance", () => {
    it("computes 200 beads in linear chain under 50ms", () => {
      const beads = generateLargeLinearChain(200);

      const start = performance.now();
      const result = computeWaves(beads);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(50);
      expect(result.waves).toHaveLength(200);
      expect(result.hasCycles).toBe(false);
    });

    it("computes wide DAG (20 chains x 10 depth) efficiently", () => {
      const beads = generateWideDag(20, 10);

      const start = performance.now();
      const result = computeWaves(beads);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(50);
      // 10 waves for depth + 1 for final merge
      expect(result.waves).toHaveLength(11);
      expect(result.hasCycles).toBe(false);
    });
  });

  describe("determinism", () => {
    it("produces consistent output across multiple runs", () => {
      const result1 = computeWaves(complexDag);
      const result2 = computeWaves(complexDag);

      expect(result1).toEqual(result2);
    });

    it("sorts bead IDs within each wave", () => {
      // Create beads in reverse order
      const beads = [
        { id: "C", dependencies: [] },
        { id: "B", dependencies: [] },
        { id: "A", dependencies: [] },
      ];

      const result = computeWaves(beads);

      expect(result.waves[0].beadIds).toEqual(["A", "B", "C"]);
    });
  });
});

describe("WORKFLOW_DEP_TYPES", () => {
  it("contains expected dependency types", () => {
    expect(WORKFLOW_DEP_TYPES).toContain("blocks");
    expect(WORKFLOW_DEP_TYPES).toContain("parent-child");
    expect(WORKFLOW_DEP_TYPES).toContain("conditional-blocks");
    expect(WORKFLOW_DEP_TYPES).toContain("waits-for");
    expect(WORKFLOW_DEP_TYPES).toHaveLength(4);
  });
});
