/**
 * Step editor panel for editing step fields in the Visual/Flow view.
 * Redesigned with more space and a Tiptap markdown editor for descriptions.
 */
import type { ProtoBead } from '@beads-ide/shared'
import {
  type CSSProperties,
  type ChangeEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { MarkdownEditor } from './markdown-editor'
import { NeedsSelector } from './needs-selector'

/** Priority levels 0-9 for visual dot indicators */
const PRIORITY_LEVELS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const

/** Validation errors for step fields */
export interface StepValidationErrors {
  title?: string
  description?: string
  priority?: string
  needs?: string
}

export interface StepEditorPanelProps {
  /** The step being edited */
  step: ProtoBead
  /** All available step IDs for dependency selection */
  availableStepIds: string[]
  /** Callback when a field changes */
  onFieldChange: (stepId: string, field: string, value: string | number | string[]) => void
  /** Callback when panel is closed */
  onClose: () => void
  /** Whether the panel is in a loading state */
  isLoading?: boolean
  /** Validation errors to display for specific fields */
  validationErrors?: StepValidationErrors
}

const panelStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  backgroundColor: '#0f172a',
}

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 16px',
  borderBottom: '1px solid #334155',
  backgroundColor: '#1e293b',
  flexShrink: 0,
}

const headerTitleStyle: CSSProperties = {
  fontSize: '14px',
  fontWeight: 600,
  color: '#e2e8f0',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
}

const stepIdBadgeStyle: CSSProperties = {
  fontSize: '11px',
  fontFamily: 'monospace',
  color: '#6b7280',
  backgroundColor: '#1e293b',
  padding: '2px 8px',
  borderRadius: '4px',
  border: '1px solid #334155',
}

const closeButtonStyle: CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#6b7280',
  cursor: 'pointer',
  fontSize: '18px',
  padding: '4px 8px',
  borderRadius: '4px',
  lineHeight: 1,
  transition: 'color 0.1s ease',
}

const contentStyle: CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '16px',
}

const sectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  marginBottom: '20px',
}

const sectionHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
}

const labelStyle: CSSProperties = {
  fontSize: '11px',
  fontWeight: 600,
  color: '#94a3b8',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
}

const collapsibleLabelStyle: CSSProperties = {
  ...labelStyle,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
}

const chevronStyle = (isExpanded: boolean): CSSProperties => ({
  fontSize: '10px',
  transition: 'transform 0.15s ease',
  transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
})

const inputStyle: CSSProperties = {
  backgroundColor: '#111827',
  border: '1px solid #374151',
  borderRadius: '6px',
  padding: '10px 12px',
  color: '#e5e7eb',
  fontSize: '14px',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
  transition: 'border-color 0.15s ease',
}

const priorityContainerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
}

const priorityInputStyle: CSSProperties = {
  ...inputStyle,
  width: '70px',
  textAlign: 'center',
  padding: '8px 10px',
}

const priorityDotsStyle: CSSProperties = {
  display: 'flex',
  gap: '4px',
  flex: 1,
}

const priorityDotStyle = (filled: boolean): CSSProperties => ({
  width: '12px',
  height: '12px',
  borderRadius: '50%',
  backgroundColor: filled ? '#3b82f6' : '#374151',
  transition: 'background-color 0.1s ease',
  cursor: 'pointer',
})

const priorityLabelStyle: CSSProperties = {
  fontSize: '11px',
  color: '#6b7280',
  minWidth: '50px',
}

const descriptionSectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  marginBottom: '20px',
}

const errorMessageStyle: CSSProperties = {
  fontSize: '12px',
  color: '#ef4444',
  marginTop: '4px',
}

const inputErrorStyle: CSSProperties = {
  borderColor: '#ef4444',
}

const loadingOverlayStyle: CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(15, 23, 42, 0.7)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 10,
}

const spinnerStyle: CSSProperties = {
  width: '24px',
  height: '24px',
  border: '2px solid #334155',
  borderTopColor: '#3b82f6',
  borderRadius: '50%',
  animation: 'spin 1s linear infinite',
}

/**
 * Panel for editing a step's fields (title, description, priority, dependencies).
 * Features a rich markdown editor for descriptions.
 */
export function StepEditorPanel({
  step,
  availableStepIds,
  onFieldChange,
  onClose,
  isLoading = false,
  validationErrors = {},
}: StepEditorPanelProps) {
  const [showDeps, setShowDeps] = useState(true)
  const [priorityError, setPriorityError] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Handle Escape key to close the panel
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !isLoading) {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose, isLoading])

  const handleTitleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      onFieldChange(step.id, 'title', e.target.value)
    },
    [step.id, onFieldChange]
  )

  const handleDescriptionChange = useCallback(
    (value: string) => {
      onFieldChange(step.id, 'description', value)
    },
    [step.id, onFieldChange]
  )

  const handlePriorityChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value
      if (raw === '') {
        setPriorityError(null)
        return
      }
      const value = Number.parseInt(raw, 10)
      if (Number.isNaN(value) || value < 0 || value > 10) {
        setPriorityError('Priority must be 0–10')
      } else {
        setPriorityError(null)
        onFieldChange(step.id, 'priority', value)
      }
    },
    [step.id, onFieldChange]
  )

  const handlePriorityDotClick = useCallback(
    (index: number) => {
      // Clicking a dot sets priority to that index + 1
      // Clicking the same dot toggles it off (sets to index)
      const newPriority = step.priority === index + 1 ? index : index + 1
      onFieldChange(step.id, 'priority', Math.max(0, Math.min(10, newPriority)))
    },
    [step.id, step.priority, onFieldChange]
  )

  const handleNeedsChange = useCallback(
    (ids: string[]) => {
      onFieldChange(step.id, 'needs', ids)
    },
    [step.id, onFieldChange]
  )

  const toggleDeps = useCallback(() => {
    setShowDeps((prev) => !prev)
  }, [])

  // Filter out current step from available dependencies
  const otherStepIds = availableStepIds.filter((id) => id !== step.id)
  const hasNeeds = step.needs && step.needs.length > 0

  // Priority label
  const priorityLabel =
    step.priority === 0
      ? 'Highest'
      : step.priority <= 3
        ? 'High'
        : step.priority <= 6
          ? 'Medium'
          : 'Low'

  return (
    <div ref={panelRef} style={{ ...panelStyle, position: 'relative' }}>
      {/* Loading overlay */}
      {isLoading && (
        <output style={loadingOverlayStyle} aria-live="polite">
          <div style={spinnerStyle} aria-label="Loading" />
        </output>
      )}

      {/* Header */}
      <div style={headerStyle}>
        <div style={headerTitleStyle}>
          <span>Edit Step</span>
          <span style={stepIdBadgeStyle}>{step.id}</span>
        </div>
        <button
          type="button"
          style={closeButtonStyle}
          onClick={onClose}
          disabled={isLoading}
          aria-label="Close step editor"
          title="Close (Esc)"
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#e2e8f0'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = '#6b7280'
          }}
        >
          ×
        </button>
      </div>

      {/* Content */}
      <div style={contentStyle}>
        {/* Title */}
        <div style={sectionStyle}>
          <label htmlFor="step-editor-title" style={labelStyle}>
            Title
          </label>
          <input
            id="step-editor-title"
            type="text"
            value={step.title}
            onChange={handleTitleChange}
            style={{ ...inputStyle, ...(validationErrors.title ? inputErrorStyle : {}) }}
            placeholder="Enter step title..."
            disabled={isLoading}
            aria-invalid={!!validationErrors.title}
            aria-describedby={validationErrors.title ? 'step-editor-title-error' : undefined}
            onFocus={(e) => {
              if (!validationErrors.title) {
                e.currentTarget.style.borderColor = '#3b82f6'
              }
            }}
            onBlur={(e) => {
              if (!validationErrors.title) {
                e.currentTarget.style.borderColor = '#374151'
              }
            }}
          />
          {validationErrors.title && (
            <div id="step-editor-title-error" style={errorMessageStyle} role="alert" aria-live="assertive">
              {validationErrors.title}
            </div>
          )}
        </div>

        {/* Priority */}
        <div style={sectionStyle}>
          <label htmlFor="step-editor-priority" style={labelStyle}>
            Priority
          </label>
          <div style={priorityContainerStyle}>
            <input
              id="step-editor-priority"
              type="number"
              min={0}
              max={10}
              value={step.priority}
              onChange={handlePriorityChange}
              style={{
                ...priorityInputStyle,
                ...(priorityError || validationErrors.priority ? inputErrorStyle : {}),
              }}
              disabled={isLoading}
              aria-invalid={!!(priorityError || validationErrors.priority)}
              aria-describedby={
                priorityError || validationErrors.priority
                  ? 'step-editor-priority-error'
                  : undefined
              }
            />
            <div style={priorityDotsStyle}>
              {PRIORITY_LEVELS.map((level) => (
                <div
                  key={`priority-dot-${level}`}
                  style={{
                    ...priorityDotStyle(level < step.priority),
                    ...(isLoading ? { cursor: 'not-allowed', opacity: 0.5 } : {}),
                  }}
                  onClick={() => !isLoading && handlePriorityDotClick(level)}
                  title={`Set priority to ${level + 1}`}
                  role="button"
                  tabIndex={isLoading ? -1 : 0}
                  onKeyDown={(e) => {
                    if (!isLoading && (e.key === 'Enter' || e.key === ' ')) {
                      handlePriorityDotClick(level)
                    }
                  }}
                />
              ))}
            </div>
            <span style={priorityLabelStyle}>{priorityLabel}</span>
          </div>
          {(priorityError || validationErrors.priority) && (
            <div id="step-editor-priority-error" style={errorMessageStyle} role="alert" aria-live="assertive">
              {priorityError || validationErrors.priority}
            </div>
          )}
        </div>

        {/* Dependencies - Collapsible */}
        <div style={sectionStyle}>
          <div style={sectionHeaderStyle}>
            <button
              type="button"
              style={{ ...collapsibleLabelStyle, background: 'none', border: 'none', padding: 0 }}
              onClick={toggleDeps}
              disabled={isLoading}
            >
              <span style={chevronStyle(showDeps)}>▶</span>
              <span>Dependencies</span>
              {hasNeeds && (
                <span
                  style={{
                    fontSize: '10px',
                    backgroundColor: '#3b82f6',
                    color: '#fff',
                    padding: '1px 6px',
                    borderRadius: '10px',
                    marginLeft: '4px',
                  }}
                >
                  {step.needs?.length}
                </span>
              )}
            </button>
          </div>
          {showDeps && (
            <NeedsSelector
              selectedIds={step.needs ?? []}
              availableIds={otherStepIds}
              onChange={handleNeedsChange}
              disabled={isLoading}
              aria-describedby={validationErrors.needs ? 'step-editor-needs-error' : undefined}
            />
          )}
          {validationErrors.needs && (
            <div id="step-editor-needs-error" style={errorMessageStyle} role="alert" aria-live="assertive">
              {validationErrors.needs}
            </div>
          )}
        </div>

        {/* Description - Takes remaining space */}
        <div style={descriptionSectionStyle}>
          <span id="step-editor-description-label" style={labelStyle}>
            Description
          </span>
          <MarkdownEditor
            value={step.description}
            onChange={handleDescriptionChange}
            placeholder="Describe what this step does..."
            minHeight="250px"
            aria-labelledby="step-editor-description-label"
            aria-describedby={validationErrors.description ? 'step-editor-description-error' : undefined}
            readOnly={isLoading}
          />
          {validationErrors.description && (
            <div id="step-editor-description-error" style={errorMessageStyle} role="alert" aria-live="assertive">
              {validationErrors.description}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
