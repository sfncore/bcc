import { describe, expect, it } from "vite-plus/test";
import { toFormulaMermaid } from "../src/to-formula-mermaid.js";
import type { CookResult } from "../src/ide-types.js";

/** Helper to build a minimal valid CookResult */
function makeCook(overrides: Partial<CookResult> = {}): CookResult {
  return {
    ok: true,
    formula: "test-formula",
    version: 1,
    type: "workflow",
    steps: [],
    vars: {},
    ...overrides,
  };
}

describe("toFormulaMermaid", () => {
  it("returns empty string for failed cook", () => {
    expect(toFormulaMermaid({ ok: false, error: "bad" })).toBe("");
  });

  it("returns empty string when no steps", () => {
    expect(toFormulaMermaid(makeCook({ steps: undefined }))).toBe("");
  });

  it("generates header with formula name and version", () => {
    const result = toFormulaMermaid(makeCook({ steps: [{ id: "s1", title: "Step 1", description: "", priority: 2 }] }));
    expect(result).toContain("flowchart TD");
    expect(result).toContain("Formula: test-formula v1");
  });

  it("renders step nodes with title", () => {
    const result = toFormulaMermaid(makeCook({
      steps: [
        { id: "build", title: "Build the project", description: "", priority: 2 },
        { id: "test", title: "Run tests", description: "", priority: 2 },
      ],
    }));
    expect(result).toContain("build");
    expect(result).toContain("Build the project");
    expect(result).toContain("test");
    expect(result).toContain("Run tests");
  });

  it("renders dependency edges from needs", () => {
    const result = toFormulaMermaid(makeCook({
      steps: [
        { id: "build", title: "Build", description: "", priority: 2 },
        { id: "test", title: "Test", description: "", priority: 2, needs: ["build"] },
        { id: "deploy", title: "Deploy", description: "", priority: 2, needs: ["test"] },
      ],
    }));
    expect(result).toContain("build --> test");
    expect(result).toContain("test --> deploy");
  });

  it("includes description snippets when enabled", () => {
    const result = toFormulaMermaid(makeCook({
      steps: [{
        id: "probe",
        title: "Probe server",
        description: "Check basic server health and measure latency.\n\nMore details here.",
        priority: 2,
      }],
    }));
    expect(result).toContain("Check basic server health and measure latency.");
  });

  it("omits description snippets when disabled", () => {
    const result = toFormulaMermaid(
      makeCook({
        steps: [{
          id: "probe",
          title: "Probe server",
          description: "Check basic server health and measure latency.",
          priority: 2,
        }],
      }),
      { showDescriptions: false },
    );
    expect(result).toContain("Probe server");
    expect(result).not.toContain("Check basic server health");
  });

  it("truncates long description snippets", () => {
    const longDesc = "A".repeat(100);
    const result = toFormulaMermaid(makeCook({
      steps: [{
        id: "s1", title: "Step", description: longDesc, priority: 2,
      }],
    }), { maxDescriptionLength: 30 });
    // Should be truncated with ...
    expect(result).toContain("...");
    // Should not contain the full string
    expect(result).not.toContain(longDesc);
  });

  it("renders variables subgraph with required markers", () => {
    const result = toFormulaMermaid(makeCook({
      steps: [{ id: "s1", title: "Step 1", description: "", priority: 2 }],
      vars: {
        version: { description: "Release version", required: true },
        target: { description: "Deploy target", default: "staging" },
      },
    }));
    expect(result).toContain('subgraph vars["Variables"]');
    expect(result).toContain("version");
    expect(result).toContain("*"); // required marker
    expect(result).toContain("target");
    expect(result).toContain("staging"); // default value
  });

  it("omits variables subgraph when showVars is false", () => {
    const result = toFormulaMermaid(
      makeCook({
        steps: [{ id: "s1", title: "Step 1", description: "", priority: 2 }],
        vars: { version: { description: "ver", required: true } },
      }),
      { showVars: false },
    );
    expect(result).not.toContain("Variables");
  });

  it("detects health_check step type and uses diamond shape", () => {
    const result = toFormulaMermaid(makeCook({
      steps: [{
        id: "health-check",
        title: "Health Check",
        description: "Run health_check on the system",
        priority: 2,
      }],
    }));
    // Diamond shape uses { }
    expect(result).toContain("{");
    expect(result).toContain("healthNode");
  });

  it("detects review step type and uses subroutine shape", () => {
    const result = toFormulaMermaid(makeCook({
      steps: [{
        id: "review-code",
        title: "Review Code",
        description: "Dispatch review agent",
        priority: 2,
      }],
    }));
    expect(result).toContain("[[");
    expect(result).toContain("reviewNode");
  });

  it("detects gate step type and uses hexagon shape", () => {
    const result = toFormulaMermaid(makeCook({
      steps: [{
        id: "approval-gate",
        title: "Approval Gate",
        description: "Wait for gate check",
        priority: 2,
      }],
    }));
    expect(result).toContain("{{");
    expect(result).toContain("gateNode");
  });

  it("detects checkpoint step type", () => {
    const result = toFormulaMermaid(makeCook({
      steps: [{
        id: "checkpoint-after-build",
        title: "Context Checkpoint",
        description: "Save context",
        priority: 2,
      }],
    }));
    expect(result).toContain("checkpointNode");
  });

  it("extracts agent role from description", () => {
    const result = toFormulaMermaid(makeCook({
      steps: [{
        id: "work",
        title: "Do Work",
        description: "This step spawns a polecat to handle the task.",
        priority: 2,
      }],
    }));
    expect(result).toContain("agent: polecat");
  });

  it("handles steps as object (bd cook --compile format)", () => {
    const cook: CookResult = {
      ok: true,
      formula: "obj-formula",
      version: 1,
      steps: {
        "step-a": { title: "Step A", description: "First", depends_on: [] },
        "step-b": { title: "Step B", description: "Second", depends_on: ["step-a"] },
      } as any,
    };
    const result = toFormulaMermaid(cook);
    expect(result).toContain("step-a");
    expect(result).toContain("Step A");
    expect(result).toContain("step-b");
    expect(result).toContain("step-a --> step-b");
  });

  it("supports LR direction", () => {
    const result = toFormulaMermaid(
      makeCook({ steps: [{ id: "s1", title: "S", description: "", priority: 2 }] }),
      { direction: "LR" },
    );
    expect(result).toContain("flowchart LR");
  });

  it("connects variable nodes to steps that reference them", () => {
    const result = toFormulaMermaid(makeCook({
      steps: [{
        id: "deploy",
        title: "Deploy",
        description: "Deploy version {{version}} to {{target}}",
        priority: 2,
      }],
      vars: {
        version: { description: "Version", required: true },
        target: { description: "Target", default: "prod" },
      },
    }));
    expect(result).toContain("var_version -.-> deploy");
    expect(result).toContain("var_target -.-> deploy");
  });

  it("skips edges for dependencies not in step set", () => {
    const result = toFormulaMermaid(makeCook({
      steps: [
        { id: "s1", title: "S1", description: "", priority: 2, needs: ["nonexistent"] },
      ],
    }));
    // Should not contain an edge to nonexistent
    expect(result).not.toContain("nonexistent -->");
  });

  it("sanitizes dots in step IDs", () => {
    const result = toFormulaMermaid(makeCook({
      steps: [
        { id: "bcc-yp2.1", title: "Sub Task", description: "", priority: 2 },
      ],
    }));
    // Dots should be replaced with underscores
    expect(result).toContain("bcc-yp2_1");
    expect(result).not.toContain("bcc-yp2.1[");
  });

  it("applies styling classes", () => {
    const result = toFormulaMermaid(makeCook({
      steps: [{ id: "s1", title: "S", description: "", priority: 2 }],
    }));
    expect(result).toContain("classDef varNode");
    expect(result).toContain("classDef reviewNode");
    expect(result).toContain("classDef healthNode");
  });

  it("extracts acceptance criteria as notes", () => {
    const result = toFormulaMermaid(makeCook({
      steps: [{
        id: "validate",
        title: "Validate",
        description: "Do validation.\n\nExit criteria:\n- All tests pass\n- No regressions\n\nMore text.",
        priority: 2,
      }],
    }));
    expect(result).toContain("note right of validate");
    expect(result).toContain("All tests pass");
    expect(result).toContain("No regressions");
  });

  it("groups steps by phase when IDs match pattern", () => {
    const result = toFormulaMermaid(makeCook({
      steps: [
        { id: "kickoff", title: "Kickoff", description: "", priority: 2 },
        { id: "step-1-build", title: "Build", description: "", priority: 2, needs: ["kickoff"] },
        { id: "step-1-test", title: "Test", description: "", priority: 2, needs: ["step-1-build"] },
        { id: "step-2-deploy", title: "Deploy", description: "", priority: 2, needs: ["step-1-test"] },
      ],
    }));
    expect(result).toContain('subgraph step-1');
    expect(result).toContain('subgraph step-2');
  });
});
