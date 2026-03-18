/**
 * Tests for TOML updater functions.
 */
import { describe, expect, it } from "vite-plus/test";
import { updateVarDefault, updateVarDefaults } from "../../src/lib/toml-updater";

describe("updateVarDefault", () => {
  it("updates existing default value in vars section", () => {
    const toml = `formula = "test"

[vars.project]
description = "The project name"
default = "old-value"
required = true

[[steps]]
id = "step1"
title = "First step"
`;
    const result = updateVarDefault(toml, "project", "new-value");

    expect(result).toContain('default = "new-value"');
    expect(result).not.toContain('default = "old-value"');
  });

  it("adds default value when missing in existing section", () => {
    const toml = `formula = "test"

[vars.project]
description = "The project name"
required = true

[[steps]]
id = "step1"
title = "First step"
`;
    const result = updateVarDefault(toml, "project", "my-value");

    expect(result).toContain("[vars.project]");
    expect(result).toContain('default = "my-value"');
    expect(result).toContain('description = "The project name"');
  });

  it("handles boolean values without quotes", () => {
    const toml = `formula = "test"

[vars.enabled]
description = "Enable feature"
type = "bool"
default = false

[[steps]]
id = "step1"
`;
    const result = updateVarDefault(toml, "enabled", "true");

    expect(result).toContain("default = true");
    expect(result).not.toContain('default = "true"');
  });

  it("handles integer values without quotes", () => {
    const toml = `formula = "test"

[vars.count]
description = "Item count"
type = "int"
default = 5

[[steps]]
id = "step1"
`;
    const result = updateVarDefault(toml, "count", "42");

    expect(result).toContain("default = 42");
    expect(result).not.toContain('default = "42"');
  });

  it("escapes quotes in string values", () => {
    const toml = `formula = "test"

[vars.message]
description = "A message"
default = "hello"

[[steps]]
id = "step1"
`;
    const result = updateVarDefault(toml, "message", 'say "hello"');

    expect(result).toContain('default = "say \\"hello\\""');
  });

  it("removes default when value is empty", () => {
    const toml = `formula = "test"

[vars.project]
description = "The project name"
default = "old-value"
required = true

[[steps]]
id = "step1"
`;
    const result = updateVarDefault(toml, "project", "");

    expect(result).toContain("[vars.project]");
    expect(result).not.toContain("default =");
    expect(result).toContain("required = true");
  });

  it("preserves other sections and formatting", () => {
    const toml = `# Header comment
formula = "test"
version = 1
type = "workflow"

[vars.project]
description = "The project name"
default = "old"

[vars.env]
description = "Environment"
enum = ["dev", "prod"]

[[steps]]
id = "step1"
title = "Step 1"
needs = []
`;
    const result = updateVarDefault(toml, "project", "new");

    // Preserves header
    expect(result).toContain("# Header comment");
    // Updates target var
    expect(result).toContain("[vars.project]");
    expect(result).toContain('default = "new"');
    // Preserves other vars
    expect(result).toContain("[vars.env]");
    expect(result).toContain('enum = ["dev", "prod"]');
    // Preserves steps
    expect(result).toContain("[[steps]]");
    expect(result).toContain('id = "step1"');
  });

  it("handles multiple vars with same prefix correctly", () => {
    const toml = `formula = "test"

[vars.name]
description = "Name"
default = "old-name"

[vars.namespace]
description = "Namespace"
default = "old-namespace"

[[steps]]
id = "step1"
`;
    const result = updateVarDefault(toml, "name", "new-name");

    expect(result).toContain("[vars.name]");
    expect(result).toContain('default = "new-name"');
    // namespace should be unchanged
    expect(result).toContain("[vars.namespace]");
    expect(result).toContain('default = "old-namespace"');
  });
});

describe("updateVarDefaults", () => {
  it("updates multiple variables at once", () => {
    const toml = `formula = "test"

[vars.project]
description = "Project name"
default = "old-project"

[vars.env]
description = "Environment"
default = "dev"

[[steps]]
id = "step1"
`;
    const result = updateVarDefaults(toml, {
      project: "new-project",
      env: "prod",
    });

    expect(result).toContain('default = "new-project"');
    expect(result).toContain('default = "prod"');
  });
});
