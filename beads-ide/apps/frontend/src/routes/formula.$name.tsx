import type { PourResult, ProtoBead, SlingRequest } from '@beads-ide/shared'
/**
 * Formula editor route with text/visual view toggle and sling workflow.
 * Displays formula TOML in text mode or as a DAG in visual mode.
 * Visual view updates automatically when TOML changes (one-way sync).
 * Includes Cook preview, Sling dispatch, and Pour (local execution) functionality.
 * Step nodes in Visual view can be clicked to edit in the StepEditorPanel.
 */
import { createFileRoute } from '@tanstack/react-router'
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  FormulaFlowView,
  FormulaOutlineView,
  PourDialog,
  SlingDialog,
  StepEditorPanel,
  TextEditor,
  VarsPanel,
  VisualBuilder,
} from '../components/formulas'
import { OpenCodeTerminal } from '../components/opencode'
import { UnsavedChangesModal } from '../components/ui/unsaved-changes-modal'
import { useAnnounce, useFormulaDirty, useFormulaSave } from '../contexts'
import { useConnectionState, useCook, useFormulaContent, useSave, useSling } from '../hooks'
import { useHotkey } from '../hooks/use-hotkeys'
import {
  type FormulaParseError,
  extractStepIds,
  parseAndValidateFormula,
  updateStepField,
  updateVarDefault,
} from '../lib'

// --- Types ---

type ViewMode = 'text' | 'outline' | 'flow' | 'visual'

// --- Styles ---

const containerStyle: CSSProperties = {
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
}

const titleContainerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
}

const titleStyle: CSSProperties = {
  fontSize: '16px',
  fontWeight: 600,
  color: '#e2e8f0',
  fontFamily: 'monospace',
}

const dirtyBadgeStyle: CSSProperties = {
  fontSize: '11px',
  fontWeight: 500,
  color: '#fbbf24',
  backgroundColor: 'rgba(251, 191, 36, 0.15)',
  padding: '2px 6px',
  borderRadius: '4px',
}

const actionsStyle: CSSProperties = {
  display: 'flex',
  gap: '8px',
  alignItems: 'center',
}

const toggleContainerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  backgroundColor: '#0f172a',
  borderRadius: '6px',
  padding: '4px',
}

const toggleButtonStyle = (isActive: boolean): CSSProperties => ({
  padding: '6px 12px',
  fontSize: '12px',
  fontWeight: 500,
  color: isActive ? '#ffffff' : '#94a3b8',
  backgroundColor: isActive ? '#3b82f6' : 'transparent',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  transition: 'all 0.15s ease',
})

const buttonBaseStyle: CSSProperties = {
  padding: '6px 12px',
  borderRadius: '6px',
  fontSize: '12px',
  fontWeight: 500,
  cursor: 'pointer',
  border: 'none',
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  transition: 'background 0.15s ease',
}

const cookButtonStyle: CSSProperties = {
  ...buttonBaseStyle,
  background: '#374151',
  color: '#e5e7eb',
}

const slingButtonStyle: CSSProperties = {
  ...buttonBaseStyle,
  background: '#3b82f6',
  color: '#fff',
}

const pourButtonStyle: CSSProperties = {
  ...buttonBaseStyle,
  background: '#4f46e5',
  color: '#fff',
}

const aiButtonStyle = (isActive: boolean): CSSProperties => ({
  ...buttonBaseStyle,
  background: isActive ? '#8b5cf6' : '#6b21a8',
  color: '#fff',
})

const contentStyle: CSSProperties = {
  display: 'flex',
  flex: 1,
  minHeight: 0, // Critical for nested flex to work
  overflow: 'hidden',
}

const mainPanelStyle: CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
}

const sidePanelStyle: CSSProperties = {
  width: '420px',
  minWidth: '380px',
  borderLeft: '1px solid #334155',
  backgroundColor: '#0f172a',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  alignSelf: 'stretch', // Fill parent height in flex
}

const visualContainerStyle: CSSProperties = {
  flex: 1,
  position: 'relative',
}

const loadingStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  color: '#94a3b8',
  fontSize: '14px',
}

const errorStyle: CSSProperties = {
  padding: '16px',
  backgroundColor: '#7f1d1d',
  color: '#fca5a5',
  borderRadius: '6px',
  margin: '16px',
  fontFamily: 'monospace',
  fontSize: '12px',
}

const statusBarStyle: CSSProperties = {
  padding: '8px 16px',
  borderTop: '1px solid #334155',
  backgroundColor: '#1e293b',
  fontSize: '11px',
  color: '#94a3b8',
  display: 'flex',
  justifyContent: 'space-between',
}

// --- Route Definition ---

export const Route = createFileRoute('/formula/$name')({
  component: FormulaPage,
})

// --- Main Component ---

function FormulaPage() {
  const { name } = Route.useParams()
  const announce = useAnnounce()
  const { setDirty } = useFormulaDirty()
  const { registerSaveHandler } = useFormulaSave()
  const [viewMode, setViewMode] = useState<ViewMode>('text')
  const [tomlContent, setTomlContent] = useState('')
  const [savedContent, setSavedContent] = useState('')
  const [parseErrors, setParseErrors] = useState<FormulaParseError[]>([])
  const [varValues, setVarValues] = useState<Record<string, string>>({})
  const [slingDialogOpen, setSlingDialogOpen] = useState(false)
  const [pourDialogOpen, setPourDialogOpen] = useState(false)
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null)
  const [showAiPanel, setShowAiPanel] = useState(false)
  // Track pending execution action when there are unsaved changes
  const [pendingAction, setPendingAction] = useState<'pour' | 'sling' | null>(null)

  // Track when unsaved changes are first detected
  const hasAnnouncedUnsavedRef = useRef(false)

  // Ref for the step editor side panel to scroll into view on selection
  const stepEditorPanelRef = useRef<HTMLDivElement>(null)

  // Compute isDirty from current content vs saved content
  const isDirty = tomlContent !== savedContent

  // Set document title to formula name
  useEffect(() => {
    document.title = `${name} - Beads IDE`
  }, [name])

  // Sync dirty state to context for sidebar indicator
  useEffect(() => {
    if (name) {
      setDirty(name, isDirty)
    }
  }, [name, isDirty, setDirty])

  // Warn user before leaving page with unsaved changes
  useEffect(() => {
    if (!isDirty) return

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      // Modern browsers ignore custom messages but still show a confirmation dialog
      e.returnValue = 'You have unsaved changes. Are you sure you want to leave?'
      return e.returnValue
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isDirty])

  // Load formula content from disk
  const {
    content: loadedContent,
    path: formulaPath,
    isLoading: contentLoading,
    error: contentError,
  } = useFormulaContent(name ?? null)

  // Reset state when formula name changes (runs on mount only, loadedContent effect handles navigation)
  useEffect(() => {
    setTomlContent('')
    setParseErrors([])
    setVarValues({})
    setSelectedStepId(null)
  }, [])

  // Set content when loaded from disk
  useEffect(() => {
    if (loadedContent) {
      setTomlContent(loadedContent)
      setSavedContent(loadedContent)
      hasAnnouncedUnsavedRef.current = false
      // Parse initial content
      const result = parseAndValidateFormula(loadedContent)
      if (!result.ok) {
        setParseErrors(result.errors)
      } else {
        setParseErrors([])
      }
    }
  }, [loadedContent])

  // Cook the formula to get steps and vars
  // In compile mode, don't pass vars - we want to see placeholders, not substituted values.
  // Passing partial vars causes the cook to fail if required vars are missing.
  const { result, isLoading, error, cook } = useCook(formulaPath, {
    mode: 'compile',
    debounceMs: 300,
  })

  // Connection state - disable Pour/Sling when backend disconnected
  const { isDisconnected } = useConnectionState()

  // Sling hook
  const { result: slingResult, isLoading: isSlinging, sling, reset: resetSling } = useSling()

  // Save hook
  const { save, isLoading: isSaving } = useSave()

  // Handle save with Mod+S hotkey
  const handleSave = useCallback(async () => {
    if (!name || !tomlContent || isSaving) return
    try {
      await save(name, tomlContent)
      setSavedContent(tomlContent)
      hasAnnouncedUnsavedRef.current = false
      toast.success('Formula saved')
      announce('Formula saved')
    } catch {
      // Error toast is already shown by useSave hook
    }
  }, [name, tomlContent, isSaving, save, announce])

  // Mod+S to save (enable on form tags so it works in the text editor)
  useHotkey('Mod+S', handleSave, { enableOnFormTags: true })

  // Register save handler with context so sidebar can trigger save
  useEffect(() => {
    registerSaveHandler(handleSave)
    return () => registerSaveHandler(null)
  }, [registerSaveHandler, handleSave])

  const handleToggleMode = useCallback((mode: ViewMode) => {
    setViewMode(mode)
    // Clear step selection when switching to text mode
    if (mode === 'text') {
      setSelectedStepId(null)
    }
  }, [])

  // Handle step selection in visual mode
  const handleStepSelect = useCallback(
    (stepId: string | null) => {
      setSelectedStepId(stepId)
      if (stepId) {
        announce('Step selected')
      }
    },
    [announce]
  )

  // Handle step field changes from the StepEditorPanel
  // NOTE: Editing only works for steps defined directly in the source TOML.
  // Expanded steps (from expansion formulas) cannot be edited here - they
  // would require modifying the expansion formula file.
  const handleStepFieldChange = useCallback(
    (stepId: string, field: string, value: string | number | string[]) => {
      setTomlContent((prev) => {
        const updated = updateStepField(prev, stepId, field, value)
        // Re-parse to update errors and trigger re-cook
        const parseResult = parseAndValidateFormula(updated)
        if (!parseResult.ok) {
          setParseErrors(parseResult.errors)
        } else {
          setParseErrors([])
        }
        return updated
      })
    },
    []
  )

  // Get the currently selected step from cook result
  const selectedStep = useMemo((): ProtoBead | null => {
    if (!selectedStepId || !result?.steps) return null
    return result.steps.find((s) => s.id === selectedStepId) ?? null
  }, [selectedStepId, result?.steps])

  // Get all step IDs for dependency selection
  const availableStepIds = useMemo((): string[] => {
    return extractStepIds(tomlContent)
  }, [tomlContent])

  // Determine if side panel should show (for visual/flow modes with selected step)
  // Outline mode uses inline editing, so no side panel needed
  const showSidePanel = (viewMode === 'visual' || viewMode === 'flow') && selectedStep

  // Scroll step editor panel into view when it appears after step selection
  useEffect(() => {
    if (showSidePanel && stepEditorPanelRef.current) {
      stepEditorPanelRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [showSidePanel])

  const handleVarChange = useCallback((key: string, value: string) => {
    setVarValues((prev) => ({ ...prev, [key]: value }))
    // Update the TOML source with the new default value
    setTomlContent((prev) => {
      const updated = updateVarDefault(prev, key, value)
      // Re-parse to update errors
      const result = parseAndValidateFormula(updated)
      if (!result.ok) {
        setParseErrors(result.errors)
      } else {
        setParseErrors([])
      }
      return updated
    })
  }, [])

  const handleTomlChange = useCallback(
    (content: string) => {
      setTomlContent(content)
      // Announce unsaved changes on first divergence
      if (content !== savedContent && !hasAnnouncedUnsavedRef.current) {
        hasAnnouncedUnsavedRef.current = true
        announce('Unsaved changes')
      }
      // Parse and validate on change
      const result = parseAndValidateFormula(content)
      if (!result.ok) {
        setParseErrors(result.errors)
      } else {
        setParseErrors([])
      }
    },
    [announce, savedContent]
  )

  const handleCook = useCallback(() => {
    cook()
  }, [cook])

  const handleOpenSling = useCallback(() => {
    if (isDirty) {
      setPendingAction('sling')
    } else {
      resetSling()
      setSlingDialogOpen(true)
    }
  }, [isDirty, resetSling])

  const handleSlingClose = useCallback(() => {
    setSlingDialogOpen(false)
  }, [])

  const handleOpenPour = useCallback(() => {
    if (isDirty) {
      setPendingAction('pour')
    } else {
      setPourDialogOpen(true)
    }
  }, [isDirty])

  // Handle save and execute from unsaved changes modal
  const handleSaveAndExecute = useCallback(async () => {
    const action = pendingAction
    setPendingAction(null)
    if (!name || !tomlContent) return

    try {
      await save(name, tomlContent)
      setSavedContent(tomlContent)
      hasAnnouncedUnsavedRef.current = false
      toast.success('Formula saved')
      announce('Formula saved')

      // Now proceed with the action
      if (action === 'pour') {
        setPourDialogOpen(true)
      } else if (action === 'sling') {
        resetSling()
        setSlingDialogOpen(true)
      }
    } catch {
      // Error toast is already shown by useSave hook
    }
  }, [pendingAction, name, tomlContent, save, announce, resetSling])

  // Handle execute without saving from unsaved changes modal
  const handleExecuteWithoutSaving = useCallback(() => {
    const action = pendingAction
    setPendingAction(null)

    if (action === 'pour') {
      setPourDialogOpen(true)
    } else if (action === 'sling') {
      resetSling()
      setSlingDialogOpen(true)
    }
  }, [pendingAction, resetSling])

  // Handle cancel from unsaved changes modal
  const handleCancelExecute = useCallback(() => {
    setPendingAction(null)
  }, [])

  const handleToggleAi = useCallback(() => {
    setShowAiPanel((prev) => !prev)
  }, [])

  const handlePourClose = useCallback(() => {
    setPourDialogOpen(false)
  }, [])

  const handlePourSuccess = useCallback((pourResult: PourResult) => {
    console.log('Pour successful:', pourResult)
    // Navigation to results could be added here
    // For now, the dialog handles showing success state
  }, [])

  const handleSlingExecute = useCallback(
    async (target: string) => {
      const request: SlingRequest = {
        formula_path: formulaPath ?? '',
        target,
        vars: Object.keys(varValues).length > 0 ? varValues : undefined,
      }
      return sling(request)
    },
    [formulaPath, varValues, sling]
  )

  const handleNavigateToResults = useCallback((moleculeId: string) => {
    console.log('Navigate to molecule:', moleculeId)
    setSlingDialogOpen(false)
    // TODO: Navigate to molecule view
  }, [])

  return (
    <div style={containerStyle}>
      {/* Header with title, view toggle, and action buttons */}
      <div style={headerStyle}>
        <div style={titleContainerStyle}>
          <div style={titleStyle}>{name}.toml</div>
          {isDirty && <span style={dirtyBadgeStyle}>Unsaved</span>}
        </div>
        <div style={actionsStyle}>
          <button
            type="button"
            onClick={handleCook}
            style={cookButtonStyle}
            disabled={isLoading}
            title="Preview cooked output (Cmd+Shift+C)"
          >
            {isLoading ? 'Cooking...' : 'Cook Preview'}
          </button>
          {result?.steps && result.steps.length > 0 && (
            <button
              type="button"
              onClick={handleOpenPour}
              style={isDisconnected ? { ...pourButtonStyle, opacity: 0.5, cursor: 'not-allowed' } : pourButtonStyle}
              disabled={isDisconnected}
              title={isDisconnected ? 'Backend connection required for this action' : 'Create beads locally'}
            >
              Pour ({result.steps.length})
            </button>
          )}
          <button
            type="button"
            onClick={handleOpenSling}
            style={isDisconnected ? { ...slingButtonStyle, opacity: 0.5, cursor: 'not-allowed' } : slingButtonStyle}
            disabled={isDisconnected}
            title={isDisconnected ? 'Backend connection required for this action' : 'Dispatch to agent (Cmd+Shift+S)'}
          >
            Sling
          </button>
          <button
            type="button"
            onClick={handleToggleAi}
            style={aiButtonStyle(showAiPanel)}
            title="AI Assistant"
          >
            AI
          </button>
          <div style={toggleContainerStyle}>
            <button
              type="button"
              style={toggleButtonStyle(viewMode === 'text')}
              onClick={() => handleToggleMode('text')}
              aria-pressed={viewMode === 'text'}
              title="Edit TOML source"
            >
              Text
            </button>
            <button
              type="button"
              style={toggleButtonStyle(viewMode === 'outline')}
              onClick={() => handleToggleMode('outline')}
              aria-pressed={viewMode === 'outline'}
              title="Step list with inline editing"
            >
              Outline
            </button>
            <button
              type="button"
              style={toggleButtonStyle(viewMode === 'flow')}
              onClick={() => handleToggleMode('flow')}
              aria-pressed={viewMode === 'flow'}
              title="Flow diagram view"
            >
              Flow
            </button>
            <button
              type="button"
              style={toggleButtonStyle(viewMode === 'visual')}
              onClick={() => handleToggleMode('visual')}
              aria-pressed={viewMode === 'visual'}
              title="DAG visualization"
            >
              Visual
            </button>
          </div>
        </div>
      </div>

      {/* Main content area */}
      <div style={contentStyle}>
        <div style={mainPanelStyle}>
          {(isLoading || contentLoading) && (
            <div style={loadingStyle}>
              {contentLoading ? 'Loading formula...' : 'Cooking formula...'}
            </div>
          )}

          {(error || contentError) && (
            <div style={errorStyle}>Error: {(error || contentError)?.message}</div>
          )}

          {!isLoading && !contentLoading && !error && !contentError && viewMode === 'text' && (
            <TextEditor value={tomlContent} onChange={handleTomlChange} errors={parseErrors} />
          )}

          {!isLoading &&
            !contentLoading &&
            !error &&
            !contentError &&
            viewMode === 'outline' &&
            (result ? (
              <FormulaOutlineView
                result={result}
                varValues={varValues}
                onVarChange={handleVarChange}
                selectedStepId={selectedStepId}
                onStepSelect={handleStepSelect}
                availableStepIds={availableStepIds}
                onStepFieldChange={handleStepFieldChange}
              />
            ) : (
              <div style={loadingStyle}>No formula data to display</div>
            ))}

          {!isLoading &&
            !contentLoading &&
            !error &&
            !contentError &&
            viewMode === 'flow' &&
            (result ? (
              <FormulaFlowView
                result={result}
                selectedStepId={selectedStepId}
                onStepSelect={handleStepSelect}
              />
            ) : (
              <div style={loadingStyle}>No formula data to display</div>
            ))}

          {!isLoading && !contentLoading && !error && !contentError && viewMode === 'visual' && (
            <div style={visualContainerStyle}>
              {result?.steps ? (
                <VisualBuilder
                  steps={result.steps}
                  vars={result.vars}
                  onStepSelect={handleStepSelect}
                  selectedStepId={selectedStepId}
                />
              ) : (
                <div style={loadingStyle}>No steps to visualize</div>
              )}
            </div>
          )}
        </div>

        {/* Side panel - shows StepEditorPanel when step selected (visual/outline mode), otherwise VarsPanel */}
        {showSidePanel && (
          <div ref={stepEditorPanelRef} style={sidePanelStyle}>
            <StepEditorPanel
              step={selectedStep}
              availableStepIds={availableStepIds}
              onFieldChange={handleStepFieldChange}
              onClose={() => setSelectedStepId(null)}
            />
          </div>
        )}
        {!showSidePanel &&
          !showAiPanel &&
          viewMode === 'text' &&
          result?.vars &&
          Object.keys(result.vars).length > 0 && (
            <div style={sidePanelStyle}>
              <VarsPanel
                vars={result.vars}
                values={varValues}
                onValueChange={handleVarChange}
                unboundVars={result.unbound_vars}
              />
            </div>
          )}
        {showAiPanel && (
          <div style={{ ...sidePanelStyle, width: '700px', minWidth: '600px' }}>
            <OpenCodeTerminal onClose={() => setShowAiPanel(false)} />
          </div>
        )}
      </div>

      {/* Status bar */}
      <div style={statusBarStyle}>
        <span>
          {result?.formula ? `Formula: ${result.formula}` : 'No formula loaded'}
          {result?.version && ` v${result.version}`}
        </span>
        <span>
          {result?.steps?.length ?? 0} steps
          {result?.vars && ` · ${Object.keys(result.vars).length} variables`}
        </span>
      </div>

      {/* Unsaved changes modal for Pour/Sling */}
      <UnsavedChangesModal
        isOpen={pendingAction !== null}
        onSave={handleSaveAndExecute}
        onDiscard={handleExecuteWithoutSaving}
        onCancel={handleCancelExecute}
        title="Unsaved Changes"
        message="You have unsaved changes. Do you want to save them before executing?"
        saveLabel="Save and Execute"
        discardLabel="Execute Without Saving"
        cancelLabel="Cancel"
      />

      <SlingDialog
        isOpen={slingDialogOpen}
        onClose={handleSlingClose}
        formulaPath={formulaPath ?? ''}
        vars={varValues}
        onSling={handleSlingExecute}
        isLoading={isSlinging}
        result={slingResult}
        onNavigateToResults={handleNavigateToResults}
      />

      {result && (
        <PourDialog
          isOpen={pourDialogOpen}
          onClose={handlePourClose}
          protoId={name ?? ''}
          cookResult={result}
          vars={varValues}
          onPourSuccess={handlePourSuccess}
        />
      )}
    </div>
  )
}
