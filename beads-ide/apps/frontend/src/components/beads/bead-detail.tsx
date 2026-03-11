import type { BeadDependent, BeadFull } from '@beads-ide/shared'
/**
 * Bead detail slide-in panel.
 * Read-only view of full bead details when a bead is clicked in the list.
 * Follows openedi's transaction-detail-modal.tsx slide-in pattern.
 */
import { type CSSProperties, useCallback, useEffect, useRef, useState } from 'react'

// --- Styles ---

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.5)',
  zIndex: 50,
}

const panelContainerStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 50,
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'flex-end',
}

const panelStyle: CSSProperties = {
  position: 'relative',
  height: '100%',
  width: '100%',
  maxWidth: '640px',
  backgroundColor: '#1e1e1e',
  boxShadow: '-4px 0 20px rgba(0, 0, 0, 0.3)',
  overflow: 'auto',
  animation: 'slideIn 0.2s ease-out',
}

const headerStyle: CSSProperties = {
  position: 'sticky',
  top: 0,
  zIndex: 10,
  backgroundColor: '#1e1e1e',
  borderBottom: '1px solid #3c3c3c',
  padding: '16px 24px',
}

const headerTopRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: '16px',
}

const titleStyle: CSSProperties = {
  fontSize: '18px',
  fontWeight: 600,
  color: '#ffffff',
  margin: 0,
  lineHeight: 1.3,
}

const subtitleStyle: CSSProperties = {
  fontSize: '12px',
  color: '#9ca3af',
  marginTop: '4px',
  fontFamily: 'monospace',
}

const closeButtonStyle: CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#9ca3af',
  cursor: 'pointer',
  padding: '4px',
  fontSize: '20px',
  lineHeight: 1,
  borderRadius: '4px',
  flexShrink: 0,
}

const badgeRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  marginTop: '12px',
  flexWrap: 'wrap',
}

const contentStyle: CSSProperties = {
  padding: '24px',
}

const sectionStyle: CSSProperties = {
  marginBottom: '24px',
}

const sectionHeaderStyle: CSSProperties = {
  fontSize: '11px',
  fontWeight: 600,
  color: '#9ca3af',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  marginBottom: '8px',
}

const sectionContentStyle: CSSProperties = {
  color: '#e5e5e5',
  fontSize: '14px',
  lineHeight: 1.6,
}

const metadataGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, 1fr)',
  gap: '16px',
}

const metadataItemStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
}

const metadataLabelStyle: CSSProperties = {
  fontSize: '11px',
  fontWeight: 500,
  color: '#9ca3af',
  textTransform: 'uppercase',
}

const metadataValueStyle: CSSProperties = {
  fontSize: '13px',
  color: '#e5e5e5',
}

const expandButtonStyle: CSSProperties = {
  background: 'none',
  border: '1px solid #3c3c3c',
  color: '#9ca3af',
  cursor: 'pointer',
  padding: '8px 12px',
  fontSize: '12px',
  borderRadius: '4px',
  marginTop: '8px',
  width: '100%',
  textAlign: 'center',
}

const dependencyCardStyle: CSSProperties = {
  backgroundColor: '#252526',
  border: '1px solid #3c3c3c',
  borderRadius: '6px',
  padding: '12px',
  marginBottom: '8px',
}

const dependencyTitleStyle: CSSProperties = {
  fontSize: '13px',
  fontWeight: 500,
  color: '#e5e5e5',
  marginBottom: '4px',
}

const dependencyMetaStyle: CSSProperties = {
  fontSize: '11px',
  color: '#9ca3af',
  fontFamily: 'monospace',
}

const loadingStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '200px',
  color: '#9ca3af',
}

// --- Helper Components ---

/** Status badge with color + icon (WCAG 2.1 AA compliant - no color-only encoding) */
function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; text: string; icon: string }> = {
    open: { bg: '#3b82f6', text: '#ffffff', icon: '○' },
    in_progress: { bg: '#f59e0b', text: '#000000', icon: '◐' },
    hooked: { bg: '#8b5cf6', text: '#ffffff', icon: '◎' },
    closed: { bg: '#22c55e', text: '#000000', icon: '●' },
    blocked: { bg: '#ef4444', text: '#ffffff', icon: '⊘' },
  }

  const color = colors[status] ?? { bg: '#6b7280', text: '#ffffff', icon: '○' }

  const style: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 500,
    textTransform: 'uppercase',
    backgroundColor: color.bg,
    color: color.text,
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: inline status badge on span, output element is block-level
    <span style={style} role="status" aria-label={`Status: ${status.replace('_', ' ')}`}>
      <span aria-hidden="true">{color.icon}</span>
      {status.replace('_', ' ')}
    </span>
  )
}

/** Priority badge with icon (WCAG 2.1 AA compliant - no color-only encoding) */
function PriorityBadge({ priority }: { priority: number }) {
  const priorities: Record<number, { bg: string; icon: string; label: string }> = {
    0: { bg: '#22c55e', icon: '▲▲', label: 'Critical' }, // P0 - green (highest)
    1: { bg: '#eab308', icon: '▲', label: 'High' }, // P1 - yellow
    2: { bg: '#f97316', icon: '◆', label: 'Medium' }, // P2 - orange
    3: { bg: '#ef4444', icon: '▼', label: 'Low' }, // P3 - red (lowest)
  }

  const p = priorities[priority] ?? { bg: '#6b7280', icon: '○', label: 'Unknown' }

  const style: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '3px',
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 500,
    backgroundColor: p.bg,
    color: '#000000',
  }

  return (
    <span style={style} aria-label={`Priority ${priority}: ${p.label}`}>
      <span aria-hidden="true">{p.icon}</span>P{priority}
    </span>
  )
}

/** Type badge with icon (WCAG 2.1 AA compliant - no color-only encoding) */
function TypeBadge({ type }: { type: string }) {
  const typeIcons: Record<string, string> = {
    task: '☐',
    bug: '🐛',
    epic: '📦',
    story: '📝',
    agent: '🤖',
    feature: '✨',
    chore: '🔧',
  }

  const icon = typeIcons[type.toLowerCase()] ?? '○'

  const style: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 500,
    backgroundColor: '#374151',
    color: '#e5e5e5',
  }

  return (
    <span style={style} aria-label={`Type: ${type}`}>
      <span aria-hidden="true">{icon}</span>
      {type}
    </span>
  )
}

/** Label chip */
function LabelChip({ label }: { label: string }) {
  const style: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '2px 8px',
    borderRadius: '12px',
    fontSize: '11px',
    backgroundColor: '#1f2937',
    color: '#9ca3af',
    border: '1px solid #374151',
  }

  return <span style={style}>{label}</span>
}

/** Generate a stable key from paragraph content */
function getContentKey(content: string, index: number): string {
  // Use first 32 chars + index for a stable key
  const prefix = content.slice(0, 32).replace(/\W/g, '_')
  return `${prefix}_${index}`
}

/** Simple markdown renderer for description */
function MarkdownContent({ content }: { content: string }) {
  // Split into paragraphs and render with basic formatting
  const paragraphs = content.split('\n\n')

  return (
    <div>
      {paragraphs.map((paragraph, idx) => {
        const key = getContentKey(paragraph, idx)

        // Handle headers
        if (paragraph.startsWith('# ')) {
          return (
            <h3
              key={key}
              style={{
                fontSize: '16px',
                fontWeight: 600,
                color: '#ffffff',
                marginBottom: '8px',
                marginTop: '16px',
              }}
            >
              {paragraph.slice(2)}
            </h3>
          )
        }
        if (paragraph.startsWith('## ')) {
          return (
            <h4
              key={key}
              style={{
                fontSize: '14px',
                fontWeight: 600,
                color: '#ffffff',
                marginBottom: '8px',
                marginTop: '12px',
              }}
            >
              {paragraph.slice(3)}
            </h4>
          )
        }

        // Handle code blocks
        if (paragraph.startsWith('```')) {
          const lines = paragraph.split('\n')
          const code = lines.slice(1, -1).join('\n')
          return (
            <pre
              key={key}
              style={{
                backgroundColor: '#0d1117',
                borderRadius: '6px',
                padding: '12px',
                fontSize: '12px',
                fontFamily: 'monospace',
                overflow: 'auto',
                marginBottom: '12px',
                color: '#e5e5e5',
              }}
            >
              <code>{code}</code>
            </pre>
          )
        }

        // Handle bullet lists
        if (paragraph.match(/^[-*]\s/m)) {
          const items = paragraph.split('\n').filter((line) => line.match(/^[-*]\s/))
          return (
            <ul key={key} style={{ paddingLeft: '20px', marginBottom: '12px' }}>
              {items.map((item) => (
                <li key={item} style={{ marginBottom: '4px' }}>
                  {item.replace(/^[-*]\s/, '')}
                </li>
              ))}
            </ul>
          )
        }

        // Regular paragraph - preserve line breaks
        return (
          <p key={key} style={{ marginBottom: '12px', whiteSpace: 'pre-wrap' }}>
            {paragraph}
          </p>
        )
      })}
    </div>
  )
}

/** Dependency card */
function DependencyCard({ dep }: { dep: BeadDependent }) {
  return (
    <div style={dependencyCardStyle}>
      <div style={dependencyTitleStyle}>{dep.title}</div>
      <div style={dependencyMetaStyle}>
        {dep.id} · {dep.status} · {dep.dependency_type}
      </div>
    </div>
  )
}

/** Format ISO date string */
function formatDate(isoString: string): string {
  try {
    const date = new Date(isoString)
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return isoString
  }
}

// --- Main Component ---

export interface BeadDetailProps {
  /** The bead to display, or null if loading/none selected */
  bead: BeadFull | null
  /** Callback when the panel should close */
  onClose: () => void
  /** Whether the bead is currently loading */
  isLoading?: boolean
}

/**
 * Slide-in panel showing full bead details.
 * Read-only display of all bead fields with progressive disclosure.
 */
export function BeadDetail({ bead, onClose, isLoading }: BeadDetailProps) {
  const [showFullDescription, setShowFullDescription] = useState(false)
  const [showAcceptanceCriteria, setShowAcceptanceCriteria] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const previousActiveElement = useRef<HTMLElement | null>(null)

  // Focus trap and management for accessibility (WCAG 2.1 AA)
  useEffect(() => {
    if (!bead && !isLoading) return

    // Store the previously focused element to restore focus on close
    previousActiveElement.current = document.activeElement as HTMLElement

    // Focus the panel when it opens
    const timer = setTimeout(() => {
      panelRef.current?.focus()
    }, 10)

    // Handle Tab key to trap focus within the panel
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
        return
      }

      if (e.key === 'Tab' && panelRef.current) {
        const focusableElements = panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        const firstElement = focusableElements[0]
        const lastElement = focusableElements[focusableElements.length - 1]

        if (e.shiftKey && document.activeElement === firstElement) {
          e.preventDefault()
          lastElement?.focus()
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          e.preventDefault()
          firstElement?.focus()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      clearTimeout(timer)
      document.removeEventListener('keydown', handleKeyDown)
      // Restore focus to the previous element when closing
      previousActiveElement.current?.focus()
    }
  }, [bead, isLoading, onClose])

  // Reset expansion state when bead changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally reset on bead ID change only
  useEffect(() => {
    setShowFullDescription(false)
    setShowAcceptanceCriteria(false)
  }, [bead?.id])

  // Handle backdrop click
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose()
      }
    },
    [onClose]
  )

  // Don't render if no bead and not loading
  if (!bead && !isLoading) {
    return null
  }

  // Truncate description for progressive disclosure
  const maxDescLength = 300
  const needsTruncation = (bead?.description?.length ?? 0) > maxDescLength
  const displayDescription =
    bead?.description && needsTruncation && !showFullDescription
      ? `${bead.description.slice(0, maxDescLength)}...`
      : bead?.description

  return (
    <>
      {/* Inject keyframe animation */}
      <style>{`
        @keyframes slideIn {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
      `}</style>

      <div style={panelContainerStyle}>
        {/* Backdrop overlay */}
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: keyboard handled via document-level Escape listener */}
        <div style={overlayStyle} onClick={handleBackdropClick} role="presentation" />

        {/* Panel - using div with role="dialog" for slide-in positioning that <dialog> doesn't support */}
        <div
          ref={panelRef}
          style={panelStyle}
          // biome-ignore lint/a11y/useSemanticElements: slide-in panel positioning requires custom div, <dialog> showModal() breaks the layout
          role="dialog"
          aria-labelledby="bead-detail-title"
          aria-modal="true"
          tabIndex={-1}
        >
          {isLoading ? (
            // biome-ignore lint/a11y/useSemanticElements: intentional ARIA status role, not form output
            <div style={loadingStyle} role="status" aria-live="polite">
              Loading bead details...
            </div>
          ) : bead ? (
            <>
              {/* Sticky Header */}
              <div style={headerStyle}>
                <div style={headerTopRowStyle}>
                  <div>
                    <h2 id="bead-detail-title" style={titleStyle}>
                      {bead.title}
                    </h2>
                    <div style={subtitleStyle}>{bead.id}</div>
                  </div>
                  <button
                    type="button"
                    style={closeButtonStyle}
                    onClick={onClose}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#3c3c3c'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent'
                    }}
                    aria-label="Close panel"
                  >
                    ×
                  </button>
                </div>

                {/* Badge row */}
                <div style={badgeRowStyle}>
                  <StatusBadge status={bead.status} />
                  <PriorityBadge priority={bead.priority} />
                  <TypeBadge type={bead.issue_type} />
                </div>
              </div>

              {/* Content */}
              <div style={contentStyle}>
                {/* Description */}
                {bead.description && (
                  <div style={sectionStyle}>
                    <div style={sectionHeaderStyle}>Description</div>
                    <div style={sectionContentStyle}>
                      <MarkdownContent content={displayDescription ?? ''} />
                      {needsTruncation && (
                        <button
                          type="button"
                          style={expandButtonStyle}
                          onClick={() => setShowFullDescription(!showFullDescription)}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = '#3c3c3c'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent'
                          }}
                        >
                          {showFullDescription ? 'Show less' : 'Show more'}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Acceptance Criteria */}
                {bead.acceptance_criteria && (
                  <div style={sectionStyle}>
                    <button
                      type="button"
                      style={{
                        ...sectionHeaderStyle,
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 0,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        width: '100%',
                        textAlign: 'left',
                      }}
                      onClick={() => setShowAcceptanceCriteria(!showAcceptanceCriteria)}
                    >
                      <span>{showAcceptanceCriteria ? '▼' : '▶'}</span>
                      Acceptance Criteria
                    </button>
                    {showAcceptanceCriteria && (
                      <div style={{ ...sectionContentStyle, marginTop: '8px' }}>
                        <MarkdownContent content={bead.acceptance_criteria} />
                      </div>
                    )}
                  </div>
                )}

                {/* Design */}
                {bead.design && (
                  <div style={sectionStyle}>
                    <div style={sectionHeaderStyle}>Design</div>
                    <div style={sectionContentStyle}>
                      <MarkdownContent content={bead.design} />
                    </div>
                  </div>
                )}

                {/* Notes */}
                {bead.notes && (
                  <div style={sectionStyle}>
                    <div style={sectionHeaderStyle}>Notes</div>
                    <div style={sectionContentStyle}>
                      <MarkdownContent content={bead.notes} />
                    </div>
                  </div>
                )}

                {/* Labels */}
                {bead.labels && bead.labels.length > 0 && (
                  <div style={sectionStyle}>
                    <div style={sectionHeaderStyle}>Labels</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {bead.labels.map((label) => (
                        <LabelChip key={label} label={label} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Metadata Grid */}
                <div style={sectionStyle}>
                  <div style={sectionHeaderStyle}>Details</div>
                  <div style={metadataGridStyle}>
                    <div style={metadataItemStyle}>
                      <span style={metadataLabelStyle}>Owner</span>
                      <span style={metadataValueStyle}>{bead.owner || '—'}</span>
                    </div>
                    <div style={metadataItemStyle}>
                      <span style={metadataLabelStyle}>Assignee</span>
                      <span style={metadataValueStyle}>{bead.assignee || '—'}</span>
                    </div>
                    <div style={metadataItemStyle}>
                      <span style={metadataLabelStyle}>Created</span>
                      <span style={metadataValueStyle}>{formatDate(bead.created_at)}</span>
                    </div>
                    <div style={metadataItemStyle}>
                      <span style={metadataLabelStyle}>Updated</span>
                      <span style={metadataValueStyle}>{formatDate(bead.updated_at)}</span>
                    </div>
                    <div style={metadataItemStyle}>
                      <span style={metadataLabelStyle}>Created By</span>
                      <span style={metadataValueStyle}>{bead.created_by}</span>
                    </div>
                    <div style={metadataItemStyle}>
                      <span style={metadataLabelStyle}>Comments</span>
                      <span style={metadataValueStyle}>{bead.comment_count}</span>
                    </div>
                  </div>
                </div>

                {/* Dependencies (Blocks) */}
                {bead.dependents && bead.dependents.length > 0 && (
                  <div style={sectionStyle}>
                    <div style={sectionHeaderStyle}>Blocks ({bead.dependents.length})</div>
                    {bead.dependents.map((dep) => (
                      <DependencyCard key={dep.id} dep={dep} />
                    ))}
                  </div>
                )}

                {/* Dependencies (Blocked By) */}
                {bead.dependencies && bead.dependencies.length > 0 && (
                  <div style={sectionStyle}>
                    <div style={sectionHeaderStyle}>Blocked By ({bead.dependencies.length})</div>
                    {bead.dependencies.map((dep) => (
                      <DependencyCard key={dep.id} dep={dep} />
                    ))}
                  </div>
                )}

                {/* Agent-specific fields */}
                {bead.issue_type === 'agent' && (
                  <div style={sectionStyle}>
                    <div style={sectionHeaderStyle}>Agent Info</div>
                    <div style={metadataGridStyle}>
                      {bead.hook_bead && (
                        <div style={metadataItemStyle}>
                          <span style={metadataLabelStyle}>Hooked Bead</span>
                          <span style={{ ...metadataValueStyle, fontFamily: 'monospace' }}>
                            {bead.hook_bead}
                          </span>
                        </div>
                      )}
                      {bead.agent_state && (
                        <div style={metadataItemStyle}>
                          <span style={metadataLabelStyle}>State</span>
                          <span style={metadataValueStyle}>{bead.agent_state}</span>
                        </div>
                      )}
                      {bead.last_activity && (
                        <div style={metadataItemStyle}>
                          <span style={metadataLabelStyle}>Last Activity</span>
                          <span style={metadataValueStyle}>{formatDate(bead.last_activity)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </>
  )
}
