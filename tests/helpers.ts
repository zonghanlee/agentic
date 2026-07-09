// tests/helpers.ts
// Shared helper utilities for Playwright tests.

import { Page } from '@playwright/test'

/**
 * Signs in with the given username via a WebAuthn passkey, using a CDP virtual
 * authenticator so the browser can complete registration without real hardware.
 * Registering an existing username simply attaches a new passkey to that
 * account and logs in — safe to call repeatedly across test files.
 */
export async function signIn(page: Page, username = 'testuser') {
  const context = page.context()
  const cdp = await context.newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  try {
    await cdp.send('WebAuthn.addVirtualAuthenticator', {
      options: {
        protocol: 'ctap2',
        transport: 'internal',
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
      },
    })
  } catch {
    // A virtual authenticator already exists for this browser context (e.g. signing
    // in as a second user within the same test) — Chrome allows only one, and it can
    // hold credentials for multiple usernames, so we just reuse it.
  }

  await page.goto('/login')
  await page.fill('[data-testid="username-input"]', username)
  await page.click('[data-testid="register-btn"]')
  await page.waitForURL('/')
}

/**
 * Deletes all todos for the currently signed-in user via the API.
 * Call this in afterEach to keep tests isolated from one another.
 */
export async function clearTodos(page: Page) {
  const todos: { id: number }[] = await page.evaluate(async () => {
    const res = await fetch('/api/todos')
    if (!res.ok) return []
    return res.json()
  })
  await Promise.all(
    todos.map((t) =>
      page.evaluate(async (id) => {
        await fetch(`/api/todos/${id}`, { method: 'DELETE' })
      }, t.id)
    )
  )
}

/** Deletes all tags for the currently signed-in user via the API. */
export async function clearTags(page: Page) {
  const tags: { id: number }[] = await page.evaluate(async () => {
    const res = await fetch('/api/tags')
    if (!res.ok) return []
    return res.json()
  })
  await Promise.all(
    tags.map((t) =>
      page.evaluate(async (id) => {
        await fetch(`/api/tags/${id}`, { method: 'DELETE' })
      }, t.id)
    )
  )
}

/** Deletes all templates for the currently signed-in user via the API. */
export async function clearTemplates(page: Page) {
  const templates: { id: number }[] = await page.evaluate(async () => {
    const res = await fetch('/api/templates')
    if (!res.ok) return []
    return res.json()
  })
  await Promise.all(
    templates.map((t) =>
      page.evaluate(async (id) => {
        await fetch(`/api/templates/${id}`, { method: 'DELETE' })
      }, t.id)
    )
  )
}

/** Creates a todo via the UI form and waits for it to appear. */
export async function createTodo(
  page: Page,
  title: string,
  priority: 'high' | 'medium' | 'low' = 'medium',
  dueDate?: string
) {
  await page.fill('[data-testid="todo-input"]', title)
  await page.selectOption('[data-testid="priority-select"]', priority)
  if (dueDate) {
    await page.fill('[data-testid="due-date-input"]', dueDate)
  }
  await page.click('[data-testid="add-todo-btn"]')
  // Wait for the new todo to appear
  await page.locator(`[data-testid="todo-title"]`).filter({ hasText: title }).waitFor()
}
