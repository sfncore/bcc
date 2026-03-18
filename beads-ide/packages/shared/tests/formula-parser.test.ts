/**
 * Tests for formula TOML parser.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import {
  parseAndValidateFormula,
  parseFormula,
  validateDependencies,
} from "../src/formula-parser.js";

// Load test fixtures
const fixturesDir = resolve(import.meta.dirname, "fixtures/formulas");

function loadFixture(name: string): string {
  return readFileSync(resolve(fixturesDir, name), "utf-8");
}

describe("parseFormula", () => {
  describe("empty input", () => {
    it("returns error for empty string", () => {
      const result = parseFormula("");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].message).toBe("Empty formula");
        expect(result.errors[0].type).toBe("validation");
      }
    });

    it("returns error for whitespace-only string", () => {
      const result = parseFormula("   \n\t   ");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors[0].message).toBe("Empty formula");
      }
    });
  });

  describe("syntax errors", () => {
    it("returns syntax error for invalid TOML", () => {
      const result = parseFormula("formula = [invalid toml");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors[0].type).toBe("syntax");
      }
    });

    it("returns syntax error for unclosed string", () => {
      const result = parseFormula('formula = "unclosed');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors[0].type).toBe("syntax");
      }
    });
  });

  describe('flat format (formula = "name")', () => {
    it("parses formula name from flat format", () => {
      const result = parseFormula('formula = "test-formula"');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.formula.name).toBe("test-formula");
      }
    });

    it("parses all flat format fields", () => {
      const toml = `
formula = "my-formula"
version = 1
type = "workflow"
phase = "liquid"
description = "A test formula"
`;
      const result = parseFormula(toml);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.formula.name).toBe("my-formula");
        expect(result.formula.version).toBe(1);
        expect(result.formula.type).toBe("workflow");
        expect(result.formula.phase).toBe("liquid");
        expect(result.formula.description).toBe("A test formula");
      }
    });
  });

  describe("nested format ([formula])", () => {
    it("parses formula name from nested format", () => {
      const toml = `
[formula]
name = "nested-formula"
`;
      const result = parseFormula(toml);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.formula.name).toBe("nested-formula");
      }
    });

    it("parses all nested format fields", () => {
      const toml = `
[formula]
name = "nested-formula"
version = 2
type = "transform"
phase = "solid"
description = "Nested format test"
`;
      const result = parseFormula(toml);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.formula.name).toBe("nested-formula");
        expect(result.formula.version).toBe(2);
        expect(result.formula.type).toBe("transform");
        expect(result.formula.phase).toBe("solid");
        expect(result.formula.description).toBe("Nested format test");
      }
    });
  });

  describe("missing required fields", () => {
    it("returns error when formula name is missing", () => {
      const toml = `
version = 1
type = "workflow"
`;
      const result = parseFormula(toml);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors[0].message).toContain("formula name");
        expect(result.errors[0].type).toBe("validation");
      }
    });
  });

  describe("variables", () => {
    it("parses variable definitions", () => {
      const toml = `
formula = "test"

[vars]
name = { description = "The name", required = true }
value = { description = "The value", default = "default-val" }
`;
      const result = parseFormula(toml);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.formula.vars).toHaveProperty("name");
        expect(result.formula.vars.name.description).toBe("The name");
        expect(result.formula.vars.name.required).toBe(true);
        expect(result.formula.vars).toHaveProperty("value");
        expect(result.formula.vars.value.description).toBe("The value");
        expect(result.formula.vars.value.default).toBe("default-val");
      }
    });

    it("parses enum and type fields", () => {
      const toml = `
formula = "test"

[vars]
level = { description = "Log level", enum = ["debug", "info", "warn", "error"], type = "string" }
count = { description = "Item count", type = "int" }
`;
      const result = parseFormula(toml);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.formula.vars.level.enum).toEqual(["debug", "info", "warn", "error"]);
        expect(result.formula.vars.level.type).toBe("string");
        expect(result.formula.vars.count.type).toBe("int");
      }
    });
  });

  describe("steps", () => {
    it("parses step definitions", () => {
      const toml = `
formula = "test"

[[steps]]
id = "step-1"
title = "First Step"
description = "Do something"
priority = 0

[[steps]]
id = "step-2"
title = "Second Step"
description = "Do something else"
needs = ["step-1"]
priority = 1
`;
      const result = parseFormula(toml);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.formula.steps).toHaveLength(2);
        expect(result.formula.steps[0].id).toBe("step-1");
        expect(result.formula.steps[0].title).toBe("First Step");
        expect(result.formula.steps[0].description).toBe("Do something");
        expect(result.formula.steps[0].priority).toBe(0);
        expect(result.formula.steps[1].id).toBe("step-2");
        expect(result.formula.steps[1].needs).toEqual(["step-1"]);
      }
    });

    it("returns error for step missing id", () => {
      const toml = `
formula = "test"

[[steps]]
title = "No ID Step"
description = "Missing id"
`;
      const result = parseFormula(toml);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors[0].message).toContain('missing required field "id"');
      }
    });

    it("returns error for step missing title", () => {
      const toml = `
formula = "test"

[[steps]]
id = "no-title"
description = "Missing title"
`;
      const result = parseFormula(toml);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors[0].message).toContain('missing required field "title"');
      }
    });
  });

  describe("real fixtures", () => {
    it("parses explore-module.formula.toml", () => {
      const toml = loadFixture("explore-module.formula.toml");
      const result = parseFormula(toml);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.formula.name).toBe("explore-module");
        expect(result.formula.type).toBe("workflow");
        expect(result.formula.phase).toBe("liquid");
        expect(result.formula.version).toBe(1);
        expect(Object.keys(result.formula.vars)).toContain("module_name");
        expect(Object.keys(result.formula.vars)).toContain("module_path");
        expect(Object.keys(result.formula.vars)).toContain("depth");
        expect(result.formula.steps.length).toBeGreaterThan(0);
      }
    });

    it("parses test-simple.formula.toml", () => {
      const toml = loadFixture("test-simple.formula.toml");
      const result = parseFormula(toml);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.formula.name).toBe("test-simple");
        expect(result.formula.steps).toHaveLength(2);
      }
    });
  });
});

describe("validateDependencies", () => {
  it("returns no errors for valid dependencies", () => {
    const result = parseFormula(`
formula = "test"

[[steps]]
id = "step-1"
title = "First"

[[steps]]
id = "step-2"
title = "Second"
needs = ["step-1"]
`);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const errors = validateDependencies(result.formula);
      expect(errors).toHaveLength(0);
    }
  });

  it("returns error for unknown dependency", () => {
    const result = parseFormula(`
formula = "test"

[[steps]]
id = "step-1"
title = "First"
needs = ["unknown-step"]
`);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const errors = validateDependencies(result.formula);
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('unknown dependency "unknown-step"');
    }
  });
});

describe("parseAndValidateFormula", () => {
  it("returns parse errors for invalid TOML", () => {
    const result = parseAndValidateFormula("invalid [[ toml");
    expect(result.ok).toBe(false);
  });

  it("returns dependency errors for invalid dependencies", () => {
    const result = parseAndValidateFormula(`
formula = "test"

[[steps]]
id = "step-1"
title = "First"
needs = ["missing"]
`);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0].message).toContain("unknown dependency");
    }
  });

  it("returns success for valid formula with valid dependencies", () => {
    const toml = loadFixture("explore-module.formula.toml");
    const result = parseAndValidateFormula(toml);
    expect(result.ok).toBe(true);
  });
});
