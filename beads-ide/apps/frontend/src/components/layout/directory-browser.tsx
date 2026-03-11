import { type CSSProperties, useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch } from '../../lib/api'

interface BrowseEntry {
  name: string
  path: string
  type: 'directory' | 'file'
}

interface BrowseResponse {
  ok: true
  path: string
  parent: string | null
  entries: BrowseEntry[]
}

export interface DirectoryBrowserProps {
  isOpen: boolean
  onSelect: (path: string) => void
  onCancel: () => void
  initialPath?: string
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
  maxWidth: '560px',
  maxHeight: '70vh',
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

const breadcrumbBarStyle: CSSProperties = {
  padding: '8px 20px',
  borderBottom: '1px solid #334155',
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  fontSize: '12px',
  color: '#94a3b8',
  overflow: 'hidden',
}

const breadcrumbSegmentStyle: CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#38bdf8',
  cursor: 'pointer',
  padding: '2px 4px',
  borderRadius: '3px',
  fontSize: '12px',
  whiteSpace: 'nowrap',
}

const listContainerStyle: CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  minHeight: '200px',
  maxHeight: '400px',
}

const entryStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '6px 20px',
  cursor: 'pointer',
  fontSize: '13px',
  color: '#e2e8f0',
  border: 'none',
  background: 'none',
  width: '100%',
  textAlign: 'left',
}

const footerStyle: CSSProperties = {
  padding: '12px 20px',
  borderTop: '1px solid #334155',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '12px',
}

const currentPathStyle: CSSProperties = {
  fontSize: '11px',
  color: '#94a3b8',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flex: 1,
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

const selectBtnStyle: CSSProperties = {
  ...buttonBaseStyle,
  backgroundColor: '#38bdf8',
  color: '#0f172a',
}

const loadingStyle: CSSProperties = {
  padding: '20px',
  textAlign: 'center',
  color: '#94a3b8',
  fontSize: '13px',
}

const errorStyle: CSSProperties = {
  padding: '20px',
  textAlign: 'center',
  color: '#f87171',
  fontSize: '13px',
}

const retryButtonStyle: CSSProperties = {
  background: 'none',
  border: '1px solid #f87171',
  color: '#f87171',
  cursor: 'pointer',
  padding: '4px 12px',
  borderRadius: '4px',
  fontSize: '12px',
  marginLeft: '8px',
}

function FolderIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="#e2a52e" aria-hidden="true">
      <path d="M1.5 2A1.5 1.5 0 000 3.5v9A1.5 1.5 0 001.5 14h13a1.5 1.5 0 001.5-1.5V5a1.5 1.5 0 00-1.5-1.5H7.71l-1.5-1.2A1.5 1.5 0 005.26 2H1.5z" />
    </svg>
  )
}

export function DirectoryBrowser({
  isOpen,
  onSelect,
  onCancel,
  initialPath,
}: DirectoryBrowserProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [currentPath, setCurrentPath] = useState(initialPath || '')
  const [entries, setEntries] = useState<BrowseEntry[]>([])
  const [parentPath, setParentPath] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchEntries = useCallback(async (path?: string) => {
    setIsLoading(true)
    setError(null)
    try {
      const url = path ? `/api/browse?path=${encodeURIComponent(path)}` : '/api/browse'
      const { data, error: apiError } = await apiFetch<BrowseResponse>(url)

      if (apiError) {
        setError(apiError.type === 'network' ? 'Failed to connect to server' : apiError.details || apiError.message)
        return
      }

      if (data) {
        setCurrentPath(data.path)
        setParentPath(data.parent)
        setEntries(data.entries.filter((e: BrowseEntry) => e.type === 'directory'))
      }
    } catch {
      setError('Failed to connect to server')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (isOpen) {
      if (!dialog.open) dialog.showModal()
      fetchEntries(initialPath)
    } else {
      if (dialog.open) dialog.close()
    }
  }, [isOpen, fetchEntries, initialPath])

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

  const navigateTo = useCallback(
    (path: string) => {
      fetchEntries(path)
    },
    [fetchEntries]
  )

  const breadcrumbSegments = currentPath.split('/').filter(Boolean)

  if (!isOpen) return null

  return (
    <dialog
      ref={dialogRef}
      style={{ ...overlayStyle, border: 'none', padding: 0, maxWidth: '100vw', maxHeight: '100vh' }}
      aria-labelledby="dir-browser-title"
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
          <h2 id="dir-browser-title" style={titleStyle}>
            Open Folder
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

        <div style={breadcrumbBarStyle}>
          <button type="button" style={breadcrumbSegmentStyle} onClick={() => navigateTo('/')}>
            /
          </button>
          {breadcrumbSegments.map((segment, i) => {
            const path = `/${breadcrumbSegments.slice(0, i + 1).join('/')}`
            return (
              <span key={path} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ color: '#64748b' }}>/</span>
                <button
                  type="button"
                  style={breadcrumbSegmentStyle}
                  onClick={() => navigateTo(path)}
                >
                  {segment}
                </button>
              </span>
            )
          })}
        </div>

        <div style={listContainerStyle}>
          {isLoading ? (
            <div style={loadingStyle}>Loading...</div>
          ) : error ? (
            <div style={errorStyle}>
              {error}
              <button
                type="button"
                style={retryButtonStyle}
                onClick={() => fetchEntries(currentPath || undefined)}
              >
                Retry
              </button>
            </div>
          ) : entries.length === 0 ? (
            <div style={loadingStyle}>No subdirectories</div>
          ) : (
            entries.map((entry) => (
              <button
                key={entry.path}
                type="button"
                style={entryStyle}
                onClick={() => navigateTo(entry.path)}
                onDoubleClick={() => onSelect(entry.path)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#2a2d2e'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent'
                }}
              >
                <FolderIcon />
                <span>{entry.name}</span>
              </button>
            ))
          )}
        </div>

        <div style={footerStyle}>
          <span style={currentPathStyle} title={currentPath}>
            {currentPath}
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" style={cancelBtnStyle} onClick={onCancel}>
              Cancel
            </button>
            <button
              type="button"
              style={selectBtnStyle}
              onClick={() => onSelect(currentPath)}
              disabled={!currentPath}
            >
              Select This Folder
            </button>
          </div>
        </div>
      </div>
    </dialog>
  )
}
