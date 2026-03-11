/**
 * Core domain types for the Beads IDE.
 *
 * Bead types match the actual JSON output of `bd list --json` and `bd show --json`.
 * Formula types are derived from docs/formulas.md (Go Formula struct).
 */

// ============================================================================
// Bead Status & Type Enums
// ============================================================================

/** Bead status values (from docs/beads.md) */
export type BeadStatus =
  | 'open'
  | 'in_progress'
  | 'blocked'
  | 'deferred'
  | 'closed'
  | 'tombstone'
  | 'pinned'
  | 'hooked'

/** Built-in bead issue types */
export type BeadBuiltinType = 'task' | 'bug' | 'feature' | 'epic' | 'chore' | 'gate'

/** Custom bead issue types (from docs/beads.md) */
export type BeadCustomType =
  | 'wisp'
  | 'molecule'
  | 'convoy'
  | 'merge-request'
  | 'slot'
  | 'agent'
  | 'role'
  | 'rig'
  | 'message'

/** All known bead types */
export type BeadType = BeadBuiltinType | BeadCustomType

// ============================================================================
// Dependency Types
// ============================================================================

/** Workflow dependency types that affect bd ready calculation */
export type WorkflowDependencyType =
  | 'blocks'
  | 'parent-child'
  | 'conditional-blocks'
  | 'waits-for'

/** Association dependency types */
export type AssociationDependencyType = 'related' | 'discovered-from'

/** Graph dependency types */
export type GraphDependencyType = 'relates-to' | 'replies-to' | 'duplicates' | 'supersedes'

/** Entity/HOP dependency types */
export type EntityDependencyType = 'authored-by' | 'assigned-to' | 'approved-by' | 'attests'

/** Other well-known dependency types */
export type OtherDependencyType =
  | 'tracks'
  | 'until'
  | 'caused-by'
  | 'validates'
  | 'delegated-from'

/** All 18 well-known dependency types */
export type DependencyType =
  | WorkflowDependencyType
  | AssociationDependencyType
  | GraphDependencyType
  | EntityDependencyType
  | OtherDependencyType

// ============================================================================
// Bead Types (matching bd CLI JSON output)
// ============================================================================

/**
 * Inline dependency/dependent reference as returned by `bd show --json`.
 * Both `dependencies` and `dependents` arrays use this shape.
 */
export interface BeadDependency {
  id: string
  title: string
  description: string
  acceptance_criteria?: string
  status: BeadStatus | string
  priority: number
  issue_type: BeadType | string
  owner?: string
  assignee?: string
  created_at: string
  created_by?: string
  updated_at: string
  /** The dependency relationship type */
  dependency_type: DependencyType | string
}

/** Alias for clarity when used in dependents context */
export type BeadDependent = BeadDependency

/**
 * Full bead structure as returned by `bd list --json` and `bd show --json`.
 *
 * Some fields are only present in certain contexts:
 * - `dependencies`, `dependents`, `parent`: present in `bd show --json`
 * - `dependency_count`, `dependent_count`, `comment_count`: present in `bd list --json`
 * - `closed_at`, `close_reason`: present when status is 'closed'
 * - `ephemeral`: present for ephemeral beads
 */
export interface BeadFull {
  id: string
  title: string
  description: string
  acceptance_criteria?: string
  status: BeadStatus | string
  priority: number
  issue_type: BeadType | string
  owner?: string
  assignee?: string
  created_at: string
  created_by?: string
  updated_at: string
  notes?: string

  /** Design notes / structured findings */
  design?: string

  /** Parent bead ID (present in show output) */
  parent?: string

  /** Whether this is an ephemeral bead */
  ephemeral?: boolean

  /** Close timestamp (present when status is 'closed') */
  closed_at?: string
  /** Reason for closure */
  close_reason?: string

  /** Dependencies (beads this one depends on) — present in show output */
  dependencies?: BeadDependency[]
  /** Dependents (beads that depend on this one) — present in show output */
  dependents?: BeadDependent[]

  /** Number of dependencies — present in list output */
  dependency_count?: number
  /** Number of dependents — present in list output */
  dependent_count?: number
  /** Number of comments — present in list output */
  comment_count?: number

  /** Labels attached to the bead */
  labels?: string[]

  // Agent-specific fields (present when issue_type is 'agent')
  /** Hooked bead ID */
  hook_bead?: string
  /** Agent state */
  agent_state?: string
  /** Last activity timestamp */
  last_activity?: string
}

/**
 * API error response structure.
 */
export interface BeadApiError {
  error: string
  code: string
  details?: string
}

/**
 * Successful beads list response.
 */
export interface BeadsListResponse {
  beads: BeadFull[]
  count: number
}

/**
 * Successful single bead response.
 */
export interface BeadShowResponse {
  bead: BeadFull
}

// ============================================================================
// Formula Source Types (from docs/formulas.md)
// ============================================================================

/** Formula type classification */
export type FormulaType = 'workflow' | 'expansion' | 'aspect'

/** Formula instantiation phase */
export type FormulaPhase = 'liquid' | 'vapor'

/**
 * Variable definition in a formula (VarDef).
 * Each variable can have type constraints, defaults, and validation rules.
 */
export interface VarDef {
  description?: string
  default?: string
  required?: boolean
  enum?: string[]
  pattern?: string
  type?: 'string' | 'int' | 'bool'
}

/**
 * Gate definition for async wait conditions in formula steps.
 */
export interface Gate {
  type: 'gh:run' | 'gh:pr' | 'timer' | 'human' | 'mail' | string
  id?: string
  timeout?: string
}

/**
 * Loop specification for iteration in formula steps.
 */
export interface LoopSpec {
  count?: number
  until?: string
  max?: number
  range?: string
  var?: string
  body?: Step[]
}

/**
 * Runtime expansion spec triggered on step completion.
 */
export interface OnCompleteSpec {
  for_each: string
  bond: string
  vars?: Record<string, string>
  parallel?: boolean
  sequential?: boolean
}

/**
 * Bond point for formula composition.
 */
export interface BondPoint {
  name: string
  after_step?: string
  before_step?: string
  parallel?: boolean
}

/**
 * Composition/bonding rules for formulas.
 */
export interface ComposeRules {
  bond_points?: BondPoint[]
  hooks?: unknown[]
  expand?: unknown[]
  map?: unknown[]
  branch?: unknown[]
  gate?: unknown[]
  aspects?: string[]
}

/**
 * A step in a formula definition.
 * Each step becomes an issue when the formula is cooked.
 */
export interface Step {
  id: string
  title: string
  description?: string
  type?: 'task' | 'bug' | 'feature' | 'epic' | 'chore'
  priority?: number
  labels?: string[]
  depends_on?: string[]
  needs?: string[]
  assignee?: string
  condition?: string
  expand?: string
  expand_vars?: Record<string, string>
  gate?: Gate
  loop?: LoopSpec
  on_complete?: OnCompleteSpec
  waits_for?: string
  children?: Step[]
}

/**
 * Advice rule for aspect formula weaving.
 */
export interface AdviceRule {
  target: string
  before?: Step
  after?: Step
  around?: { before: Step; after: Step }
}

/**
 * Pointcut for aspect formula targeting.
 */
export interface Pointcut {
  glob?: string
  type?: string
  label?: string
}

/**
 * Full formula definition (source code representation).
 * This is the schema of .formula.toml / .formula.json files.
 */
export interface FormulaSource {
  formula: string
  description?: string
  version?: number
  type?: FormulaType
  phase?: FormulaPhase
  source?: string
  extends?: string[]
  vars?: Record<string, VarDef>
  steps?: Step[]
  template?: Step[]
  compose?: ComposeRules
  advice?: AdviceRule[]
  pointcuts?: Pointcut[]
}
