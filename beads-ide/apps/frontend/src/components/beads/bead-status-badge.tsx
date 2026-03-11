/**
 * Status badge using statusConfig pattern from openedi's transaction-status-badge.
 * Maps bead status to { label, color, bgColor } for consistent styling.
 * WCAG 2.1 AA compliant — uses icon + text, not color alone.
 */
import type { BeadStatus } from '@beads-ide/shared'
import type { CSSProperties } from 'react'

interface StatusConfig {
  label: string
  color: string
  bgColor: string
  icon: string
}

const statusConfig: Record<BeadStatus, StatusConfig> = {
  open: { label: 'Open', color: '#3b82f6', bgColor: 'rgba(59, 130, 246, 0.15)', icon: '○' },
  in_progress: {
    label: 'In Progress',
    color: '#f59e0b',
    bgColor: 'rgba(245, 158, 11, 0.15)',
    icon: '◐',
  },
  hooked: { label: 'Hooked', color: '#8b5cf6', bgColor: 'rgba(139, 92, 246, 0.15)', icon: '◎' },
  blocked: { label: 'Blocked', color: '#ef4444', bgColor: 'rgba(239, 68, 68, 0.15)', icon: '⊘' },
  closed: { label: 'Closed', color: '#22c55e', bgColor: 'rgba(34, 197, 94, 0.15)', icon: '●' },
  deferred: {
    label: 'Deferred',
    color: '#6b7280',
    bgColor: 'rgba(107, 114, 128, 0.15)',
    icon: '◇',
  },
  tombstone: {
    label: 'Tombstone',
    color: '#4b5563',
    bgColor: 'rgba(75, 85, 99, 0.15)',
    icon: '†',
  },
  pinned: { label: 'Pinned', color: '#ec4899', bgColor: 'rgba(236, 72, 153, 0.15)', icon: '📌' },
}

const defaultConfig: StatusConfig = {
  label: 'Unknown',
  color: '#6b7280',
  bgColor: 'rgba(107, 114, 128, 0.15)',
  icon: '○',
}

interface BeadStatusBadgeProps {
  status: string
}

export function BeadStatusBadge({ status }: BeadStatusBadgeProps) {
  const config = statusConfig[status as BeadStatus] ?? defaultConfig

  const style: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 500,
    textTransform: 'uppercase',
    backgroundColor: config.bgColor,
    color: config.color,
    whiteSpace: 'nowrap',
  }

  return (
    <output style={style} aria-label={`Status: ${config.label}`}>
      <span aria-hidden="true">{config.icon}</span>
      {config.label}
    </output>
  )
}

/** Check if a status is considered an error/blocked state */
export function isBlockedStatus(status: string): boolean {
  return status === 'blocked'
}
