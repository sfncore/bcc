import { Link, Outlet, createRootRoute, useMatchRoute } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'
import { Component, type ErrorInfo, type ReactNode, useCallback, useEffect, useState } from 'react'
import { Toaster } from 'sonner'
import { BeadDetail } from '../components/beads/bead-detail'
import {
  AppShell,
  DirectoryBrowser,
  NewProjectModal,
  WorkspaceHeader,
  WorkspaceTree,
} from '../components/layout'
import { CommandPalette, useDefaultActions } from '../components/layout/command-palette'
import { GenericErrorPage, OfflineBanner } from '../components/ui'
import { UnsavedChangesModal } from '../components/ui/unsaved-changes-modal'
import {
  BeadSelectionProvider,
  FormulaSaveProvider,
  useBeadSelection,
  useFormulaDirty,
  useFormulaSave,
} from '../contexts'
import { useBead, useKeyboardTip, useWorkspaceConfig } from '../hooks'
import { apiFetch, apiPost } from '../lib'

type ViewMode = 'list' | 'wave' | 'graph'

/** Props for ErrorBoundary component */
interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
}

/** State for ErrorBoundary component */
interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

/**
 * Error boundary to catch React rendering errors.
 * Prevents the app from showing a blank screen on unhandled errors.
 */
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log error details for debugging
    console.error('React Error Boundary caught an error:', error, errorInfo)
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null })
  }

  render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback
      }
      return <GenericErrorPage error={this.state.error} resetErrorBoundary={this.handleReset} />
    }

    return this.props.children
  }
}

export const Route = createRootRoute({
  component: RootLayout,
})

const navTabStyle = (active: boolean): React.CSSProperties => ({
  padding: '6px 16px',
  fontSize: '12px',
  color: active ? '#e5e5e5' : '#888',
  borderBottom: active ? '2px solid #007acc' : '2px solid transparent',
  background: 'none',
  cursor: 'pointer',
  textDecoration: 'none',
  display: 'inline-block',
})

function NavTabs() {
  const matchRoute = useMatchRoute()
  const isBeads = !!matchRoute({ to: '/beads' })
  const isCrossRig = !!matchRoute({ to: '/crossrig' })
  const isHome = !!matchRoute({ to: '/' })
  const isFormula = !isBeads && !isCrossRig && !isHome

  return (
    <div style={{ padding: '0 16px', borderBottom: '1px solid #333', display: 'flex', gap: '0' }}>
      <Link to="/" style={navTabStyle(isHome)}>Home</Link>
      <Link to="/beads" style={navTabStyle(isBeads)}>Beads</Link>
      <Link to="/crossrig" style={navTabStyle(isCrossRig)}>Cross-Rig</Link>
    </div>
  )
}

/**
 * Inner layout component that uses bead selection context.
 */
function RootLayoutInner() {
  const { selectedBeadId, clearSelection } = useBeadSelection()
  const { bead, isLoading, error } = useBead(selectedBeadId)
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const { config, setRootPath, addRecentRoot, clearConfig } = useWorkspaceConfig()
  const [treeFilter, setTreeFilter] = useState('')
  const [showCmdBrowser, setShowCmdBrowser] = useState(false)
  const [showCmdNewProject, setShowCmdNewProject] = useState(false)
  const [cmdBrowserMode, setCmdBrowserMode] = useState<'open' | 'new' | 'change'>('open')
  const [cmdNewProjectPath, setCmdNewProjectPath] = useState('')
  const [showUnsavedModal, setShowUnsavedModal] = useState(false)
  const { hasAnyDirty } = useFormulaDirty()
  const { save: saveFormula } = useFormulaSave()

  // Show one-time keyboard shortcut tip
  useKeyboardTip()

  // Reconcile localStorage workspace config with backend state on mount
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally run once on mount
  useEffect(() => {
    async function syncWorkspace() {
      const { data, error: fetchError } = await apiFetch<{ ok: true; root: string }>(
        '/api/workspace'
      )
      const localRoot = config.rootPath

      if (fetchError) {
        // Backend has no root (NO_ROOT) — try to restore from localStorage
        if (fetchError.message === 'No workspace root configured' && localRoot) {
          await apiPost('/api/workspace/open', { path: localRoot })
        }
        return
      }

      if (data) {
        if (!localRoot) {
          // localStorage empty — adopt backend root
          setRootPath(data.root)
        } else if (data.root !== localRoot) {
          // Mismatch — clear localStorage and navigate to welcome screen
          clearConfig()
          window.history.pushState(null, '', '/')
          window.dispatchEvent(new PopStateEvent('popstate'))
        }
      }
    }
    syncWorkspace()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleOpenFormula = useCallback(() => {
    // Navigate to first formula or show formula picker
    console.log('Open Formula triggered')
  }, [])

  const handleCookPreview = useCallback(() => {
    console.log('Cook Preview triggered')
  }, [])

  const handleSling = useCallback(() => {
    console.log('Sling triggered')
  }, [])

  const handleOpenFolder = useCallback(() => {
    setCmdBrowserMode('open')
    setShowCmdBrowser(true)
  }, [])

  const handleNewProject = useCallback(() => {
    setCmdBrowserMode('new')
    setShowCmdBrowser(true)
  }, [])

  const handleChangeFolder = useCallback(() => {
    if (hasAnyDirty) {
      setShowUnsavedModal(true)
      return
    }
    setCmdBrowserMode('change')
    setShowCmdBrowser(true)
  }, [hasAnyDirty])

  const handleUnsavedSave = useCallback(async () => {
    await saveFormula()
    setShowUnsavedModal(false)
    setCmdBrowserMode('change')
    setShowCmdBrowser(true)
  }, [saveFormula])

  const handleUnsavedDiscard = useCallback(() => {
    setShowUnsavedModal(false)
    setCmdBrowserMode('change')
    setShowCmdBrowser(true)
  }, [])

  const handleUnsavedCancel = useCallback(() => {
    setShowUnsavedModal(false)
  }, [])

  const handleCmdFolderSelected = useCallback(
    async (path: string) => {
      setShowCmdBrowser(false)
      if (cmdBrowserMode === 'new') {
        setCmdNewProjectPath(path)
        setShowCmdNewProject(true)
        return
      }
      const { error: openError } = await apiPost('/api/workspace/open', { path })
      if (!openError) {
        setRootPath(path)
        addRecentRoot(path)
        window.history.pushState({}, '', '/')
        window.dispatchEvent(new PopStateEvent('popstate'))
      }
    },
    [cmdBrowserMode, setRootPath, addRecentRoot]
  )

  const handleCmdNewProjectComplete = useCallback(async () => {
    setShowCmdNewProject(false)
    const { error: openError } = await apiPost('/api/workspace/open', { path: cmdNewProjectPath })
    if (!openError) {
      setRootPath(cmdNewProjectPath)
      addRecentRoot(cmdNewProjectPath)
      window.history.pushState({}, '', '/')
      window.dispatchEvent(new PopStateEvent('popstate'))
    }
  }, [cmdNewProjectPath, setRootPath, addRecentRoot])

  const actions = useDefaultActions({
    onOpenFormula: handleOpenFormula,
    onCookPreview: handleCookPreview,
    onSling: handleSling,
    onSwitchToGraph: () => setViewMode('graph'),
    onSwitchToList: () => setViewMode('list'),
    onSwitchToWave: () => setViewMode('wave'),
    onOpenFolder: handleOpenFolder,
    onNewProject: handleNewProject,
    onChangeFolder: handleChangeFolder,
  })

  return (
    <>
      <button
        type="button"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[9999] focus:px-4 focus:py-2 focus:bg-zinc-900 focus:text-white focus:border-2 focus:border-brand-500 focus:rounded focus:font-medium"
        onClick={() => {
          const main = document.getElementById('main-content')
          if (main) {
            main.tabIndex = -1
            main.focus()
            main.removeAttribute('tabindex')
          }
        }}
      >
        Skip to main content
      </button>
      <OfflineBanner />
      <AppShell
        sidebarContent={
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <WorkspaceHeader onFilterChange={setTreeFilter} />
            <WorkspaceTree filter={treeFilter} />
          </div>
        }
        mainContent={
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <NavTabs />
            <div style={{ flex: 1, overflow: 'auto' }}>
              <Outlet />
            </div>
          </div>
        }
        detailContent={
          selectedBeadId ? (
            <div style={{ padding: '16px', color: '#858585' }}>
              {error ? (
                <div style={{ color: '#f87171' }}>Error: {error.message}</div>
              ) : isLoading ? (
                'Loading bead details...'
              ) : (
                'Bead details'
              )}
            </div>
          ) : null
        }
      />
      {/* Bead detail overlay panel */}
      {selectedBeadId && <BeadDetail bead={bead} onClose={clearSelection} isLoading={isLoading} />}
      {/* Global command palette */}
      <CommandPalette actions={actions} placeholder="Search actions..." />
      <Toaster
        position="bottom-right"
        theme="dark"
        toastOptions={{
          style: {
            background: '#1f2937',
            border: '1px solid #374151',
            color: '#e5e7eb',
          },
        }}
      />
      {import.meta.env.DEV && <TanStackRouterDevtools position="bottom-right" />}
      {/* Command palette triggered directory browser */}
      <DirectoryBrowser
        isOpen={showCmdBrowser}
        onSelect={handleCmdFolderSelected}
        onCancel={() => setShowCmdBrowser(false)}
        initialPath={config.rootPath || undefined}
      />
      <NewProjectModal
        isOpen={showCmdNewProject}
        selectedPath={cmdNewProjectPath}
        onComplete={handleCmdNewProjectComplete}
        onCancel={() => setShowCmdNewProject(false)}
      />
      <UnsavedChangesModal
        isOpen={showUnsavedModal}
        onSave={handleUnsavedSave}
        onDiscard={handleUnsavedDiscard}
        onCancel={handleUnsavedCancel}
        message="You have unsaved changes. Do you want to save them before changing folder?"
      />
    </>
  )
}

function RootLayout() {
  return (
    <ErrorBoundary>
      <BeadSelectionProvider>
        <FormulaSaveProvider>
          <RootLayoutInner />
        </FormulaSaveProvider>
      </BeadSelectionProvider>
    </ErrorBoundary>
  )
}
