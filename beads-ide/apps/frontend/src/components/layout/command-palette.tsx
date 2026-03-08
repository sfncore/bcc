import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { formatHotkey, useHotkey } from '../../hooks/use-hotkeys'

export interface CommandAction {
  id: string
  label: string
  description?: string
  shortcut?: string
  icon?: string
  category?: string
  onSelect: () => void
}

interface CommandPaletteProps {
  actions: CommandAction[]
  placeholder?: string
}

interface CommandPaletteItemProps {
  action: CommandAction
  isSelected: boolean
  onSelect: () => void
  onMouseEnter: () => void
}

function CommandPaletteItem({
  action,
  isSelected,
  onSelect,
  onMouseEnter,
}: CommandPaletteItemProps) {
  const itemRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (isSelected && itemRef.current) {
      itemRef.current.scrollIntoView({ block: 'nearest' })
    }
  }, [isSelected])

  return (
    <button
      ref={itemRef}
      type="button"
      aria-selected={isSelected}
      onClick={onSelect}
      onMouseEnter={onMouseEnter}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        padding: '10px 16px',
        border: 'none',
        background: isSelected ? '#3b82f6' : 'transparent',
        color: isSelected ? '#fff' : '#e5e5e5',
        cursor: 'pointer',
        textAlign: 'left',
        fontSize: '14px',
        transition: 'background 0.1s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
        {action.icon && <span style={{ fontSize: '16px', opacity: 0.7 }}>{action.icon}</span>}
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontWeight: 500,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {action.label}
          </div>
          {action.description && (
            <div
              style={{
                fontSize: '12px',
                opacity: 0.6,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {action.description}
            </div>
          )}
        </div>
      </div>
      {action.shortcut && (
        <kbd
          style={{
            fontSize: '11px',
            padding: '2px 6px',
            background: isSelected ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)',
            borderRadius: '4px',
            fontFamily: 'system-ui, sans-serif',
            color: isSelected ? '#fff' : '#a3a3a3',
            flexShrink: 0,
            marginLeft: '16px',
          }}
        >
          {formatHotkey(action.shortcut)}
        </kbd>
      )}
    </button>
  )
}

export function CommandPalette({
  actions,
  placeholder = 'Type to search...',
}: CommandPaletteProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)

  const filteredActions = useMemo(() => {
    if (!query.trim()) return actions

    const lowerQuery = query.toLowerCase()
    return actions.filter(
      (action) =>
        action.label.toLowerCase().includes(lowerQuery) ||
        action.description?.toLowerCase().includes(lowerQuery) ||
        action.category?.toLowerCase().includes(lowerQuery)
    )
  }, [actions, query])

  const open = useCallback(() => {
    setIsOpen(true)
    setQuery('')
    setSelectedIndex(0)
  }, [])

  const close = useCallback(() => {
    setIsOpen(false)
    setQuery('')
    setSelectedIndex(0)
  }, [])

  const selectAction = useCallback(
    (action: CommandAction) => {
      close()
      action.onSelect()
    },
    [close]
  )

  // Cmd+K / Ctrl+K to open
  useHotkey('Mod+K', open)

  // Escape to close (enableOnFormTags so it works when input is focused)
  useHotkey('Escape', close, { enabled: isOpen, enableOnFormTags: true })

  // Arrow navigation
  useHotkey(
    'ArrowUp',
    () => {
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : filteredActions.length - 1))
    },
    { enabled: isOpen, enableOnFormTags: true }
  )

  useHotkey(
    'ArrowDown',
    () => {
      setSelectedIndex((prev) => (prev < filteredActions.length - 1 ? prev + 1 : 0))
    },
    { enabled: isOpen, enableOnFormTags: true }
  )

  // Enter to select
  useHotkey(
    'Enter',
    () => {
      const action = filteredActions[selectedIndex]
      if (action) selectAction(action)
    },
    { enabled: isOpen, enableOnFormTags: true }
  )

  // Focus input when opened and show dialog
  useEffect(() => {
    if (isOpen) {
      dialogRef.current?.showModal()
      const timer = setTimeout(() => inputRef.current?.focus(), 10)
      return () => clearTimeout(timer)
    }
    dialogRef.current?.close()
  }, [isOpen])

  // Reset selection when query changes (filter result changes)
  const queryRef = useRef(query)
  useEffect(() => {
    if (queryRef.current !== query) {
      queryRef.current = query
      setSelectedIndex(0)
    }
  })

  // Group actions by category
  const groupedActions = useMemo(() => {
    const groups: Record<string, CommandAction[]> = {}
    for (const action of filteredActions) {
      const category = action.category || 'Actions'
      if (!groups[category]) groups[category] = []
      groups[category].push(action)
    }
    return groups
  }, [filteredActions])

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === dialogRef.current) {
        close()
      }
    },
    [close]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Handle Enter on dialog backdrop (for keyboard a11y)
      if (e.key === 'Enter' && e.target === dialogRef.current) {
        close()
      }
    },
    [close]
  )

  const selectedActionId = filteredActions[selectedIndex]?.id

  // Don't render anything when closed
  if (!isOpen) return null

  const dialog = (
    <dialog
      ref={dialogRef}
      aria-label="Command palette"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      onCancel={(e) => {
        e.preventDefault()
        close()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        maxWidth: '100%',
        maxHeight: '100%',
        padding: 0,
        border: 'none',
        background: 'transparent',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '15vh',
      }}
    >
      {/* Dialog content */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: '560px',
          background: '#1a1a1a',
          borderRadius: '12px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          overflow: 'hidden',
          border: '1px solid #333',
        }}
      >
        {/* Search input */}
        <div style={{ padding: '16px', borderBottom: '1px solid #333' }}>
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            aria-label="Search commands"
            aria-autocomplete="list"
            aria-controls="command-list"
            aria-expanded="true"
            aria-activedescendant={selectedActionId ? `option-${selectedActionId}` : undefined}
            style={{
              width: '100%',
              padding: '8px 0',
              border: 'none',
              background: 'transparent',
              color: '#fff',
              fontSize: '16px',
              outline: 'none',
            }}
          />
        </div>

        {/* Results */}
        <div
          id="command-list"
          // biome-ignore lint/a11y/useSemanticElements: custom listbox widget, <select> is not suitable for a command palette
          role="listbox"
          aria-label="Commands"
          tabIndex={0}
          style={{
            maxHeight: '320px',
            overflowY: 'auto',
          }}
        >
          {filteredActions.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#737373' }}>
              <div style={{ marginBottom: '4px' }}>No results found</div>
              <div style={{ fontSize: '12px' }}>
                Try different keywords or press{' '}
                <kbd
                  style={{
                    fontSize: '11px',
                    padding: '1px 5px',
                    background: 'rgba(255,255,255,0.1)',
                    borderRadius: '4px',
                    fontFamily: 'system-ui, sans-serif',
                  }}
                >
                  Esc
                </kbd>{' '}
                to close
              </div>
            </div>
          ) : (
            Object.entries(groupedActions).map(([category, categoryActions]) => {
              let groupStartIndex = 0
              for (const [cat, acts] of Object.entries(groupedActions)) {
                if (cat === category) break
                groupStartIndex += acts.length
              }

              return (
                // biome-ignore lint/a11y/useSemanticElements: div group widget, fieldset would disrupt command palette layout
                <div key={category} role="group" aria-label={category}>
                  <div
                    style={{
                      padding: '8px 16px 4px',
                      fontSize: '11px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: '#737373',
                    }}
                  >
                    {category}
                  </div>
                  {categoryActions.map((action, idx) => (
                    <div
                      key={action.id}
                      id={`option-${action.id}`}
                      // biome-ignore lint/a11y/useSemanticElements: custom listbox option, <option> only valid inside <select>
                      role="option"
                      tabIndex={-1}
                      aria-selected={selectedIndex === groupStartIndex + idx}
                    >
                      <CommandPaletteItem
                        action={action}
                        isSelected={selectedIndex === groupStartIndex + idx}
                        onSelect={() => selectAction(action)}
                        onMouseEnter={() => setSelectedIndex(groupStartIndex + idx)}
                      />
                    </div>
                  ))}
                </div>
              )
            })
          )}
        </div>

        {/* Footer hint */}
        <div
          style={{
            padding: '10px 16px',
            borderTop: '1px solid #333',
            display: 'flex',
            gap: '16px',
            fontSize: '11px',
            color: '#737373',
          }}
        >
          <span>
            <kbd
              style={{
                padding: '2px 4px',
                background: '#333',
                borderRadius: '3px',
                marginRight: '4px',
              }}
            >
              &uarr;&darr;
            </kbd>
            Navigate
          </span>
          <span>
            <kbd
              style={{
                padding: '2px 4px',
                background: '#333',
                borderRadius: '3px',
                marginRight: '4px',
              }}
            >
              &crarr;
            </kbd>
            Select
          </span>
          <span>
            <kbd
              style={{
                padding: '2px 4px',
                background: '#333',
                borderRadius: '3px',
                marginRight: '4px',
              }}
            >
              Esc
            </kbd>
            Close
          </span>
        </div>
      </div>
    </dialog>
  )

  return createPortal(dialog, document.body)
}

/**
 * Default actions for the Beads IDE command palette
 */
export function useDefaultActions(handlers: {
  onOpenFormula?: () => void
  onCookPreview?: () => void
  onSling?: () => void
  onSwitchToGraph?: () => void
  onSwitchToList?: () => void
  onSwitchToWave?: () => void
  onOpenFolder?: () => void
  onNewProject?: () => void
  onChangeFolder?: () => void
}): CommandAction[] {
  return useMemo(
    () => [
      {
        id: 'open-folder',
        label: 'Open Folder...',
        description: 'Open a project folder',
        icon: '📁',
        category: 'Workspace',
        onSelect: handlers.onOpenFolder || (() => {}),
      },
      {
        id: 'new-project',
        label: 'New Project...',
        description: 'Create a new Beads project',
        icon: '✨',
        category: 'Workspace',
        onSelect: handlers.onNewProject || (() => {}),
      },
      {
        id: 'change-folder',
        label: 'Change Folder...',
        description: 'Switch to a different project folder',
        icon: '🔄',
        category: 'Workspace',
        onSelect: handlers.onChangeFolder || (() => {}),
      },
      {
        id: 'open-formula',
        label: 'Open Formula',
        description: 'Open a formula file',
        shortcut: 'Mod+O',
        icon: '📄',
        category: 'File',
        onSelect: handlers.onOpenFormula || (() => {}),
      },
      {
        id: 'cook-preview',
        label: 'Cook Preview',
        description: 'Preview the cooked output',
        shortcut: 'Mod+Shift+C',
        icon: '🍳',
        category: 'Actions',
        onSelect: handlers.onCookPreview || (() => {}),
      },
      {
        id: 'sling',
        label: 'Sling',
        description: 'Dispatch work to polecats',
        shortcut: 'Mod+Shift+S',
        icon: '🚀',
        category: 'Actions',
        onSelect: handlers.onSling || (() => {}),
      },
      {
        id: 'view-graph',
        label: 'Switch to Graph View',
        description: 'View beads as a dependency graph',
        icon: '🔗',
        category: 'View',
        onSelect: handlers.onSwitchToGraph || (() => {}),
      },
      {
        id: 'view-list',
        label: 'Switch to List View',
        description: 'View beads as a flat list',
        icon: '📋',
        category: 'View',
        onSelect: handlers.onSwitchToList || (() => {}),
      },
      {
        id: 'view-wave',
        label: 'Switch to Wave View',
        description: 'View beads by dependency wave',
        icon: '🌊',
        category: 'View',
        onSelect: handlers.onSwitchToWave || (() => {}),
      },
    ],
    [handlers]
  )
}
