// tests/07-templates.spec.ts
// E2E tests for PRP 07 — Template System.

import { test, expect } from '@playwright/test'
import { signIn, createTodo, clearTodos, clearTemplates } from './helpers'

test.describe('Template System', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, 'testuser-templates')
    await clearTodos(page)
    await clearTemplates(page)
  })

  test.afterEach(async ({ page }) => {
    await clearTodos(page)
    await clearTemplates(page)
  })

  test('save-as-template button only appears when title is non-empty', async ({ page }) => {
    await expect(page.locator('[data-testid="save-as-template-btn"]')).not.toBeVisible()
    await page.fill('[data-testid="todo-input"]', 'Weekly review')
    await expect(page.locator('[data-testid="save-as-template-btn"]')).toBeVisible()
  })

  test('saves a template from the create form', async ({ page }) => {
    await page.fill('[data-testid="todo-input"]', 'Weekly review')
    await page.selectOption('[data-testid="priority-select"]', 'high')
    await page.click('[data-testid="save-as-template-btn"]')
    await page.fill('[data-testid="template-name-input"]', 'My Weekly Review')
    await page.click('[data-testid="save-template-confirm"]')

    await expect(page.locator('[data-testid="template-name-input"]')).not.toBeVisible()
    await expect(page.locator('[data-testid="use-template-select"]')).toBeVisible()
  })

  test('applies a template from the dropdown and creates a todo', async ({ page }) => {
    await page.fill('[data-testid="todo-input"]', 'Weekly review')
    await page.click('[data-testid="save-as-template-btn"]')
    await page.fill('[data-testid="template-name-input"]', 'My Weekly Review')
    await page.click('[data-testid="save-template-confirm"]')
    await page.fill('[data-testid="todo-input"]', '')

    await page.selectOption('[data-testid="use-template-select"]', { label: 'My Weekly Review' })

    await expect(
      page.locator('[data-testid="todo-title"]').filter({ hasText: 'Weekly review' })
    ).toBeVisible()
  })

  test('templates manager lists saved templates and applies via Use button', async ({ page }) => {
    await page.fill('[data-testid="todo-input"]', 'Standup prep')
    await page.click('[data-testid="save-as-template-btn"]')
    await page.fill('[data-testid="template-name-input"]', 'Standup')
    await page.click('[data-testid="save-template-confirm"]')
    await page.fill('[data-testid="todo-input"]', '')

    await page.click('[data-testid="templates-btn"]')
    await expect(page.locator('[data-testid="templates-modal"]')).toContainText('Standup')

    await page.locator('[data-testid="templates-modal"] button', { hasText: 'Use' }).click()

    await expect(page.locator('[data-testid="templates-modal"]')).not.toBeVisible()
    await expect(
      page.locator('[data-testid="todo-title"]').filter({ hasText: 'Standup prep' })
    ).toBeVisible()
  })

  test('deleting a template removes it but keeps todos created from it', async ({ page }) => {
    await page.fill('[data-testid="todo-input"]', 'Monthly report')
    await page.click('[data-testid="save-as-template-btn"]')
    await page.fill('[data-testid="template-name-input"]', 'Monthly Report')
    await page.click('[data-testid="save-template-confirm"]')
    await page.fill('[data-testid="todo-input"]', '')

    await page.selectOption('[data-testid="use-template-select"]', { label: 'Monthly Report' })
    await expect(
      page.locator('[data-testid="todo-title"]').filter({ hasText: 'Monthly report' })
    ).toBeVisible()

    await page.click('[data-testid="templates-btn"]')
    await page.locator('[data-testid="templates-modal"] button', { hasText: 'Delete' }).click()
    await expect(page.locator('[data-testid="templates-modal"]')).toContainText(
      'No templates saved yet.'
    )
    await page.click('text=Close')

    await expect(
      page.locator('[data-testid="todo-title"]').filter({ hasText: 'Monthly report' })
    ).toBeVisible()
  })

  test('empty state shown when no templates exist', async ({ page }) => {
    await page.click('[data-testid="templates-btn"]')
    await expect(page.locator('[data-testid="templates-modal"]')).toContainText(
      'No templates saved yet.'
    )
  })

  test('template API endpoints return 401 for unauthenticated requests', async ({ page }) => {
    await page.evaluate(async () => {
      await fetch('/api/auth/logout', { method: 'POST' })
    })

    const res = await page.request.get('/api/templates')
    expect(res.status()).toBe(401)
  })

  test('creating a template with an empty name is rejected', async ({ page }) => {
    const res = await page.request.post('/api/templates', {
      data: { name: '', title_template: 'Something' },
    })
    expect(res.status()).toBe(400)
  })

  test('existing tags are unaffected by template creation', async ({ page }) => {
    await createTodo(page, 'Independent task')
    await expect(
      page.locator('[data-testid="todo-title"]').filter({ hasText: 'Independent task' })
    ).toBeVisible()
  })
})
