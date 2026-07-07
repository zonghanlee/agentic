// tests/04-reminders.spec.ts
// E2E tests for PRP 04 — Reminders & Notifications.

import { test, expect } from '@playwright/test'
import { signIn, clearTodos } from './helpers'

function futureISO(hoursFromNow = 48): string {
  return new Date(Date.now() + hoursFromNow * 3_600_000).toISOString().slice(0, 16)
}

test.describe('Reminders & Notifications', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, 'testuser-reminders')
    await clearTodos(page)
  })

  test.afterEach(async ({ page }) => {
    await clearTodos(page)
  })

  // -------------------------------------------------------------------------
  // Reminder dropdown state
  // -------------------------------------------------------------------------

  test('reminder dropdown is disabled when no due date is set', async ({ page }) => {
    await expect(page.locator('[data-testid="reminder-select"]')).toBeDisabled()
  })

  test('reminder dropdown becomes enabled after setting a due date', async ({ page }) => {
    await page.fill('[data-testid="due-date-input"]', futureISO())
    await expect(page.locator('[data-testid="reminder-select"]')).toBeEnabled()
  })

  test('reminder dropdown contains all 7 preset options plus None', async ({ page }) => {
    await page.fill('[data-testid="due-date-input"]', futureISO())
    const options = await page.locator('[data-testid="reminder-select"] option').allTextContents()
    expect(options).toContain('None')
    expect(options).toContain('15 minutes before')
    expect(options).toContain('30 minutes before')
    expect(options).toContain('1 hour before')
    expect(options).toContain('2 hours before')
    expect(options).toContain('1 day before')
    expect(options).toContain('2 days before')
    expect(options).toContain('1 week before')
    expect(options).toHaveLength(8) // None + 7 presets
  })

  test('reminder dropdown defaults to None', async ({ page }) => {
    await page.fill('[data-testid="due-date-input"]', futureISO())
    await expect(page.locator('[data-testid="reminder-select"]')).toHaveValue('')
  })

  // -------------------------------------------------------------------------
  // Reminder badge display
  // -------------------------------------------------------------------------

  test('🔔 1h badge visible after setting 1 hour reminder', async ({ page }) => {
    await page.fill('[data-testid="todo-input"]', 'Reminder badge test')
    await page.fill('[data-testid="due-date-input"]', futureISO())
    await page.selectOption('[data-testid="reminder-select"]', '60')
    await page.click('[data-testid="add-todo-btn"]')
    await page.locator('[data-testid="todo-title"]').filter({ hasText: 'Reminder badge test' }).waitFor()
    await expect(page.locator('text=🔔 1h').first()).toBeVisible()
  })

  test('🔔 1d badge visible after setting 1 day reminder', async ({ page }) => {
    await page.fill('[data-testid="todo-input"]', 'Day reminder test')
    await page.fill('[data-testid="due-date-input"]', futureISO())
    await page.selectOption('[data-testid="reminder-select"]', '1440')
    await page.click('[data-testid="add-todo-btn"]')
    await page.locator('[data-testid="todo-title"]').filter({ hasText: 'Day reminder test' }).waitFor()
    await expect(page.locator('text=🔔 1d').first()).toBeVisible()
  })

  test('no 🔔 badge when no reminder is set', async ({ page }) => {
    await page.fill('[data-testid="todo-input"]', 'No reminder task')
    await page.click('[data-testid="add-todo-btn"]')
    await page.locator('[data-testid="todo-title"]').filter({ hasText: 'No reminder task' }).waitFor()
    // Scope to the content area — the header button also has 🔔 and is always visible
    await expect(page.locator('[data-testid="pending-section"]').locator('text=🔔')).not.toBeVisible()
  })

  test('edit modal reminder dropdown respects due date enablement', async ({ page }) => {
    // Create todo without due date
    await page.fill('[data-testid="todo-input"]', 'Edit reminder test')
    await page.click('[data-testid="add-todo-btn"]')
    await page.locator('[data-testid="todo-title"]').filter({ hasText: 'Edit reminder test' }).waitFor()

    // Open edit modal
    await page.locator('[data-testid^="edit-todo-"]').first().click()
    await expect(page.locator('[data-testid="edit-reminder-select"]')).toBeDisabled()

    // Set a due date in the modal
    await page.fill('[data-testid="edit-due-date-input"]', futureISO())
    await expect(page.locator('[data-testid="edit-reminder-select"]')).toBeEnabled()
  })

  test('setting reminder via edit modal shows badge on card', async ({ page }) => {
    await page.fill('[data-testid="todo-input"]', 'Edit reminder badge')
    await page.fill('[data-testid="due-date-input"]', futureISO())
    await page.click('[data-testid="add-todo-btn"]')
    await page.locator('[data-testid="todo-title"]').filter({ hasText: 'Edit reminder badge' }).waitFor()

    await page.locator('[data-testid^="edit-todo-"]').first().click()
    await page.selectOption('[data-testid="edit-reminder-select"]', '30')
    await page.click('[data-testid="update-todo-btn"]')

    await expect(page.locator('text=🔔 30m').first()).toBeVisible()
  })

  // -------------------------------------------------------------------------
  // Notification API
  // -------------------------------------------------------------------------

  test('GET /api/notifications/check returns 401 when not authenticated', async ({ page }) => {
    // Make an unauthenticated request from a fresh context
    const res = await page.request.get('/api/notifications/check')
    // We are signed in from beforeEach, so sign out first
    await page.evaluate(async () => {
      await fetch('/api/auth/logout', { method: 'POST' })
    })
    const res2 = await page.request.get('/api/notifications/check')
    expect(res2.status()).toBe(401)
  })

  test('GET /api/notifications/check returns empty array when no reminders due', async ({ page }) => {
    // Create a todo with a reminder set far in the future
    const res = await page.request.post('/api/todos', {
      data: {
        title: 'Far future reminder',
        due_date: new Date(Date.now() + 30 * 24 * 3_600_000).toISOString(), // 30 days
        reminder_minutes: 60,
      },
    })
    expect(res.status()).toBe(201)

    const checkRes = await page.request.get('/api/notifications/check')
    expect(checkRes.status()).toBe(200)
    const pending = await checkRes.json()
    expect(Array.isArray(pending)).toBe(true)
    // Far-future todo should not be pending
    const ids = pending.map((t: { title: string }) => t.title)
    expect(ids).not.toContain('Far future reminder')
  })

  test('GET /api/notifications/check fires and marks sent for overdue reminder', async ({
    page,
  }) => {
    // Create a todo with due date 1 minute in the past and reminder 60 min
    // → reminder threshold = due - 60min = >60 min in the past → should fire
    const pastDue = new Date(Date.now() - 90 * 60_000).toISOString()
    const createRes = await page.request.post('/api/todos', {
      data: {
        title: 'Overdue reminder',
        due_date: pastDue,
        reminder_minutes: 60,
      },
    })
    expect(createRes.status()).toBe(201)
    const created = await createRes.json()

    // First check — should return the todo
    const check1 = await page.request.get('/api/notifications/check')
    const pending1: { id: number; title: string }[] = await check1.json()
    const found = pending1.find((t) => t.id === created.id)
    expect(found).toBeDefined()

    // Second check — last_notification_sent is now set, should NOT return it again
    const check2 = await page.request.get('/api/notifications/check')
    const pending2: { id: number }[] = await check2.json()
    expect(pending2.find((t) => t.id === created.id)).toBeUndefined()
  })

  test('completed todo is excluded from reminder check', async ({ page }) => {
    const pastDue = new Date(Date.now() - 90 * 60_000).toISOString()
    const createRes = await page.request.post('/api/todos', {
      data: { title: 'Completed reminder', due_date: pastDue, reminder_minutes: 60 },
    })
    const created = await createRes.json()

    // Mark it complete
    await page.request.put(`/api/todos/${created.id}`, {
      data: { completed: true },
    })

    const checkRes = await page.request.get('/api/notifications/check')
    const pending: { id: number }[] = await checkRes.json()
    expect(pending.find((t) => t.id === created.id)).toBeUndefined()
  })
})
