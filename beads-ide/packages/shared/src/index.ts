// Shared types for beads-ide
export interface Placeholder {
  id: string
}

// Formula parser
export {
  parseFormula,
  parseAndValidateFormula,
  validateDependencies,
  type ParsedFormula as ParserParsedFormula,
  type FormulaParseError,
  type FormulaParseResult,
} from './formula-parser.js'

// Wave computation
export {
  computeWaves,
  isWorkflowDep,
  WORKFLOW_DEP_TYPES,
  type Bead,
  type Dependency,
  type Wave,
  type WaveResult,
  type WorkflowDepType,
} from './wave.js'

// Core domain types — bead types matching bd CLI JSON output
export type {
  BeadStatus,
  BeadBuiltinType,
  BeadCustomType,
  BeadType,
  WorkflowDependencyType,
  AssociationDependencyType,
  GraphDependencyType,
  EntityDependencyType,
  OtherDependencyType,
  DependencyType,
  BeadDependency,
  BeadDependent,
  BeadFull,
  BeadApiError,
  BeadsListResponse,
  BeadShowResponse,
} from './types.js'

// Core domain types — formula source types from docs/formulas.md
export type {
  FormulaType,
  FormulaPhase,
  VarDef,
  Gate,
  LoopSpec,
  OnCompleteSpec,
  BondPoint,
  ComposeRules,
  Step,
  AdviceRule,
  Pointcut,
  FormulaSource,
} from './types.js'

// IDE-specific types — graph metrics and visualization
export type {
  GraphNode,
  GraphEdge,
  GraphStats,
  GraphExport,
  RankedMetric,
  HITSScores,
  CycleInfo,
  DegreeMetrics,
  CriticalPath,
  TopoSort,
  GraphMetrics,
  GraphError,
  GraphMetricsResponse,
  GraphExportResponse,
  GraphMetricsResult,
  GraphExportResult,
  // Cook API types
  ProtoBead,
  FormulaVariable,
  CookResult,
  CookRequest,
  // Formula list API types
  FormulaFile,
  Formula,
  FormulaListItem,
  FormulaListResponse,
  FormulaListError,
  // Sling API types
  SlingRequest,
  SlingResult,
  SlingTarget,
  // Pour API types
  PourRequest,
  CreatedBead,
  PourResult,
  // Burn API types (rollback)
  BurnRequest,
  BurnResult,
  // Formula detail API types
  ParsedFormula,
  FormulaReadResponse,
  FormulaApiError,
  FormulaWriteRequest,
  FormulaWriteResponse,
  FormulaCookRequest,
  FormulaSlingRequest,
  // Workspace tree API types
  TreeNode,
  TreeResponse,
  TreeError,
  TreeResult,
  // Workspace management API types
  WorkspaceOpenRequest,
  WorkspaceOpenResponse,
  WorkspaceInitRequest,
  WorkspaceInitResponse,
  WorkspaceStateResponse,
  WorkspaceError,
  WorkspaceOpenResult,
  WorkspaceInitResult,
  WorkspaceStateResult,
  // Generic API types
  ApiResponse,
  // CLI invocation types
  CliInvocation,
  // Session & config types
  SessionState,
  BeadsIDEConfig,
} from './ide-types.js'

// Mermaid export
export {
  toMermaid,
  type MermaidNode,
  type MermaidEdge,
  type ToMermaidOptions,
} from './to-mermaid.js'
