# CLI Flags Reference

This document describes the CLI flags used by the beads-ide backend to interact with `bd`, `gt`, and `bv` commands.

## bd (Beads CLI)

### `bd cook`

Cook transforms a formula file into a proto for inspection or persistence.

**Key flags:**
- `--json` - Output as JSON (default behavior, explicit flag ensures consistency)
- `--var KEY=VALUE` - Substitute variables at runtime
- `--mode=compile|runtime` - Compile-time keeps `{{vars}}`, runtime substitutes
- `--dry-run` - Preview steps without creating anything
- `--persist` - Write proto to database (not used by beads-ide)

**Example:**
```bash
bd cook formulas/explore-module.formula.toml --json
bd cook explore-module --var module_name=api --var depth=deep --json
```

**Output format (JSON):**
```json
{
  "formula": "explore-module",
  "version": 1,
  "type": "workflow",
  "vars": { ... },
  "steps": [ ... ]
}
```

### `bd show`

Display bead details.

**Example:**
```bash
bd show bcc-abc123
```

**Output:** Plain text formatted bead details (title, description, status, dependencies).

## bv (Beads Viewer)

### Graph Export

**Recommended: `--robot-graph`** (JSON to stdout)
```bash
bv --robot-graph --graph-format json
bv --robot-graph --graph-format dot
bv --robot-graph --graph-format mermaid
```

**Alternative: `--export-graph`** (writes to file)
```bash
bv --export-graph graph.html   # Interactive HTML
bv --export-graph graph.png    # Static PNG
bv --export-graph graph.svg    # Static SVG
```

**Note:** `--export-graph` does NOT support JSON format via `--output-format json`. For JSON output, use `--robot-graph` instead.

### Robot Commands (JSON output)

All `--robot-*` commands output JSON suitable for programmatic consumption:

- `--robot-graph` - Dependency graph as JSON/DOT/Mermaid
- `--robot-insights` - Graph analysis and insights
- `--robot-priority` - Priority recommendations
- `--robot-plan` - Dependency-respecting execution plan
- `--robot-triage` - Unified triage data

**Output format control:**
- `--format json` - Force JSON output (default for robot commands)
- `--graph-format json|dot|mermaid` - Graph-specific format

### Verified Output (2026-03-11)

CLI flag verification performed against live `bd` and `bv` binaries.

**`bd cook <formula> --json`:** Confirmed working. Outputs valid JSON to stdout with structure:
```json
{
  "formula": "explore-module",
  "version": 1,
  "type": "workflow",
  "vars": { "<name>": { "description": "...", "default": "...", "required": true } },
  "steps": [ { "title": "...", "description": "..." } ]
}
```

**`bv -robot-graph -graph-format json`:** Confirmed working. Outputs valid JSON to stdout:
```json
{
  "format": "json",
  "nodes": 1,
  "edges": 0,
  "explanation": { "what": "...", "when_to_use": "..." },
  "data_hash": "...",
  "adjacency": {
    "nodes": [ { "id": "...", "title": "...", "status": "...", "priority": 4, "pagerank": 1 } ],
    "edges": null
  }
}
```

**`bv -robot-insights`:** Confirmed working. Outputs JSON to stdout (requires beads data in cwd).

**`bv -export-graph`:** Does NOT support `--output-format json`. Writes HTML/PNG/SVG files.
For JSON graph data, use `-robot-graph -graph-format json` instead.

**Note:** `bv` uses Go-style single-dash flags (`-robot-graph`), but also accepts
double-dash (`--robot-graph`). The cli.ts wrapper uses double-dash for consistency.

## gt (Gas Town)

### `gt hook`

Check currently hooked work for a polecat.

**Example:**
```bash
gt hook
```

**Output:** Plain text showing hooked bead/molecule details.

## beads-ide Usage

The backend uses these commands via the secure `cli.ts` wrapper which:

1. Uses `execFile` (not `exec`) to prevent shell injection
2. Validates all inputs against safe patterns
3. Sets appropriate timeouts (30s default, 60s for cook)
4. Resolves project root via `.beads/redirect`

### Wrapper Functions

```typescript
import { bdCook, bdShow, bvGraph, bvInsights, runCli } from './cli.js';

// Cook a formula to JSON
const result = await bdCook('explore-module', { module_name: 'api' });
const formula = JSON.parse(result.stdout);

// Get graph as JSON
const graph = await bvGraph('json');
const graphData = JSON.parse(graph.stdout);

// Generic CLI execution
const custom = await runCli('bv', ['--robot-insights']);
```
