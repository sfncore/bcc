/**
 * Faceted filter panel for bead list.
 * Client-side filtering by status, type, priority, and labels.
 */
import type { BeadFull } from '@beads-ide/shared'
import { type CSSProperties, useCallback, useMemo } from 'react'

// --- Types ---

export type GroupMode = 'none' | 'epic' | 'type' | 'status'

export interface FilterState {
  statuses: Set<string>
  types: Set<string>
  priorities: Set<number>
  labels: Set<string>
}

export interface BeadFiltersProps {
  beads: BeadFull[]
  filters: FilterState
  onFiltersChange: (filters: FilterState) => void
  groupMode: GroupMode
  onGroupModeChange: (mode: GroupMode) => void
}

// --- Styles ---

const panelStyle: CSSProperties = {
  padding: '12px 16px',
  borderBottom: '1px solid #3c3c3c',
  backgroundColor: '#252526',
  display: 'flex',
  flexWrap: 'wrap',
  gap: '12px',
  alignItems: 'flex-start',
}

const sectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
}

const sectionLabelStyle: CSSProperties = {
  fontSize: '10px',
  fontWeight: 600,
  color: '#9ca3af',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
}

const chipContainerStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '4px',
}

const chipStyle = (active: boolean): CSSProperties => ({
  padding: '2px 8px',
  fontSize: '11px',
  fontWeight: 500,
  borderRadius: '4px',
  border: '1px solid',
  borderColor: active ? '#007acc' : '#3c3c3c',
  backgroundColor: active ? 'rgba(0, 122, 204, 0.15)' : 'transparent',
  color: active ? '#4fc1ff' : '#9ca3af',
  cursor: 'pointer',
  transition: 'all 0.1s ease',
  whiteSpace: 'nowrap',
})

const groupSelectStyle: CSSProperties = {
  padding: '4px 8px',
  fontSize: '11px',
  backgroundColor: '#1e1e1e',
  color: '#e5e5e5',
  border: '1px solid #3c3c3c',
  borderRadius: '4px',
  cursor: 'pointer',
}

// --- Helpers ---

/** Extract unique facet values from beads */
export function extractFacets(beads: BeadFull[]) {
  const statuses = new Set<string>()
  const types = new Set<string>()
  const priorities = new Set<number>()
  const labels = new Set<string>()

  for (const bead of beads) {
    statuses.add(bead.status)
    types.add(bead.issue_type)
    priorities.add(bead.priority)
    if (bead.labels) {
      for (const label of bead.labels) {
        labels.add(label)
      }
    }
  }

  return { statuses, types, priorities, labels }
}

/** Apply filters to bead list. Returns filtered beads. */
export function applyFilters(beads: BeadFull[], filters: FilterState): BeadFull[] {
  return beads.filter((bead) => {
    if (filters.statuses.size > 0 && !filters.statuses.has(bead.status)) return false
    if (filters.types.size > 0 && !filters.types.has(bead.issue_type)) return false
    if (filters.priorities.size > 0 && !filters.priorities.has(bead.priority)) return false
    if (filters.labels.size > 0) {
      const beadLabels = bead.labels ?? []
      if (!beadLabels.some((l) => filters.labels.has(l))) return false
    }
    return true
  })
}

/** Group beads by the selected mode */
export function groupBeads(
  beads: BeadFull[],
  mode: GroupMode
): Map<string, BeadFull[]> {
  if (mode === 'none') {
    return new Map([['All', beads]])
  }

  const groups = new Map<string, BeadFull[]>()

  for (const bead of beads) {
    let key: string
    switch (mode) {
      case 'status':
        key = bead.status
        break
      case 'type':
        key = bead.issue_type
        break
      case 'epic':
        key = bead.parent ?? 'No Parent'
        break
    }

    const group = groups.get(key)
    if (group) {
      group.push(bead)
    } else {
      groups.set(key, [bead])
    }
  }

  return groups
}

/** Create an empty filter state */
export function emptyFilters(): FilterState {
  return {
    statuses: new Set(),
    types: new Set(),
    priorities: new Set(),
    labels: new Set(),
  }
}

// --- Component ---

export function BeadFilters({
  beads,
  filters,
  onFiltersChange,
  groupMode,
  onGroupModeChange,
}: BeadFiltersProps) {
  const facets = useMemo(() => extractFacets(beads), [beads])

  const toggleSet = useCallback(
    <T,>(current: Set<T>, value: T): Set<T> => {
      const next = new Set(current)
      if (next.has(value)) {
        next.delete(value)
      } else {
        next.add(value)
      }
      return next
    },
    []
  )

  const toggleStatus = useCallback(
    (status: string) => {
      onFiltersChange({ ...filters, statuses: toggleSet(filters.statuses, status) })
    },
    [filters, onFiltersChange, toggleSet]
  )

  const toggleType = useCallback(
    (type: string) => {
      onFiltersChange({ ...filters, types: toggleSet(filters.types, type) })
    },
    [filters, onFiltersChange, toggleSet]
  )

  const togglePriority = useCallback(
    (priority: number) => {
      onFiltersChange({ ...filters, priorities: toggleSet(filters.priorities, priority) })
    },
    [filters, onFiltersChange, toggleSet]
  )

  const toggleLabel = useCallback(
    (label: string) => {
      onFiltersChange({ ...filters, labels: toggleSet(filters.labels, label) })
    },
    [filters, onFiltersChange, toggleSet]
  )

  const hasActiveFilters =
    filters.statuses.size > 0 ||
    filters.types.size > 0 ||
    filters.priorities.size > 0 ||
    filters.labels.size > 0

  return (
    <div style={panelStyle}>
      {/* Group by */}
      <div style={sectionStyle}>
        <span style={sectionLabelStyle}>Group</span>
        <select
          style={groupSelectStyle}
          value={groupMode}
          onChange={(e) => onGroupModeChange(e.target.value as GroupMode)}
          aria-label="Group beads by"
        >
          <option value="none">None</option>
          <option value="epic">Epic</option>
          <option value="type">Type</option>
          <option value="status">Status</option>
        </select>
      </div>

      {/* Status filter */}
      {facets.statuses.size > 0 && (
        <div style={sectionStyle}>
          <span style={sectionLabelStyle}>Status</span>
          <div style={chipContainerStyle}>
            {[...facets.statuses].sort().map((status) => (
              <button
                key={status}
                type="button"
                style={chipStyle(filters.statuses.has(status))}
                onClick={() => toggleStatus(status)}
                aria-pressed={filters.statuses.has(status)}
              >
                {status.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Type filter */}
      {facets.types.size > 0 && (
        <div style={sectionStyle}>
          <span style={sectionLabelStyle}>Type</span>
          <div style={chipContainerStyle}>
            {[...facets.types].sort().map((type) => (
              <button
                key={type}
                type="button"
                style={chipStyle(filters.types.has(type))}
                onClick={() => toggleType(type)}
                aria-pressed={filters.types.has(type)}
              >
                {type}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Priority filter */}
      {facets.priorities.size > 0 && (
        <div style={sectionStyle}>
          <span style={sectionLabelStyle}>Priority</span>
          <div style={chipContainerStyle}>
            {[...facets.priorities].sort().map((p) => (
              <button
                key={p}
                type="button"
                style={chipStyle(filters.priorities.has(p))}
                onClick={() => togglePriority(p)}
                aria-pressed={filters.priorities.has(p)}
              >
                P{p}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Labels filter */}
      {facets.labels.size > 0 && (
        <div style={sectionStyle}>
          <span style={sectionLabelStyle}>Labels</span>
          <div style={chipContainerStyle}>
            {[...facets.labels].sort().map((label) => (
              <button
                key={label}
                type="button"
                style={chipStyle(filters.labels.has(label))}
                onClick={() => toggleLabel(label)}
                aria-pressed={filters.labels.has(label)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Clear filters */}
      {hasActiveFilters && (
        <div style={{ ...sectionStyle, justifyContent: 'flex-end' }}>
          <span style={sectionLabelStyle}>&nbsp;</span>
          <button
            type="button"
            style={{
              ...chipStyle(false),
              borderColor: '#ef4444',
              color: '#ef4444',
            }}
            onClick={() => onFiltersChange(emptyFilters())}
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  )
}
