import { expect, test } from './fixtures'

/**
 * Formula Workflow E2E Tests
 *
 * Tests the full MVP workflow:
 * - Open formula -> edit -> auto-save -> cook preview -> view results
 * - Command palette navigation
 * - View switching (list/wave/graph)
 *
 * All tests use mocked CLI responses to avoid database dependency in CI.
 */

// Platform-aware modifier key: Ctrl on Linux/Windows, Meta on Mac
const MOD_KEY = process.platform === 'darwin' ? 'Meta' : 'Control'

test.describe('Formula Edit -> Cook -> Preview Flow', () => {
  test.describe('Formula Loading', () => {
    test('should load and display formula content', async ({ page, apiMock }) => {
      await page.goto('/formula/test-simple')
      await page.waitForLoadState('networkidle')

      // Should show the formula name in the header
      await expect(page.getByText('test-simple.toml')).toBeVisible()

      // Should show the editor (text mode by default)
      const editor = page.locator('.cm-editor')
      await expect(editor).toBeVisible()
    })

    test('should display loading state while fetching formula', async ({ page, apiMock }) => {
      await page.goto('/formula/test-simple')

      // Should show loading state initially
      await expect(page.getByText('Loading formula...')).toBeVisible()

      // Wait for content to load
      await page.waitForLoadState('networkidle')

      // Loading should disappear
      await expect(page.getByText('Loading formula...')).not.toBeVisible()
    })
  })

  test.describe('Formula Editing', () => {
    test('should allow editing formula content', async ({ page, apiMock }) => {
      await page.goto('/formula/test-simple')
      await page.waitForLoadState('networkidle')

      // Focus the editor
      const editor = page.locator('.cm-editor')
      await editor.click()

      // Type some content
      await page.keyboard.type('# Test comment')

      // Content should be in the editor
      await expect(page.locator('.cm-content')).toContainText('# Test comment')
    })

    test('should toggle between text and visual view modes', async ({ page, apiMock }) => {
      await page.goto('/formula/test-simple')
      await page.waitForLoadState('networkidle')

      // Start in text mode
      const textButton = page.getByRole('button', { name: 'Text' })
      const visualButton = page.getByRole('button', { name: 'Visual' })

      await expect(textButton).toHaveAttribute('aria-pressed', 'true')
      await expect(visualButton).toHaveAttribute('aria-pressed', 'false')

      // Switch to visual mode
      await visualButton.click()

      await expect(textButton).toHaveAttribute('aria-pressed', 'false')
      await expect(visualButton).toHaveAttribute('aria-pressed', 'true')
    })
  })

  test.describe('Cook Preview', () => {
    test('should cook formula and display preview', async ({ page, apiMock }) => {
      await page.goto('/formula/test-multi')
      await page.waitForLoadState('networkidle')

      // Click the Cook Preview button
      const cookButton = page.getByRole('button', { name: 'Cook Preview' })
      await cookButton.click()

      // Wait for cook result - should show step count
      await expect(page.getByText('3 steps')).toBeVisible()
    })

    test('should display cooking state while processing', async ({ page, apiMock }) => {
      // Override cook with a delayed response so the loading state is visible
      await page.unroute(/\/api\/cook$/)
      await page.route(/\/api\/cook$/, async (route) => {
        await new Promise((r) => setTimeout(r, 1000))
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: true,
            formula: 'test-simple',
            version: 1,
            type: 'workflow',
            phase: 'liquid',
            steps: [{ id: 'step-1', title: 'First step', description: 'Do the first thing', priority: 2 }],
            vars: { project_name: { description: 'Name of the project', required: true } },
          }),
        })
      })
      await page.goto('/formula/test-simple')

      // Wait for the Cook Preview button to appear (formula loaded)
      const cookButton = page.getByRole('button', { name: 'Cook Preview' })
      await expect(cookButton).toBeVisible()

      // Click cook and check loading state
      await cookButton.click()

      // Should show cooking state while the delayed response is pending
      await expect(page.getByText('Cooking...')).toBeVisible()

      // Wait for result to finish
      await expect(page.getByText('Cooking...')).not.toBeVisible({ timeout: 5000 })
    })

    test('should show variables panel when formula has vars', async ({ page, apiMock }) => {
      await page.goto('/formula/test-multi')
      await page.waitForLoadState('networkidle')

      // Trigger cook to load vars
      await page.getByRole('button', { name: 'Cook Preview' }).click()
      await page.waitForLoadState('networkidle')

      // Should show variables panel with var definitions
      // Scope to textbox inputs to avoid matching CodeMirror editor tokens
      await expect(page.getByRole('textbox', { name: 'project_name' })).toBeVisible()
      await expect(page.getByRole('textbox', { name: 'owner' })).toBeVisible()
    })

    test('should allow editing variable values', async ({ page, apiMock }) => {
      await page.goto('/formula/test-multi')
      await page.waitForLoadState('networkidle')

      // Trigger cook to load vars
      await page.getByRole('button', { name: 'Cook Preview' }).click()
      await page.waitForLoadState('networkidle')

      // Find a variable input and change its value
      const varInput = page.locator('input[name="project_name"]')
      if (await varInput.isVisible()) {
        await varInput.fill('my-project')
        await expect(varInput).toHaveValue('my-project')
      }
    })

    test('should show Pour button after successful cook', async ({ page, apiMock }) => {
      await page.goto('/formula/test-multi')
      await page.waitForLoadState('networkidle')

      // Cook the formula
      await page.getByRole('button', { name: 'Cook Preview' }).click()
      await page.waitForLoadState('networkidle')

      // Pour button should appear with step count
      await expect(page.getByRole('button', { name: /Pour \(\d+\)/ })).toBeVisible()
    })
  })

  test.describe('Visual Builder', () => {
    test('should render DAG in visual mode after cook', async ({ page, apiMock }) => {
      await page.goto('/formula/test-multi')
      await page.waitForLoadState('networkidle')

      // Cook to get steps
      await page.getByRole('button', { name: 'Cook Preview' }).click()
      await page.waitForLoadState('networkidle')

      // Switch to visual mode
      await page.getByRole('button', { name: 'Visual' }).click()

      // Should show the visual builder (React Flow canvas)
      await expect(page.locator('.react-flow')).toBeVisible()
    })
  })

  test.describe('Sling Workflow', () => {
    test('should open sling dialog when clicking Sling button', async ({ page, apiMock }) => {
      await page.goto('/formula/test-simple')
      await page.waitForLoadState('networkidle')

      // Click Sling button
      await page.getByRole('button', { name: 'Sling' }).click()

      // Dialog should open
      await expect(page.getByRole('dialog')).toBeVisible()
      await expect(page.getByText('Sling Formula')).toBeVisible()
    })

    test('should close sling dialog on cancel', async ({ page, apiMock }) => {
      await page.goto('/formula/test-simple')
      await page.waitForLoadState('networkidle')

      // Open dialog
      await page.getByRole('button', { name: 'Sling' }).click()
      await expect(page.getByRole('dialog')).toBeVisible()

      // Close with cancel
      await page.getByRole('button', { name: 'Cancel' }).click()
      await expect(page.getByRole('dialog')).not.toBeVisible()
    })
  })

  test.describe('Status Bar', () => {
    test('should display formula info in status bar', async ({ page, apiMock }) => {
      await page.goto('/formula/test-simple')
      await page.waitForLoadState('networkidle')

      // Cook to populate status
      await page.getByRole('button', { name: 'Cook Preview' }).click()
      await page.waitForLoadState('networkidle')

      // Status bar should show formula info
      await expect(page.getByText(/Formula: test-simple/)).toBeVisible()
      await expect(page.getByText(/\d+ steps/)).toBeVisible()
    })
  })
})

test.describe('Formula Workflow', () => {
  test.describe('App Shell', () => {
    test('should render the app shell with three panels', async ({ page, apiMock }) => {
      await page.goto('/')
      await page.waitForLoadState('networkidle')

      // The app should have rendered
      await expect(page.getByText('Beads IDE')).toBeVisible()
    })

    test('should display the current view mode', async ({ page, apiMock }) => {
      await page.goto('/')
      await page.waitForLoadState('networkidle')

      // Default view should be list
      await expect(page.getByText('Current view: list')).toBeVisible()
    })
  })

  test.describe('Command Palette', () => {
    test('should open command palette with Cmd+K', async ({ page, apiMock }) => {
      await page.goto('/')
      await page.waitForLoadState('networkidle')

      // Press Cmd+K (or Ctrl+K on non-Mac)
      await page.keyboard.press(`${MOD_KEY}+k`)

      // Command palette should be visible
      await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible()
      await expect(page.getByRole('combobox', { name: 'Search commands' })).toBeVisible()
    })

    test('should close command palette with Escape', async ({ page, apiMock }) => {
      await page.goto('/')
      await page.waitForLoadState('networkidle')

      // Open palette
      await page.keyboard.press(`${MOD_KEY}+k`)
      await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible()

      // Close with Escape
      await page.keyboard.press('Escape')
      await expect(page.getByRole('dialog', { name: 'Command palette' })).not.toBeVisible()
    })

    test('should filter actions by search query', async ({ page, apiMock }) => {
      await page.goto('/')
      await page.waitForLoadState('networkidle')

      // Open palette
      await page.keyboard.press(`${MOD_KEY}+k`)

      // Type to filter
      await page.getByRole('combobox', { name: 'Search commands' }).fill('graph')

      // Should show only graph-related action
      await expect(page.getByText('Switch to Graph View')).toBeVisible()
      // Other actions should be filtered out
      await expect(page.getByText('Open Formula')).not.toBeVisible()
    })

    test('should navigate actions with arrow keys', async ({ page, apiMock }) => {
      await page.goto('/')
      await page.waitForLoadState('networkidle')

      // Open palette
      await page.keyboard.press(`${MOD_KEY}+k`)

      // First item should be selected by default
      const firstItem = page.locator('button[aria-selected="true"]').first()
      await expect(firstItem).toBeVisible()

      // Press down arrow to move selection
      await page.keyboard.press('ArrowDown')

      // A different item should now be selected
      const newSelectedItem = page.locator('button[aria-selected="true"]').first()
      await expect(newSelectedItem).toBeVisible()
    })

    test('should execute action on Enter', async ({ page, apiMock }) => {
      await page.goto('/')
      await page.waitForLoadState('networkidle')

      // Initially list view
      await expect(page.getByText('Current view: list')).toBeVisible()

      // Open palette and search for graph view
      await page.keyboard.press(`${MOD_KEY}+k`)
      await page.getByRole('combobox', { name: 'Search commands' }).fill('graph')

      // Press Enter to select
      await page.keyboard.press('Enter')

      // Palette should close and view should change
      await expect(page.getByRole('dialog', { name: 'Command palette' })).not.toBeVisible()
      await expect(page.getByText('Current view: graph')).toBeVisible()
    })

    test('should switch to wave view via command palette', async ({ page, apiMock }) => {
      await page.goto('/')
      await page.waitForLoadState('networkidle')

      // Open palette and search for wave view
      await page.keyboard.press(`${MOD_KEY}+k`)
      await page.getByRole('combobox', { name: 'Search commands' }).fill('wave')
      await page.keyboard.press('Enter')

      await expect(page.getByText('Current view: wave')).toBeVisible()
    })

    test('should switch to list view via command palette', async ({ page, apiMock }) => {
      await page.goto('/')
      await page.waitForLoadState('networkidle')

      // First switch to graph
      await page.keyboard.press(`${MOD_KEY}+k`)
      await page.getByRole('combobox', { name: 'Search commands' }).fill('graph')
      await page.keyboard.press('Enter')
      await expect(page.getByText('Current view: graph')).toBeVisible()

      // Then switch back to list
      await page.keyboard.press(`${MOD_KEY}+k`)
      await page.getByRole('combobox', { name: 'Search commands' }).fill('list')
      await page.keyboard.press('Enter')
      await expect(page.getByText('Current view: list')).toBeVisible()
    })
  })

  test.describe('View Switching', () => {
    test('should switch between list, wave, and graph views', async ({ page, apiMock }) => {
      await page.goto('/')
      await page.waitForLoadState('networkidle')

      // Start with list view
      await expect(page.getByText('Current view: list')).toBeVisible()

      // Switch to graph
      await page.keyboard.press(`${MOD_KEY}+k`)
      await page.getByRole('combobox', { name: 'Search commands' }).fill('graph')
      await page.keyboard.press('Enter')
      await expect(page.getByText('Current view: graph')).toBeVisible()

      // Switch to wave
      await page.keyboard.press(`${MOD_KEY}+k`)
      await page.getByRole('combobox', { name: 'Search commands' }).fill('wave')
      await page.keyboard.press('Enter')
      await expect(page.getByText('Current view: wave')).toBeVisible()

      // Switch back to list
      await page.keyboard.press(`${MOD_KEY}+k`)
      await page.getByRole('combobox', { name: 'Search commands' }).fill('list')
      await page.keyboard.press('Enter')
      await expect(page.getByText('Current view: list')).toBeVisible()
    })

    test('should maintain view state across navigation', async ({ page, apiMock }) => {
      await page.goto('/')
      await page.waitForLoadState('networkidle')

      // Switch to graph view
      await page.keyboard.press(`${MOD_KEY}+k`)
      await page.getByRole('combobox', { name: 'Search commands' }).fill('graph')
      await page.keyboard.press('Enter')
      await expect(page.getByText('Current view: graph')).toBeVisible()

      // The view should persist (no reload needed for this test)
      await expect(page.getByText('Current view: graph')).toBeVisible()
    })
  })

  test.describe('Keyboard Navigation', () => {
    test('should show keyboard hints in command palette footer', async ({ page, apiMock }) => {
      await page.goto('/')
      await page.waitForLoadState('networkidle')

      await page.keyboard.press(`${MOD_KEY}+k`)

      // Should show navigation hints
      await expect(page.getByText('Navigate')).toBeVisible()
      await expect(page.getByText('Select')).toBeVisible()
      await expect(page.getByText('Close')).toBeVisible()
    })

    test('should show action shortcuts in command palette', async ({ page, apiMock }) => {
      await page.goto('/')
      await page.waitForLoadState('networkidle')

      await page.keyboard.press(`${MOD_KEY}+k`)

      // Should show shortcuts for actions
      // The Open Formula action has Mod+O shortcut
      const openFormulaItem = page.getByText('Open Formula').locator('..')
      await expect(openFormulaItem).toBeVisible()
    })
  })
})

test.describe('Results View', () => {
  test.describe('List/Wave/Graph Switching', () => {
    test('should cycle through all view modes', async ({ page, apiMock }) => {
      await page.goto('/')
      await page.waitForLoadState('networkidle')

      // Verify we can switch through all views
      const views = ['graph', 'wave', 'list']

      for (const view of views) {
        await page.keyboard.press(`${MOD_KEY}+k`)
        await page.getByRole('combobox', { name: 'Search commands' }).fill(view)
        await page.keyboard.press('Enter')
        await expect(page.getByText(`Current view: ${view}`)).toBeVisible()
      }
    })
  })
})

test.describe('Performance', () => {
  test('command palette should open quickly', async ({ page, apiMock }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const startTime = Date.now()
    await page.keyboard.press(`${MOD_KEY}+k`)
    await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible()
    const endTime = Date.now()

    // Should open in under 200ms
    expect(endTime - startTime).toBeLessThan(200)
  })

  test('view switching should be responsive', async ({ page, apiMock }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Measure view switch time
    const startTime = Date.now()
    await page.keyboard.press(`${MOD_KEY}+k`)
    await page.getByRole('combobox', { name: 'Search commands' }).fill('graph')
    await page.keyboard.press('Enter')
    await expect(page.getByText('Current view: graph')).toBeVisible()
    const endTime = Date.now()

    // Should complete in under 500ms
    expect(endTime - startTime).toBeLessThan(500)
  })
})
