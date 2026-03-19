/**
 * Convert a CookResult (formula) into a rich Mermaid flowchart.
 *
 * Enrichments over the generic toMermaid():
 * - Variable inputs rendered as a subgraph with required/optional styling
 * - Step nodes include description snippets and type-based shapes
 * - Agent roles shown in node labels
 * - Acceptance criteria shown as Mermaid notes
 * - CSS classes for step types (agent, health_check, completion, gate)
 * - Composition/expansion markers
 */

import type { CookResult, FormulaVariable, ProtoBead } from './ide-types.js'

export interface FormulaToMermaidOptions {
  /** Flowchart direction: TD (top-down), LR (left-right) */
  direction?: 'TD' | 'LR'
  /** Maximum characters for description snippets in nodes */
  maxDescriptionLength?: number
  /** Show variable inputs as a subgraph */
  showVars?: boolean
  /** Show description snippets in nodes */
  showDescriptions?: boolean
  /** Show acceptance criteria as notes */
  showAcceptance?: boolean
}

/** Sanitize ID for Mermaid (no dots, dashes OK) */
function sanitizeId(id: string): string {
  return id.replace(/[.\s/]/g, '_').replace(/[^a-zA-Z0-9_-]/g, '')
}

/** Escape label text for Mermaid */
function escapeLabel(text: string): string {
  return text.replace(/"/g, '#quot;').replace(/[[\](){}]/g, ' ').replace(/\n/g, '<br/>')
}

/** Extract the first meaningful line from a description */
function extractSnippet(description: string, maxLen: number): string {
  if (!description) return ''
  // Skip blank lines and common header patterns
  const lines = description.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (trimmed.startsWith('#')) continue
    if (trimmed.startsWith('==')) continue
    if (trimmed.startsWith('---')) continue
    if (trimmed.startsWith('```')) continue
    // Strip markdown bold/italic
    const clean = trimmed.replace(/\*\*/g, '').replace(/\*/g, '').replace(/`/g, '')
    if (clean.length <= maxLen) return clean
    return `${clean.slice(0, maxLen - 3)}...`
  }
  return ''
}

/** Detect step type from description keywords and step properties */
function detectStepType(step: ProtoBead): string {
  const desc = (step.description || '').toLowerCase()
  const id = step.id.toLowerCase()

  // Check for known patterns in step content
  if (id.includes('health') || desc.includes('health_check') || desc.includes('health check')) return 'health_check'
  if (id.includes('completion') || id.includes('complete') || desc.includes('completion handler')) return 'completion'
  if (id.includes('gate') || desc.includes('gate check') || desc.includes('timer gate')) return 'gate'
  if (id.includes('kickoff') || id.includes('banner')) return 'kickoff'
  if (id.includes('checkpoint') || id.includes('context-checkpoint')) return 'checkpoint'
  if (id.includes('review') || desc.includes('review pass') || desc.includes('dispatch review')) return 'review'
  if (id.includes('verify') || id.includes('validation') || desc.includes('verify')) return 'verify'
  if (id.includes('report') || id.includes('summary')) return 'report'
  if (desc.includes('gt sling') || desc.includes('gt formula') || desc.includes('dispatch')) return 'dispatch'
  if (desc.includes('bd create') || desc.includes('bd close') || desc.includes('execute')) return 'execute'
  return 'task'
}

/** Extract agent role from description if mentioned */
function extractAgent(description: string): string | null {
  if (!description) return null
  const match = description.match(/agent[:\s]*["']?(\w+)["']?/i)
    || description.match(/role[:\s]*["']?(\w+)["']?/i)
    || description.match(/spawns?\s+(?:a\s+)?(\w+)/i)
  return match ? match[1] : null
}

/** Extract acceptance criteria from description */
function extractAcceptance(description: string): string[] {
  if (!description) return []
  const criteria: string[] = []
  const lines = description.split('\n')
  let inAcceptance = false
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.toLowerCase().includes('acceptance') || trimmed.toLowerCase().includes('exit criteria')) {
      inAcceptance = true
      continue
    }
    if (inAcceptance) {
      if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        criteria.push(trimmed.slice(2).replace(/`/g, '').trim())
      } else if (trimmed.startsWith('#') || trimmed === '') {
        if (criteria.length > 0) break
      }
    }
  }
  return criteria.slice(0, 3) // Max 3 criteria to keep diagram readable
}

/** Get node shape brackets based on step type */
function nodeShape(stepType: string): [string, string] {
  switch (stepType) {
    case 'health_check': return ['{', '}']        // diamond
    case 'completion':   return ['([', '])']       // stadium
    case 'gate':         return ['{{', '}}']       // hexagon
    case 'kickoff':      return ['>', ']']         // asymmetric
    case 'checkpoint':   return ['[/', '/]']       // parallelogram
    case 'review':       return ['[[', ']]']       // subroutine
    case 'dispatch':     return ['([', '])']       // stadium
    default:             return ['[', ']']         // rectangle
  }
}

/** Build a rich node label with title, snippet, and metadata */
function buildNodeLabel(
  step: ProtoBead,
  stepType: string,
  snippet: string,
  agent: string | null,
): string {
  const parts: string[] = []

  // Title with type icon
  const typeIcon = stepType === 'review' ? 'Review: '
    : stepType === 'health_check' ? 'Health: '
    : stepType === 'gate' ? 'Gate: '
    : stepType === 'dispatch' ? 'Dispatch: '
    : stepType === 'checkpoint' ? 'Checkpoint: '
    : ''
  parts.push(`<b>${escapeLabel(typeIcon + step.title)}</b>`)

  // Description snippet
  if (snippet) {
    parts.push(`<i>${escapeLabel(snippet)}</i>`)
  }

  // Agent role
  if (agent) {
    parts.push(`agent: ${escapeLabel(agent)}`)
  }

  return parts.join('<br/>')
}

export function toFormulaMermaid(
  result: CookResult,
  options: FormulaToMermaidOptions = {}
): string {
  const {
    direction = 'TD',
    maxDescriptionLength = 60,
    showVars = true,
    showDescriptions = true,
    showAcceptance = true,
  } = options

  if (!result.ok || !result.steps) return ''

  const lines: string[] = []

  // Header
  lines.push(`flowchart ${direction}`)
  if (result.formula) {
    lines.push(`  %% Formula: ${result.formula} v${result.version ?? 1} (${result.type ?? 'workflow'})`)
  }
  lines.push('')

  // Normalize steps: CookResult.steps can be array or object
  const steps: ProtoBead[] = Array.isArray(result.steps)
    ? result.steps
    : Object.entries(result.steps).map(([id, s]) => ({
        id,
        title: (s as any).title ?? id,
        description: (s as any).description ?? '',
        priority: (s as any).priority ?? 2,
        needs: (s as any).depends_on ?? (s as any).blocking ?? (s as any).needs ?? [],
      }))

  // Variables subgraph
  if (showVars && result.vars && Object.keys(result.vars).length > 0) {
    lines.push('  subgraph vars["Variables"]')
    lines.push('    direction LR')
    for (const [varName, varDef] of Object.entries(result.vars)) {
      const v = varDef as FormulaVariable
      const reqTag = v.required ? ' *' : ''
      const defaultTag = v.default ? ` = ${escapeLabel(v.default)}` : ''
      const desc = v.description ? `<br/><i>${escapeLabel(v.description.slice(0, 40))}</i>` : ''
      const sid = sanitizeId(`var_${varName}`)
      lines.push(`    ${sid}[/"<b>${escapeLabel(varName)}${reqTag}</b>${defaultTag}${desc}"/]`)
    }
    lines.push('  end')
    lines.push('')
  }

  // Detect step groups (compositions/phases) from ID patterns
  const phaseGroups = new Map<string, ProtoBead[]>()
  const ungrouped: ProtoBead[] = []

  for (const step of steps) {
    // Group by dotted prefix: "step-1-beads-creation" stays ungrouped
    // but "load-inputs", "draft-structure" under a composition could be grouped
    // Use step ID patterns to detect phases
    const phaseMatch = step.id.match(/^(step-\d+|phase-\d+)/i)
    if (phaseMatch) {
      const phase = phaseMatch[1]
      if (!phaseGroups.has(phase)) phaseGroups.set(phase, [])
      phaseGroups.get(phase)!.push(step)
    } else {
      ungrouped.push(step)
    }
  }

  // Render all steps (ungrouped first, then grouped)
  const allSteps = phaseGroups.size > 0 ? ungrouped : steps
  const renderStep = (step: ProtoBead, indent: string) => {
    const stepType = detectStepType(step)
    const snippet = showDescriptions ? extractSnippet(step.description, maxDescriptionLength) : ''
    const agent = extractAgent(step.description)
    const [open, close] = nodeShape(stepType)
    const label = buildNodeLabel(step, stepType, snippet, agent)
    const sid = sanitizeId(step.id)
    lines.push(`${indent}${sid}${open}"${label}"${close}`)
  }

  // Render ungrouped steps
  for (const step of allSteps) {
    renderStep(step, '  ')
  }

  // Render phase groups as subgraphs
  if (phaseGroups.size > 0) {
    lines.push('')
    for (const [phase, phaseSteps] of phaseGroups) {
      const phaseTitle = phaseSteps[0]?.title?.replace(/^Step \d+:\s*/i, '') ?? phase
      lines.push(`  subgraph ${sanitizeId(phase)}["${escapeLabel(phase)}: ${escapeLabel(phaseTitle)}"]`)
      for (const step of phaseSteps) {
        renderStep(step, '    ')
      }
      lines.push('  end')
    }
  }

  lines.push('')

  // Edges from needs/depends_on
  const stepIdSet = new Set(steps.map(s => s.id))
  for (const step of steps) {
    const deps = step.needs ?? []
    const sid = sanitizeId(step.id)
    for (const dep of deps) {
      if (stepIdSet.has(dep)) {
        lines.push(`  ${sanitizeId(dep)} --> ${sid}`)
      }
    }
  }

  // Variable edges: connect vars to first step (or steps that reference them)
  if (showVars && result.vars && Object.keys(result.vars).length > 0) {
    // Find root steps (no dependencies)
    const rootSteps = steps.filter(s => !s.needs || s.needs.length === 0)
    if (rootSteps.length > 0) {
      lines.push('')
      lines.push('  %% Variable inputs')
      for (const varName of Object.keys(result.vars)) {
        const varSid = sanitizeId(`var_${varName}`)
        // Connect to root steps that mention the variable in their description
        let connected = false
        for (const root of rootSteps) {
          if (root.description?.includes(`{{${varName}}}`) || root.description?.includes(varName)) {
            lines.push(`  ${varSid} -.-> ${sanitizeId(root.id)}`)
            connected = true
          }
        }
        // If no specific connection found, connect to first root
        if (!connected && rootSteps[0]) {
          lines.push(`  ${varSid} -.->|"${escapeLabel(varName)}"| ${sanitizeId(rootSteps[0].id)}`)
        }
      }
    }
  }

  // Acceptance criteria as notes (Mermaid supports click/note annotations)
  if (showAcceptance) {
    const notes: string[] = []
    for (const step of steps) {
      const criteria = extractAcceptance(step.description)
      if (criteria.length > 0) {
        const sid = sanitizeId(step.id)
        const noteText = criteria.map(c => `- ${escapeLabel(c)}`).join('<br/>')
        notes.push(`  note right of ${sid}`)
        notes.push(`    ${noteText}`)
        notes.push('  end note')
      }
    }
    if (notes.length > 0) {
      lines.push('')
      lines.push('  %% Acceptance criteria')
      lines.push(...notes)
    }
  }

  // Style classes
  lines.push('')
  lines.push('  %% Styling')
  lines.push('  classDef varNode fill:#1e3a5f,stroke:#38bdf8,color:#bae6fd')
  lines.push('  classDef reviewNode fill:#3b1f4b,stroke:#a78bfa,color:#ddd6fe')
  lines.push('  classDef checkpointNode fill:#1c3d2e,stroke:#4ade80,color:#bbf7d0')
  lines.push('  classDef healthNode fill:#4a2c1b,stroke:#fb923c,color:#fed7aa')
  lines.push('  classDef gateNode fill:#4a1b1b,stroke:#f87171,color:#fecaca')
  lines.push('  classDef executeNode fill:#1e3a5f,stroke:#60a5fa,color:#bfdbfe')

  // Apply classes
  for (const step of steps) {
    const stepType = detectStepType(step)
    const sid = sanitizeId(step.id)
    switch (stepType) {
      case 'review': lines.push(`  class ${sid} reviewNode`); break
      case 'checkpoint': lines.push(`  class ${sid} checkpointNode`); break
      case 'health_check': lines.push(`  class ${sid} healthNode`); break
      case 'gate': lines.push(`  class ${sid} gateNode`); break
      case 'execute': lines.push(`  class ${sid} executeNode`); break
    }
  }

  // Apply var styling
  if (showVars && result.vars) {
    for (const varName of Object.keys(result.vars)) {
      lines.push(`  class ${sanitizeId(`var_${varName}`)} varNode`)
    }
  }

  return lines.join('\n')
}
