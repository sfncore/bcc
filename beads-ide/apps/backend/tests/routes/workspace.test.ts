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

  it("returns tree with formula files from search paths", async () => {
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

      // Should have a labeled directory node for the search path
      expect(body.nodes).toHaveLength(1);
      const dirNode = body.nodes[0];
      expect(dirNode.type).toBe("directory");
      expect(dirNode.children).toHaveLength(2);

      // Formula files should have formulaName
      const deployFormula = dirNode.children?.find((n) => n.name === "deploy.formula.toml");
      expect(deployFormula?.type).toBe("formula");
      expect(deployFormula?.formulaName).toBe("deploy");

      const testFormula = dirNode.children?.find((n) => n.name === "test.formula.json");
      expect(testFormula?.type).toBe("formula");
      expect(testFormula?.formulaName).toBe("test");
    }
  });

  it("skips empty search paths", async () => {
    // Empty dir in search paths should not appear
    const emptyDir = join(tempDir, "empty-formulas");
    mkdirSync(emptyDir);

    const populatedDir = join(tempDir, "has-formulas");
    mkdirSync(populatedDir);
    writeFileSync(join(populatedDir, "a.formula.toml"), "");

    vi.spyOn(config, "getWorkspaceRoot").mockReturnValue(tempDir);
    vi.spyOn(config, "getConfig").mockReturnValue({
      formulaPaths: [emptyDir, populatedDir],
      projectRoot: tempDir,
      bdBinary: "bd",
      gtBinary: "gt",
      bvBinary: "bv",
    });

    const res = await app.request("/api/tree");
    const body = (await res.json()) as TreeResponse;
    expect(body.ok).toBe(true);
    if (body.ok) {
      // Only the populated dir should appear
      expect(body.nodes).toHaveLength(1);
      expect(body.nodes[0].children).toHaveLength(1);
    }
  });

  it("only shows formula files from configured search paths", async () => {
    // Create dirs with formulas but only include one in search paths
    const includedDir = join(tempDir, "included");
    mkdirSync(includedDir);
    writeFileSync(join(includedDir, "yes.formula.toml"), "");

    const excludedDir = join(tempDir, "excluded");
    mkdirSync(excludedDir);
    writeFileSync(join(excludedDir, "no.formula.toml"), "");

    vi.spyOn(config, "getWorkspaceRoot").mockReturnValue(tempDir);
    vi.spyOn(config, "getConfig").mockReturnValue({
      formulaPaths: [includedDir],
      projectRoot: tempDir,
      bdBinary: "bd",
      gtBinary: "gt",
      bvBinary: "bv",
    });

    const res = await app.request("/api/tree");
    const body = (await res.json()) as TreeResponse;
    expect(body.ok).toBe(true);
    if (body.ok) {
      expect(body.totalCount).toBe(2); // 1 dir + 1 formula
      // Should not contain excluded formula
      const allNames = body.nodes.flatMap((n) => n.children?.map((c) => c.formulaName) ?? []);
      expect(allNames).toContain("yes");
      expect(allNames).not.toContain("no");
    }
  });

  it("shows formulas from multiple search paths as separate directories", async () => {
    const dir1 = join(tempDir, "formulas");
    mkdirSync(dir1);
    writeFileSync(join(dir1, "local.formula.toml"), "");

    const dir2 = mkdtempSync(join(tmpdir(), "ext-formulas-"));
    writeFileSync(join(dir2, "remote.formula.toml"), "");
    writeFileSync(join(dir2, "shared.formula.toml"), "");

    vi.spyOn(config, "getWorkspaceRoot").mockReturnValue(tempDir);
    vi.spyOn(config, "getConfig").mockReturnValue({
      formulaPaths: [dir1, dir2],
      projectRoot: tempDir,
      bdBinary: "bd",
      gtBinary: "gt",
      bvBinary: "bv",
    });

    const res = await app.request("/api/tree");
    const body = (await res.json()) as TreeResponse;
    expect(body.ok).toBe(true);
    if (body.ok) {
      // dir1: 1 dir + 1 formula = 2, dir2: 1 dir + 2 formulas = 3
      expect(body.totalCount).toBe(5);
      expect(body.nodes).toHaveLength(2);
      expect(body.nodes[0].children).toHaveLength(1);
      expect(body.nodes[1].children).toHaveLength(2);
    }

    rmSync(dir2, { recursive: true, force: true });
  });

  it("deduplicates formulas by name across search paths", async () => {
    const dir1 = join(tempDir, "formulas");
    mkdirSync(dir1);
    writeFileSync(join(dir1, "deploy.formula.toml"), "");

    const dir2 = mkdtempSync(join(tmpdir(), "ext-dup-"));
    writeFileSync(join(dir2, "deploy.formula.toml"), ""); // duplicate
    writeFileSync(join(dir2, "unique.formula.toml"), "");

    vi.spyOn(config, "getWorkspaceRoot").mockReturnValue(tempDir);
    vi.spyOn(config, "getConfig").mockReturnValue({
      formulaPaths: [dir1, dir2],
      projectRoot: tempDir,
      bdBinary: "bd",
      gtBinary: "gt",
      bvBinary: "bv",
    });

    const res = await app.request("/api/tree");
    const body = (await res.json()) as TreeResponse;
    expect(body.ok).toBe(true);
    if (body.ok) {
      // dir1: 1 dir + 1 formula = 2, dir2: 1 dir + 1 unique = 2 (deploy deduplicated)
      expect(body.totalCount).toBe(4);
    }

    rmSync(dir2, { recursive: true, force: true });
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

  it("handles search path with many formulas", async () => {
    const formulasDir = join(tempDir, "formulas");
    mkdirSync(formulasDir);
    writeFileSync(join(formulasDir, "a.formula.toml"), "");
    writeFileSync(join(formulasDir, "b.formula.toml"), "");
    writeFileSync(join(formulasDir, "c.formula.json"), "");

    vi.spyOn(config, "getWorkspaceRoot").mockReturnValue(tempDir);
    vi.spyOn(config, "getConfig").mockReturnValue({
      formulaPaths: [formulasDir],
      projectRoot: tempDir,
      bdBinary: "bd",
      gtBinary: "gt",
      bvBinary: "bv",
    });

    const res = await app.request("/api/tree");
    const body = (await res.json()) as TreeResponse;
    expect(body.ok).toBe(true);
    if (body.ok) {
      expect(body.totalCount).toBe(4); // 1 dir + 3 formulas
      const dirNode = body.nodes[0];
      expect(dirNode.children).toHaveLength(3);
      const names = dirNode.children!.map((c) => c.formulaName);
      expect(names).toContain("a");
      expect(names).toContain("b");
      expect(names).toContain("c");
    }
  });

  it("responds within 500ms for 200-file fixture", async () => {
    // Create a single search path with 200 formula files
    const formulasDir = join(tempDir, "formulas");
    mkdirSync(formulasDir);
    for (let j = 0; j < 200; j++) {
      writeFileSync(join(formulasDir, `formula-${j}.formula.toml`), "");
    }

    vi.spyOn(config, "getWorkspaceRoot").mockReturnValue(tempDir);
    vi.spyOn(config, "getConfig").mockReturnValue({
      formulaPaths: [formulasDir],
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
      // 1 dir + 200 files = 201 nodes
      expect(body.totalCount).toBe(201);
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
