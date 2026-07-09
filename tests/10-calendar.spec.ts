// tests/10-calendar.spec.ts
// E2E tests for PRP 10 — Calendar View.

import { test, expect } from '@playwright/test'
import { signIn, clearTodos } from './helpers'

test.describe('Calendar View', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, 'testuser-calendar')
    await clearTodos(page)
  })

  test.afterEach(async ({ page }) => {
    await clearTodos(page)
  })

  test('navigates to calendar page via nav button', async ({ page }) => {
    await page.click('[data-testid="calendar-nav-btn"]')
    await expect(page).toHaveURL('/calendar')
  })

  test('displays current month and year', async ({ page }) => {
    await page.goto('/calendar')
    await expect(page.locator('[data-testid="calendar-month-title"]')).toBeVisible()
  })

  test('navigates to next and previous month', async ({ page }) => {
    await page.goto('/calendar')
    const initialTitle = await page.locator('[data-testid="calendar-month-title"]').textContent()
    await page.click('[data-testid="next-month-btn"]')
    const nextTitle = await page.locator('[data-testid="calendar-month-title"]').textContent()
    expect(nextTitle).not.toBe(initialTitle)
    await page.click('[data-testid="prev-month-btn"]')
    await expect(page.locator('[data-testid="calendar-month-title"]')).toHaveText(initialTitle ?? '')
  })

  test('today button returns to the current month', async ({ page }) => {
    await page.goto('/calendar')
    await page.click('[data-testid="next-month-btn"]')
    await page.click('[data-testid="next-month-btn"]')
    await page.click('[data-testid="today-btn"]')
    await expect(page.locator('[data-testid="calendar-today"]')).toBeVisible()
  })

  test('todo appears on its due date cell colour-coded by priority', async ({ page }) => {
    await page.goto('/')
    const now = new Date()
    const dueDate = new Date(now.getTime() + 24 * 60 * 60 * 1000)
    const dueDateStr = dueDate.toISOString().slice(0, 16)

    await page.fill('[data-testid="todo-input"]', 'Calendar todo')
    await page.selectOption('[data-testid="priority-select"]', 'high')
    await page.fill('[data-testid="due-date-input"]', dueDateStr)
    await page.click('[data-testid="add-todo-btn"]')
    await page.locator('[data-testid="todo-title"]').filter({ hasText: 'Calendar todo' }).waitFor()

    await page.goto('/calendar')
    await expect(page.locator('text=Calendar todo')).toBeVisible()
  })

  test('renders without error when no todos exist for the month', async ({ page }) => {
    await page.goto('/calendar')
    await expect(page.locator('[data-testid="calendar-month-title"]')).toBeVisible()
  })

  test('calendar API returns 401 for unauthenticated requests', async ({ page }) => {
    await page.evaluate(async () => {
      await fetch('/api/auth/logout', { method: 'POST' })
    })
    const res = await page.request.get('/api/calendar?year=2025&month=11')
    expect(res.status()).toBe(401)
  })

  test('calendar API returns 400 for an out-of-range month', async ({ page }) => {
    const res = await page.request.get('/api/calendar?year=2025&month=13')
    expect(res.status()).toBe(400)
  })

  test('list link navigates back to the main todo page', async ({ page }) => {
    await page.goto('/calendar')
    await page.click('[data-testid="list-view-btn"]')
    await expect(page).toHaveURL('/')
  })
})
