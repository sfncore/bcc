/**
 * Types for Beads IDE graph visualization and metrics.
 * These types map to bv CLI robot command outputs.
 */

/**
 * A bead node in the graph.
 */
export interface GraphNode {
  id: string
  title: string
  status: string
  priority?: number
  labels?: string[]
  type?: string
}

/**
 * A dependency edge in the graph.
 */
export interface GraphEdge {
  from: string
  to: string
  type: string
}

/**
 * Graph statistics from bv.
 */
export interface GraphStats {
  nodes: number
  edges: number
  density: number
  avgDegree?: number
}

/**
 * Graph export from bv --robot-graph.
 */
export interface GraphExport {
  generated_at: string
  data_hash: string
  format: 'json' | 'dot' | 'mermaid'
  nodes: GraphNode[]
  edges: GraphEdge[]
  stats: GraphStats
}

/**
 * A ranked metric entry (used for PageRank, betweenness, etc.)
 */
export interface RankedMetric {
  id: string
  title: string
  score: number
  rank?: number
}

/**
 * HITS scores (authorities and hubs).
 */
export interface HITSScores {
  authorities: RankedMetric[]
  hubs: RankedMetric[]
}

/**
 * Cycle information from graph analysis.
 */
export interface CycleInfo {
  count: number
  cycles: string[][]
}

/**
 * Degree metrics for a node.
 */
export interface DegreeMetrics {
  id: string
  title: string
  inDegree: number
  outDegree: number
  totalDegree: number
}

/**
 * Critical path information.
 */
export interface CriticalPath {
  length: number
  path: string[]
  slack: Record<string, number>
}

/**
 * Topological sort order.
 */
export interface TopoSort {
  order: string[]
  levels: Record<string, number>
}

/**
 * The 9 graph metrics exposed by the backend.
 * Maps bv robot-insights output to a normalized structure.
 */
export interface GraphMetrics {
  /** ISO timestamp when metrics were generated */
  generated_at: string
  /** Hash of source data for cache validation */
  data_hash: string

  /** 1. PageRank - influence scores */
  pagerank: RankedMetric[]

  /** 2. Betweenness centrality - bottleneck nodes */
  betweenness: RankedMetric[]

  /** 3. HITS scores - authorities and hubs */
  hits: HITSScores

  /** 4. Critical path length and slack */
  criticalPath: CriticalPath

  /** 5. Eigenvector centrality - keystone nodes */
  eigenvector: RankedMetric[]

  /** 6. Degree metrics (in/out degree) */
  degree: DegreeMetrics[]

  /** 7. Graph density (edges / max possible edges) */
  density: number

  /** 8. Cycle count and cycle details */
  cycles: CycleInfo

  /** 9. Topological sort order */
  topoSort: TopoSort

  /** Graph statistics summary */
  stats: GraphStats

  /** Raw status from bv */
  status?: Record<string, unknown>

  /** Usage hints for agents */
  usageHints?: string[]
}

/**
 * Error response when bv is unavailable or fails.
 */
export interface GraphError {
  ok: false
  error: string
  code: 'BV_NOT_FOUND' | 'BV_ERROR' | 'PARSE_ERROR' | 'NO_BEADS'
}

/**
 * Successful graph metrics response.
 */
export interface GraphMetricsResponse {
  ok: true
  metrics: GraphMetrics
}

/**
 * Successful graph export response.
 */
export interface GraphExportResponse {
  ok: true
  graph: GraphExport
}

/** Union type for graph metrics endpoint */
export type GraphMetricsResult = GraphMetricsResponse | GraphError

/** Union type for graph export endpoint */
export type GraphExportResult = GraphExportResponse | GraphError

// ============================================================================
// Cook API Types
// ============================================================================

/** A proto bead representing a step that will be created when poured */
export interface ProtoBead {
  /** Step ID within the formula */
  id: string
  /** Human-readable title */
  title: string
  /** Detailed description of what this step does */
  description: string
  /** Priority level (0 = highest) */
  priority: number
  /** IDs of steps this step depends on */
  needs?: string[]
}

/** Variable definition from a formula */
export interface FormulaVariable {
  /** Human-readable description of the variable */
  description: string
  /** Default value if not provided */
  default?: string
  /** Whether this variable must be provided */
  required?: boolean
  /** Allowed values (renders as dropdown) */
  enum?: string[]
  /** Expected type: string (default), int, or bool */
  type?: 'string' | 'int' | 'bool'
  /** Regex pattern the value must match */
  pattern?: string
}

/** Result of cooking a formula */
export interface CookResult {
  /** Whether the cook succeeded */
  ok: boolean
  /** Formula name */
  formula?: string
  /** Formula version */
  version?: number
  /** Formula type (e.g., "workflow") */
  type?: string
  /** Formula phase (e.g., "liquid") */
  phase?: string
  /** Variable definitions from the formula */
  vars?: Record<string, FormulaVariable>
  /** Steps that will be created (proto beads) */
  steps?: ProtoBead[]
  /** Source file path */
  source?: string
  /** Variables that are required but not provided (for runtime mode) */
  unbound_vars?: string[]
  /** Error message if cook failed */
  error?: string
  /** Stderr output from cook command */
  stderr?: string
  /** Exit code from cook command */
  exit_code?: number
}

/** Request payload for cook API */
export interface CookRequest {
  /** Path to the formula file */
  formula_path: string
  /** Variable substitutions (key=value pairs) */
  vars?: Record<string, string>
  /** Cooking mode: compile (keep placeholders) or runtime (substitute vars) */
  mode?: 'compile' | 'runtime'
}

// ============================================================================
// Formula List API Types
// ============================================================================

/** A formula file discovered in a search path */
export interface FormulaFile {
  /** Formula name (without extension) */
  name: string
  /** Full path to the formula file */
  path: string
  /** Search path this formula was found in */
  searchPath: string
  /** Human-readable search path label */
  searchPathLabel: string
}

/** @deprecated Use FormulaFile instead */
export type Formula = FormulaFile

/** Alias for FormulaFile used in list API responses */
export type FormulaListItem = FormulaFile

/** Successful formula list response */
export interface FormulaListResponse {
  ok: true
  /** Formulas grouped by search path */
  formulas: FormulaFile[]
  /** Total count of formulas */
  count: number
  /** Search paths that were checked */
  searchPaths: string[]
}

/** Error response for formula list */
export interface FormulaListError {
  ok: false
  error: string
}

// ============================================================================
// Sling API Types
// ============================================================================

/** Request payload for sling API */
export interface SlingRequest {
  /** Path to the formula file */
  formula_path: string
  /** Target agent or crew (e.g., "bcc/polecats/fury" or "bcc/crew/main") */
  target: string
  /** Variable substitutions (key=value pairs) */
  vars?: Record<string, string>
}

/** Result of slinging a formula */
export interface SlingResult {
  /** Whether the sling succeeded */
  ok: boolean
  /** ID of the dispatched molecule/bead */
  molecule_id?: string
  /** Target that received the work */
  target?: string
  /** Formula that was slung */
  formula?: string
  /** Error message if sling failed */
  error?: string
  /** Stderr output from sling command */
  stderr?: string
  /** Exit code from sling command */
  exit_code?: number
}

/** Available sling target */
export interface SlingTarget {
  /** Target identifier (e.g., "bcc/polecats/fury") */
  id: string
  /** Human-readable name */
  name: string
  /** Target type */
  type: 'polecat' | 'crew' | 'rig'
  /** Current status (if available) */
  status?: 'available' | 'busy' | 'offline'
}

// ============================================================================
// Pour API Types
// ============================================================================

/** Request payload for pour API */
export interface PourRequest {
  /** Proto ID to instantiate (e.g., formula name or proto-id) */
  proto_id: string
  /** Variable substitutions (key=value pairs) */
  vars?: Record<string, string>
  /** Assignee for the root issue */
  assignee?: string
  /** Whether to perform a dry run (preview only) */
  dry_run?: boolean
}

/** A created bead from pour operation */
export interface CreatedBead {
  /** Bead ID */
  id: string
  /** Bead title */
  title: string
  /** Bead type (task, bug, epic, etc.) */
  type: string
  /** Bead priority */
  priority: number
}

/** Result of pouring a formula */
export interface PourResult {
  /** Whether the pour succeeded */
  ok: boolean
  /** Molecule ID created from the pour */
  molecule_id?: string
  /** List of beads created */
  created_beads?: CreatedBead[]
  /** Total count of beads created */
  bead_count?: number
  /** Error message if pour failed */
  error?: string
  /** Stderr output from pour command */
  stderr?: string
  /** Exit code from pour command */
  exit_code?: number
  /** Whether this was a dry run */
  dry_run?: boolean
}

// ============================================================================
// Burn API Types (rollback/undo pour)
// ============================================================================

/** Request payload for burn API */
export interface BurnRequest {
  /** Molecule ID to burn/delete */
  molecule_id: string
  /** Whether to force deletion without confirmation */
  force?: boolean
  /** Whether to perform a dry run (preview only) */
  dry_run?: boolean
}

/** Result of burning a molecule */
export interface BurnResult {
  /** Whether the burn succeeded */
  ok: boolean
  /** Number of beads deleted */
  deleted_count?: number
  /** Error message if burn failed */
  error?: string
  /** Stderr output from burn command */
  stderr?: string
  /** Exit code from burn command */
  exit_code?: number
  /** Whether this was a dry run */
  dry_run?: boolean
}

// ============================================================================
// Formula Detail API Types (GET/PUT :name, cook, sling)
// ============================================================================

/** Parsed formula structure returned with formula content */
export interface ParsedFormula {
  /** Formula name */
  name: string
  /** Formula version */
  version?: number
  /** Formula type */
  type?: string
  /** Formula phase */
  phase?: string
  /** Variable definitions */
  vars?: Record<string, FormulaVariable>
  /** Steps defined in formula */
  steps?: ProtoBead[]
}

/** Successful formula read response */
export interface FormulaReadResponse {
  ok: true
  /** Formula name */
  name: string
  /** Full path to the formula file */
  path: string
  /** Raw TOML/JSON content of the formula */
  content: string
  /** Parsed formula structure (from bd cook --compile) */
  parsed?: ParsedFormula
}

/** Error response for formula operations */
export interface FormulaApiError {
  ok: false
  error: string
  code: 'NOT_FOUND' | 'INVALID_NAME' | 'VALIDATION_ERROR' | 'WRITE_ERROR' | 'PARSE_ERROR'
}

/** Request payload for PUT /api/formulas/:name */
export interface FormulaWriteRequest {
  /** TOML/JSON content to write */
  content: string
}

/** Successful formula write response */
export interface FormulaWriteResponse {
  ok: true
  /** Formula name */
  name: string
  /** Path where the formula was written */
  path: string
}

/** Request payload for POST /api/formulas/:name/cook */
export interface FormulaCookRequest {
  /** Variable substitutions */
  vars?: Record<string, string>
}

/** Request payload for POST /api/formulas/:name/sling */
export interface FormulaSlingRequest {
  /** Target agent or crew (e.g., "bcc/polecats/fury") */
  target: string
  /** Variable substitutions */
  vars?: Record<string, string>
}

// ============================================================================
// Workspace Tree API Types
// ============================================================================

/**
 * A node in the workspace file tree.
 * Represents either a directory or a formula file.
 */
export interface TreeNode {
  /** Display name (basename) */
  name: string
  /** Full filesystem path */
  path: string
  /** Node type: directory or formula file */
  type: 'directory' | 'formula'
  /** For formula nodes: name without .formula.toml extension */
  formulaName?: string
  /** For directory nodes: child nodes */
  children?: TreeNode[]
}

/**
 * Successful response from GET /api/tree.
 */
export interface TreeResponse {
  ok: true
  /** Root path of the workspace */
  root: string
  /** Top-level children of the root */
  nodes: TreeNode[]
  /** Total number of nodes in the tree */
  totalCount: number
  /** True if the node limit was reached and results were truncated */
  truncated: boolean
}

/**
 * Error response from GET /api/tree.
 */
export interface TreeError {
  ok: false
  error: string
  code: 'NO_ROOT' | 'NOT_FOUND' | 'READ_ERROR'
}

/** Union type for tree endpoint */
export type TreeResult = TreeResponse | TreeError

// ============================================================================
// Workspace Management API Types
// ============================================================================

/**
 * Request payload for POST /api/workspace/open.
 */
export interface WorkspaceOpenRequest {
  /** Absolute path to the workspace directory */
  path: string
}

/**
 * Successful response from POST /api/workspace/open.
 */
export interface WorkspaceOpenResponse {
  ok: true
  /** The opened workspace root path */
  root: string
  /** Number of formula files discovered */
  formulaCount: number
}

/**
 * Request payload for POST /api/workspace/init.
 */
export interface WorkspaceInitRequest {
  /** Absolute path to the new workspace directory */
  path: string
  /** Template to use for initial formula (defaults to 'blank') */
  template?: 'blank'
}

/**
 * Successful response from POST /api/workspace/init.
 */
export interface WorkspaceInitResponse {
  ok: true
  /** The initialized workspace root path */
  root: string
  /** List of created file/directory paths */
  created: string[]
}

/**
 * Response from GET /api/workspace showing current workspace state.
 */
export interface WorkspaceStateResponse {
  ok: true
  /** Current workspace root path */
  root: string
  /** Number of formula files in the workspace */
  formulaCount: number
  /** Active search paths for formulas */
  searchPaths: string[]
}

/**
 * Error response for workspace operations.
 */
export interface WorkspaceError {
  ok: false
  error: string
  code:
    | 'NOT_FOUND'
    | 'NOT_DIRECTORY'
    | 'PERMISSION_DENIED'
    | 'ALREADY_INITIALIZED'
    | 'WRITE_ERROR'
    | 'NO_ROOT'
    | 'READ_ERROR'
}

/** Union type for workspace open endpoint */
export type WorkspaceOpenResult = WorkspaceOpenResponse | WorkspaceError

/** Union type for workspace init endpoint */
export type WorkspaceInitResult = WorkspaceInitResponse | WorkspaceError

/** Union type for workspace state endpoint */
export type WorkspaceStateResult = WorkspaceStateResponse | WorkspaceError

// ============================================================================
// Generic API Types
// ============================================================================

/** Generic typed API response envelope */
export interface ApiResponse<T> {
  ok: boolean
  data?: T
  error?: string
  code?: string
}

// ============================================================================
// CLI Invocation Types
// ============================================================================

/** Result of a CLI command invocation */
export interface CliInvocation {
  /** Standard output from the command */
  stdout: string
  /** Standard error from the command */
  stderr: string
  /** Process exit code */
  exitCode: number
}

// ============================================================================
// Session & Configuration Types
// ============================================================================

/** Current IDE session state */
export interface SessionState {
  /** Whether the backend is connected */
  connected: boolean
  /** Current workspace root path */
  workspaceRoot?: string
  /** bd CLI version */
  bdVersion?: string
  /** Whether bv (graph tool) is available */
  bvAvailable: boolean
}

/** Beads IDE configuration */
export interface BeadsIDEConfig {
  /** Backend server port */
  port: number
  /** Backend server host */
  host: string
  /** Formula search paths */
  formulaSearchPaths: string[]
  /** Default CLI timeout in milliseconds */
  cliTimeout: number
  /** Cook CLI timeout in milliseconds */
  cookTimeout: number
}
