/**
 * Convert graph nodes + edges to Mermaid flowchart syntax.
 * Works for formulas, epics, and convoys.
 */

export interface MermaidNode {
  id: string
  title: string
  status?: string
  type?: string
  _rig_db?: string
  wave?: number
}

export interface MermaidEdge {
  from: string
  to: string
  type?: string
}

export interface ToMermaidOptions {
  /** Flowchart direction: TD (top-down), LR (left-right) */
  direction?: 'TD' | 'LR'
  /** Show status as node shape: rounded = open, hexagon = closed */
  statusShapes?: boolean
  /** Show rig as subgraph grouping */
  groupByRig?: boolean
  /** Show wave numbers as comments */
  showWaves?: boolean
}

/** Sanitize ID for Mermaid (no dots, dashes OK) */
function sanitizeId(id: string): string {
  return id.replace(/\./g, '_')
}

/** Escape label text for Mermaid */
function escapeLabel(text: string): string {
  return text.replace(/"/g, '#quot;').replace(/[[\](){}]/g, ' ')
}

/** Get node shape based on status/type */
function nodeShape(node: MermaidNode, useStatusShapes: boolean): [string, string] {
  if (node.type === 'epic') return ['([', '])'] // stadium
  if (node.type === 'convoy') return ['{{', '}}'] // hexagon
  if (useStatusShapes && node.status === 'closed') return ['[/', '/]'] // parallelogram (done)
  return ['[', ']'] // rectangle (default)
}

export function toMermaid(
  nodes: MermaidNode[],
  edges: MermaidEdge[],
  options: ToMermaidOptions = {}
): string {
  const {
    direction = 'TD',
    statusShapes = true,
    groupByRig = false,
    showWaves = true,
  } = options

  const lines: string[] = [`flowchart ${direction}`]

  // Group by rig if requested
  if (groupByRig) {
    const rigGroups = new Map<string, MermaidNode[]>()
    for (const node of nodes) {
      const rig = node._rig_db ?? 'unknown'
      if (!rigGroups.has(rig)) rigGroups.set(rig, [])
      rigGroups.get(rig)!.push(node)
    }

    for (const [rig, rigNodes] of rigGroups) {
      lines.push(`  subgraph ${sanitizeId(rig)}["${rig}"]`)
      for (const node of rigNodes) {
        const [open, close] = nodeShape(node, statusShapes)
        const label = escapeLabel(node.title)
        const waveComment = showWaves && node.wave ? ` W${node.wave}` : ''
        lines.push(`    ${sanitizeId(node.id)}${open}"${label}${waveComment}"${close}`)
      }
      lines.push('  end')
    }
  } else {
    // Wave comments
    if (showWaves) {
      const waveGroups = new Map<number, MermaidNode[]>()
      for (const node of nodes) {
        const w = node.wave ?? 0
        if (!waveGroups.has(w)) waveGroups.set(w, [])
        waveGroups.get(w)!.push(node)
      }

      for (const [wave, waveNodes] of [...waveGroups.entries()].sort((a, b) => a[0] - b[0])) {
        if (wave > 0) lines.push(`  %% Wave ${wave}`)
        for (const node of waveNodes) {
          const [open, close] = nodeShape(node, statusShapes)
          const label = escapeLabel(node.title)
          lines.push(`  ${sanitizeId(node.id)}${open}"${label}"${close}`)
        }
      }
    } else {
      for (const node of nodes) {
        const [open, close] = nodeShape(node, statusShapes)
        const label = escapeLabel(node.title)
        lines.push(`  ${sanitizeId(node.id)}${open}"${label}"${close}`)
      }
    }
  }

  // Edges
  for (const edge of edges) {
    const from = sanitizeId(edge.from)
    const to = sanitizeId(edge.to)
    const arrow = edge.type === 'blocks' ? '-->' : '-.->'
    const label = edge.type === 'parent-child' ? '' : edge.type ? `|${edge.type}|` : ''
    lines.push(`  ${from} ${arrow}${label} ${to}`)
  }

  return lines.join('\n')
}
