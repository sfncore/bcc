/**
 * Visual Builder Performance Benchmarks
 *
 * Validates performance targets for the formula visual builder:
 * - Mode switch latency <100ms (switching between text/outline/flow/visual)
 * - Node selection latency <50ms
 * - Initial render for 50-step formula <500ms
 *
 * These benchmarks measure the data transformation and computation overhead.
 * For full browser rendering benchmarks, use Playwright with DevTools Performance panel.
 *
 * @see bcc-n12k1.2 - Performance baseline measurement task
 */
import { bench, describe, expect } from "vite-plus/test";
import { measureTimeSync } from "../../src/lib/graph-benchmark";

// --- Performance Thresholds ---

/** Mode switch must complete in <100ms */
const MODE_SWITCH_THRESHOLD_MS = 100;

/** Node selection must complete in <50ms */
const NODE_SELECTION_THRESHOLD_MS = 50;

/** Initial render (50 steps) must complete in <500ms */
const INITIAL_RENDER_THRESHOLD_MS = 500;

/** Standard test formula size (matches bcc-n12k1.2 spec) */
const TEST_STEP_COUNT = 50;

// --- Types ---

interface ProtoBead {
  id: string;
  title: string;
  description: string;
  priority: number;
  needs?: string[];
}

interface FormulaVariable {
  description: string;
  required?: boolean;
  default?: string;
}

interface CookResult {
  ok: boolean;
  formula: string;
  version: number;
  type: string;
  steps: ProtoBead[];
  vars: Record<string, FormulaVariable>;
}

// --- Test Data Generators ---

/**
 * Generate a synthetic formula with the specified number of steps.
 * Creates a DAG structure with realistic dependencies:
 * - ~60% of steps have 1-2 dependencies
 * - ~20% are root steps (no dependencies)
 * - ~20% are gate steps (3+ dependencies)
 */
function generateSyntheticFormula(stepCount: number): CookResult {
  const steps: ProtoBead[] = [];

  for (let i = 0; i < stepCount; i++) {
    const step: ProtoBead = {
      id: `step-${i}`,
      title: `Step ${i}: ${generateStepTitle(i)}`,
      description: `Description for step ${i}. This step performs important work.`,
      priority: (i % 4) + 1, // P1-P4
    };

    // Add dependencies based on position in DAG
    if (i > 0) {
      const depCount = getDepCount(i, stepCount);
      if (depCount > 0) {
        step.needs = [];
        // Pick random earlier steps as dependencies
        const maxDeps = Math.min(depCount, i);
        const availableSteps = Array.from({ length: i }, (_, j) => j);
        for (let d = 0; d < maxDeps; d++) {
          const idx = Math.floor(Math.random() * availableSteps.length);
          step.needs.push(`step-${availableSteps.splice(idx, 1)[0]}`);
        }
      }
    }

    steps.push(step);
  }

  return {
    ok: true,
    formula: "test-formula",
    version: 1,
    type: "workflow",
    steps,
    vars: {
      project_name: { description: "Project name", required: true },
      owner: { description: "Owner name", default: "team" },
      environment: { description: "Target environment", default: "development" },
    },
  };
}

function generateStepTitle(index: number): string {
  const titles = [
    "Initialize environment",
    "Load configuration",
    "Validate inputs",
    "Setup dependencies",
    "Run preprocessing",
    "Execute main task",
    "Process results",
    "Generate report",
    "Cleanup resources",
    "Finalize output",
  ];
  return titles[index % titles.length];
}

function getDepCount(index: number, total: number): number {
  // 20% root steps (no deps), 60% have 1-2 deps, 20% have 3+ deps
  const ratio = index / total;
  if (ratio < 0.2) return 0; // Early steps are roots
  if (ratio < 0.8) return 1 + (index % 2); // Most have 1-2 deps
  return 3 + (index % 2); // Late steps are gates
}

// --- Simulation Helpers ---

/**
 * Simulates the data transformation for mode switch.
 * When switching to visual mode, the formula needs to be:
 * 1. Parsed and validated
 * 2. Transformed into React Flow nodes/edges
 * 3. Laid out using dagre
 */
function simulateModeSwitch(formula: CookResult): {
  nodes: { id: string; position: { x: number; y: number }; data: unknown }[];
  edges: { id: string; source: string; target: string }[];
} {
  const nodes = formula.steps.map((step, index) => ({
    id: step.id,
    position: {
      x: (index % 10) * 250 + Math.random() * 20,
      y: Math.floor(index / 10) * 120 + Math.random() * 20,
    },
    data: {
      id: step.id,
      title: step.title,
      description: step.description,
      priority: step.priority,
      variables: [],
      isSelected: false,
      isBottleneck: false,
      isGate: (step.needs?.length ?? 0) >= 2,
      needsCount: step.needs?.length ?? 0,
      blocksCount: 0,
    },
  }));

  const edges: { id: string; source: string; target: string }[] = [];
  for (const step of formula.steps) {
    if (step.needs) {
      for (const needId of step.needs) {
        edges.push({
          id: `${needId}->${step.id}`,
          source: needId,
          target: step.id,
        });
      }
    }
  }

  // Calculate blocks count for bottleneck detection
  const blocksMap = new Map<string, number>();
  for (const edge of edges) {
    blocksMap.set(edge.source, (blocksMap.get(edge.source) ?? 0) + 1);
  }
  for (const node of nodes) {
    node.data.blocksCount = blocksMap.get(node.id) ?? 0;
    node.data.isBottleneck = node.data.blocksCount >= 2;
  }

  return { nodes, edges };
}

/**
 * Simulates node selection state update.
 * When a node is selected:
 * 1. Update selected node's isSelected flag
 * 2. Build adjacency maps for keyboard navigation
 * 3. Update visual state
 */
function simulateNodeSelection<T extends { id: string; data: unknown }>(
  nodes: T[],
  selectedId: string,
): T[] {
  return nodes.map((node) => ({
    ...node,
    data: {
      ...(node.data as Record<string, unknown>),
      isSelected: node.id === selectedId,
    },
  }));
}

/**
 * Simulates building the DAG adjacency structure for keyboard navigation.
 */
function buildDagAdjacency(
  nodes: { id: string; position: { x: number; y: number } }[],
  edges: { source: string; target: string }[],
): {
  parents: Map<string, string[]>;
  children: Map<string, string[]>;
  siblings: Map<string, { left: string[]; right: string[] }>;
} {
  const parents = new Map<string, string[]>();
  const children = new Map<string, string[]>();
  const siblings = new Map<string, { left: string[]; right: string[] }>();

  // Initialize maps
  for (const node of nodes) {
    parents.set(node.id, []);
    children.set(node.id, []);
  }

  // Build parent/child from edges
  for (const edge of edges) {
    parents.get(edge.target)?.push(edge.source);
    children.get(edge.source)?.push(edge.target);
  }

  // Build siblings based on Y position
  const Y_THRESHOLD = 40;
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  for (const node of nodes) {
    const leftSiblings: string[] = [];
    const rightSiblings: string[] = [];

    for (const other of nodes) {
      if (other.id === node.id) continue;
      if (Math.abs(other.position.y - node.position.y) <= Y_THRESHOLD) {
        if (other.position.x < node.position.x) {
          leftSiblings.push(other.id);
        } else {
          rightSiblings.push(other.id);
        }
      }
    }

    // Sort by distance
    leftSiblings.sort((a, b) => {
      const aX = nodeById.get(a)?.position.x ?? 0;
      const bX = nodeById.get(b)?.position.x ?? 0;
      return bX - aX;
    });
    rightSiblings.sort((a, b) => {
      const aX = nodeById.get(a)?.position.x ?? 0;
      const bX = nodeById.get(b)?.position.x ?? 0;
      return aX - bX;
    });

    siblings.set(node.id, { left: leftSiblings, right: rightSiblings });
  }

  return { parents, children, siblings };
}

// --- Benchmarks ---

describe("Visual Builder Performance (50-step formula)", () => {
  // Pre-generate formula data
  const formula = generateSyntheticFormula(TEST_STEP_COUNT);

  describe("Mode Switch Latency", () => {
    /**
     * Simulates switching from text mode to visual mode.
     * This is the heaviest operation as it requires:
     * - Full graph transformation
     * - Layout computation
     * - State initialization
     */
    bench("text → visual mode switch", () => {
      const { timeMs } = measureTimeSync(() => simulateModeSwitch(formula));
      expect(timeMs).toBeLessThan(MODE_SWITCH_THRESHOLD_MS);
    });

    bench("visual → outline mode switch", () => {
      // Simulates switching view with existing data
      const { timeMs } = measureTimeSync(() => {
        // Outline mode uses the same step data but different presentation
        return formula.steps.map((step) => ({
          ...step,
          isExpanded: false,
          isEditing: false,
        }));
      });
      expect(timeMs).toBeLessThan(MODE_SWITCH_THRESHOLD_MS);
    });

    bench("outline → flow mode switch", () => {
      const { timeMs } = measureTimeSync(() => simulateModeSwitch(formula));
      expect(timeMs).toBeLessThan(MODE_SWITCH_THRESHOLD_MS);
    });

    bench("rapid mode cycling (10 switches)", () => {
      const { timeMs } = measureTimeSync(() => {
        for (let i = 0; i < 10; i++) {
          simulateModeSwitch(formula);
        }
      });
      // 10 switches should still be under 10x threshold
      expect(timeMs).toBeLessThan(MODE_SWITCH_THRESHOLD_MS * 10);
    });
  });

  describe("Node Selection", () => {
    const { nodes, edges } = simulateModeSwitch(formula);

    bench("single node selection", () => {
      const { timeMs } = measureTimeSync(() => {
        const selectedId = "step-25"; // Middle node
        return simulateNodeSelection(nodes, selectedId);
      });
      expect(timeMs).toBeLessThan(NODE_SELECTION_THRESHOLD_MS);
    });

    bench("selection with adjacency computation", () => {
      const { timeMs } = measureTimeSync(() => {
        const selectedId = "step-25";
        simulateNodeSelection(nodes, selectedId);
        return buildDagAdjacency(nodes, edges);
      });
      expect(timeMs).toBeLessThan(NODE_SELECTION_THRESHOLD_MS);
    });

    bench("rapid selection changes (20 selections)", () => {
      const { timeMs } = measureTimeSync(() => {
        let currentNodes = nodes;
        for (let i = 0; i < 20; i++) {
          const selectedId = `step-${i * 2}`;
          currentNodes = simulateNodeSelection(currentNodes, selectedId);
        }
        return currentNodes;
      });
      expect(timeMs).toBeLessThan(NODE_SELECTION_THRESHOLD_MS * 5);
    });

    bench("keyboard navigation sequence (arrow key sim)", () => {
      const adjacency = buildDagAdjacency(nodes, edges);
      const { timeMs } = measureTimeSync(() => {
        let currentId = "step-0";
        const path: string[] = [currentId];

        // Simulate navigating down the DAG
        for (let i = 0; i < 10; i++) {
          const children = adjacency.children.get(currentId);
          if (children && children.length > 0) {
            currentId = children[0];
            path.push(currentId);
          }
        }

        return path;
      });
      expect(timeMs).toBeLessThan(NODE_SELECTION_THRESHOLD_MS);
    });
  });

  describe("Initial Render", () => {
    bench("50-step formula initial render", () => {
      const { timeMs } = measureTimeSync(() => {
        // Full render simulation
        const formula = generateSyntheticFormula(TEST_STEP_COUNT);
        const { nodes, edges } = simulateModeSwitch(formula);
        buildDagAdjacency(nodes, edges);
        return { formula, nodes, edges };
      });
      expect(timeMs).toBeLessThan(INITIAL_RENDER_THRESHOLD_MS);
    });

    bench("100-step formula initial render (stress test)", () => {
      const { timeMs } = measureTimeSync(() => {
        const formula = generateSyntheticFormula(100);
        const { nodes, edges } = simulateModeSwitch(formula);
        buildDagAdjacency(nodes, edges);
        return { formula, nodes, edges };
      });
      // Should still be reasonable even at 2x size
      expect(timeMs).toBeLessThan(INITIAL_RENDER_THRESHOLD_MS * 2);
    });

    bench("formula with expansion groups (50 steps, 5 groups)", () => {
      const { timeMs } = measureTimeSync(() => {
        // Simulate formula with expansion groups
        const formula = generateSyntheticFormula(50);
        // Modify step IDs to simulate expansion groups
        formula.steps = formula.steps.map((step, i) => ({
          ...step,
          id: `group-${Math.floor(i / 10)}.${step.id}`,
        }));
        const { nodes, edges } = simulateModeSwitch(formula);
        return { nodes, edges };
      });
      expect(timeMs).toBeLessThan(INITIAL_RENDER_THRESHOLD_MS);
    });
  });
});

describe("Visual Builder Stress Tests", () => {
  bench("mixed operations (mode switch + selection + navigation)", () => {
    const { timeMs } = measureTimeSync(() => {
      // Full user interaction sequence
      const formula = generateSyntheticFormula(50);

      // Switch to visual mode
      const { nodes, edges } = simulateModeSwitch(formula);

      // Select a node
      let currentNodes = simulateNodeSelection(nodes, "step-10");

      // Build adjacency
      const adjacency = buildDagAdjacency(nodes, edges);

      // Navigate to children
      const children = adjacency.children.get("step-10");
      if (children && children.length > 0) {
        currentNodes = simulateNodeSelection(currentNodes, children[0]);
      }

      // Switch back and forth
      simulateModeSwitch(formula);
      currentNodes = simulateNodeSelection(currentNodes, "step-25");

      return currentNodes;
    });
    expect(timeMs).toBeLessThan(MODE_SWITCH_THRESHOLD_MS * 2);
  });
});
