import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type {
  TreeError,
  TreeResponse,
  WorkspaceError,
  WorkspaceInitResponse,
  WorkspaceOpenResponse,
  WorkspaceStateResponse,
} from "@beads-ide/shared";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import * as config from "../../src/config.js";
import { workspace } from "../../src/routes/workspace.js";

// Create test app
const app = new Hono();
app.route("/api", workspace);

// Temp directory for each test
let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "workspace-test-"));
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
  try {
    rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // cleanup best-effort
  }
});

describe("GET /api/workspace", () => {
  it("returns NO_ROOT when .beads/ does not exist", async () => {
    vi.spyOn(config, "getWorkspaceRoot").mockReturnValue(tempDir);
    vi.spyOn(config, "getConfig").mockReturnValue({
      formulaPaths: [],
      projectRoot: tempDir,
      bdBinary: "bd",
      gtBinary: "gt",
      bvBinary: "bv",
    });

    const res = await app.request("/api/workspace");
    expect(res.status).toBe(200);

    const body = (await res.json()) as WorkspaceError;
    expect(body.ok).toBe(false);
    if (!body.ok) {
      expect(body.code).toBe("NO_ROOT");
    }
  });

  it("returns workspace state when .beads/ exists", async () => {
    const beadsDir = join(tempDir, ".beads");
    mkdirSync(beadsDir);

    const formulasDir = join(tempDir, "formulas");
    mkdirSync(formulasDir);
    writeFileSync(join(formulasDir, "test.formula.toml"), '[formula]\nname = "test"');

    vi.spyOn(config, "getWorkspaceRoot").mockReturnValue(tempDir);
    vi.spyOn(config, "getConfig").mockReturnValue({
      formulaPaths: [formulasDir],
      projectRoot: tempDir,
      bdBinary: "bd",
      gtBinary: "gt",
      bvBinary: "bv",
    });

    const res = await app.request("/api/workspace");
    expect(res.status).toBe(200);

    const body = (await res.json()) as WorkspaceStateResponse;
    expect(body.ok).toBe(true);
    if (body.ok) {
      expect(body.root).toBe(tempDir);
      expect(body.formulaCount).toBe(1);
      expect(body.searchPaths).toContain(formulasDir);
    }
  });

  it("counts formulas across multiple search paths", async () => {
    const beadsDir = join(tempDir, ".beads");
    mkdirSync(beadsDir);

    const formulasDir1 = join(tempDir, "formulas");
    mkdirSync(formulasDir1);
    writeFileSync(join(formulasDir1, "a.formula.toml"), "");
    writeFileSync(join(formulasDir1, "b.formula.json"), "");

    const formulasDir2 = join(tempDir, ".beads", "formulas");
    mkdirSync(formulasDir2);
    writeFileSync(join(formulasDir2, "c.formula.toml"), "");

    vi.spyOn(config, "getWorkspaceRoot").mockReturnValue(tempDir);
    vi.spyOn(config, "getConfig").mockReturnValue({
      formulaPaths: [formulasDir1, formulasDir2],
      projectRoot: tempDir,
      bdBinary: "bd",
      gtBinary: "gt",
      bvBinary: "bv",
    });

    const res = await app.request("/api/workspace");
    const body = (await res.json()) as WorkspaceStateResponse;
    expect(body.ok).toBe(true);
    if (body.ok) {
      expect(body.formulaCount).toBe(3);
    }
  });
});

describe("POST /api/workspace/open", () => {
  it("opens a valid directory and sets workspace root", async () => {
    vi.spyOn(config, "setWorkspaceRoot").mockImplementation(() => {});
    vi.spyOn(config, "getFormulaSearchPaths").mockReturnValue([]);

    const res = await app.request("/api/workspace/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: tempDir }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as WorkspaceOpenResponse;
    expect(body.ok).toBe(true);
    if (body.ok) {
      expect(body.root).toBe(resolve(tempDir));
      expect(typeof body.formulaCount).toBe("number");
    }

    expect(config.setWorkspaceRoot).toHaveBeenCalledWith(resolve(tempDir));
  });

  it("auto-creates .beads/ if missing", async () => {
    vi.spyOn(config, "setWorkspaceRoot").mockImplementation(() => {});
    vi.spyOn(config, "getFormulaSearchPaths").mockReturnValue([]);

    const beadsDir = join(resolve(tempDir), ".beads");
    expect(existsSync(beadsDir)).toBe(false);

    await app.request("/api/workspace/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: tempDir }),
    });

    expect(existsSync(beadsDir)).toBe(true);
  });

  it("returns 400 for non-existent path", async () => {
    const res = await app.request("/api/workspace/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "/tmp/nonexistent-path-xyz-999" }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as WorkspaceError;
    expect(body.ok).toBe(false);
    if (!body.ok) {
      expect(body.code).toBe("NOT_FOUND");
    }
  });

  it("returns 400 for path that is a file, not directory", async () => {
    const filePath = join(tempDir, "file.txt");
    writeFileSync(filePath, "hello");

    const res = await app.request("/api/workspace/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: filePath }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as WorkspaceError;
    expect(body.ok).toBe(false);
    if (!body.ok) {
      expect(body.code).toBe("NOT_DIRECTORY");
    }
  });

  it("returns 400 for missing path field", async () => {
    const res = await app.request("/api/workspace/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as WorkspaceError;
    expect(body.ok).toBe(false);
  });

  it("returns 400 for invalid JSON body", async () => {
    const res = await app.request("/api/workspace/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as WorkspaceError;
    expect(body.ok).toBe(false);
  });
});

describe("POST /api/workspace/init", () => {
  it("scaffolds .beads/ + formulas/ and blank template", async () => {
    vi.spyOn(config, "setWorkspaceRoot").mockImplementation(() => {});

    const res = await app.request("/api/workspace/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: tempDir }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as WorkspaceInitResponse;
    expect(body.ok).toBe(true);
    if (body.ok) {
      expect(body.root).toBe(resolve(tempDir));
      expect(body.created.length).toBeGreaterThanOrEqual(3);
    }

    // Verify created directories and files
    expect(existsSync(join(resolve(tempDir), ".beads"))).toBe(true);
    expect(existsSync(join(resolve(tempDir), ".beads", "formulas"))).toBe(true);
    expect(existsSync(join(resolve(tempDir), "formulas"))).toBe(true);
    expect(existsSync(join(resolve(tempDir), ".beads", "formulas", "blank.formula.toml"))).toBe(
      true,
    );

    expect(config.setWorkspaceRoot).toHaveBeenCalledWith(resolve(tempDir));
  });

  it("returns 400 when workspace already initialized", async () => {
    mkdirSync(join(tempDir, ".beads"));

    const res = await app.request("/api/workspace/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: tempDir }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as WorkspaceError;
    expect(body.ok).toBe(false);
    if (!body.ok) {
      expect(body.code).toBe("ALREADY_INITIALIZED");
    }
  });

  it("returns 400 for non-existent path", async () => {
    const res = await app.request("/api/workspace/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "/tmp/nonexistent-init-xyz-999" }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as WorkspaceError;
    expect(body.ok).toBe(false);
    if (!body.ok) {
      expect(body.code).toBe("NOT_FOUND");
    }
  });

  it("returns 400 for path that is a file", async () => {
    const filePath = join(tempDir, "file.txt");
    writeFileSync(filePath, "content");

    const res = await app.request("/api/workspace/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: filePath }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as WorkspaceError;
    expect(body.ok).toBe(false);
    if (!body.ok) {
      expect(body.code).toBe("NOT_DIRECTORY");
    }
  });

  it("returns 400 for missing path field", async () => {
    const res = await app.request("/api/workspace/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid JSON body", async () => {
    const res = await app.request("/api/workspace/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });

    expect(res.status).toBe(400);
  });
});

describe("GET /api/tree", () => {
  it("returns empty tree for workspace with no formula files", async () => {
    mkdirSync(join(tempDir, "src"));
    writeFileSync(join(tempDir, "src", "index.ts"), "");

    vi.spyOn(config, "getWorkspaceRoot").mockReturnValue(tempDir);
    vi.spyOn(config, "getConfig").mockReturnValue({
      formulaPaths: [],
      projectRoot: tempDir,
      bdBinary: "bd",
      gtBinary: "gt",
      bvBinary: "bv",
    });

    const res = await app.request("/api/tree");
    expect(res.status).toBe(200);

    const body = (await res.json()) as TreeResponse;
    expect(body.ok).toBe(true);
    if (body.ok) {
      expect(body.nodes).toEqual([]);
      expect(body.totalCount).toBe(0);
      expect(body.truncated).toBe(false);
    }
  });

  it("returns tree with formula files", async () => {
    const formulasDir = join(tempDir, "formulas");
    mkdirSync(formulasDir);
    writeFileSync(join(formulasDir, "deploy.formula.toml"), '[formula]\nname = "deploy"');
    writeFileSync(join(formulasDir, "test.formula.json"), "{}");

    vi.spyOn(config, "getWorkspaceRoot").mockReturnValue(tempDir);
    vi.spyOn(config, "getConfig").mockReturnValue({
      formulaPaths: [formulasDir],
      projectRoot: tempDir,
      bdBinary: "bd",
      gtBinary: "gt",
      bvBinary: "bv",
    });

    const res = await app.request("/api/tree");
    expect(res.status).toBe(200);

    const body = (await res.json()) as TreeResponse;
    expect(body.ok).toBe(true);
    if (body.ok) {
      expect(body.totalCount).toBe(3); // 1 dir + 2 formula files
      expect(body.truncated).toBe(false);

      // Should have a formulas directory
      const formulasNode = body.nodes.find((n) => n.name === "formulas");
      expect(formulasNode).toBeDefined();
      expect(formulasNode?.type).toBe("directory");
      expect(formulasNode?.children).toHaveLength(2);

      // Formula files should have formulaName
      const deployFormula = formulasNode?.children?.find((n) => n.name === "deploy.formula.toml");
      expect(deployFormula?.type).toBe("formula");
      expect(deployFormula?.formulaName).toBe("deploy");

      const testFormula = formulasNode?.children?.find((n) => n.name === "test.formula.json");
      expect(testFormula?.type).toBe("formula");
      expect(testFormula?.formulaName).toBe("test");
    }
  });

  it("prunes empty directories", async () => {
    mkdirSync(join(tempDir, "empty-dir"));
    mkdirSync(join(tempDir, "has-formulas"));
    writeFileSync(join(tempDir, "has-formulas", "a.formula.toml"), "");

    vi.spyOn(config, "getWorkspaceRoot").mockReturnValue(tempDir);
    vi.spyOn(config, "getConfig").mockReturnValue({
      formulaPaths: [],
      projectRoot: tempDir,
      bdBinary: "bd",
      gtBinary: "gt",
      bvBinary: "bv",
    });

    const res = await app.request("/api/tree");
    const body = (await res.json()) as TreeResponse;
    expect(body.ok).toBe(true);
    if (body.ok) {
      const names = body.nodes.map((n) => n.name);
      expect(names).not.toContain("empty-dir");
      expect(names).toContain("has-formulas");
    }
  });

  it("skips dotfiles and pruned directories", async () => {
    mkdirSync(join(tempDir, ".git"));
    writeFileSync(join(tempDir, ".git", "a.formula.toml"), "");
    mkdirSync(join(tempDir, "node_modules"));
    writeFileSync(join(tempDir, "node_modules", "b.formula.toml"), "");
    mkdirSync(join(tempDir, ".hidden"));
    writeFileSync(join(tempDir, ".hidden", "c.formula.toml"), "");
    mkdirSync(join(tempDir, "visible"));
    writeFileSync(join(tempDir, "visible", "d.formula.toml"), "");

    vi.spyOn(config, "getWorkspaceRoot").mockReturnValue(tempDir);
    vi.spyOn(config, "getConfig").mockReturnValue({
      formulaPaths: [],
      projectRoot: tempDir,
      bdBinary: "bd",
      gtBinary: "gt",
      bvBinary: "bv",
    });

    const res = await app.request("/api/tree");
    const body = (await res.json()) as TreeResponse;
    expect(body.ok).toBe(true);
    if (body.ok) {
      const names = body.nodes.map((n) => n.name);
      expect(names).not.toContain(".git");
      expect(names).not.toContain("node_modules");
      expect(names).not.toContain(".hidden");
      expect(names).toContain("visible");
    }
  });

  it("truncates at node limit", async () => {
    // Create 510 formula files across directories to exceed the 500 limit
    for (let i = 0; i < 51; i++) {
      const dir = join(tempDir, `dir-${String(i).padStart(3, "0")}`);
      mkdirSync(dir);
      for (let j = 0; j < 10; j++) {
        writeFileSync(join(dir, `f${j}.formula.toml`), "");
      }
    }

    vi.spyOn(config, "getWorkspaceRoot").mockReturnValue(tempDir);
    vi.spyOn(config, "getConfig").mockReturnValue({
      formulaPaths: [],
      projectRoot: tempDir,
      bdBinary: "bd",
      gtBinary: "gt",
      bvBinary: "bv",
    });

    const res = await app.request("/api/tree");
    const body = (await res.json()) as TreeResponse;
    expect(body.ok).toBe(true);
    if (body.ok) {
      expect(body.truncated).toBe(true);
      // Counter may slightly exceed NODE_LIMIT (500) because a directory node
      // is counted after its children fill the limit during recursion
      expect(body.totalCount).toBeGreaterThanOrEqual(500);
      expect(body.totalCount).toBeLessThanOrEqual(510);
    }
  });

  it("merges formulas from external search paths", async () => {
    // Create workspace with one local formula
    const localFormulas = join(tempDir, "formulas");
    mkdirSync(localFormulas);
    writeFileSync(join(localFormulas, "local.formula.toml"), "");

    // Create an external search path outside workspace root
    const externalDir = mkdtempSync(join(tmpdir(), "ext-formulas-"));
    writeFileSync(join(externalDir, "remote.formula.toml"), "");
    writeFileSync(join(externalDir, "shared.formula.toml"), "");

    vi.spyOn(config, "getWorkspaceRoot").mockReturnValue(tempDir);
    vi.spyOn(config, "getConfig").mockReturnValue({
      formulaPaths: [localFormulas, externalDir],
      projectRoot: tempDir,
      bdBinary: "bd",
      gtBinary: "gt",
      bvBinary: "bv",
    });

    const res = await app.request("/api/tree");
    const body = (await res.json()) as TreeResponse;
    expect(body.ok).toBe(true);
    if (body.ok) {
      // Local: 1 dir + 1 formula = 2, External: 1 dir + 2 formulas = 3
      expect(body.totalCount).toBe(5);

      // Local formulas present under workspace tree
      const localNode = body.nodes.find((n) => n.name === "formulas");
      expect(localNode).toBeDefined();
      expect(localNode?.children).toHaveLength(1);

      // External formulas present as a labeled directory
      const externalNode = body.nodes.find((n) => n.path === externalDir);
      expect(externalNode).toBeDefined();
      expect(externalNode?.type).toBe("directory");
      expect(externalNode?.children).toHaveLength(2);
    }

    rmSync(externalDir, { recursive: true, force: true });
  });

  it("deduplicates formulas by name across search paths", async () => {
    // Create workspace with a formula
    const localFormulas = join(tempDir, "formulas");
    mkdirSync(localFormulas);
    writeFileSync(join(localFormulas, "deploy.formula.toml"), "");

    // External path has same formula name
    const externalDir = mkdtempSync(join(tmpdir(), "ext-dup-"));
    writeFileSync(join(externalDir, "deploy.formula.toml"), "");
    writeFileSync(join(externalDir, "unique.formula.toml"), "");

    vi.spyOn(config, "getWorkspaceRoot").mockReturnValue(tempDir);
    vi.spyOn(config, "getConfig").mockReturnValue({
      formulaPaths: [localFormulas, externalDir],
      projectRoot: tempDir,
      bdBinary: "bd",
      gtBinary: "gt",
      bvBinary: "bv",
    });

    const res = await app.request("/api/tree");
    const body = (await res.json()) as TreeResponse;
    expect(body.ok).toBe(true);
    if (body.ok) {
      // Local: 1 dir + 1 formula = 2, External: 1 dir + 1 unique formula = 2
      // (deploy is deduplicated)
      expect(body.totalCount).toBe(4);
    }

    rmSync(externalDir, { recursive: true, force: true });
  });

  it("returns 404 when workspace root does not exist", async () => {
    vi.spyOn(config, "getWorkspaceRoot").mockReturnValue("/tmp/nonexistent-tree-root-999");

    const res = await app.request("/api/tree");
    expect(res.status).toBe(404);

    const body = (await res.json()) as TreeError;
    expect(body.ok).toBe(false);
    if (!body.ok) {
      expect(body.code).toBe("NOT_FOUND");
    }
  });

  it("handles nested directory structures", async () => {
    const a = join(tempDir, "a");
    const ab = join(a, "b");
    mkdirSync(ab, { recursive: true });
    writeFileSync(join(ab, "deep.formula.toml"), "");

    vi.spyOn(config, "getWorkspaceRoot").mockReturnValue(tempDir);
    vi.spyOn(config, "getConfig").mockReturnValue({
      formulaPaths: [],
      projectRoot: tempDir,
      bdBinary: "bd",
      gtBinary: "gt",
      bvBinary: "bv",
    });

    const res = await app.request("/api/tree");
    const body = (await res.json()) as TreeResponse;
    expect(body.ok).toBe(true);
    if (body.ok) {
      expect(body.totalCount).toBe(3); // dir a + dir b + formula file
      const aNode = body.nodes.find((n) => n.name === "a");
      expect(aNode?.type).toBe("directory");
      const bNode = aNode?.children?.find((n) => n.name === "b");
      expect(bNode?.type).toBe("directory");
      const formulaNode = bNode?.children?.find((n) => n.name === "deep.formula.toml");
      expect(formulaNode?.type).toBe("formula");
      expect(formulaNode?.formulaName).toBe("deep");
    }
  });

  it("responds within 500ms for 200-file fixture", async () => {
    // Create 200 formula files across 20 directories
    for (let i = 0; i < 20; i++) {
      const dir = join(tempDir, `perf-${String(i).padStart(2, "0")}`);
      mkdirSync(dir);
      for (let j = 0; j < 10; j++) {
        writeFileSync(join(dir, `formula-${j}.formula.toml`), "");
      }
    }

    vi.spyOn(config, "getWorkspaceRoot").mockReturnValue(tempDir);
    vi.spyOn(config, "getConfig").mockReturnValue({
      formulaPaths: [],
      projectRoot: tempDir,
      bdBinary: "bd",
      gtBinary: "gt",
      bvBinary: "bv",
    });

    const start = performance.now();
    const res = await app.request("/api/tree");
    const elapsed = performance.now() - start;

    expect(res.status).toBe(200);
    const body = (await res.json()) as TreeResponse;
    expect(body.ok).toBe(true);
    if (body.ok) {
      // 20 dirs + 200 files = 220 nodes
      expect(body.totalCount).toBe(220);
    }
    expect(elapsed).toBeLessThan(500);
  });
});

describe("GET /api/browse", () => {
  it("lists workspace root when no path param", async () => {
    mkdirSync(join(tempDir, "src"));
    writeFileSync(join(tempDir, "package.json"), "{}");
    mkdirSync(join(tempDir, ".beads"));

    vi.spyOn(config, "getWorkspaceRoot").mockReturnValue(tempDir);

    const res = await app.request("/api/browse");
    expect(res.status).toBe(200);

    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.path).toBe(tempDir);
    expect(body.parent).toBeTruthy();

    const names = (body.entries as Array<{ name: string }>).map((e) => e.name);
    expect(names).toContain("src");
    expect(names).toContain("package.json");
    // .beads is the only dotfile that should be shown
    expect(names).toContain(".beads");
  });

  it("lists specified directory via path param", async () => {
    const subDir = join(tempDir, "sub");
    mkdirSync(subDir);
    writeFileSync(join(subDir, "file.txt"), "hello");

    const res = await app.request(`/api/browse?path=${encodeURIComponent(subDir)}`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.path).toBe(subDir);
    const entries = body.entries as Array<{ name: string; type: string }>;
    expect(entries).toHaveLength(1);
    expect(entries[0].name).toBe("file.txt");
    expect(entries[0].type).toBe("file");
  });

  it("sorts directories before files", async () => {
    writeFileSync(join(tempDir, "zebra.txt"), "");
    mkdirSync(join(tempDir, "alpha"));
    writeFileSync(join(tempDir, "beta.txt"), "");
    mkdirSync(join(tempDir, "gamma"));

    vi.spyOn(config, "getWorkspaceRoot").mockReturnValue(tempDir);

    const res = await app.request("/api/browse");
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ok).toBe(true);

    const types = (body.entries as Array<{ type: string }>).map((e) => e.type);
    const firstFileIndex = types.indexOf("file");
    const lastDirIndex = types.lastIndexOf("directory");
    if (firstFileIndex !== -1 && lastDirIndex !== -1) {
      expect(lastDirIndex).toBeLessThan(firstFileIndex);
    }
  });

  it("hides dotfiles except .beads", async () => {
    mkdirSync(join(tempDir, ".git"));
    mkdirSync(join(tempDir, ".hidden"));
    mkdirSync(join(tempDir, ".beads"));
    mkdirSync(join(tempDir, "visible"));

    vi.spyOn(config, "getWorkspaceRoot").mockReturnValue(tempDir);

    const res = await app.request("/api/browse");
    const body = (await res.json()) as Record<string, unknown>;
    const names = (body.entries as Array<{ name: string }>).map((e) => e.name);
    expect(names).not.toContain(".git");
    expect(names).not.toContain(".hidden");
    expect(names).toContain(".beads");
    expect(names).toContain("visible");
  });

  it("returns parent path", async () => {
    const subDir = join(tempDir, "child");
    mkdirSync(subDir);

    const res = await app.request(`/api/browse?path=${encodeURIComponent(subDir)}`);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.parent).toBe(resolve(subDir, ".."));
  });

  it("returns 404 for non-existent path", async () => {
    const res = await app.request("/api/browse?path=/tmp/nonexistent-browse-999");
    expect(res.status).toBe(404);

    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ok).toBe(false);
    expect(body.code).toBe("NOT_FOUND");
  });

  it("returns 400 for path that is a file", async () => {
    const filePath = join(tempDir, "file.txt");
    writeFileSync(filePath, "content");

    const res = await app.request(`/api/browse?path=${encodeURIComponent(filePath)}`);
    expect(res.status).toBe(400);

    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ok).toBe(false);
    expect(body.code).toBe("NOT_DIRECTORY");
  });
});
