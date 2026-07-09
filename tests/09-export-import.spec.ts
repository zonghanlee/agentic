// tests/09-export-import.spec.ts
// E2E tests for PRP 09 — Export & Import.

import { test, expect } from '@playwright/test'
import { signIn, createTodo, clearTodos } from './helpers'

test.describe('Export & Import', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, 'testuser-export')
    await clearTodos(page)
  })

  test.afterEach(async ({ page }) => {
    await clearTodos(page)
  })

  test('exports JSON file with todos', async ({ page }) => {
    await createTodo(page, 'Export me')

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('[data-testid="export-json-btn"]'),
    ])
    expect(download.suggestedFilename()).toMatch(/^todos-\d{4}-\d{2}-\d{2}\.json$/)

    const stream = await download.createReadStream()
    const chunks: Buffer[] = []
    for await (const chunk of stream) chunks.push(chunk as Buffer)
    const todos = JSON.parse(Buffer.concat(chunks).toString())

    expect(Array.isArray(todos)).toBe(true)
    expect(todos.some((t: { title: string }) => t.title === 'Export me')).toBe(true)
    expect(todos[0]).toHaveProperty('subtasks')
    expect(todos[0]).toHaveProperty('tags')
  })

  test('exports CSV file with todos', async ({ page }) => {
    await createTodo(page, 'CSV export me')

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('[data-testid="export-csv-btn"]'),
    ])
    expect(download.suggestedFilename()).toMatch(/^todos-\d{4}-\d{2}-\d{2}\.csv$/)
  })

  test('imports todos from a JSON file', async ({ page }) => {
    const json = JSON.stringify([{ title: 'Imported task', priority: 'low' }])
    const buffer = Buffer.from(json)
    await page.locator('[data-testid="import-file-input"]').setInputFiles({
      name: 'todos.json',
      mimeType: 'application/json',
      buffer,
    })

    await expect(page.locator('text=Successfully imported 1 todos')).toBeVisible()
    await expect(
      page.locator('[data-testid="todo-title"]').filter({ hasText: 'Imported task' })
    ).toBeVisible()
  })

  test('invalid JSON file shows a friendly error', async ({ page }) => {
    await page.locator('[data-testid="import-file-input"]').setInputFiles({
      name: 'bad.json',
      mimeType: 'application/json',
      buffer: Buffer.from('NOT_JSON'),
    })

    await expect(page.locator('text=Invalid JSON file')).toBeVisible()
  })

  test('empty array import reports zero imported', async ({ page }) => {
    const buffer = Buffer.from('[]')
    await page.locator('[data-testid="import-file-input"]').setInputFiles({
      name: 'empty.json',
      mimeType: 'application/json',
      buffer,
    })

    await expect(page.locator('text=Successfully imported 0 todos')).toBeVisible()
  })

  test('import with missing title is rejected with a 400', async ({ page }) => {
    const res = await page.request.post('/api/todos/import', {
      data: [{ priority: 'high' }],
    })
    expect(res.status()).toBe(400)
  })

  test('non-array JSON body is rejected with a 400', async ({ page }) => {
    const res = await page.request.post('/api/todos/import', {
      data: { title: 'not an array' },
    })
    expect(res.status()).toBe(400)
  })

  test('export/import API endpoints return 401 for unauthenticated requests', async ({ page }) => {
    await page.evaluate(async () => {
      await fetch('/api/auth/logout', { method: 'POST' })
    })

    const exportRes = await page.request.get('/api/todos/export')
    expect(exportRes.status()).toBe(401)

    const importRes = await page.request.post('/api/todos/import', { data: [] })
    expect(importRes.status()).toBe(401)
  })
})
