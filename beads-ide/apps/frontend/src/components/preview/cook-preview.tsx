import type { CookResult, FormulaVariable, PourResult } from '@beads-ide/shared'
/**
 * Cook preview panel with split view.
 * Shows formula editor on left, proto bead results on right.
 * Re-cooks automatically when formula content changes.
 * Includes Pour button when proto beads are ready.
 */
import { useCallback, useState } from 'react'
import { useConnectionState } from '../../hooks/use-connection-state'
import { useCook } from '../../hooks/use-cook'
import { PourDialog } from '../formulas/pour-dialog'
import { ProtoBeadList } from './proto-bead-list'

/** Props for unbound variables display */
interface UnboundVarsProps {
  vars: string[]
}

/**
 * Displays unbound variables with warning styling.
 */
function UnboundVars({ vars }: UnboundVarsProps) {
  return (
    <div
      style={{
        backgroundColor: '#7f1d1d',
        border: '1px solid #dc2626',
        borderRadius: '6px',
        padding: '12px',
        marginBottom: '12px',
      }}
    >
      <div
        style={{
          fontSize: '13px',
          fontWeight: 600,
          color: '#fca5a5',
          marginBottom: '8px',
        }}
      >
        Blocks pour
      </div>
      <div style={{ fontSize: '12px', color: '#fecaca' }}>Required variables not provided:</div>
      <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        {vars.map((v) => (
          <span
            key={v}
            style={{
              fontFamily: 'monospace',
              fontSize: '12px',
              backgroundColor: '#dc2626',
              color: '#fff',
              padding: '2px 8px',
              borderRadius: '4px',
            }}
          >
            {v}
          </span>
        ))}
      </div>
    </div>
  )
}

/** Props for cook error display */
interface CookErrorProps {
  error: string
  stderr?: string
}

/**
 * Displays cook errors with stderr content.
 */
function CookError({ error, stderr }: CookErrorProps) {
  return (
    <div
      style={{
        backgroundColor: '#1e1e1e',
        border: '1px solid #dc2626',
        borderRadius: '6px',
        padding: '12px',
      }}
    >
      <div
        style={{
          fontSize: '13px',
          fontWeight: 600,
          color: '#f87171',
          marginBottom: '8px',
        }}
      >
        Cook Error
      </div>
      <div
        style={{
          fontFamily: 'monospace',
          fontSize: '12px',
          color: '#fca5a5',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {stderr || error}
      </div>
    </div>
  )
}

/** Props for loading spinner */
interface LoadingSpinnerProps {
  text?: string
}

/**
 * Loading spinner shown during cook.
 * Uses role="status" and aria-live for screen reader accessibility (WCAG 2.1 AA).
 */
function LoadingSpinner({ text = 'Cooking...' }: LoadingSpinnerProps) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: intentional ARIA status role for loading indicator
    <div
      role="status"
      aria-live="polite"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        color: '#9ca3af',
        fontSize: '14px',
        gap: '8px',
      }}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        role="img"
        aria-label="Loading"
        style={{
          animation: 'spin 1s linear infinite',
        }}
      >
        <title>Loading</title>
        <circle
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="31.416"
          strokeDashoffset="10"
        />
      </svg>
      <span>{text}</span>
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

/** Props for formula variables panel */
interface VariablesPanelProps {
  vars: Record<string, FormulaVariable>
}

/**
 * Displays formula variable definitions.
 */
function VariablesPanel({ vars }: VariablesPanelProps) {
  const entries = Object.entries(vars)
  if (entries.length === 0) return null

  return (
    <div
      style={{
        marginBottom: '16px',
        padding: '12px',
        backgroundColor: '#1e293b',
        borderRadius: '6px',
        border: '1px solid #334155',
      }}
    >
      <div
        style={{
          fontSize: '12px',
          fontWeight: 600,
          color: '#94a3b8',
          marginBottom: '8px',
        }}
      >
        Variables
      </div>
      {entries.map(([key, def]) => (
        <div
          key={key}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
            marginBottom: '6px',
            fontSize: '12px',
          }}
        >
          <span
            style={{
              fontFamily: 'monospace',
              color: def.required ? '#fca5a5' : '#a5b4fc',
              minWidth: '100px',
            }}
          >
            {key}
            {def.required && <span style={{ color: '#f87171' }}>*</span>}
          </span>
          <span style={{ color: '#9ca3af', flex: 1 }}>{def.description}</span>
          {def.default !== undefined && (
            <span
              style={{
                fontFamily: 'monospace',
                color: '#6b7280',
                fontSize: '11px',
              }}
            >
              = {def.default}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

/** Props for preview results panel */
interface PreviewResultsProps {
  result: CookResult | null
  isLoading: boolean
  error: Error | null
  onPourClick?: () => void
  canPour?: boolean
}

/** Pour button styling */
const pourButtonStyle = {
  backgroundColor: '#4f46e5',
  color: '#fff',
  border: 'none',
  padding: '10px 20px',
  borderRadius: '6px',
  fontSize: '14px',
  fontWeight: 600 as const,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  marginBottom: '16px',
  transition: 'background-color 0.15s',
}

const pourButtonDisabledStyle = {
  ...pourButtonStyle,
  backgroundColor: '#374151',
  cursor: 'not-allowed',
  opacity: 0.6,
}

/**
 * Right panel showing cook results.
 */
function PreviewResults({ result, isLoading, error, onPourClick, canPour }: PreviewResultsProps) {
  if (isLoading) {
    return <LoadingSpinner />
  }

  if (error) {
    return <CookError error={error.message} />
  }

  if (!result) {
    return (
      <div
        style={{
          padding: '24px',
          textAlign: 'center',
          color: '#6b7280',
          fontSize: '14px',
        }}
      >
        Select a formula to preview
      </div>
    )
  }

  if (!result.ok) {
    return (
      <>
        {result.unbound_vars && result.unbound_vars.length > 0 && (
          <UnboundVars vars={result.unbound_vars} />
        )}
        <CookError error={result.error ?? 'Cook failed'} stderr={result.stderr} />
      </>
    )
  }

  const stepCount = result.steps?.length ?? 0
  const showPourButton = stepCount > 0

  return (
    <>
      {showPourButton && (
        <button
          type="button"
          style={canPour ? pourButtonStyle : pourButtonDisabledStyle}
          onClick={canPour ? onPourClick : undefined}
          disabled={!canPour}
          aria-label={`Pour ${stepCount} beads`}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 2v10" />
            <path d="M18.5 8c.83.9 1.5 2.02 1.5 3.5 0 2.48-2.02 4.5-4.5 4.5H8.5C6.02 16 4 13.98 4 11.5c0-1.48.67-2.6 1.5-3.5" />
            <path d="M8 22h8" />
            <path d="M12 16v6" />
          </svg>
          Pour {stepCount} Bead{stepCount !== 1 ? 's' : ''}
        </button>
      )}
      {result.vars && <VariablesPanel vars={result.vars} />}
      <ProtoBeadList beads={result.steps ?? []} />
    </>
  )
}

/** Props for formula editor panel */
interface FormulaEditorProps {
  content: string
  onChange: (content: string) => void
  formulaPath: string
}

/**
 * Left panel with formula editor.
 * This is a placeholder - in a full implementation, this would be
 * replaced with a proper code editor (Monaco, CodeMirror, etc.)
 */
function FormulaEditor({ content, onChange, formulaPath }: FormulaEditorProps) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          fontSize: '12px',
          color: '#6b7280',
          padding: '8px 12px',
          borderBottom: '1px solid #374151',
          fontFamily: 'monospace',
        }}
      >
        {formulaPath || 'No formula selected'}
      </div>
      <textarea
        value={content}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Formula content..."
        style={{
          flex: 1,
          width: '100%',
          padding: '12px',
          backgroundColor: '#111827',
          color: '#e5e7eb',
          border: 'none',
          resize: 'none',
          fontFamily: 'monospace',
          fontSize: '13px',
          lineHeight: 1.5,
        }}
      />
    </div>
  )
}

/** Props for the cook preview component */
export interface CookPreviewProps {
  /** Path to the formula file */
  formulaPath: string
  /** Initial formula content */
  initialContent?: string
  /** Variable substitutions for runtime mode */
  vars?: Record<string, string>
  /** Callback when formula content changes */
  onContentChange?: (content: string) => void
  /** Callback after successful pour */
  onPourSuccess?: (result: PourResult) => void
}

/**
 * Extract the proto ID from a formula path.
 * Removes directory and extension to get the formula name.
 */
function extractProtoId(formulaPath: string): string {
  return formulaPath.replace(/\.formula\.(toml|json)$/, '').replace(/^.*\//, '')
}

/**
 * Split-view cook preview panel.
 * Shows formula editor on left, proto bead results on right.
 * Re-cooks automatically when the formula is saved via debounced auto-save.
 * Includes Pour button when proto beads are ready.
 */
export function CookPreview({
  formulaPath,
  initialContent = '',
  vars,
  onContentChange,
  onPourSuccess,
}: CookPreviewProps) {
  const [content, setContent] = useState(initialContent)
  const [isPourDialogOpen, setIsPourDialogOpen] = useState(false)

  // Use the cook hook with 500ms debounce
  const { result, isLoading, error } = useCook(formulaPath, {
    debounceMs: 500,
    mode: 'compile',
    vars,
  })

  const handleContentChange = useCallback(
    (newContent: string) => {
      setContent(newContent)
      onContentChange?.(newContent)
    },
    [onContentChange]
  )

  const handlePourClick = useCallback(() => {
    setIsPourDialogOpen(true)
  }, [])

  const handlePourDialogClose = useCallback(() => {
    setIsPourDialogOpen(false)
  }, [])

  const handlePourSuccess = useCallback(
    (pourResult: PourResult) => {
      onPourSuccess?.(pourResult)
    },
    [onPourSuccess]
  )

  const { isDisconnected } = useConnectionState()

  // Determine if pour is available (cook succeeded with steps, no unbound vars, backend connected)
  const canPour =
    !isDisconnected &&
    result?.ok === true &&
    (result.steps?.length ?? 0) > 0 &&
    (!result.unbound_vars || result.unbound_vars.length === 0)

  const protoId = extractProtoId(formulaPath)

  return (
    <>
      <div
        style={{
          display: 'flex',
          height: '100%',
          minHeight: '400px',
          backgroundColor: '#0f172a',
          border: '1px solid #1e293b',
          borderRadius: '8px',
          overflow: 'hidden',
        }}
      >
        {/* Left panel: Formula editor */}
        <div
          style={{
            flex: 1,
            borderRight: '1px solid #1e293b',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <FormulaEditor
            content={content}
            onChange={handleContentChange}
            formulaPath={formulaPath}
          />
        </div>

        {/* Right panel: Preview results */}
        <div
          style={{
            flex: 1,
            padding: '16px',
            overflowY: 'auto',
            backgroundColor: '#111827',
          }}
        >
          <PreviewResults
            result={result}
            isLoading={isLoading}
            error={error}
            onPourClick={handlePourClick}
            canPour={canPour}
          />
        </div>
      </div>

      {/* Pour confirmation dialog */}
      {result?.ok && (
        <PourDialog
          isOpen={isPourDialogOpen}
          onClose={handlePourDialogClose}
          protoId={protoId}
          cookResult={result}
          vars={vars}
          onPourSuccess={handlePourSuccess}
        />
      )}
    </>
  )
}
