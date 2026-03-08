/**
 * Needs selector component for step dependencies.
 * Displays a checkbox list of available step IDs that can be selected as dependencies.
 */
import { type CSSProperties, useCallback } from 'react'

export interface NeedsSelectorProps {
  /** Currently selected dependency IDs */
  selectedIds: string[]
  /** All available step IDs (excluding current step) */
  availableIds: string[]
  /** Callback when selection changes */
  onChange: (ids: string[]) => void
  /** Whether the selector is disabled */
  disabled?: boolean
  /** ID of the element that describes this selector (e.g. error message) */
  'aria-describedby'?: string
}

const containerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
}

const checkboxRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '4px 0',
}

const checkboxStyle: CSSProperties = {
  width: '16px',
  height: '16px',
  accentColor: '#6366f1',
  cursor: 'pointer',
}

const labelStyle: CSSProperties = {
  fontFamily: 'monospace',
  fontSize: '12px',
  color: '#e5e7eb',
  cursor: 'pointer',
}

const emptyStyle: CSSProperties = {
  fontSize: '12px',
  color: '#6b7280',
  fontStyle: 'italic',
}

/**
 * Multi-select checkbox list for step dependencies.
 */
export function NeedsSelector({
  selectedIds,
  availableIds,
  onChange,
  disabled = false,
  'aria-describedby': ariaDescribedBy,
}: NeedsSelectorProps) {
  const selectedSet = new Set(selectedIds)

  const handleToggle = useCallback(
    (id: string) => {
      if (disabled) return
      const newSelected = selectedSet.has(id)
        ? selectedIds.filter((s) => s !== id)
        : [...selectedIds, id]
      onChange(newSelected)
    },
    [selectedIds, selectedSet, onChange, disabled]
  )

  if (availableIds.length === 0) {
    return <div style={emptyStyle}>No other steps available</div>
  }

  return (
    <fieldset style={containerStyle} aria-label="Dependencies" aria-describedby={ariaDescribedBy}>
      {availableIds.map((id) => {
        const isChecked = selectedSet.has(id)
        return (
          <div key={id} style={checkboxRowStyle}>
            <input
              type="checkbox"
              id={`needs-${id}`}
              checked={isChecked}
              onChange={() => handleToggle(id)}
              style={{
                ...checkboxStyle,
                ...(disabled ? { cursor: 'not-allowed', opacity: 0.5 } : {}),
              }}
              disabled={disabled}
              aria-label={`Depends on ${id}`}
            />
            <label
              htmlFor={`needs-${id}`}
              style={{
                ...labelStyle,
                ...(disabled ? { cursor: 'not-allowed', opacity: 0.5 } : {}),
              }}
            >
              {id}
            </label>
          </div>
        )
      })}
    </fieldset>
  )
}
