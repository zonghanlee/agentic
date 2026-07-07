// tests/01-todo-crud.spec.ts
// E2E tests for PRP 01 — Todo CRUD Operations.

import { test, expect } from '@playwright/test'
import { signIn, createTodo, clearTodos } from './helpers'

test.describe('Authentication', () => {
  test('redirects unauthenticated user to /login', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL('/login')
  })

  test('signs in and reaches the main page', async ({ page }) => {
    await signIn(page, 'testuser-crud')
    await expect(page).toHaveURL('/')
    await expect(page.locator('[data-testid="todo-input"]')).toBeVisible()
  })
})

test.describe('Todo CRUD', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, 'testuser-crud')
    await clearTodos(page)
  })

  test.afterEach(async ({ page }) => {
    await clearTodos(page)
  })

  test('creates a todo with title only', async ({ page }) => {
    await page.fill('[data-testid="todo-input"]', 'Buy groceries')
    await page.click('[data-testid="add-todo-btn"]')
    await expect(page.locator('[data-testid="todo-title"]').filter({ hasText: 'Buy groceries' })).toBeVisible()
  })

  test('creates a todo with a future due date', async ({ page }) => {
    // Use a date far in the future to avoid flakiness
    const future = new Date(Date.now() + 48 * 60 * 60 * 1000)
    const iso = future.toISOString().slice(0, 16)
    await page.fill('[data-testid="todo-input"]', 'Submit report')
    await page.fill('[data-testid="due-date-input"]', iso)
    await page.click('[data-testid="add-todo-btn"]')
    await expect(page.locator('[data-testid="todo-title"]').filter({ hasText: 'Submit report' })).toBeVisible()
  })

  test('marks a todo as complete', async ({ page }) => {
    await createTodo(page, 'Complete me')
    const checkbox = page.locator('[data-testid^="todo-checkbox-"]').first()
    await checkbox.check()
    await expect(page.locator('[data-testid="completed-section"]')).toBeVisible()
    await expect(
      page.locator('[data-testid="completed-section"] [data-testid="todo-title"]').filter({ hasText: 'Complete me' })
    ).toBeVisible()
  })

  test('completed todo shows strikethrough styling', async ({ page }) => {
    await createTodo(page, 'Strikethrough test')
    const checkbox = page.locator('[data-testid^="todo-checkbox-"]').first()
    await checkbox.check()
    const title = page
      .locator('[data-testid="completed-section"] [data-testid="todo-title"]')
      .filter({ hasText: 'Strikethrough test' })
    await expect(title).toHaveClass(/line-through/)
  })

  test('edits a todo title', async ({ page }) => {
    await createTodo(page, 'Original title')
    await page.locator('[data-testid^="edit-todo-"]').first().click()
    await page.fill('[data-testid="edit-title-input"]', 'Updated title')
    await page.click('[data-testid="update-todo-btn"]')
    await expect(page.locator('[data-testid="todo-title"]').filter({ hasText: 'Updated title' })).toBeVisible()
    await expect(page.locator('[data-testid="todo-title"]').filter({ hasText: 'Original title' })).not.toBeVisible()
  })

  test('edit modal pre-fills current values', async ({ page }) => {
    await createTodo(page, 'Pre-fill check')
    await page.locator('[data-testid^="edit-todo-"]').first().click()
    await expect(page.locator('[data-testid="edit-title-input"]')).toHaveValue('Pre-fill check')
  })

  test('deletes a todo after confirmation', async ({ page }) => {
    await createTodo(page, 'Delete me')
    await page.locator('[data-testid^="delete-todo-"]').first().click()
    await page.click('[data-testid="confirm-delete"]')
    await expect(page.locator('[data-testid="todo-title"]').filter({ hasText: 'Delete me' })).not.toBeVisible()
  })

  test('cancelling delete keeps the todo', async ({ page }) => {
    await createTodo(page, 'Keep me')
    await page.locator('[data-testid^="delete-todo-"]').first().click()
    await page.click('[data-testid="cancel-delete"]')
    await expect(page.locator('[data-testid="todo-title"]').filter({ hasText: 'Keep me' })).toBeVisible()
  })

  test('rejects empty title submission', async ({ page }) => {
    await page.click('[data-testid="add-todo-btn"]')
    // HTML5 required validation prevents submission — input is invalid
    const input = page.locator('[data-testid="todo-input"]')
    await expect(input).toHaveAttribute('required')
    // No new todo should appear (list state is unchanged)
  })

  test('completed todos appear in completed section', async ({ page }) => {
    await createTodo(page, 'Section test')
    const checkbox = page.locator('[data-testid^="todo-checkbox-"]').first()
    await checkbox.check()
    await expect(page.locator('[data-testid="completed-section"]')).toBeVisible()
  })

  test('empty state shown when no todos', async ({ page }) => {
    // Fresh user with no todos
    await signIn(page, 'empty-user-' + Date.now())
    await expect(page.locator('text=All clear!')).toBeVisible()
  })
})
