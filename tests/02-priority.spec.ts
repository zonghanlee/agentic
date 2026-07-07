// tests/02-priority.spec.ts
// E2E tests for PRP 02 — Priority System.

import { test, expect } from '@playwright/test'
import { signIn, createTodo, clearTodos } from './helpers'

test.describe('Priority System', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, 'testuser-priority')
    await clearTodos(page)
  })

  test.afterEach(async ({ page }) => {
    await clearTodos(page)
  })

  test('create form defaults to medium priority', async ({ page }) => {
    await expect(page.locator('[data-testid="priority-select"]')).toHaveValue('medium')
  })

  test('creates a high-priority todo with a red badge', async ({ page }) => {
    await createTodo(page, 'Critical task', 'high')
    const badge = page
      .locator('[data-testid="priority-badge"]')
      .filter({ hasText: 'High' })
      .first()
    await expect(badge).toBeVisible()
    await expect(badge).toHaveClass(/text-red/)
  })

  test('creates a medium-priority todo with a yellow badge', async ({ page }) => {
    await createTodo(page, 'Normal task', 'medium')
    const badge = page
      .locator('[data-testid="priority-badge"]')
      .filter({ hasText: 'Medium' })
      .first()
    await expect(badge).toHaveClass(/text-yellow/)
  })

  test('creates a low-priority todo with a blue badge', async ({ page }) => {
    await createTodo(page, 'Low task', 'low')
    const badge = page
      .locator('[data-testid="priority-badge"]')
      .filter({ hasText: 'Low' })
      .first()
    await expect(badge).toHaveClass(/text-blue/)
  })

  test('high-priority todos sort before lower-priority todos', async ({ page }) => {
    await createTodo(page, 'Low item', 'low')
    await createTodo(page, 'High item', 'high')

    // Wait for both to be visible
    await expect(page.locator('[data-testid="todo-title"]').filter({ hasText: 'High item' })).toBeVisible()
    await expect(page.locator('[data-testid="todo-title"]').filter({ hasText: 'Low item' })).toBeVisible()

    const titles = await page
      .locator('[data-testid="pending-section"] [data-testid="todo-title"]')
      .allTextContents()

    const highIndex = titles.findIndex((t) => t.includes('High item'))
    const lowIndex = titles.findIndex((t) => t.includes('Low item'))
    expect(highIndex).toBeLessThan(lowIndex)
  })

  test('priority filter shows only high-priority todos', async ({ page }) => {
    await createTodo(page, 'High filter test', 'high')
    await createTodo(page, 'Low filter test', 'low')

    await page.selectOption('[data-testid="priority-filter"]', 'high')

    const badges = await page.locator('[data-testid="priority-badge"]').allTextContents()
    expect(badges.every((b) => b === 'High')).toBe(true)
    await expect(
      page.locator('[data-testid="todo-title"]').filter({ hasText: 'Low filter test' })
    ).not.toBeVisible()
  })

  test('selecting "All Priorities" restores the full list', async ({ page }) => {
    await createTodo(page, 'Restore high', 'high')
    await createTodo(page, 'Restore low', 'low')

    await page.selectOption('[data-testid="priority-filter"]', 'high')
    await page.selectOption('[data-testid="priority-filter"]', 'all')

    await expect(page.locator('[data-testid="todo-title"]').filter({ hasText: 'Restore high' })).toBeVisible()
    await expect(page.locator('[data-testid="todo-title"]').filter({ hasText: 'Restore low' })).toBeVisible()
  })

  test('changing priority via edit modal updates the badge', async ({ page }) => {
    await createTodo(page, 'Change priority', 'medium')
    await page.locator('[data-testid^="edit-todo-"]').first().click()
    await page.selectOption('[data-testid="edit-priority-select"]', 'low')
    await page.click('[data-testid="update-todo-btn"]')

    const badge = page
      .locator('[data-testid="todo-title"]')
      .filter({ hasText: 'Change priority' })
      .locator('../..')
      .locator('[data-testid="priority-badge"]')
    await expect(badge).toHaveText('Low')
  })

  test('priority badge visible on completed todos', async ({ page }) => {
    await createTodo(page, 'Complete with badge', 'high')
    await page.locator('[data-testid^="todo-checkbox-"]').first().click()
    const completedBadge = page
      .locator('[data-testid="completed-section"] [data-testid="priority-badge"]')
      .first()
    await expect(completedBadge).toBeVisible()
    await expect(completedBadge).toHaveText('High')
  })

  test('priority filter with active filter and completing a todo — filter stays active', async ({ page }) => {
    await createTodo(page, 'Keep filter active', 'high')
    await page.selectOption('[data-testid="priority-filter"]', 'high')
    await page.locator('[data-testid^="todo-checkbox-"]').first().click()
    // Filter should still be 'high'
    await expect(page.locator('[data-testid="priority-filter"]')).toHaveValue('high')
  })
})
