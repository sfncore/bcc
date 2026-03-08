import type { SlingResult, SlingTarget } from '@beads-ide/shared'
/**
 * Sling dialog for dispatching formulas to agents/crews.
 * Allows target selection and shows execution status.
 */
import {
  type CSSProperties,
  type ChangeEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'

/** Props for the sling dialog */
export interface SlingDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean
  /** Close the dialog */
  onClose: () => void
  /** Formula path to sling */
  formulaPath: string
  /** Variable values to pass */
  vars?: Record<string, string>
  /** Execute the sling */
  onSling: (target: string) => Promise<SlingResult>
  /** Whether a sling is in progress */
  isLoading?: boolean
  /** Result from the last sling */
  result?: SlingResult | null
  /** Navigate to results view */
  onNavigateToResults?: (moleculeId: string) => void
}

// Default targets (would come from API in production)
const DEFAULT_TARGETS: SlingTarget[] = [
  { id: 'bcc/polecats/fury', name: 'Fury (Polecat)', type: 'polecat', status: 'available' },
  { id: 'bcc/polecats/max', name: 'Max (Polecat)', type: 'polecat', status: 'available' },
  { id: 'bcc/crew/main', name: 'Main Crew', type: 'crew', status: 'available' },
]

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.6)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
}

const dialogStyle: CSSProperties = {
  background: '#1a1a1a',
  borderRadius: '12px',
  border: '1px solid #333',
  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
  width: '100%',
  maxWidth: '480px',
  overflow: 'hidden',
}

const headerStyle: CSSProperties = {
  padding: '16px 20px',
  borderBottom: '1px solid #333',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
}

const titleStyle: CSSProperties = {
  fontSize: '16px',
  fontWeight: 600,
  color: '#fff',
  margin: 0,
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
}

const closeButtonStyle: CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#737373',
  fontSize: '20px',
  cursor: 'pointer',
  padding: '4px',
  lineHeight: 1,
}

const contentStyle: CSSProperties = {
  padding: '20px',
}

const labelStyle: CSSProperties = {
  display: 'block',
  fontSize: '13px',
  fontWeight: 500,
  color: '#a3a3a3',
  marginBottom: '8px',
}

const selectContainerStyle: CSSProperties = {
  marginBottom: '16px',
}

const selectStyle: CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  fontSize: '14px',
  background: '#262626',
  border: '1px solid #404040',
  borderRadius: '6px',
  color: '#fff',
  cursor: 'pointer',
  outline: 'none',
}

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  fontSize: '14px',
  background: '#262626',
  border: '1px solid #404040',
  borderRadius: '6px',
  color: '#fff',
  outline: 'none',
  boxSizing: 'border-box',
}

const hintStyle: CSSProperties = {
  fontSize: '12px',
  color: '#737373',
  marginTop: '6px',
}

const formulaPathStyle: CSSProperties = {
  fontSize: '13px',
  color: '#a5b4fc',
  fontFamily: 'monospace',
  background: '#262626',
  padding: '8px 12px',
  borderRadius: '4px',
  marginBottom: '16px',
  wordBreak: 'break-all',
}

const footerStyle: CSSProperties = {
  padding: '16px 20px',
  borderTop: '1px solid #333',
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '12px',
}

const buttonBaseStyle: CSSProperties = {
  padding: '8px 16px',
  borderRadius: '6px',
  fontSize: '14px',
  fontWeight: 500,
  cursor: 'pointer',
  border: 'none',
  transition: 'background 0.15s ease',
}

const cancelButtonStyle: CSSProperties = {
  ...buttonBaseStyle,
  background: '#333',
  color: '#a3a3a3',
}

const slingButtonStyle: CSSProperties = {
  ...buttonBaseStyle,
  background: '#3b82f6',
  color: '#fff',
}

const slingButtonDisabledStyle: CSSProperties = {
  ...slingButtonStyle,
  background: '#1e3a5f',
  cursor: 'not-allowed',
  opacity: 0.6,
}

const statusStyle: CSSProperties = {
  padding: '12px 16px',
  borderRadius: '6px',
  marginBottom: '16px',
  fontSize: '14px',
}

const successStatusStyle: CSSProperties = {
  ...statusStyle,
  background: '#052e16',
  border: '1px solid #166534',
  color: '#86efac',
}

const errorStatusStyle: CSSProperties = {
  ...statusStyle,
  background: '#450a0a',
  border: '1px solid #991b1b',
  color: '#fca5a5',
}

const loadingStyle: CSSProperties = {
  ...statusStyle,
  background: '#1e1b4b',
  border: '1px solid #4338ca',
  color: '#a5b4fc',
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
}

const retryButtonStyle: CSSProperties = {
  ...buttonBaseStyle,
  background: '#991b1b',
  color: '#fff',
  marginTop: '8px',
  padding: '6px 12px',
  fontSize: '13px',
}

const viewResultsButtonStyle: CSSProperties = {
  ...buttonBaseStyle,
  background: '#166534',
  color: '#fff',
  marginTop: '8px',
  padding: '6px 12px',
  fontSize: '13px',
}

/**
 * Sling dialog component for dispatching formulas to agents/crews.
 */
export function SlingDialog({
  isOpen,
  onClose,
  formulaPath,
  vars,
  onSling,
  isLoading = false,
  result,
  onNavigateToResults,
}: SlingDialogProps) {
  const [selectedTarget, setSelectedTarget] = useState<string>('')
  const [customTarget, setCustomTarget] = useState<string>('')
  const [useCustom, setUseCustom] = useState(false)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const customInputRef = useRef<HTMLInputElement>(null)

  // Reset state when dialog opens and show/close dialog
  useEffect(() => {
    if (isOpen) {
      setSelectedTarget(DEFAULT_TARGETS[0]?.id || '')
      setCustomTarget('')
      setUseCustom(false)
      dialogRef.current?.showModal()
    } else {
      dialogRef.current?.close()
    }
  }, [isOpen])

  // Focus custom input when switching to custom mode
  useEffect(() => {
    if (useCustom && customInputRef.current) {
      customInputRef.current.focus()
    }
  }, [useCustom])

  // Handle click outside to close
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget && !isLoading) {
        onClose()
      }
    },
    [onClose, isLoading]
  )

  const handleTargetChange = useCallback((e: ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value
    if (value === '__custom__') {
      setUseCustom(true)
      setSelectedTarget('')
    } else {
      setUseCustom(false)
      setSelectedTarget(value)
    }
  }, [])

  const handleCustomTargetChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setCustomTarget(e.target.value)
  }, [])

  const handleSling = useCallback(async () => {
    const target = useCustom ? customTarget : selectedTarget
    if (!target) return
    await onSling(target)
  }, [useCustom, customTarget, selectedTarget, onSling])

  const handleRetry = useCallback(() => {
    handleSling()
  }, [handleSling])

  const handleViewResults = useCallback(() => {
    if (result?.molecule_id && onNavigateToResults) {
      onNavigateToResults(result.molecule_id)
    }
  }, [result, onNavigateToResults])

  const currentTarget = useCustom ? customTarget : selectedTarget
  const canSling = currentTarget.trim() !== '' && !isLoading

  // Handle dialog cancel event (backdrop click or escape)
  const handleDialogCancel = useCallback(
    (e: React.SyntheticEvent) => {
      e.preventDefault()
      if (!isLoading) {
        onClose()
      }
    },
    [onClose, isLoading]
  )

  // Handle keyboard events on dialog (for accessibility)
  const handleDialogKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Handle Enter on the backdrop to close (matches click behavior)
      if (e.key === 'Enter' && e.target === dialogRef.current && !isLoading) {
        onClose()
      }
    },
    [onClose, isLoading]
  )

  if (!isOpen) return null

  const dialog = (
    <dialog
      ref={dialogRef}
      style={{
        ...overlayStyle,
        border: 'none',
        background: 'transparent',
        padding: 0,
        maxWidth: '100vw',
        maxHeight: '100vh',
      }}
      aria-labelledby="sling-dialog-title"
      onCancel={handleDialogCancel}
      onClick={handleOverlayClick}
      onKeyDown={handleDialogKeyDown}
    >
      <div style={dialogStyle}>
        <header style={headerStyle}>
          <h2 id="sling-dialog-title" style={titleStyle}>
            <span>Sling Formula</span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={closeButtonStyle}
            aria-label="Close dialog"
            disabled={isLoading}
          >
            &times;
          </button>
        </header>

        <div style={contentStyle}>
          {/* Formula path display */}
          <div style={formulaPathStyle}>{formulaPath}</div>

          {/* Status indicators */}
          {isLoading && (
            // biome-ignore lint/a11y/useSemanticElements: intentional ARIA status role on container div, not form output
            <div style={loadingStyle} role="status" aria-live="polite">
              <span style={{ animation: 'spin 1s linear infinite' }} aria-hidden="true">
                &#x21BB;
              </span>
              <span>Slinging formula to {currentTarget}...</span>
            </div>
          )}

          {result && !isLoading && result.ok && (
            // biome-ignore lint/a11y/useSemanticElements: intentional ARIA status role on container div, not form output
            <div style={successStatusStyle} role="status" aria-live="polite">
              <div>Slung to {result.target}</div>
              {result.molecule_id && (
                <div style={{ fontSize: '12px', marginTop: '4px', fontFamily: 'monospace' }}>
                  Molecule: {result.molecule_id}
                </div>
              )}
              {onNavigateToResults && result.molecule_id && (
                <button type="button" onClick={handleViewResults} style={viewResultsButtonStyle}>
                  View Results
                </button>
              )}
            </div>
          )}

          {result && !isLoading && !result.ok && (
            <div style={errorStatusStyle} role="alert" aria-live="assertive">
              <div>{result.error || 'Sling failed'}</div>
              {result.stderr && (
                <pre
                  style={{
                    fontSize: '11px',
                    marginTop: '8px',
                    whiteSpace: 'pre-wrap',
                    opacity: 0.8,
                  }}
                >
                  {result.stderr}
                </pre>
              )}
              <button type="button" onClick={handleRetry} style={retryButtonStyle}>
                Retry
              </button>
            </div>
          )}

          {/* Target selection */}
          <div style={selectContainerStyle}>
            <label htmlFor="sling-target" style={labelStyle}>
              Target
            </label>
            <select
              id="sling-target"
              value={useCustom ? '__custom__' : selectedTarget}
              onChange={handleTargetChange}
              style={selectStyle}
              disabled={isLoading}
            >
              {DEFAULT_TARGETS.map((target) => (
                <option key={target.id} value={target.id}>
                  {target.name} ({target.type})
                </option>
              ))}
              <option value="__custom__">Custom target...</option>
            </select>
          </div>

          {useCustom && (
            <div style={selectContainerStyle}>
              <label htmlFor="sling-custom-target" style={labelStyle}>
                Custom Target
              </label>
              <input
                ref={customInputRef}
                id="sling-custom-target"
                type="text"
                value={customTarget}
                onChange={handleCustomTargetChange}
                placeholder="rig/polecats/name or rig/crew/name"
                style={inputStyle}
                disabled={isLoading}
              />
              <div style={hintStyle}>Format: rig/polecats/name or rig/crew/name</div>
            </div>
          )}

          {vars && Object.keys(vars).length > 0 && (
            <div style={{ marginTop: '12px' }}>
              <div style={labelStyle}>Variables</div>
              <div
                style={{
                  background: '#262626',
                  padding: '10px 12px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontFamily: 'monospace',
                }}
              >
                {Object.entries(vars).map(([key, value]) => (
                  <div key={key} style={{ color: '#a3a3a3' }}>
                    <span style={{ color: '#a5b4fc' }}>{key}</span>
                    <span style={{ color: '#666' }}> = </span>
                    <span>{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <footer style={footerStyle}>
          <button type="button" onClick={onClose} style={cancelButtonStyle} disabled={isLoading}>
            {result?.ok ? 'Close' : 'Cancel'}
          </button>
          <button
            type="button"
            onClick={handleSling}
            style={canSling ? slingButtonStyle : slingButtonDisabledStyle}
            disabled={!canSling}
          >
            {isLoading ? 'Slinging...' : result?.ok ? 'Sling Again' : 'Sling'}
          </button>
        </footer>
      </div>
    </dialog>
  )

  return createPortal(dialog, document.body)
}
