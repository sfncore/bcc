import { type Page, test as base, expect } from '@playwright/test'

/**
 * Mock CLI response types matching @beads-ide/shared types
 */
export interface MockBead {
  id: string
  title: string
  description: string
  status: 'open' | 'in_progress' | 'hooked' | 'closed' | 'blocked'
  priority: number
  issue_type: 'task' | 'epic' | 'bug' | 'agent'
  labels: string[]
  owner: string
  assignee: string
  created_at: string
  updated_at: string
  created_by: string
  comment_count: number
}

export interface MockCookResult {
  ok: boolean
  formula?: string
  version?: number
  type?: string
  phase?: string
  vars?: Record<string, MockVarDef>
  steps?: MockProtoStep[]
  source?: string
  unbound_vars?: string[]
  error?: string
  stderr?: string
  exit_code?: number
}

export interface MockProtoStep {
  id: string
  title: string
  description: string
  priority: number
  needs?: string[]
}

export interface MockVarDef {
  description: string
  required?: boolean
  default?: string
  enum?: string[]
  type?: 'string' | 'int' | 'bool'
  pattern?: string
}

export interface MockFormula {
  name: string
  path: string
  searchPath: string
  searchPathLabel: string
}

export interface MockFormulaListResponse {
  ok: true
  formulas: MockFormula[]
  count: number
  searchPaths: string[]
}

/**
 * Test formula fixtures
 * Note: The path must match what the formula route generates: `formulas/${name}.toml`
 */
export const TEST_FORMULAS = {
  simple: {
    name: 'test-simple',
    path: 'formulas/test-simple.toml',
    searchPath: 'formulas/',
    searchPathLabel: 'Project Formulas',
    content: `[formula]
name = "test-simple"
description = "A simple test formula"

[vars]
project_name = { description = "Name of the project", required = true }

[[steps]]
id = "step-1"
title = "First step"
description = "Do the first thing"
type = "task"
`,
    cookResult: {
      ok: true,
      formula: 'test-simple',
      version: 1,
      type: 'workflow',
      phase: 'liquid',
      source: 'formulas/test-simple.formula.toml',
      steps: [
        {
          id: 'step-1',
          title: 'First step',
          description: 'Do the first thing',
          priority: 2,
        },
      ],
      vars: {
        project_name: {
          description: 'Name of the project',
          required: true,
        },
      },
    } as MockCookResult,
  },
  multiStep: {
    name: 'test-multi',
    path: 'formulas/test-multi.toml',
    searchPath: 'formulas/',
    searchPathLabel: 'Project Formulas',
    content: `[formula]
name = "test-multi"
description = "A multi-step test formula"

[vars]
project_name = { description = "Project name", required = true }
owner = { description = "Owner name", required = false, default = "team" }

[[steps]]
id = "step-1"
title = "Setup"
description = "Initial setup"
type = "task"

[[steps]]
id = "step-2"
title = "Implementation"
description = "Main implementation"
type = "task"
needs = ["step-1"]

[[steps]]
id = "step-3"
title = "Testing"
description = "Write tests"
type = "task"
needs = ["step-2"]
`,
    cookResult: {
      ok: true,
      formula: 'test-multi',
      version: 1,
      type: 'workflow',
      phase: 'liquid',
      source: 'formulas/test-multi.formula.toml',
      steps: [
        { id: 'step-1', title: 'Setup', description: 'Initial setup', priority: 2 },
        {
          id: 'step-2',
          title: 'Implementation',
          description: 'Main implementation',
          priority: 2,
          needs: ['step-1'],
        },
        {
          id: 'step-3',
          title: 'Testing',
          description: 'Write tests',
          priority: 2,
          needs: ['step-2'],
        },
      ],
      vars: {
        project_name: { description: 'Project name', required: true },
        owner: { description: 'Owner name', required: false, default: 'team' },
      },
    } as MockCookResult,
  },
  withError: {
    name: 'test-error',
    path: 'formulas/test-error.toml',
    searchPath: 'formulas/',
    searchPathLabel: 'Project Formulas',
    content: `[formula]
name = "test-error"
# Invalid TOML - missing closing bracket
`,
    cookResult: {
      ok: false,
      error: 'TOML parse error',
      stderr: 'Error: Invalid TOML syntax at line 3',
      exit_code: 1,
    } as MockCookResult,
  },
  unboundVars: {
    name: 'test-unbound',
    path: 'formulas/test-unbound.toml',
    searchPath: 'formulas/',
    searchPathLabel: 'Project Formulas',
    content: `[formula]
name = "test-unbound"

[vars]
required_var = { description = "A required var", required = true }
another_var = { description = "Another required var", required = true }

[[steps]]
id = "step-1"
title = "Do something"
type = "task"
`,
    cookResult: {
      ok: false,
      formula: 'test-unbound',
      unbound_vars: ['required_var', 'another_var'],
      error: 'Unbound required variables',
    } as MockCookResult,
  },
}

/**
 * Mock beads for results view testing
 */
export const TEST_BEADS: MockBead[] = [
  {
    id: 'bcc-test-1',
    title: 'First test bead',
    description: 'Description for first bead',
    status: 'open',
    priority: 1,
    issue_type: 'task',
    labels: ['test', 'e2e'],
    owner: 'test-user',
    assignee: '',
    created_at: '2026-02-22T00:00:00Z',
    updated_at: '2026-02-22T00:00:00Z',
    created_by: 'test-user',
    comment_count: 0,
  },
  {
    id: 'bcc-test-2',
    title: 'Second test bead',
    description: 'Description for second bead',
    status: 'in_progress',
    priority: 2,
    issue_type: 'task',
    labels: ['test'],
    owner: 'test-user',
    assignee: 'test-assignee',
    created_at: '2026-02-22T00:00:00Z',
    updated_at: '2026-02-22T01:00:00Z',
    created_by: 'test-user',
    comment_count: 2,
  },
  {
    id: 'bcc-test-epic',
    title: 'Test Epic',
    description: 'An epic bead for testing',
    status: 'open',
    priority: 1,
    issue_type: 'epic',
    labels: ['epic', 'test'],
    owner: 'test-user',
    assignee: '',
    created_at: '2026-02-22T00:00:00Z',
    updated_at: '2026-02-22T00:00:00Z',
    created_by: 'test-user',
    comment_count: 0,
  },
]

/**
 * API mock helper - intercepts backend API calls and returns mock responses
 */
export class ApiMock {
  private page: Page
  private formulas: typeof TEST_FORMULAS = TEST_FORMULAS
  private beads: MockBead[] = TEST_BEADS

  constructor(page: Page) {
    this.page = page
  }

  /**
   * Set up all API route mocks
   */
  async setup(): Promise<void> {
    // Mock health check (both relative and absolute URLs)
    await this.page.route(/\/api\/health$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, bd_version: '1.0.0-test' }),
      })
    })

    // Mock formula list - return the FormulaListResponse shape (exact /api/formulas path)
    await this.page.route(/\/api\/formulas$/, async (route) => {
      if (route.request().method() === 'GET') {
        const formulaList: MockFormula[] = Object.values(this.formulas).map((f) => ({
          name: f.name,
          path: f.path,
          searchPath: f.searchPath,
          searchPathLabel: f.searchPathLabel,
        }))
        const response: MockFormulaListResponse = {
          ok: true,
          formulas: formulaList,
          count: formulaList.length,
          searchPaths: ['formulas/', '.beads/formulas/'],
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(response),
        })
      } else {
        await route.continue()
      }
    })

    // Mock individual formula fetch (matches /api/formulas/:name)
    await this.page.route(/\/api\/formulas\/[^/]+$/, async (route) => {
      const url = route.request().url()
      const method = route.request().method()

      // Extract formula name from URL
      const match = url.match(/\/api\/formulas\/([^/?]+)/)
      const formulaName = match ? match[1] : null

      if (method === 'GET' && formulaName) {
        const formula = Object.values(this.formulas).find(
          (f) => f.name === formulaName || f.name.startsWith(formulaName)
        )
        if (formula) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              ok: true,
              name: formula.name,
              path: formula.path,
              content: formula.content,
            }),
          })
        } else {
          await route.fulfill({
            status: 404,
            body: JSON.stringify({ ok: false, error: 'Formula not found' }),
          })
        }
      } else if (method === 'PUT') {
        // Mock save - just return success
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true }),
        })
      } else {
        await route.continue()
      }
    })

    // Mock cook endpoint
    await this.page.route(/\/api\/cook$/, async (route) => {
      const body = route.request().postDataJSON()
      const formulaPath = body?.formula_path
      const formula = Object.values(this.formulas).find((f) => f.path === formulaPath)

      if (formula) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(formula.cookResult),
        })
      } else {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ ok: false, error: 'Formula not found' }),
        })
      }
    })

    // Mock beads list
    await this.page.route(/\/api\/beads$/, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true, beads: this.beads, count: this.beads.length }),
        })
      } else {
        await route.continue()
      }
    })

    // Mock individual bead fetch
    await this.page.route(/\/api\/beads\/[^/]+$/, async (route) => {
      const url = route.request().url()
      const match = url.match(/\/api\/beads\/([^/?]+)/)
      const beadId = match ? match[1] : null

      const bead = this.beads.find((b) => b.id === beadId)
      if (bead) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true, bead }),
        })
      } else {
        await route.fulfill({
          status: 404,
          body: JSON.stringify({ ok: false, error: 'Bead not found' }),
        })
      }
    })

    // Mock workspace endpoint (GET returns no-root, POST returns success)
    await this.page.route(/\/api\/workspace$/, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ ok: false, error: 'No workspace root configured', code: 'NO_ROOT' }),
        })
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true }),
        })
      }
    })

    // Mock workspace open/init endpoints
    await this.page.route(/\/api\/workspace\/(open|init)$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      })
    })

    // Mock tree endpoint
    await this.page.route(/\/api\/tree$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          root: '/test/workspace',
          nodes: [
            {
              name: 'formulas',
              path: 'formulas',
              type: 'directory',
              children: Object.values(this.formulas).map((f) => ({
                name: `${f.name}.formula.toml`,
                path: f.path,
                type: 'formula',
                formulaName: f.name,
              })),
            },
          ],
          totalCount: Object.keys(this.formulas).length,
          truncated: false,
        }),
      })
    })

    // Mock browse endpoint
    await this.page.route(/\/api\/browse/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          path: '/test',
          parent: '/',
          entries: [{ name: 'workspace', path: '/test/workspace', type: 'directory' }],
        }),
      })
    })

    // Mock pour endpoint
    await this.page.route(/\/api\/pour$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          molecule_id: 'test-mol-1',
          beads_created: 3,
        }),
      })
    })

    // Mock sling endpoint
    await this.page.route(/\/api\/sling$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          dispatched: true,
          target: 'test-polecat',
        }),
      })
    })

    // Mock burn endpoint
    await this.page.route(/\/api\/burn$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      })
    })

    // Mock graph metrics
    await this.page.route(/\/api\/graph\/metrics$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          metrics: {
            generated_at: new Date().toISOString(),
            data_hash: 'test-hash',
            pagerank: [
              { id: 'bcc-test-1', title: 'First test bead', score: 0.5, rank: 1 },
              { id: 'bcc-test-2', title: 'Second test bead', score: 0.3, rank: 2 },
            ],
            betweenness: [{ id: 'bcc-test-epic', title: 'Test Epic', score: 0.7, rank: 1 }],
            density: 0.05,
            cycles: { count: 0, cycles: [] },
            stats: { nodes: 3, edges: 2, density: 0.05 },
          },
        }),
      })
    })
  }

  /**
   * Add custom formula for testing
   */
  addFormula(key: string, formula: (typeof TEST_FORMULAS)['simple']): void {
    ;(this.formulas as Record<string, typeof formula>)[key] = formula
  }

  /**
   * Set custom beads list
   */
  setBeads(beads: MockBead[]): void {
    this.beads = beads
  }
}

/**
 * Extended test fixtures for Beads IDE E2E tests
 *
 * Provides:
 * - apiMock: An ApiMock instance for mocking backend API responses
 * - testFormulas: Reference to test formula fixtures
 * - testBeads: Reference to test bead fixtures
 */
type TestFixtures = {
  apiMock: ApiMock
  testFormulas: typeof TEST_FORMULAS
  testBeads: MockBead[]
}

// Create the extended test with fixtures
export const test = base.extend<TestFixtures>({
  // API mock fixture - sets up mocks before each test
  apiMock: async ({ page }, use) => {
    const mock = new ApiMock(page)
    await mock.setup()
    await use(mock)
  },

  // Test formulas fixture
  // biome-ignore lint/correctness/noEmptyPattern: Playwright fixture pattern
  testFormulas: async ({}, use) => {
    await use(TEST_FORMULAS)
  },

  // Test beads fixture
  // biome-ignore lint/correctness/noEmptyPattern: Playwright fixture pattern
  testBeads: async ({}, use) => {
    await use(TEST_BEADS)
  },
})

// Re-export expect for convenience
export { expect }
