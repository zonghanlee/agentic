// tests/08-search-filtering.spec.ts
// E2E tests for PRP 08 — Search & Filtering.

import { test, expect } from '@playwright/test'
import { signIn, createTodo, clearTodos, clearTags } from './helpers'

test.describe('Search & Filtering', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, 'testuser-search')
    await clearTodos(page)
    await clearTags(page)
  })

  test.afterEach(async ({ page }) => {
    await clearTodos(page)
    await clearTags(page)
  })

  // -------------------------------------------------------------------------
  // Basic search
  // -------------------------------------------------------------------------

  test('search filters by title', async ({ page }) => {
    await createTodo(page, 'Team meeting')
    await createTodo(page, 'Buy groceries')

    await page.fill('[data-testid="search-input"]', 'meeting')

    await expect(page.locator('[data-testid="todo-title"]').filter({ hasText: 'Team meeting' })).toBeVisible()
    await expect(page.locator('[data-testid="todo-title"]').filter({ hasText: 'Buy groceries' })).not.toBeVisible()
  })

  test('search is case-insensitive', async ({ page }) => {
    await createTodo(page, 'Project Alpha')
    await page.fill('[data-testid="search-input"]', 'ALPHA')
    await expect(page.locator('[data-testid="todo-title"]').filter({ hasText: 'Project Alpha' })).toBeVisible()
  })

  test('search matches subtask titles', async ({ page }) => {
    await createTodo(page, 'Project Alpha')
    const id = await page.evaluate(async () => {
      const res = await fetch('/api/todos')
      const todos: { id: number }[] = await res.json()
      return todos[0].id
    })
    await page.request.post(`/api/todos/${id}/subtasks`, { data: { title: 'Send report' } })
    await page.reload()

    await page.fill('[data-testid="search-input"]', 'send report')
    await expect(page.locator('[data-testid="todo-title"]').filter({ hasText: 'Project Alpha' })).toBeVisible()
  })

  test('clear search button empties the input', async ({ page }) => {
    await createTodo(page, 'Something to find')
    await page.fill('[data-testid="search-input"]', 'xyz')
    await page.click('[data-testid="clear-search-btn"]')
    await expect(page.locator('[data-testid="search-input"]')).toHaveValue('')
  })

  // -------------------------------------------------------------------------
  // Combined AND-logic filters
  // -------------------------------------------------------------------------

  test('search and priority filter combine with AND logic', async ({ page }) => {
    await createTodo(page, 'Urgent report', 'high')
    await createTodo(page, 'Urgent laundry', 'low')

    await page.fill('[data-testid="search-input"]', 'urgent')
    await page.selectOption('[data-testid="priority-filter"]', 'high')

    await expect(page.locator('[data-testid="todo-title"]').filter({ hasText: 'Urgent report' })).toBeVisible()
    await expect(page.locator('[data-testid="todo-title"]').filter({ hasText: 'Urgent laundry' })).not.toBeVisible()
  })

  // -------------------------------------------------------------------------
  // Advanced filters
  // -------------------------------------------------------------------------

  test('advanced panel expands and collapses on toggle', async ({ page }) => {
    await page.click('[data-testid="advanced-toggle"]')
    await expect(page.locator('[data-testid="completion-filter"]')).toBeVisible()
    await page.click('[data-testid="advanced-toggle"]')
    await expect(page.locator('[data-testid="completion-filter"]')).not.toBeVisible()
  })

  test('completion status filter shows only completed todos', async ({ page }) => {
    await createTodo(page, 'Done task')
    await createTodo(page, 'Not done task')
    await page.locator('[data-testid^="todo-checkbox-"]').first().click()

    await page.click('[data-testid="advanced-toggle"]')
    await page.selectOption('[data-testid="completion-filter"]', 'completed')

    await expect(page.locator('[data-testid="completed-section"]')).toBeVisible()
    await expect(page.locator('[data-testid="pending-section"]')).not.toBeVisible()
  })

  test('date range filter excludes todos without a due date', async ({ page }) => {
    await createTodo(page, 'No due date task')

    await page.click('[data-testid="advanced-toggle"]')
    await page.fill('[data-testid="date-from-input"]', '2020-01-01')

    await expect(page.locator('[data-testid="todo-title"]').filter({ hasText: 'No due date task' })).not.toBeVisible()
  })

  // -------------------------------------------------------------------------
  // Clear all
  // -------------------------------------------------------------------------

  test('clear all resets every active filter', async ({ page }) => {
    await createTodo(page, 'Reset me')
    await page.fill('[data-testid="search-input"]', 'xyz')
    await page.selectOption('[data-testid="priority-filter"]', 'high')

    await page.click('[data-testid="clear-all-btn"]')

    await expect(page.locator('[data-testid="search-input"]')).toHaveValue('')
    await expect(page.locator('[data-testid="priority-filter"]')).toHaveValue('all')
    await expect(page.locator('[data-testid="todo-title"]').filter({ hasText: 'Reset me' })).toBeVisible()
  })

  test('save filter button only appears when a filter is active', async ({ page }) => {
    await expect(page.locator('[data-testid="save-filter-btn"]')).not.toBeVisible()
    await page.fill('[data-testid="search-input"]', 'work')
    await expect(page.locator('[data-testid="save-filter-btn"]')).toBeVisible()
  })

  // -------------------------------------------------------------------------
  // Presets
  // -------------------------------------------------------------------------

  test('saves and applies a filter preset', async ({ page }) => {
    await createTodo(page, 'Work item')

    await page.fill('[data-testid="search-input"]', 'work')
    await page.click('[data-testid="save-filter-btn"]')
    await page.fill('[data-testid="preset-name-input"]', 'Work Items')
    await page.click('[data-testid="save-preset-confirm"]')

    await page.click('[data-testid="clear-all-btn"]')
    await expect(page.locator('[data-testid="search-input"]')).toHaveValue('')

    await page.click('[data-testid="advanced-toggle"]')
    await page.click('[data-testid="preset-Work Items"]')

    await expect(page.locator('[data-testid="search-input"]')).toHaveValue('work')
  })

  test('preset survives a page refresh', async ({ page }) => {
    await page.fill('[data-testid="search-input"]', 'persisted')
    await page.click('[data-testid="save-filter-btn"]')
    await page.fill('[data-testid="preset-name-input"]', 'Persisted Preset')
    await page.click('[data-testid="save-preset-confirm"]')

    await page.reload()
    await page.click('[data-testid="advanced-toggle"]')
    await expect(page.locator('[data-testid="preset-Persisted Preset"]')).toBeVisible()
  })

  test('deleting a preset removes it from the panel', async ({ page }) => {
    await page.fill('[data-testid="search-input"]', 'temp preset')
    await page.click('[data-testid="save-filter-btn"]')
    await page.fill('[data-testid="preset-name-input"]', 'Temp Preset')
    await page.click('[data-testid="save-preset-confirm"]')

    await page.click('[data-testid="advanced-toggle"]')
    await page.click('[data-testid="delete-preset-Temp Preset"]')

    await expect(page.locator('[data-testid="preset-Temp Preset"]')).not.toBeVisible()
  })

  // -------------------------------------------------------------------------
  // Section counts
  // -------------------------------------------------------------------------

  test('section counts reflect the filtered result set', async ({ page }) => {
    await createTodo(page, 'Alpha task')
    await createTodo(page, 'Beta task')

    await page.fill('[data-testid="search-input"]', 'alpha')

    await expect(page.locator('[data-testid="pending-section"]')).toContainText('Pending (1)')
  })
})
