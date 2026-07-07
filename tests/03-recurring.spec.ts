// tests/03-recurring.spec.ts
// E2E tests for PRP 03 — Recurring Todos.

import { test, expect } from '@playwright/test'
import { signIn, clearTodos } from './helpers'

/** Returns a datetime-local string N hours from now */
function futureISO(hoursFromNow = 48): string {
  return new Date(Date.now() + hoursFromNow * 3_600_000).toISOString().slice(0, 16)
}

/** Creates a recurring todo via the UI form */
async function createRecurringTodo(
  page: import('@playwright/test').Page,
  title: string,
  pattern: 'daily' | 'weekly' | 'monthly' | 'yearly' = 'weekly'
) {
  const due = futureISO()
  await page.fill('[data-testid="todo-input"]', title)
  await page.fill('[data-testid="due-date-input"]', due)
  // Recurring checkbox is only enabled after a due date is set
  await page.check('[data-testid="recurring-checkbox"]')
  await page.selectOption('[data-testid="recurrence-pattern-select"]', pattern)
  await page.click('[data-testid="add-todo-btn"]')
  await page.locator('[data-testid="todo-title"]').filter({ hasText: title }).waitFor()
}

test.describe('Recurring Todos', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, 'testuser-recurring')
    await clearTodos(page)
  })

  test.afterEach(async ({ page }) => {
    await clearTodos(page)
  })

  test('recurring checkbox is disabled when no due date is set', async ({ page }) => {
    // Title filled but no due date → checkbox must be disabled
    await page.fill('[data-testid="todo-input"]', 'No date task')
    await expect(page.locator('[data-testid="recurring-checkbox"]')).toBeDisabled()
  })

  test('recurring checkbox becomes enabled after due date is set', async ({ page }) => {
    await page.fill('[data-testid="todo-input"]', 'Has date task')
    await page.fill('[data-testid="due-date-input"]', futureISO())
    await expect(page.locator('[data-testid="recurring-checkbox"]')).toBeEnabled()
  })

  test('recurrence pattern dropdown appears only when repeat is checked', async ({ page }) => {
    await page.fill('[data-testid="todo-input"]', 'Pattern visibility')
    await page.fill('[data-testid="due-date-input"]', futureISO())

    // Before checking — pattern select should not be visible
    await expect(page.locator('[data-testid="recurrence-pattern-select"]')).not.toBeVisible()

    await page.check('[data-testid="recurring-checkbox"]')

    // After checking — pattern select should be visible
    await expect(page.locator('[data-testid="recurrence-pattern-select"]')).toBeVisible()
  })

  test('creates a weekly recurring todo and shows 🔄 badge', async ({ page }) => {
    await createRecurringTodo(page, 'Weekly review', 'weekly')
    await expect(page.locator('text=🔄 weekly').first()).toBeVisible()
  })

  test('creates a daily recurring todo and shows correct badge', async ({ page }) => {
    await createRecurringTodo(page, 'Daily standup', 'daily')
    await expect(page.locator('text=🔄 daily').first()).toBeVisible()
  })

  test('non-recurring todo has no 🔄 badge', async ({ page }) => {
    await page.fill('[data-testid="todo-input"]', 'One-time task')
    await page.click('[data-testid="add-todo-btn"]')
    await page.locator('[data-testid="todo-title"]').filter({ hasText: 'One-time task' }).waitFor()
    await expect(page.locator('text=🔄').first()).not.toBeVisible()
  })

  test('completing a recurring todo creates the next instance in pending', async ({ page }) => {
    await createRecurringTodo(page, 'Recurring task', 'weekly')

    // Count pending todos before
    const pendingBefore = await page
      .locator('[data-testid="pending-section"] [data-testid="todo-title"]')
      .count()

    // Complete the recurring todo
    const checkbox = page.locator('[data-testid^="todo-checkbox-"]').first()
    await checkbox.check()

    // Wait for it to move to completed section
    await expect(
      page.locator('[data-testid="completed-section"] [data-testid="todo-title"]').filter({ hasText: 'Recurring task' })
    ).toBeVisible()

    // A new instance with the same title should now be in pending
    await expect(
      page.locator('[data-testid="pending-section"] [data-testid="todo-title"]').filter({ hasText: 'Recurring task' })
    ).toBeVisible()

    // Pending count should be same as before (old removed, new added)
    const pendingAfter = await page
      .locator('[data-testid="pending-section"] [data-testid="todo-title"]')
      .count()
    expect(pendingAfter).toBe(pendingBefore)
  })

  test('next recurring instance has same recurrence badge', async ({ page }) => {
    await createRecurringTodo(page, 'Monthly habit', 'monthly')

    const checkbox = page.locator('[data-testid^="todo-checkbox-"]').first()
    await checkbox.check()

    // Wait for the new instance to appear in pending with the recurrence badge
    await expect(
      page.locator('[data-testid="pending-section"]').locator('text=🔄 monthly').first()
    ).toBeVisible()
  })

  test('completing a non-recurring todo does not create a new instance', async ({ page }) => {
    await page.fill('[data-testid="todo-input"]', 'One-off task')
    await page.click('[data-testid="add-todo-btn"]')
    await page.locator('[data-testid="todo-title"]').filter({ hasText: 'One-off task' }).waitFor()

    const pendingBefore = await page
      .locator('[data-testid^="todo-checkbox-"]')
      .count()

    const checkbox = page.locator('[data-testid^="todo-checkbox-"]').first()
    await checkbox.check()

    // Give the page time to potentially add a new todo
    await page.waitForTimeout(500)

    // No new pending todo with same title should exist
    const pendingTitles = await page
      .locator('[data-testid="pending-section"] [data-testid="todo-title"]')
      .allTextContents()
    expect(pendingTitles.filter((t) => t.includes('One-off task'))).toHaveLength(0)
  })

  test('API validates recurring todo requires a due date', async ({ page }) => {
    const res = await page.request.post('/api/todos', {
      data: { title: 'Bad recurring', is_recurring: true },
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/due date/i)
  })

  test('API validates recurring todo requires a recurrence pattern', async ({ page }) => {
    const res = await page.request.post('/api/todos', {
      data: {
        title: 'Bad recurring',
        is_recurring: true,
        due_date: futureISO() + ':00.000Z',
      },
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/pattern/i)
  })
})
