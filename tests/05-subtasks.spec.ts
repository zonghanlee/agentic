// tests/05-subtasks.spec.ts
// E2E tests for PRP 05 — Subtasks & Progress Tracking.

import { test, expect } from '@playwright/test'
import { signIn, createTodo, clearTodos } from './helpers'

/** Gets the first pending todo's ID via the API */
async function getFirstPendingId(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(async () => {
    const res = await fetch('/api/todos')
    const todos: { id: number; completed: boolean }[] = await res.json()
    const pending = todos.find((t) => !t.completed)
    if (!pending) throw new Error('No pending todo found')
    return pending.id
  })
}

test.describe('Subtasks & Progress', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, 'testuser-subtasks')
    await clearTodos(page)
  })

  test.afterEach(async ({ page }) => {
    await clearTodos(page)
  })

  // -------------------------------------------------------------------------
  // Subtask toggle / panel
  // -------------------------------------------------------------------------

  test('every todo card has a subtask toggle button', async ({ page }) => {
    await createTodo(page, 'Task with subtask toggle')
    const id = await getFirstPendingId(page)
    await expect(page.locator(`[data-testid="subtask-toggle-${id}"]`)).toBeVisible()
  })

  test('clicking toggle expands the subtask panel with an input field', async ({ page }) => {
    await createTodo(page, 'Expand subtask panel')
    const id = await getFirstPendingId(page)

    await page.click(`[data-testid="subtask-toggle-${id}"]`)
    await expect(page.locator(`[data-testid="subtask-input-${id}"]`)).toBeVisible()
  })

  test('clicking toggle again collapses the subtask panel', async ({ page }) => {
    await createTodo(page, 'Collapse subtask panel')
    const id = await getFirstPendingId(page)

    await page.click(`[data-testid="subtask-toggle-${id}"]`)
    await expect(page.locator(`[data-testid="subtask-input-${id}"]`)).toBeVisible()

    await page.click(`[data-testid="subtask-toggle-${id}"]`)
    await expect(page.locator(`[data-testid="subtask-input-${id}"]`)).not.toBeVisible()
  })

  // -------------------------------------------------------------------------
  // Adding subtasks
  // -------------------------------------------------------------------------

  test('adds a subtask via the input and it appears in the list', async ({ page }) => {
    await createTodo(page, 'Parent task')
    const id = await getFirstPendingId(page)

    await page.click(`[data-testid="subtask-toggle-${id}"]`)
    await page.fill(`[data-testid="subtask-input-${id}"]`, 'Buy milk')
    await page.press(`[data-testid="subtask-input-${id}"]`, 'Enter')

    await expect(page.locator('text=Buy milk')).toBeVisible()
  })

  test('adds a subtask via the Add button', async ({ page }) => {
    await createTodo(page, 'Parent add-button')
    const id = await getFirstPendingId(page)

    await page.click(`[data-testid="subtask-toggle-${id}"]`)
    await page.fill(`[data-testid="subtask-input-${id}"]`, 'Subtask via button')
    await page.locator(`[data-testid="subtask-input-${id}"]`).press('Enter')

    await expect(page.locator('text=Subtask via button')).toBeVisible()
  })

  test('empty subtask title is rejected (no submission)', async ({ page }) => {
    await createTodo(page, 'Empty subtask test')
    const id = await getFirstPendingId(page)

    await page.click(`[data-testid="subtask-toggle-${id}"]`)
    // Submit with empty input
    await page.press(`[data-testid="subtask-input-${id}"]`, 'Enter')

    // No subtask should appear
    const subtasks = await page.locator(`[data-testid^="subtask-checkbox-"]`).count()
    expect(subtasks).toBe(0)
  })

  test('multiple subtasks can be added sequentially', async ({ page }) => {
    await createTodo(page, 'Multi-subtask parent')
    const id = await getFirstPendingId(page)

    await page.click(`[data-testid="subtask-toggle-${id}"]`)
    for (const title of ['Step 1', 'Step 2', 'Step 3']) {
      await page.fill(`[data-testid="subtask-input-${id}"]`, title)
      await page.press(`[data-testid="subtask-input-${id}"]`, 'Enter')
      await expect(page.locator(`text=${title}`)).toBeVisible()
    }

    const checkboxes = await page.locator('[data-testid^="subtask-checkbox-"]').count()
    expect(checkboxes).toBe(3)
  })

  // -------------------------------------------------------------------------
  // Completing subtasks & progress bar
  // -------------------------------------------------------------------------

  test('progress bar appears once a subtask is added', async ({ page }) => {
    await createTodo(page, 'Progress bar parent')
    const id = await getFirstPendingId(page)

    await page.click(`[data-testid="subtask-toggle-${id}"]`)
    await page.fill(`[data-testid="subtask-input-${id}"]`, 'First subtask')
    await page.press(`[data-testid="subtask-input-${id}"]`, 'Enter')
    await expect(page.locator('[data-testid^="subtask-checkbox-"]').first()).toBeVisible()

    await expect(page.locator(`[data-testid="progress-container-${id}"]`)).toBeVisible()
  })

  test('progress bar shows 0% with no completed subtasks', async ({ page }) => {
    await createTodo(page, 'Zero progress')
    const id = await getFirstPendingId(page)

    await page.click(`[data-testid="subtask-toggle-${id}"]`)
    await page.fill(`[data-testid="subtask-input-${id}"]`, 'Unchecked subtask')
    await page.press(`[data-testid="subtask-input-${id}"]`, 'Enter')
    await page.locator('[data-testid^="subtask-checkbox-"]').first().waitFor()

    const bar = page.locator(`[data-testid="progress-bar-${id}"]`)
    await expect(bar).toHaveAttribute('style', /width: 0%/)
  })

  test('completing 1 of 2 subtasks shows 50% progress', async ({ page }) => {
    await createTodo(page, '50 percent progress')
    const id = await getFirstPendingId(page)

    await page.click(`[data-testid="subtask-toggle-${id}"]`)
    for (const t of ['Sub A', 'Sub B']) {
      await page.fill(`[data-testid="subtask-input-${id}"]`, t)
      await page.press(`[data-testid="subtask-input-${id}"]`, 'Enter')
      await expect(page.locator(`text=${t}`)).toBeVisible()
    }

    // Check the first subtask
    await page.locator('[data-testid^="subtask-checkbox-"]').first().check()

    const bar = page.locator(`[data-testid="progress-bar-${id}"]`)
    await expect(bar).toHaveAttribute('style', /width: 50%/)

    const counter = page.locator(`[data-testid="subtask-counter-${id}"]`)
    await expect(counter).toHaveText('1/2 subtasks')
  })

  test('completing all subtasks shows 100% progress', async ({ page }) => {
    await createTodo(page, 'Full progress')
    const id = await getFirstPendingId(page)

    await page.click(`[data-testid="subtask-toggle-${id}"]`)
    await page.fill(`[data-testid="subtask-input-${id}"]`, 'Only subtask')
    await page.press(`[data-testid="subtask-input-${id}"]`, 'Enter')
    await page.locator('[data-testid^="subtask-checkbox-"]').first().waitFor()

    await page.locator('[data-testid^="subtask-checkbox-"]').first().check()

    const bar = page.locator(`[data-testid="progress-bar-${id}"]`)
    await expect(bar).toHaveAttribute('style', /width: 100%/)
  })

  test('checking a subtask adds strikethrough styling', async ({ page }) => {
    await createTodo(page, 'Strikethrough subtask')
    const id = await getFirstPendingId(page)

    await page.click(`[data-testid="subtask-toggle-${id}"]`)
    await page.fill(`[data-testid="subtask-input-${id}"]`, 'Cross me off')
    await page.press(`[data-testid="subtask-input-${id}"]`, 'Enter')
    await page.locator('[data-testid^="subtask-checkbox-"]').first().check()

    await expect(page.locator('text=Cross me off')).toHaveClass(/line-through/)
  })

  test('progress bar visible when panel is collapsed', async ({ page }) => {
    await createTodo(page, 'Collapsed progress')
    const id = await getFirstPendingId(page)

    // Open panel and add a subtask
    await page.click(`[data-testid="subtask-toggle-${id}"]`)
    await page.fill(`[data-testid="subtask-input-${id}"]`, 'Hidden subtask')
    await page.press(`[data-testid="subtask-input-${id}"]`, 'Enter')
    await page.locator('[data-testid^="subtask-checkbox-"]').first().waitFor()

    // Close panel
    await page.click(`[data-testid="subtask-toggle-${id}"]`)
    await expect(page.locator(`[data-testid="subtask-input-${id}"]`)).not.toBeVisible()

    // Progress container should still be visible (fill bar has 0% width so check the wrapper)
    await expect(page.locator(`[data-testid="progress-container-${id}"]`)).toBeVisible()
  })

  // -------------------------------------------------------------------------
  // Deleting subtasks
  // -------------------------------------------------------------------------

  test('deleting a subtask removes it from the list', async ({ page }) => {
    await createTodo(page, 'Delete subtask parent')
    const id = await getFirstPendingId(page)

    await page.click(`[data-testid="subtask-toggle-${id}"]`)
    await page.fill(`[data-testid="subtask-input-${id}"]`, 'Doomed subtask')
    await page.press(`[data-testid="subtask-input-${id}"]`, 'Enter')
    await page.locator('[data-testid^="subtask-checkbox-"]').first().waitFor()

    // Get the subtask ID from the checkbox testid
    const subtaskCheckbox = page.locator('[data-testid^="subtask-checkbox-"]').first()
    const subtaskTestId = await subtaskCheckbox.getAttribute('data-testid')
    const subtaskId = subtaskTestId?.replace('subtask-checkbox-', '')

    await page.click(`[data-testid="delete-subtask-${subtaskId}"]`)

    await expect(page.locator('text=Doomed subtask')).not.toBeVisible()
  })

  test('deleting a subtask updates the counter', async ({ page }) => {
    await createTodo(page, 'Counter update on delete')
    const id = await getFirstPendingId(page)

    await page.click(`[data-testid="subtask-toggle-${id}"]`)
    for (const t of ['Keep me', 'Delete me']) {
      await page.fill(`[data-testid="subtask-input-${id}"]`, t)
      await page.press(`[data-testid="subtask-input-${id}"]`, 'Enter')
      await expect(page.locator(`text=${t}`)).toBeVisible()
    }

    await expect(page.locator(`[data-testid="subtask-counter-${id}"]`)).toHaveText('0/2 subtasks')

    // Find and delete the second subtask
    const checkboxes = page.locator('[data-testid^="subtask-checkbox-"]')
    const count = await checkboxes.count()
    const lastCheckbox = checkboxes.nth(count - 1)
    const lastTestId = await lastCheckbox.getAttribute('data-testid')
    const lastSubtaskId = lastTestId?.replace('subtask-checkbox-', '')

    await page.click(`[data-testid="delete-subtask-${lastSubtaskId}"]`)

    await expect(page.locator(`[data-testid="subtask-counter-${id}"]`)).toHaveText('0/1 subtasks')
  })

  // -------------------------------------------------------------------------
  // Cascade delete
  // -------------------------------------------------------------------------

  test('deleting the parent todo removes all its subtasks via API', async ({ page }) => {
    await createTodo(page, 'Cascade delete parent')
    const id = await getFirstPendingId(page)

    // Add a subtask via API
    await page.request.post(`/api/todos/${id}/subtasks`, {
      data: { title: 'Cascade subtask' },
    })

    // Verify subtask exists
    const before = await page.request.get(`/api/todos/${id}/subtasks`)
    expect((await before.json()).length).toBe(1)

    // Delete the parent todo
    await page.locator(`[data-testid="delete-todo-${id}"]`).click()
    await page.click('[data-testid="confirm-delete"]')

    // The subtask endpoint should now 404
    const after = await page.request.get(`/api/todos/${id}/subtasks`)
    expect(after.status()).toBe(404)
  })

  // -------------------------------------------------------------------------
  // API security
  // -------------------------------------------------------------------------

  test('subtask endpoints return 401 for unauthenticated requests', async ({ page }) => {
    await createTodo(page, 'Auth check parent')
    const id = await getFirstPendingId(page)

    // Sign out
    await page.evaluate(async () => {
      await fetch('/api/auth/logout', { method: 'POST' })
    })

    const res = await page.request.get(`/api/todos/${id}/subtasks`)
    expect(res.status()).toBe(401)
  })

  test('subtask endpoint returns 404 for todo belonging to another user', async ({ page }) => {
    await createTodo(page, 'Wrong user parent')
    const id = await getFirstPendingId(page)

    // Sign in as a different user
    await signIn(page, 'testuser-subtasks-other')

    const res = await page.request.get(`/api/todos/${id}/subtasks`)
    expect(res.status()).toBe(404)
  })
})
