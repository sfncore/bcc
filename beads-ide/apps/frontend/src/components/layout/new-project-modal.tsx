import { type CSSProperties, useCallback, useEffect, useRef, useState } from 'react'
import { type ApiError, apiPost } from '../../lib'

export interface NewProjectModalProps {
  isOpen: boolean
  selectedPath: string
  onComplete: () => void
  onCancel: () => void
}

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.7)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
}

const dialogBoxStyle: CSSProperties = {
  backgroundColor: '#1e293b',
  borderRadius: '8px',
  border: '1px solid #334155',
  width: '100%',
  maxWidth: '440px',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
}

const headerStyle: CSSProperties = {
  padding: '16px 20px',
  borderBottom: '1px solid #334155',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
}

const titleStyle: CSSProperties = {
  fontSize: '16px',
  fontWeight: 600,
  color: '#e2e8f0',
  margin: 0,
}

const closeButtonStyle: CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#94a3b8',
  cursor: 'pointer',
  padding: '4px',
  fontSize: '18px',
  lineHeight: 1,
}

const contentStyle: CSSProperties = {
  padding: '20px',
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
}

const labelStyle: CSSProperties = {
  fontSize: '12px',
  color: '#94a3b8',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
}

const pathDisplayStyle: CSSProperties = {
  fontSize: '13px',
  color: '#e2e8f0',
  backgroundColor: '#0f172a',
  padding: '8px 12px',
  borderRadius: '4px',
  border: '1px solid #334155',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const templateCardStyle: CSSProperties = {
  padding: '12px 16px',
  borderRadius: '6px',
  border: '2px solid #38bdf8',
  backgroundColor: '#0f172a',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
}

const templateNameStyle: CSSProperties = {
  fontSize: '14px',
  color: '#e2e8f0',
  fontWeight: 500,
}

const templateDescStyle: CSSProperties = {
  fontSize: '12px',
  color: '#94a3b8',
  marginTop: '2px',
}

const errorMsgStyle: CSSProperties = {
  fontSize: '13px',
  color: '#f87171',
  padding: '8px 12px',
  backgroundColor: 'rgba(248, 113, 113, 0.1)',
  borderRadius: '4px',
}

const footerStyle: CSSProperties = {
  padding: '16px 20px',
  borderTop: '1px solid #334155',
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
}

const cancelBtnStyle: CSSProperties = {
  ...buttonBaseStyle,
  backgroundColor: '#374151',
  color: '#e5e7eb',
}

const createBtnStyle: CSSProperties = {
  ...buttonBaseStyle,
  backgroundColor: '#38bdf8',
  color: '#0f172a',
}

/** Map backend error codes to user-friendly messages, falling back to raw details. */
function parseApiError(error: ApiError): string {
  // Try to parse structured error from details (backend returns JSON in error.details for 4xx)
  if (error.details) {
    try {
      const parsed = JSON.parse(error.details)
      if (parsed && typeof parsed.error === 'string') {
        return parsed.error
      }
    } catch {
      // details is not JSON, use as-is if it looks like a message
      if (error.details.length < 200 && !error.details.startsWith('{')) {
        return error.details
      }
    }
  }
  return error.message
}

export function NewProjectModal({
  isOpen,
  selectedPath,
  onComplete,
  onCancel,
}: NewProjectModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (isOpen) {
      if (!dialog.open) dialog.showModal()
      setErrorMsg(null)
    } else {
      if (dialog.open) dialog.close()
    }
  }, [isOpen])

  const handleCreate = useCallback(async () => {
    setErrorMsg(null)

    // Client-side path validation
    if (!selectedPath || !selectedPath.trim()) {
      setErrorMsg('No folder selected. Please select a folder first.')
      return
    }
    if (!selectedPath.startsWith('/')) {
      setErrorMsg('Path must be an absolute path (starting with /).')
      return
    }

    setIsCreating(true)
    try {
      const { data, error } = await apiPost<
        { ok: true; root: string; created: string[] },
        { path: string; template: string }
      >('/api/workspace/init', { path: selectedPath, template: 'blank' })
      if (error) {
        setErrorMsg(parseApiError(error))
        return
      }
      if (data) {
        onComplete()
      }
    } finally {
      setIsCreating(false)
    }
  }, [selectedPath, onComplete])

  const handleDialogCancel = useCallback(
    (e: React.SyntheticEvent) => {
      e.preventDefault()
      onCancel()
    },
    [onCancel]
  )

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onCancel()
    },
    [onCancel]
  )

  if (!isOpen) return null

  return (
    <dialog
      ref={dialogRef}
      style={{ ...overlayStyle, border: 'none', padding: 0, maxWidth: '100vw', maxHeight: '100vh' }}
      aria-labelledby="new-project-title"
      onCancel={handleDialogCancel}
      onClick={handleOverlayClick}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel()
      }}
    >
      <div
        style={dialogBoxStyle}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div style={headerStyle}>
          <h2 id="new-project-title" style={titleStyle}>
            New Project
          </h2>
          <button
            type="button"
            style={closeButtonStyle}
            onClick={onCancel}
            aria-label="Close dialog"
          >
            &times;
          </button>
        </div>

        <div style={contentStyle}>
          <div>
            <div style={labelStyle}>Folder</div>
            <div style={{ ...pathDisplayStyle, marginTop: '6px' }} title={selectedPath}>
              {selectedPath}
            </div>
          </div>

          <div>
            <div style={labelStyle}>Choose a template</div>
            <div style={{ marginTop: '8px' }}>
              <div style={templateCardStyle}>
                <svg width="20" height="20" viewBox="0 0 16 16" fill="#38bdf8" aria-hidden="true">
                  <path d="M3 1.5A1.5 1.5 0 014.5 0h4.379a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0113.5 4.622V14.5a1.5 1.5 0 01-1.5 1.5H4.5A1.5 1.5 0 013 14.5v-13z" />
                </svg>
                <div>
                  <div style={templateNameStyle}>Blank formula</div>
                  <div style={templateDescStyle}>Empty formula with one step</div>
                </div>
              </div>
            </div>
          </div>

          {errorMsg && <div style={errorMsgStyle}>{errorMsg}</div>}
        </div>

        <div style={footerStyle}>
          <button type="button" style={cancelBtnStyle} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            style={{ ...createBtnStyle, opacity: isCreating ? 0.6 : 1 }}
            onClick={handleCreate}
            disabled={isCreating}
          >
            {isCreating ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </dialog>
  )
}
