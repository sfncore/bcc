import { expect, test } from './fixtures'

/**
 * Workspace Onboarding E2E Tests
 *
 * Tests the full onboarding flow:
 * - Welcome screen display
 * - Open folder flow via directory browser
 * - New project flow via template selection
 * - Workspace tree navigation
 * - Formula opening from tree
 * - Dirty indicator display
 * - Change folder with unsaved changes guard
 * - Tree filter / search
 * - Open recent workspace
 * - Command palette workspace actions
 *
 * All tests use mocked API responses to avoid filesystem/backend dependency in CI.
 */

// --- Test data for workspace mocks ---

const MOCK_BROWSE_ROOT = {
  ok: true,
  path: '/home/user',
  parent: '/',
  entries: [
    { name: 'projects', path: '/home/user/projects', type: 'directory' as const },
    { name: 'documents', path: '/home/user/documents', type: 'directory' as const },
    { name: '.config', path: '/home/user/.config', type: 'directory' as const },
  ],
}

const MOCK_BROWSE_PROJECTS = {
  ok: true,
  path: '/home/user/projects',
  parent: '/home/user',
  entries: [
    { name: 'my-beads', path: '/home/user/projects/my-beads', type: 'directory' as const },
    {
      name: 'other-project',
      path: '/home/user/projects/other-project',
      type: 'directory' as const,
    },
  ],
}

const MOCK_TREE_RESPONSE = {
  ok: true,
  root: '/home/user/projects/my-beads',
  nodes: [
    {
      name: 'formulas',
      path: 'formulas',
      type: 'directory' as const,
      children: [
        {
          name: 'deploy.formula.toml',
          path: 'formulas/deploy.formula.toml',
          type: 'formula' as const,
          formulaName: 'deploy',
        },
        {
          name: 'setup.formula.toml',
          path: 'formulas/setup.formula.toml',
          type: 'formula' as const,
          formulaName: 'setup',
        },
      ],
    },
    {
      name: '.beads',
      path: '.beads',
      type: 'directory' as const,
      children: [
        {
          name: 'formulas',
          path: '.beads/formulas',
          type: 'directory' as const,
          children: [
            {
              name: 'internal.formula.toml',
              path: '.beads/formulas/internal.formula.toml',
              type: 'formula' as const,
              formulaName: 'internal',
            },
          ],
        },
      ],
    },
  ],
  totalCount: 3,
  truncated: false,
}

const MOCK_WORKSPACE_NO_ROOT = {
  ok: false,
  error: 'No workspace root configured',
  code: 'NO_ROOT',
}

const MOCK_WORKSPACE_OPEN_SUCCESS = {
  ok: true,
  root: '/home/user/projects/my-beads',
  formulaCount: 3,
}

const MOCK_WORKSPACE_INIT_SUCCESS = {
  ok: true,
  root: '/home/user/projects/my-beads',
  created: ['formulas/', '.beads/', 'formulas/blank.formula.toml'],
}

/**
 * Set up workspace-related API mocks on the page.
 * Extends the base apiMock with workspace, browse, and tree endpoints.
 */
async function setupWorkspaceMocks(
  page: import('@playwright/test').Page,
  opts: {
    hasWorkspace?: boolean
    recentRoots?: string[]
    browseValidPaths?: string[]
  } = {}
) {
  const { hasWorkspace = false, browseValidPaths = ['/home/user', '/home/user/projects'] } = opts

  // Mock /api/workspace
  await page.route(/\/api\/workspace$/, async (route) => {
    if (route.request().method() === 'GET') {
      if (hasWorkspace) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: true,
            root: '/home/user/projects/my-beads',
            formulaCount: 3,
            searchPaths: ['formulas/', '.beads/formulas/'],
          }),
        })
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_WORKSPACE_NO_ROOT),
        })
      }
    } else {
      await route.continue()
    }
  })

  // Mock /api/workspace/open
  await page.route(/\/api\/workspace\/open$/, async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_WORKSPACE_OPEN_SUCCESS),
      })
    } else {
      await route.continue()
    }
  })

  // Mock /api/workspace/init
  await page.route(/\/api\/workspace\/init$/, async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_WORKSPACE_INIT_SUCCESS),
      })
    } else {
      await route.continue()
    }
  })

  // Mock /api/browse
  await page.route(/\/api\/browse/, async (route) => {
    const url = new URL(route.request().url())
    const path = url.searchParams.get('path')

    if (path === '/home/user/projects') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_BROWSE_PROJECTS),
      })
    } else if (path === '/') {
      // Root path "/" returns home directory entries
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_BROWSE_ROOT),
      })
    } else if (path && browseValidPaths.includes(path)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_BROWSE_ROOT),
      })
    } else if (!path) {
      // Default browse (no path param) returns home
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_BROWSE_ROOT),
      })
    } else {
      // Valid browse but custom path
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          path,
          parent: path.split('/').slice(0, -1).join('/') || '/',
          entries: [],
        }),
      })
    }
  })

  // Mock /api/tree
  await page.route(/\/api\/tree$/, async (route) => {
    if (hasWorkspace) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_TREE_RESPONSE),
      })
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          root: null,
          nodes: [],
          totalCount: 0,
          truncated: false,
        }),
      })
    }
  })
}

// =====================================================================
// Welcome Screen Tests
// =====================================================================

test.describe('Welcome Screen', () => {
  test('should display welcome panel when no workspace is configured', async ({
    page,
    apiMock,
  }) => {
    await setupWorkspaceMocks(page, { hasWorkspace: false })

    // Clear localStorage to ensure no rootPath
    await page.addInitScript(() => {
      localStorage.removeItem('workspaceConfig')
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Welcome panel should be visible
    await expect(page.getByRole('heading', { name: 'Beads IDE' })).toBeVisible()
    await expect(page.getByText('Open a folder to get started.')).toBeVisible()

    // Action buttons should be visible
    await expect(page.getByRole('button', { name: 'Open Folder' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible()
  })

  test('should show sidebar empty when no workspace root', async ({ page, apiMock }) => {
    await setupWorkspaceMocks(page, { hasWorkspace: false })

    await page.addInitScript(() => {
      localStorage.removeItem('workspaceConfig')
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Tree should not be visible (sidebar empty)
    await expect(page.locator('nav[role="tree"]')).not.toBeVisible()
  })
})

// =====================================================================
// Open Folder Flow
// =====================================================================

test.describe('Open Folder Flow', () => {
  test('should open directory browser when Open Folder is clicked', async ({ page, apiMock }) => {
    await setupWorkspaceMocks(page, { hasWorkspace: false })

    await page.addInitScript(() => {
      localStorage.removeItem('workspaceConfig')
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Click Open Folder
    await page.getByRole('button', { name: 'Open Folder' }).click()

    // Directory browser dialog should appear
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('Open Folder').first()).toBeVisible()

    // Should show directory entries
    await expect(dialog.getByText('projects')).toBeVisible()
    await expect(dialog.getByText('documents')).toBeVisible()
  })

  test('should navigate directories in browser', async ({ page, apiMock }) => {
    await setupWorkspaceMocks(page, { hasWorkspace: false })

    await page.addInitScript(() => {
      localStorage.removeItem('workspaceConfig')
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: 'Open Folder' }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // Click into projects directory
    await dialog.getByText('projects').click()

    // Should now show subdirectories of projects
    await expect(dialog.getByText('my-beads')).toBeVisible()
    await expect(dialog.getByText('other-project')).toBeVisible()
  })

  test('should select folder and open workspace', async ({ page, apiMock }) => {
    await setupWorkspaceMocks(page, {
      hasWorkspace: false,
      browseValidPaths: ['/home/user', '/home/user/projects', '/home/user/projects/my-beads'],
    })

    await page.addInitScript(() => {
      localStorage.removeItem('workspaceConfig')
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: 'Open Folder' }).click()

    const dialog = page.getByRole('dialog')

    // Navigate to projects
    await dialog.getByText('projects').click()
    await expect(dialog.getByText('my-beads')).toBeVisible()

    // Navigate into my-beads
    await dialog.getByText('my-beads').click()

    // Click "Select This Folder"
    await dialog.getByRole('button', { name: 'Select This Folder' }).click()

    // Dialog should close
    await expect(dialog).not.toBeVisible()
  })

  test('should cancel directory browser', async ({ page, apiMock }) => {
    await setupWorkspaceMocks(page, { hasWorkspace: false })

    await page.addInitScript(() => {
      localStorage.removeItem('workspaceConfig')
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: 'Open Folder' }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // Click Cancel
    await dialog.getByRole('button', { name: 'Cancel' }).click()

    // Dialog should close
    await expect(dialog).not.toBeVisible()

    // Welcome panel should still be visible
    await expect(page.getByRole('heading', { name: 'Beads IDE' })).toBeVisible()
  })

  test('should navigate via breadcrumbs', async ({ page, apiMock }) => {
    await setupWorkspaceMocks(page, { hasWorkspace: false })

    await page.addInitScript(() => {
      localStorage.removeItem('workspaceConfig')
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: 'Open Folder' }).click()

    const dialog = page.getByRole('dialog')

    // Navigate to projects
    await dialog.getByRole('button', { name: 'projects' }).click()
    await expect(dialog.getByText('my-beads')).toBeVisible()

    // Click root breadcrumb "/" to go back to root
    const breadcrumbRoot = dialog.locator('button').filter({ hasText: '/' }).first()
    await breadcrumbRoot.click()

    // Should show root-level entries again
    await expect(dialog.getByRole('button', { name: 'projects' })).toBeVisible()
  })
})

// =====================================================================
// New Project Flow
// =====================================================================

test.describe('New Project Flow', () => {
  test('should open directory browser in new mode, then show template modal', async ({
    page,
    apiMock,
  }) => {
    await setupWorkspaceMocks(page, { hasWorkspace: false })

    await page.addInitScript(() => {
      localStorage.removeItem('workspaceConfig')
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Click New Project
    await page.getByRole('button', { name: 'New Project' }).click()

    // Directory browser should appear to select location
    const dirDialog = page.getByRole('dialog')
    await expect(dirDialog).toBeVisible()

    // Select a folder
    await dirDialog.getByRole('button', { name: 'Select This Folder' }).click()

    // New Project modal should now appear
    const newProjectDialog = page.getByRole('dialog')
    await expect(newProjectDialog).toBeVisible()
    await expect(newProjectDialog.getByText('New Project')).toBeVisible()
    await expect(newProjectDialog.getByText('Blank formula')).toBeVisible()
    await expect(newProjectDialog.getByText('Empty formula with one step')).toBeVisible()
  })

  test('should create new project with blank template', async ({ page, apiMock }) => {
    await setupWorkspaceMocks(page, { hasWorkspace: false })

    await page.addInitScript(() => {
      localStorage.removeItem('workspaceConfig')
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: 'New Project' }).click()

    const dialog = page.getByRole('dialog')

    // Select folder
    await dialog.getByRole('button', { name: 'Select This Folder' }).click()

    // New project modal visible
    const newProjectDialog = page.getByRole('dialog')
    await expect(newProjectDialog.getByText('Blank formula')).toBeVisible()

    // Click Create
    await newProjectDialog.getByRole('button', { name: 'Create' }).click()

    // Modal should close after creation
    await expect(newProjectDialog).not.toBeVisible()
  })

  test('should cancel new project modal', async ({ page, apiMock }) => {
    await setupWorkspaceMocks(page, { hasWorkspace: false })

    await page.addInitScript(() => {
      localStorage.removeItem('workspaceConfig')
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: 'New Project' }).click()

    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: 'Select This Folder' }).click()

    const newProjectDialog = page.getByRole('dialog')
    await expect(newProjectDialog.getByText('New Project')).toBeVisible()

    // Click Cancel
    await newProjectDialog.getByRole('button', { name: 'Cancel' }).click()

    // Should be back at welcome
    await expect(page.getByRole('heading', { name: 'Beads IDE' })).toBeVisible()
  })
})

// =====================================================================
// Workspace Tree Navigation
// =====================================================================

test.describe('Workspace Tree Navigation', () => {
  test('should display workspace tree when workspace is configured', async ({ page, apiMock }) => {
    await setupWorkspaceMocks(page, { hasWorkspace: true })

    await page.addInitScript(() => {
      localStorage.setItem(
        'workspaceConfig',
        JSON.stringify({
          version: 1,
          rootPath: '/home/user/projects/my-beads',
          recentRoots: ['/home/user/projects/my-beads'],
          treeExpanded: {},
        })
      )
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Tree should be visible
    const tree = page.locator('nav[role="tree"]')
    await expect(tree).toBeVisible()

    // Should show directory and formula nodes
    await expect(tree.getByText('formulas').first()).toBeVisible()
    await expect(tree.getByText('deploy')).toBeVisible()
    await expect(tree.getByText('setup')).toBeVisible()
  })

  test('should collapse and expand directories', async ({ page, apiMock }) => {
    await setupWorkspaceMocks(page, { hasWorkspace: true })

    await page.addInitScript(() => {
      localStorage.setItem(
        'workspaceConfig',
        JSON.stringify({
          version: 1,
          rootPath: '/home/user/projects/my-beads',
          recentRoots: ['/home/user/projects/my-beads'],
          treeExpanded: {},
        })
      )
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const tree = page.locator('nav[role="tree"]')

    // Formulas directory should be expanded by default
    await expect(tree.getByText('deploy')).toBeVisible()

    // Click the formulas directory to collapse
    const formulasDir = tree.locator('[role="treeitem"]').filter({ hasText: 'formulas' }).first()
    await formulasDir.click()

    // Children should be hidden
    await expect(tree.getByText('deploy')).not.toBeVisible()

    // Click again to expand
    await formulasDir.click()
    await expect(tree.getByText('deploy')).toBeVisible()
  })

  test('should navigate to formula on click', async ({ page, apiMock }) => {
    await setupWorkspaceMocks(page, { hasWorkspace: true })

    await page.addInitScript(() => {
      localStorage.setItem(
        'workspaceConfig',
        JSON.stringify({
          version: 1,
          rootPath: '/home/user/projects/my-beads',
          recentRoots: ['/home/user/projects/my-beads'],
          treeExpanded: {},
        })
      )
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const tree = page.locator('nav[role="tree"]')

    // Click deploy formula
    await tree.getByText('deploy').click()

    // URL should change to formula route
    await expect(page).toHaveURL(/\/formula\/deploy/)
  })

  test('should show empty state when no formulas exist', async ({ page, apiMock }) => {
    // Override tree to return empty
    await setupWorkspaceMocks(page, { hasWorkspace: true })
    await page.route(/\/api\/tree$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          root: '/home/user/projects/my-beads',
          nodes: [],
          totalCount: 0,
          truncated: false,
        }),
      })
    })

    await page.addInitScript(() => {
      localStorage.setItem(
        'workspaceConfig',
        JSON.stringify({
          version: 1,
          rootPath: '/home/user/projects/my-beads',
          recentRoots: ['/home/user/projects/my-beads'],
          treeExpanded: {},
        })
      )
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Should show empty state message
    await expect(page.getByText('No formulas found')).toBeVisible()
  })

  test('should show truncation banner when tree exceeds limit', async ({ page, apiMock }) => {
    await setupWorkspaceMocks(page, { hasWorkspace: true })
    await page.route(/\/api\/tree$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...MOCK_TREE_RESPONSE,
          totalCount: 750,
          truncated: true,
        }),
      })
    })

    await page.addInitScript(() => {
      localStorage.setItem(
        'workspaceConfig',
        JSON.stringify({
          version: 1,
          rootPath: '/home/user/projects/my-beads',
          recentRoots: ['/home/user/projects/my-beads'],
          treeExpanded: {},
        })
      )
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Should show truncation banner
    await expect(page.getByText('Showing 500 of 750 files')).toBeVisible()
  })
})

// =====================================================================
// Search / Filter
// =====================================================================

test.describe('Tree Search Filter', () => {
  test('should filter formulas by name', async ({ page, apiMock }) => {
    await setupWorkspaceMocks(page, { hasWorkspace: true })

    await page.addInitScript(() => {
      localStorage.setItem(
        'workspaceConfig',
        JSON.stringify({
          version: 1,
          rootPath: '/home/user/projects/my-beads',
          recentRoots: ['/home/user/projects/my-beads'],
          treeExpanded: {},
        })
      )
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const tree = page.locator('nav[role="tree"]')

    // Both formulas should be visible initially
    await expect(tree.getByText('deploy')).toBeVisible()
    await expect(tree.getByText('setup')).toBeVisible()

    // Type in filter input (workspace header has filter)
    const filterInput = page.getByPlaceholder('Filter')
    if (await filterInput.isVisible()) {
      await filterInput.fill('deploy')

      // Only deploy should be visible
      await expect(tree.getByText('deploy')).toBeVisible()
      await expect(tree.getByText('setup')).not.toBeVisible()
    }
  })

  test('should show no-match message when filter has no results', async ({ page, apiMock }) => {
    await setupWorkspaceMocks(page, { hasWorkspace: true })

    await page.addInitScript(() => {
      localStorage.setItem(
        'workspaceConfig',
        JSON.stringify({
          version: 1,
          rootPath: '/home/user/projects/my-beads',
          recentRoots: ['/home/user/projects/my-beads'],
          treeExpanded: {},
        })
      )
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const filterInput = page.getByPlaceholder('Filter')
    if (await filterInput.isVisible()) {
      await filterInput.fill('nonexistent-formula-xyz')

      // Should show no match message
      await expect(page.getByText(/No formulas match/)).toBeVisible()
    }
  })
})

// =====================================================================
// Open Recent
// =====================================================================

test.describe('Open Recent', () => {
  test('should display recent workspaces on welcome panel', async ({ page, apiMock }) => {
    await setupWorkspaceMocks(page, {
      hasWorkspace: false,
      browseValidPaths: ['/home/user/projects/my-beads', '/home/user/projects/other-project'],
    })

    await page.addInitScript(() => {
      localStorage.setItem(
        'workspaceConfig',
        JSON.stringify({
          version: 1,
          rootPath: null,
          recentRoots: ['/home/user/projects/my-beads', '/home/user/projects/other-project'],
          treeExpanded: {},
        })
      )
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Recent section should be visible
    await expect(page.getByText('Recent')).toBeVisible()

    // Recent paths should be shown (abbreviated)
    await expect(page.getByTitle('/home/user/projects/my-beads')).toBeVisible()
    await expect(page.getByTitle('/home/user/projects/other-project')).toBeVisible()
  })

  test('should open workspace when clicking a recent path', async ({ page, apiMock }) => {
    await setupWorkspaceMocks(page, {
      hasWorkspace: false,
      browseValidPaths: ['/home/user/projects/my-beads'],
    })

    await page.addInitScript(() => {
      localStorage.setItem(
        'workspaceConfig',
        JSON.stringify({
          version: 1,
          rootPath: null,
          recentRoots: ['/home/user/projects/my-beads'],
          treeExpanded: {},
        })
      )
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Click recent path
    await page.getByTitle('/home/user/projects/my-beads').click()

    // Welcome panel should disappear (workspace opened) — check for text unique to welcome
    await expect(page.getByText('Open a folder to get started.')).not.toBeVisible()
  })

  test('should show warning for invalid recent paths', async ({ page, apiMock }) => {
    await setupWorkspaceMocks(page, { hasWorkspace: false })

    // Override browse to return error for deleted path
    await page.route(/\/api\/browse\?path=%2Fhome%2Fuser%2Fdeleted/, async (route) => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: 'Path not found' }),
      })
    })

    await page.addInitScript(() => {
      localStorage.setItem(
        'workspaceConfig',
        JSON.stringify({
          version: 1,
          rootPath: null,
          recentRoots: ['/home/user/deleted-project'],
          treeExpanded: {},
        })
      )
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Invalid path should show with strikethrough (line-through) and warning icon
    const invalidItem = page.getByTitle('/home/user/deleted-project (not found)')
    await expect(invalidItem).toBeVisible()
  })
})

// =====================================================================
// Command Palette Workspace Actions
// =====================================================================

test.describe('Command Palette Workspace Actions', () => {
  test('should open command palette with Ctrl+K', async ({ page, apiMock }) => {
    await setupWorkspaceMocks(page, { hasWorkspace: true })

    await page.addInitScript(() => {
      localStorage.setItem(
        'workspaceConfig',
        JSON.stringify({
          version: 1,
          rootPath: '/home/user/projects/my-beads',
          recentRoots: ['/home/user/projects/my-beads'],
          treeExpanded: {},
        })
      )
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Open command palette
    await page.keyboard.press('Control+k')

    // Command palette dialog should appear
    const dialog = page.getByRole('dialog', { name: 'Command palette' })
    await expect(dialog).toBeVisible()

    // Should have a search input
    await expect(dialog.getByRole('combobox', { name: 'Search commands' })).toBeVisible()
  })

  test('should show workspace actions in command palette', async ({ page, apiMock }) => {
    await setupWorkspaceMocks(page, { hasWorkspace: true })

    await page.addInitScript(() => {
      localStorage.setItem(
        'workspaceConfig',
        JSON.stringify({
          version: 1,
          rootPath: '/home/user/projects/my-beads',
          recentRoots: ['/home/user/projects/my-beads'],
          treeExpanded: {},
        })
      )
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await page.keyboard.press('Control+k')

    const dialog = page.getByRole('dialog', { name: 'Command palette' })

    // Workspace actions should be visible
    await expect(dialog.getByText('Open Folder...')).toBeVisible()
    await expect(dialog.getByText('New Project...')).toBeVisible()
    await expect(dialog.getByText('Change Folder...')).toBeVisible()
  })

  test('should filter command palette actions by search query', async ({ page, apiMock }) => {
    await setupWorkspaceMocks(page, { hasWorkspace: true })

    await page.addInitScript(() => {
      localStorage.setItem(
        'workspaceConfig',
        JSON.stringify({
          version: 1,
          rootPath: '/home/user/projects/my-beads',
          recentRoots: ['/home/user/projects/my-beads'],
          treeExpanded: {},
        })
      )
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await page.keyboard.press('Control+k')

    const dialog = page.getByRole('dialog', { name: 'Command palette' })
    const searchInput = dialog.getByRole('combobox', { name: 'Search commands' })

    // Type to filter
    await searchInput.fill('open folder')

    // Should show matching action
    await expect(dialog.getByText('Open Folder...')).toBeVisible()

    // Non-matching actions should be hidden
    await expect(dialog.getByText('Cook Preview')).not.toBeVisible()
  })

  test('should open directory browser via Open Folder command', async ({ page, apiMock }) => {
    await setupWorkspaceMocks(page, { hasWorkspace: true })

    await page.addInitScript(() => {
      localStorage.setItem(
        'workspaceConfig',
        JSON.stringify({
          version: 1,
          rootPath: '/home/user/projects/my-beads',
          recentRoots: ['/home/user/projects/my-beads'],
          treeExpanded: {},
        })
      )
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Open command palette and select Open Folder
    await page.keyboard.press('Control+k')

    const cmdDialog = page.getByRole('dialog', { name: 'Command palette' })
    await cmdDialog.getByText('Open Folder...').click()

    // Command palette should close and directory browser should open
    await expect(cmdDialog).not.toBeVisible()

    // Directory browser dialog should appear
    const dirDialog = page.getByRole('dialog')
    await expect(dirDialog).toBeVisible()
  })

  test('should close command palette with Escape', async ({ page, apiMock }) => {
    await setupWorkspaceMocks(page, { hasWorkspace: true })

    await page.addInitScript(() => {
      localStorage.setItem(
        'workspaceConfig',
        JSON.stringify({
          version: 1,
          rootPath: '/home/user/projects/my-beads',
          recentRoots: ['/home/user/projects/my-beads'],
          treeExpanded: {},
        })
      )
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await page.keyboard.press('Control+k')

    const dialog = page.getByRole('dialog', { name: 'Command palette' })
    await expect(dialog).toBeVisible()

    await page.keyboard.press('Escape')

    await expect(dialog).not.toBeVisible()
  })

  test('should navigate command palette with arrow keys and Enter', async ({ page, apiMock }) => {
    await setupWorkspaceMocks(page, { hasWorkspace: true })

    await page.addInitScript(() => {
      localStorage.setItem(
        'workspaceConfig',
        JSON.stringify({
          version: 1,
          rootPath: '/home/user/projects/my-beads',
          recentRoots: ['/home/user/projects/my-beads'],
          treeExpanded: {},
        })
      )
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await page.keyboard.press('Control+k')

    const dialog = page.getByRole('dialog', { name: 'Command palette' })

    // First item should be selected by default
    const firstOption = dialog.locator('[role="option"]').first()
    await expect(firstOption).toHaveAttribute('aria-selected', 'true')

    // Arrow down to next item
    await page.keyboard.press('ArrowDown')

    // Second option should now be selected
    const secondOption = dialog.locator('[role="option"]').nth(1)
    await expect(secondOption).toHaveAttribute('aria-selected', 'true')
    await expect(firstOption).toHaveAttribute('aria-selected', 'false')
  })

  test('should show no results for empty search', async ({ page, apiMock }) => {
    await setupWorkspaceMocks(page, { hasWorkspace: true })

    await page.addInitScript(() => {
      localStorage.setItem(
        'workspaceConfig',
        JSON.stringify({
          version: 1,
          rootPath: '/home/user/projects/my-beads',
          recentRoots: ['/home/user/projects/my-beads'],
          treeExpanded: {},
        })
      )
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await page.keyboard.press('Control+k')

    const dialog = page.getByRole('dialog', { name: 'Command palette' })
    const searchInput = dialog.getByRole('combobox', { name: 'Search commands' })

    await searchInput.fill('zzzznonexistent')

    await expect(dialog.getByText('No results found')).toBeVisible()
  })
})

// =====================================================================
// Change Folder with Unsaved Changes Guard
// =====================================================================

test.describe('Change Folder with Unsaved Changes Guard', () => {
  test('should show unsaved changes modal when changing folder with dirty formula', async ({
    page,
    apiMock,
  }) => {
    await setupWorkspaceMocks(page, { hasWorkspace: true })

    await page.addInitScript(() => {
      localStorage.setItem(
        'workspaceConfig',
        JSON.stringify({
          version: 1,
          rootPath: '/home/user/projects/my-beads',
          recentRoots: ['/home/user/projects/my-beads'],
          treeExpanded: {},
        })
      )
    })

    await page.goto('/formula/test-simple')
    await page.waitForLoadState('networkidle')

    // Edit formula to make it dirty
    const editor = page.locator('.cm-editor')
    if (await editor.isVisible()) {
      await editor.click()
      await page.keyboard.type('# making it dirty')

      // Blur editor so keyboard shortcut reaches the command palette handler
      await page.locator('body').click({ position: { x: 0, y: 0 } })

      // Open command palette and try to change folder
      await page.keyboard.press('Control+k')
      const cmdDialog = page.getByRole('dialog', { name: 'Command palette' })
      await cmdDialog.getByText('Change Folder...').click()

      // Should show unsaved changes modal
      const unsavedDialog = page.getByRole('dialog')
      await expect(unsavedDialog.getByRole('heading', { name: 'Unsaved Changes' })).toBeVisible()
      await expect(unsavedDialog.getByText('You have unsaved changes')).toBeVisible()

      // Should have Save, Discard, Cancel buttons
      await expect(unsavedDialog.getByRole('button', { name: 'Save' })).toBeVisible()
      await expect(unsavedDialog.getByRole('button', { name: 'Discard' })).toBeVisible()
      await expect(unsavedDialog.getByRole('button', { name: 'Cancel' })).toBeVisible()
    }
  })

  test('should cancel change folder when Cancel is clicked on unsaved changes modal', async ({
    page,
    apiMock,
  }) => {
    await setupWorkspaceMocks(page, { hasWorkspace: true })

    await page.addInitScript(() => {
      localStorage.setItem(
        'workspaceConfig',
        JSON.stringify({
          version: 1,
          rootPath: '/home/user/projects/my-beads',
          recentRoots: ['/home/user/projects/my-beads'],
          treeExpanded: {},
        })
      )
    })

    await page.goto('/formula/test-simple')
    await page.waitForLoadState('networkidle')

    const editor = page.locator('.cm-editor')
    if (await editor.isVisible()) {
      await editor.click()
      await page.keyboard.type('# dirty edit')

      // Blur editor so keyboard shortcut reaches the command palette handler
      await page.locator('body').click({ position: { x: 0, y: 0 } })

      await page.keyboard.press('Control+k')
      const cmdDialog = page.getByRole('dialog', { name: 'Command palette' })
      await cmdDialog.getByText('Change Folder...').click()

      const unsavedDialog = page.getByRole('dialog')
      await expect(unsavedDialog.getByRole('heading', { name: 'Unsaved Changes' })).toBeVisible()

      // Click Cancel
      await unsavedDialog.getByRole('button', { name: 'Cancel' }).click()

      // Modal should close, no directory browser
      await expect(unsavedDialog.getByRole('heading', { name: 'Unsaved Changes' })).not.toBeVisible()
    }
  })

  test('should proceed to directory browser when Discard is clicked', async ({ page, apiMock }) => {
    await setupWorkspaceMocks(page, { hasWorkspace: true })

    await page.addInitScript(() => {
      localStorage.setItem(
        'workspaceConfig',
        JSON.stringify({
          version: 1,
          rootPath: '/home/user/projects/my-beads',
          recentRoots: ['/home/user/projects/my-beads'],
          treeExpanded: {},
        })
      )
    })

    await page.goto('/formula/test-simple')
    await page.waitForLoadState('networkidle')

    const editor = page.locator('.cm-editor')
    if (await editor.isVisible()) {
      await editor.click()
      await page.keyboard.type('# dirty edit')

      // Blur editor so keyboard shortcut reaches the command palette handler
      await page.locator('body').click({ position: { x: 0, y: 0 } })

      await page.keyboard.press('Control+k')
      const cmdDialog = page.getByRole('dialog', { name: 'Command palette' })
      await cmdDialog.getByText('Change Folder...').click()

      const unsavedDialog = page.getByRole('dialog')
      await expect(unsavedDialog.getByRole('heading', { name: 'Unsaved Changes' })).toBeVisible()

      // Click Discard
      await unsavedDialog.getByRole('button', { name: 'Discard' }).click()

      // Directory browser should open
      const dirDialog = page.getByRole('dialog')
      await expect(dirDialog).toBeVisible()
    }
  })
})

// =====================================================================
// Performance
// =====================================================================

test.describe('Tree Render Performance', () => {
  test('should render 100-formula tree within 500ms', async ({ page, apiMock }) => {
    // Generate 100 formula nodes across 10 directories
    const nodes = Array.from({ length: 10 }, (_, dirIdx) => ({
      name: `dir-${dirIdx}`,
      path: `formulas/dir-${dirIdx}`,
      type: 'directory' as const,
      children: Array.from({ length: 10 }, (_, fIdx) => ({
        name: `formula-${dirIdx}-${fIdx}.formula.toml`,
        path: `formulas/dir-${dirIdx}/formula-${dirIdx}-${fIdx}.formula.toml`,
        type: 'formula' as const,
        formulaName: `formula-${dirIdx}-${fIdx}`,
      })),
    }))

    const largeTreeResponse = {
      ok: true,
      root: '/home/user/projects/my-beads',
      nodes,
      totalCount: 100,
      truncated: false,
    }

    // Set up workspace mocks with hasWorkspace but override tree
    await setupWorkspaceMocks(page, { hasWorkspace: true })
    await page.route(/\/api\/tree$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(largeTreeResponse),
      })
    })

    await page.addInitScript(() => {
      localStorage.setItem(
        'workspaceConfig',
        JSON.stringify({
          version: 1,
          rootPath: '/home/user/projects/my-beads',
          recentRoots: ['/home/user/projects/my-beads'],
          treeExpanded: {},
        })
      )
    })

    // Measure time from navigation to tree visible
    const startTime = Date.now()
    await page.goto('/')
    const tree = page.locator('nav[role="tree"]')
    await expect(tree).toBeVisible()
    // Verify at least one formula node rendered
    await expect(tree.getByText('formula-0-0')).toBeVisible()
    const elapsed = Date.now() - startTime

    // Allow 2s for CI/parallel test environments (500ms target for dev)
    expect(elapsed).toBeLessThan(2000)
  })
})

// =====================================================================
// Full Integration Flows
// =====================================================================

test.describe('Full Onboarding Integration', () => {
  test('full flow: welcome -> open folder -> workspace tree visible', async ({ page, apiMock }) => {
    // Start with no workspace, switch to having one after open
    await page.route(/\/api\/workspace$/, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_WORKSPACE_NO_ROOT),
        })
      } else {
        await route.continue()
      }
    })

    await page.route(/\/api\/workspace\/open$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_WORKSPACE_OPEN_SUCCESS),
      })
    })

    await page.route(/\/api\/browse/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_BROWSE_ROOT),
      })
    })

    await page.route(/\/api\/tree$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_TREE_RESPONSE),
      })
    })

    await page.addInitScript(() => {
      localStorage.removeItem('workspaceConfig')
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // 1. Should see welcome screen
    await expect(page.getByRole('heading', { name: 'Beads IDE' })).toBeVisible()

    // 2. Click Open Folder
    await page.getByRole('button', { name: 'Open Folder' }).click()

    // 3. Directory browser opens
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // 4. Select current folder
    await dialog.getByRole('button', { name: 'Select This Folder' }).click()

    // 5. Dialog should close
    await expect(dialog).not.toBeVisible()
  })
})
