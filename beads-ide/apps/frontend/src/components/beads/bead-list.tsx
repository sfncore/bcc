/**
 * Bead list view with grouping support.
 * Primary results analysis panel following openedi's transaction-list.tsx pattern.
 */
import type { BeadFull } from '@beads-ide/shared'
import { type CSSProperties, useCallback, useMemo, useState } from 'react'
import { useBeads } from '../../hooks/use-beads'
import {
  BeadFilters,
  type FilterState,
  type GroupMode,
  applyFilters,
  emptyFilters,
  groupBeads,
} from './bead-filters'
import { BeadStatusBadge } from './bead-status-badge'

// --- Styles ---

const containerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  backgroundColor: '#1e1e1e',
}

const listContainerStyle: CSSProperties = {
  flex: 1,
  overflow: 'auto',
  padding: '12px 16px',
}

const groupHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '8px 0',
  marginTop: '8px',
  borderBottom: '1px solid #3c3c3c',
}

const groupTitleStyle: CSSProperties = {
  fontSize: '12px',
  fontWeight: 600,
  color: '#9ca3af',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
}

const groupCountStyle: CSSProperties = {
  fontSize: '10px',
  color: '#6b7280',
  backgroundColor: '#374151',
  padding: '1px 6px',
  borderRadius: '8px',
}

const listItemStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '10px 12px',
  marginBottom: '4px',
  backgroundColor: '#252526',
  borderRadius: '6px',
  border: '1px solid #3c3c3c',
  cursor: 'pointer',
  transition: 'border-color 0.15s ease',
  textAlign: 'left',
  width: '100%',
}

const titleStyle: CSSProperties = {
  fontSize: '13px',
  fontWeight: 500,
  color: '#e5e5e5',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const idStyle: CSSProperties = {
  fontSize: '11px',
  fontFamily: 'monospace',
  color: '#6b7280',
}

const typeBadgeStyle: CSSProperties = {
  fontSize: '10px',
  color: '#9ca3af',
  padding: '2px 6px',
  backgroundColor: '#374151',
  borderRadius: '4px',
  whiteSpace: 'nowrap',
}

const priorityStyle: CSSProperties = {
  fontSize: '11px',
  color: '#9ca3af',
  whiteSpace: 'nowrap',
}

const countBarStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '8px 16px',
  borderBottom: '1px solid #3c3c3c',
  backgroundColor: '#252526',
}

const countTextStyle: CSSProperties = {
  fontSize: '12px',
  color: '#6b7280',
}

const loadingStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  color: '#9ca3af',
  fontSize: '14px',
}

const errorStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  color: '#ef4444',
  fontSize: '14px',
  gap: '8px',
  padding: '24px',
}

const emptyStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '200px',
  color: '#9ca3af',
  fontSize: '14px',
  gap: '8px',
}

// --- Bead Row ---

interface BeadRowProps {
  bead: BeadFull
  onBeadClick?: (beadId: string) => void
}

function BeadRow({ bead, onBeadClick }: BeadRowProps) {
  return (
    <button
      type="button"
      style={listItemStyle}
      onClick={() => onBeadClick?.(bead.id)}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = '#007acc'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = '#3c3c3c'
      }}
    >
      <BeadStatusBadge status={bead.status} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={titleStyle}>{bead.title}</div>
        <div style={idStyle}>{bead.id}</div>
      </div>
      {bead.issue_type && <span style={typeBadgeStyle}>{bead.issue_type}</span>}
      {bead.priority !== undefined && <span style={priorityStyle}>P{bead.priority}</span>}
    </button>
  )
}

// --- Grouped List ---

interface GroupedListProps {
  groups: Map<string, BeadFull[]>
  onBeadClick?: (beadId: string) => void
}

function GroupedList({ groups, onBeadClick }: GroupedListProps) {
  return (
    <>
      {[...groups.entries()].map(([groupName, beads]) => (
        <div key={groupName}>
          <div style={groupHeaderStyle}>
            <span style={groupTitleStyle}>{groupName}</span>
            <span style={groupCountStyle}>{beads.length}</span>
          </div>
          {beads.map((bead) => (
            <BeadRow key={bead.id} bead={bead} onBeadClick={onBeadClick} />
          ))}
        </div>
      ))}
    </>
  )
}

// --- Main Component ---

export interface BeadListProps {
  onBeadClick?: (beadId: string) => void
}

export function BeadList({ onBeadClick }: BeadListProps) {
  const { beads, isLoading, error, refresh } = useBeads()
  const [filters, setFilters] = useState<FilterState>(emptyFilters)
  const [groupMode, setGroupMode] = useState<GroupMode>('none')

  const filteredBeads = useMemo(() => applyFilters(beads, filters), [beads, filters])

  const groups = useMemo(() => groupBeads(filteredBeads, groupMode), [filteredBeads, groupMode])

  const handleBeadClick = useCallback(
    (beadId: string) => {
      onBeadClick?.(beadId)
    },
    [onBeadClick]
  )

  if (isLoading && beads.length === 0) {
    return (
      <div style={containerStyle}>
        <div style={loadingStyle}>Loading beads...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={containerStyle}>
        <div style={errorStyle}>
          <span>Failed to load beads</span>
          <span style={{ fontSize: '12px', color: '#9ca3af' }}>{error.message}</span>
          <button
            type="button"
            style={{
              padding: '6px 16px',
              fontSize: '12px',
              backgroundColor: '#007acc',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              marginTop: '8px',
            }}
            onClick={refresh}
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={containerStyle}>
      {/* Filter panel */}
      <BeadFilters
        beads={beads}
        filters={filters}
        onFiltersChange={setFilters}
        groupMode={groupMode}
        onGroupModeChange={setGroupMode}
      />

      {/* Count bar */}
      <div style={countBarStyle}>
        <span style={countTextStyle}>
          {filteredBeads.length} of {beads.length} {beads.length === 1 ? 'bead' : 'beads'}
        </span>
        {isLoading && <span style={{ fontSize: '11px', color: '#9ca3af' }}>Refreshing...</span>}
      </div>

      {/* List */}
      <div style={listContainerStyle}>
        {filteredBeads.length === 0 ? (
          <div style={emptyStyle}>
            <span>No beads match filters</span>
            <button
              type="button"
              style={{
                fontSize: '12px',
                color: '#007acc',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
              onClick={() => setFilters(emptyFilters())}
            >
              Clear filters
            </button>
          </div>
        ) : groupMode === 'none' ? (
          filteredBeads.map((bead) => (
            <BeadRow key={bead.id} bead={bead} onBeadClick={handleBeadClick} />
          ))
        ) : (
          <GroupedList groups={groups} onBeadClick={handleBeadClick} />
        )}
      </div>
    </div>
  )
}
