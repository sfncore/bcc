/**
 * Configuration management for Beads IDE backend.
 * Handles formula search paths, CLI binary locations, and project root detection.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, resolve } from 'node:path'

export interface BeadsConfig {
  /** Ordered list of formula search paths that exist */
  formulaPaths: string[]
  /** Project root directory */
  projectRoot: string
  /** bd CLI binary location (or 'bd' if in PATH) */
  bdBinary: string
  /** gt CLI binary location (or 'gt' if in PATH) */
  gtBinary: string
  /** bv CLI binary location (or 'bv' if in PATH) */
  bvBinary: string
}

/**
 * Resolves the project root by following .beads/redirect if present.
 * Walks up directory tree looking for .beads directory.
 */
export function resolveProjectRoot(startDir: string = process.cwd()): string {
  let dir = resolve(startDir)
  const maxDepth = 10
  let depth = 0

  while (depth < maxDepth) {
    const beadsDir = resolve(dir, '.beads')
    const redirectFile = resolve(beadsDir, 'redirect')

    if (existsSync(redirectFile)) {
      const redirectTarget = readFileSync(redirectFile, 'utf-8').trim()
      if (redirectTarget) {
        // Resolve redirect relative to the project dir (not .beads/).
        // Redirects point to .beads directories (e.g., "../../mayor/rig/.beads"),
        // so strip the trailing .beads to get the project root.
        let resolved = resolve(dir, redirectTarget)
        if (resolved.endsWith('.beads') || resolved.endsWith('.beads/')) {
          resolved = dirname(resolved)
        }
        dir = resolved
        depth++
        continue
      }
    }

    if (existsSync(beadsDir)) {
      return dir
    }

    const parent = dirname(dir)
    if (parent === dir) {
      break
    }
    dir = parent
    depth++
  }

  return startDir
}

/**
 * Finds the nearest ancestor directory that contains a .beads/ directory
 * (with or without a redirect). This is the "launch rig" — the rig the
 * backend was started from, before following any redirects.
 */
function findLaunchRig(startDir: string): string | null {
  let dir = resolve(startDir)
  const maxDepth = 10
  let depth = 0

  while (depth < maxDepth) {
    if (existsSync(resolve(dir, '.beads'))) {
      return dir
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
    depth++
  }
  return null
}

/**
 * Discovers all rig directories under $GT_ROOT that have a formulas/ directory.
 * Scans for mayor/rig/formulas/ patterns and top-level formulas/ dirs.
 * Follows .beads/redirect to find the canonical project root for each rig.
 */
function discoverRigFormulaPaths(gtRoot: string): string[] {
  const formulaPaths: string[] = []

  try {
    const entries = readdirSync(gtRoot)
    for (const entry of entries) {
      const rigBase = resolve(gtRoot, entry)
      try {
        if (!statSync(rigBase).isDirectory()) continue
      } catch {
        continue
      }

      // Skip hidden dirs and node_modules
      if (entry.startsWith('.') || entry === 'node_modules') continue

      // Check mayor/rig/formulas/ (most common pattern)
      const mayorFormulas = resolve(rigBase, 'mayor', 'rig', 'formulas')
      if (existsSync(mayorFormulas)) {
        formulaPaths.push(mayorFormulas)
      }

      // Check top-level formulas/
      const topFormulas = resolve(rigBase, 'formulas')
      if (existsSync(topFormulas)) {
        formulaPaths.push(topFormulas)
      }

      // Check crew/*/formulas/ for crew rigs
      const crewDir = resolve(rigBase, 'crew')
      if (existsSync(crewDir)) {
        try {
          for (const crewMember of readdirSync(crewDir)) {
            const crewFormulas = resolve(crewDir, crewMember, 'formulas')
            if (existsSync(crewFormulas)) {
              formulaPaths.push(crewFormulas)
            }
          }
        } catch {
          // Skip unreadable crew dirs
        }
      }
    }
  } catch {
    // GT_ROOT unreadable
  }

  return formulaPaths
}

/**
 * Returns ordered list of formula search paths.
 * Searches in order (most specific first):
 *   1. formulas/ (relative to launch rig — the cwd's nearest .beads ancestor)
 *   2. formulas/ (relative to project root — after following redirects)
 *   3. .beads/formulas/ (relative to project root)
 *   4. ~/.beads/formulas/
 *   5. $GT_ROOT/.beads/formulas/
 *   6. All rig formulas/ directories discovered under $GT_ROOT
 * Skips missing directories and deduplicates paths.
 */
export function getFormulaSearchPaths(projectRoot: string, cwd?: string): string[] {
  const seen = new Set<string>()
  const paths: string[] = []
  const home = homedir()
  const gtRoot = process.env.GT_ROOT

  const addIfExists = (candidate: string) => {
    const resolved = resolve(candidate)
    if (!seen.has(resolved) && existsSync(resolved)) {
      seen.add(resolved)
      paths.push(resolved)
    }
  }

  // Launch rig formulas (before redirect — the rig we're actually in)
  if (cwd) {
    const launchRig = findLaunchRig(cwd)
    if (launchRig) {
      addIfExists(resolve(launchRig, 'formulas'))
    }
  }

  // Project root formulas (after following redirects)
  addIfExists(resolve(projectRoot, 'formulas'))
  addIfExists(resolve(projectRoot, '.beads', 'formulas'))

  // Global formula paths
  addIfExists(resolve(home, '.beads', 'formulas'))
  if (gtRoot) {
    addIfExists(resolve(gtRoot, '.beads', 'formulas'))

    // Discover formulas from all rigs under GT_ROOT
    for (const rigPath of discoverRigFormulaPaths(gtRoot)) {
      addIfExists(rigPath)
    }
  }

  return paths
}

/**
 * Resolves CLI binary location.
 * Returns the binary name if it should be found in PATH.
 */
function resolveBinary(name: string): string {
  // Could be extended to check specific paths, but for now assume in PATH
  return name
}

/**
 * Loads the full configuration.
 */
export function loadConfig(cwd: string = process.cwd()): BeadsConfig {
  const projectRoot = resolveProjectRoot(cwd)
  const formulaPaths = getFormulaSearchPaths(projectRoot, cwd)

  return {
    formulaPaths,
    projectRoot,
    bdBinary: resolveBinary('bd'),
    gtBinary: resolveBinary('gt'),
    bvBinary: resolveBinary('bv'),
  }
}

// Cached config instance
let cachedConfig: BeadsConfig | null = null

// Workspace root for hot-swapping active directory
let workspaceRoot: string | null = null

/**
 * Gets the configuration, loading it if not already cached.
 * Uses the workspace root if set, otherwise uses current working directory.
 */
export function getConfig(): BeadsConfig {
  if (!cachedConfig) {
    cachedConfig = loadConfig(getWorkspaceRoot())
  }
  return cachedConfig
}

/**
 * Clears the cached configuration (useful for testing or when project changes).
 * Note: Does NOT reset workspaceRoot - that's managed separately.
 */
export function clearConfigCache(): void {
  cachedConfig = null
}

/**
 * Gets the current workspace root directory.
 * Returns the explicitly set workspace root, or process.cwd() if not set.
 */
export function getWorkspaceRoot(): string {
  return workspaceRoot ?? process.cwd()
}

/**
 * Sets the workspace root directory for hot-swapping the active root.
 * Also clears the config cache so getConfig() will reload with the new root.
 */
export function setWorkspaceRoot(path: string): void {
  workspaceRoot = path
  clearConfigCache()
}
