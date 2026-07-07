// tests/helpers.ts
// Shared helper utilities for Playwright tests.

import { Page } from '@playwright/test'

/** Signs in with the given username (creates account if it doesn't exist). */
export async function signIn(page: Page, username = 'testuser') {
  await page.goto('/login')
  await page.fill('[data-testid="username-input"]', username)
  await page.click('[data-testid="login-btn"]')
  await page.waitForURL('/')
}

/**
 * Deletes all todos for the currently signed-in user via the API.
 * Call this in afterEach to keep tests isolated from one another.
 */
export async function clearTodos(page: Page) {
  const todos: { id: number }[] = await page.evaluate(async () => {
    const res = await fetch('/api/todos')
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
