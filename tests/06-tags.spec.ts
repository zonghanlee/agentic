// tests/06-tags.spec.ts
// E2E tests for PRP 06 — Tag System.

import { test, expect } from '@playwright/test'
import { signIn, createTodo, clearTodos, clearTags } from './helpers'

test.describe('Tag System', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, 'testuser-tags')
    await clearTodos(page)
    await clearTags(page)
  })

  test.afterEach(async ({ page }) => {
    await clearTodos(page)
    await clearTags(page)
  })

  // -------------------------------------------------------------------------
  // Tag CRUD via modal
  // -------------------------------------------------------------------------

  test('manage tags modal opens and closes', async ({ page }) => {
    await page.click('[data-testid="manage-tags-btn"]')
    await expect(page.locator('[data-testid="tag-name-input"]')).toBeVisible()
    await page.click('[data-testid="close-tag-modal"]')
    await expect(page.locator('[data-testid="tag-name-input"]')).not.toBeVisible()
  })

  test('creates a tag and it appears in the create form', async ({ page }) => {
    await page.click('[data-testid="manage-tags-btn"]')
    await page.fill('[data-testid="tag-name-input"]', 'Work')
    await page.click('[data-testid="create-tag-btn"]')
    await page.click('[data-testid="close-tag-modal"]')

    await expect(page.locator('[data-testid="tag-pill-Work"]')).toBeVisible()
  })

  test('duplicate tag name for the same user is rejected with an error', async ({ page }) => {
    await page.click('[data-testid="manage-tags-btn"]')
    await page.fill('[data-testid="tag-name-input"]', 'Urgent')
    await page.click('[data-testid="create-tag-btn"]')
    await expect(page.locator('[data-testid="tag-pill-Urgent"]').first()).toBeVisible()

    await page.fill('[data-testid="tag-name-input"]', 'Urgent')
    await page.click('[data-testid="create-tag-btn"]')

    await expect(page.locator('text=Tag name already exists')).toBeVisible()
  })

  test('editing a tag updates its name everywhere', async ({ page }) => {
    await page.click('[data-testid="manage-tags-btn"]')
    await page.fill('[data-testid="tag-name-input"]', 'Home');
    await page.click('[data-testid="create-tag-btn"]')
    await expect(page.locator('[data-testid="tag-pill-Home"]').first()).toBeVisible()

    await page.click('text=Edit')
    await page.fill('[data-testid="tag-name-input"]', 'House')
    await page.click('[data-testid="create-tag-btn"]')

    await expect(page.locator('[data-testid="tag-pill-House"]').first()).toBeVisible()
    await page.click('[data-testid="close-tag-modal"]')
    await expect(page.locator('[data-testid="tag-pill-House"]')).toBeVisible()
  })

  test('deleting a tag removes it from the tag list and the create form', async ({ page }) => {
    await page.click('[data-testid="manage-tags-btn"]')
    await page.fill('[data-testid="tag-name-input"]', 'Temp')
    await page.click('[data-testid="create-tag-btn"]')
    await expect(page.locator('[data-testid="tag-pill-Temp"]').first()).toBeVisible()

    await page.click('[data-testid="delete-tag-Temp"]')
    await page.click('[data-testid="close-tag-modal"]')

    await expect(page.locator('[data-testid="tag-pill-Temp"]')).not.toBeVisible()
  })

  // -------------------------------------------------------------------------
  // Applying tags to todos
  // -------------------------------------------------------------------------

  test('applies a tag to a todo on creation and shows it as a pill on the card', async ({ page }) => {
    await page.click('[data-testid="manage-tags-btn"]')
    await page.fill('[data-testid="tag-name-input"]', 'Meeting')
    await page.click('[data-testid="create-tag-btn"]')
    await page.click('[data-testid="close-tag-modal"]')

    await page.click('[data-testid="tag-pill-Meeting"]')
    await createTodo(page, 'Team sync')

    const card = page.locator('[data-testid="todo-title"]').filter({ hasText: 'Team sync' }).locator('..')
    await expect(card.locator('[data-testid="tag-pill-Meeting"]')).toBeVisible()
  })

  test('toggling tags in the edit modal updates the todo card', async ({ page }) => {
    await page.click('[data-testid="manage-tags-btn"]')
    await page.fill('[data-testid="tag-name-input"]', 'Later')
    await page.click('[data-testid="create-tag-btn"]')
    await page.click('[data-testid="close-tag-modal"]')

    await createTodo(page, 'Untagged task')
    await page.locator('[data-testid^="edit-todo-"]').first().click()
    await page.locator('[data-testid="edit-modal"] [data-testid="tag-pill-Later"]').click()
    await page.click('[data-testid="update-todo-btn"]')

    const card = page.locator('[data-testid="todo-title"]').filter({ hasText: 'Untagged task' }).locator('..')
    await expect(card.locator('[data-testid="tag-pill-Later"]')).toBeVisible()
  })

  // -------------------------------------------------------------------------
  // Tag filter
  // -------------------------------------------------------------------------

  test('tag filter dropdown is hidden when no tags exist', async ({ page }) => {
    await expect(page.locator('[data-testid="tag-filter"]')).not.toBeVisible()
  })

  test('tag filter shows only todos carrying the selected tag', async ({ page }) => {
    await page.click('[data-testid="manage-tags-btn"]')
    await page.fill('[data-testid="tag-name-input"]', 'Personal')
    await page.click('[data-testid="create-tag-btn"]')
    await page.click('[data-testid="close-tag-modal"]')

    await page.click('[data-testid="tag-pill-Personal"]')
    await createTodo(page, 'Personal errand')

    // Second todo without the tag
    await page.fill('[data-testid="todo-input"]', 'Work errand')
    await page.click('[data-testid="add-todo-btn"]')
    await expect(page.locator('[data-testid="todo-title"]').filter({ hasText: 'Work errand' })).toBeVisible()

    await page.selectOption('[data-testid="tag-filter"]', { label: 'Personal' })

    await expect(page.locator('[data-testid="todo-title"]').filter({ hasText: 'Personal errand' })).toBeVisible()
    await expect(page.locator('[data-testid="todo-title"]').filter({ hasText: 'Work errand' })).not.toBeVisible()
  })

  // -------------------------------------------------------------------------
  // API security & validation
  // -------------------------------------------------------------------------

  test('tag API endpoints return 401 for unauthenticated requests', async ({ page }) => {
    await page.evaluate(async () => {
      await fetch('/api/auth/logout', { method: 'POST' })
    })

    const res = await page.request.get('/api/tags')
    expect(res.status()).toBe(401)
  })

  test('invalid hex colour is rejected with a 400', async ({ page }) => {
    const res = await page.request.post('/api/tags', {
      data: { name: 'BadColor', color: 'not-a-color' },
    })
    expect(res.status()).toBe(400)
  })
})
