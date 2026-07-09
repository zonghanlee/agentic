// lib/db.ts
// Single source of truth for all database interfaces and CRUD operations.
// better-sqlite3 is synchronous — no async/await needed for DB operations.

import Database from 'better-sqlite3'
import path from 'path'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Priority = 'high' | 'medium' | 'low'
export type RecurrencePattern = 'daily' | 'weekly' | 'monthly' | 'yearly'

export interface User {
  id: number
  username: string
  created_at: string
}

export interface Todo {
  id: number
  user_id: number
  title: string
  completed: boolean
  due_date: string | null
  priority: Priority
  is_recurring: boolean
  recurrence_pattern: RecurrencePattern | null
  reminder_minutes: number | null
  last_notification_sent: string | null
  created_at: string
}

export type ReminderOption = 15 | 30 | 60 | 120 | 1440 | 2880 | 10080

export const REMINDER_LABELS: Record<number, string> = {
  15: '15 minutes before',
  30: '30 minutes before',
  60: '1 hour before',
  120: '2 hours before',
  1440: '1 day before',
  2880: '2 days before',
  10080: '1 week before',
}

export const REMINDER_BADGE: Record<number, string> = {
  15: '15m',
  30: '30m',
  60: '1h',
  120: '2h',
  1440: '1d',
  2880: '2d',
  10080: '1w',
}

export interface Tag {
  id: number
  user_id: number
  name: string
  color: string
  created_at: string
}

export interface CreateTagDto {
  name: string
  color?: string
}

export interface UpdateTagDto {
  name?: string
  color?: string
}

export interface Subtask {
  id: number
  todo_id: number
  title: string
  completed: boolean
  position: number
  created_at: string
}

export interface CreateSubtaskDto {
  title: string
}

export interface UpdateSubtaskDto {
  title?: string
  completed?: boolean
}

export interface SubtaskTemplate {
  title: string
  position: number
}

export interface Template {
  id: number
  user_id: number
  name: string
  description: string | null
  category: string | null
  title_template: string
  priority: Priority
  is_recurring: boolean
  recurrence_pattern: RecurrencePattern | null
  reminder_minutes: number | null
  subtasks_json: string
  created_at: string
}

export interface CreateTemplateDto {
  name: string
  description?: string | null
  category?: string | null
  title_template: string
  priority?: Priority
  is_recurring?: boolean
  recurrence_pattern?: RecurrencePattern | null
  reminder_minutes?: number | null
  subtasks?: SubtaskTemplate[]
}

// Internal raw template row as returned by SQLite
interface RawTemplate {
  id: number
  user_id: number
  name: string
  description: string | null
  category: string | null
  title_template: string
  priority: string
  is_recurring: number
  recurrence_pattern: string | null
  reminder_minutes: number | null
  subtasks_json: string
  created_at: string
}

export interface Holiday {
  id: number
  date: string
  name: string
}

export interface ExportedTodo extends Todo {
  subtasks: Subtask[]
  tags: Tag[]
}

export interface CreateTodoDto {
  title: string
  due_date?: string | null
  priority?: Priority
  is_recurring?: boolean
  recurrence_pattern?: RecurrencePattern | null
  reminder_minutes?: number | null
}

export interface UpdateTodoDto {
  title?: string
  completed?: boolean
  due_date?: string | null
  priority?: Priority
  is_recurring?: boolean
  recurrence_pattern?: RecurrencePattern | null
  reminder_minutes?: number | null
  last_notification_sent?: string | null
}

// Internal raw row as returned by SQLite (booleans stored as 0/1)
interface RawTodo {
  id: number
  user_id: number
  title: string
  completed: number
  due_date: string | null
  priority: string
  is_recurring: number
  recurrence_pattern: string | null
  reminder_minutes: number | null
  last_notification_sent: string | null
  created_at: string
}

// ---------------------------------------------------------------------------
// Database initialisation
// ---------------------------------------------------------------------------

const db = new Database(path.join(process.cwd(), 'todos.db'))

// Enable WAL mode for better read concurrency
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    username   TEXT UNIQUE NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS todos (
    id                     INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id                INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title                  TEXT NOT NULL,
    completed              INTEGER NOT NULL DEFAULT 0,
    due_date               TEXT,
    priority               TEXT NOT NULL DEFAULT 'medium',
    is_recurring           INTEGER NOT NULL DEFAULT 0,
    recurrence_pattern     TEXT,
    reminder_minutes       INTEGER,
    last_notification_sent TEXT,
    created_at             TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS subtasks (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    todo_id    INTEGER NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
    title      TEXT NOT NULL,
    completed  INTEGER NOT NULL DEFAULT 0,
    position   INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tags (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    color      TEXT NOT NULL DEFAULT '#3B82F6',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, name)
  );

  CREATE TABLE IF NOT EXISTS todo_tags (
    todo_id INTEGER NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
    tag_id  INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (todo_id, tag_id)
  );

  CREATE TABLE IF NOT EXISTS templates (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name                TEXT NOT NULL,
    description         TEXT,
    category            TEXT,
    title_template      TEXT NOT NULL,
    priority            TEXT NOT NULL DEFAULT 'medium',
    is_recurring        INTEGER NOT NULL DEFAULT 0,
    recurrence_pattern  TEXT,
    reminder_minutes    INTEGER,
    subtasks_json       TEXT NOT NULL DEFAULT '[]',
    created_at          TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS holidays (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    date    TEXT NOT NULL,
    name    TEXT NOT NULL,
    UNIQUE(date, name)
  );
`)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_PRIORITIES: Priority[] = ['high', 'medium', 'low']

export function isValidPriority(value: unknown): value is Priority {
  return typeof value === 'string' && (VALID_PRIORITIES as string[]).includes(value)
}

const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/

export function isValidHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOR_REGEX.test(value)
}

function mapTodo(row: RawTodo): Todo {
  return {
    ...row,
    completed: row.completed === 1,
    is_recurring: row.is_recurring === 1,
    priority: row.priority as Priority,
    recurrence_pattern: row.recurrence_pattern as RecurrencePattern | null,
  }
}

// Internal raw subtask row as returned by SQLite
interface RawSubtask {
  id: number
  todo_id: number
  title: string
  completed: number
  position: number
  created_at: string
}

function mapSubtask(row: RawSubtask): Subtask {
  return {
    ...row,
    completed: row.completed === 1,
  }
}

function mapTemplate(row: RawTemplate): Template {
  return {
    ...row,
    priority: row.priority as Priority,
    is_recurring: row.is_recurring === 1,
    recurrence_pattern: row.recurrence_pattern as RecurrencePattern | null,
  }
}

// ---------------------------------------------------------------------------
// User operations
// ---------------------------------------------------------------------------

export const userDB = {
  findByUsername(username: string): User | null {
    return (
      (db.prepare('SELECT * FROM users WHERE username = ?').get(username) as User | undefined) ??
      null
    )
  },

  findById(id: number): User | null {
    return (
      (db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined) ?? null
    )
  },

  create(username: string): User {
    return db
      .prepare('INSERT INTO users (username) VALUES (?) RETURNING *')
      .get(username) as User
  },
}

// ---------------------------------------------------------------------------
// Todo operations
// ---------------------------------------------------------------------------

export const todoDB = {
  findAll(userId: number): Todo[] {
    const rows = db
      .prepare(
        `SELECT * FROM todos
         WHERE user_id = ?
         ORDER BY
           CASE priority
             WHEN 'high'   THEN 1
             WHEN 'medium' THEN 2
             ELSE               3
           END,
           due_date ASC NULLS LAST,
           created_at DESC`
      )
      .all(userId) as RawTodo[]
    return rows.map(mapTodo)
  },

  findById(id: number, userId: number): Todo | null {
    const row = db
      .prepare('SELECT * FROM todos WHERE id = ? AND user_id = ?')
      .get(id, userId) as RawTodo | undefined
    return row ? mapTodo(row) : null
  },

  create(userId: number, dto: CreateTodoDto): Todo {
    const row = db
      .prepare(
        `INSERT INTO todos (user_id, title, due_date, priority, is_recurring, recurrence_pattern, reminder_minutes)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         RETURNING *`
      )
      .get(
        userId,
        dto.title,
        dto.due_date ?? null,
        dto.priority ?? 'medium',
        dto.is_recurring ? 1 : 0,
        dto.recurrence_pattern ?? null,
        dto.reminder_minutes ?? null
      ) as RawTodo
    return mapTodo(row)
  },

  update(id: number, userId: number, dto: UpdateTodoDto): Todo | null {
    const sets: string[] = []
    const values: unknown[] = []

    // Explicit allow-list of updatable fields keeps this injection-safe
    if (dto.title !== undefined) {
      sets.push('title = ?')
      values.push(dto.title)
    }
    if (dto.completed !== undefined) {
      sets.push('completed = ?')
      values.push(dto.completed ? 1 : 0)
    }
    if (dto.due_date !== undefined) {
      sets.push('due_date = ?')
      values.push(dto.due_date)
    }
    if (dto.priority !== undefined) {
      sets.push('priority = ?')
      values.push(dto.priority)
    }
    if (dto.is_recurring !== undefined) {
      sets.push('is_recurring = ?')
      values.push(dto.is_recurring ? 1 : 0)
    }
    if (dto.recurrence_pattern !== undefined) {
      sets.push('recurrence_pattern = ?')
      values.push(dto.recurrence_pattern)
    }
    if (dto.reminder_minutes !== undefined) {
      sets.push('reminder_minutes = ?')
      values.push(dto.reminder_minutes)
    }
    if (dto.last_notification_sent !== undefined) {
      sets.push('last_notification_sent = ?')
      values.push(dto.last_notification_sent)
    }

    if (sets.length === 0) {
      return todoDB.findById(id, userId)
    }

    values.push(id, userId)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = db
      .prepare(
        `UPDATE todos SET ${sets.join(', ')} WHERE id = ? AND user_id = ? RETURNING *`
      )
      .get(...(values as any[])) as RawTodo | undefined

    return row ? mapTodo(row) : null
  },

  delete(id: number, userId: number): boolean {
    const info = db
      .prepare('DELETE FROM todos WHERE id = ? AND user_id = ?')
      .run(id, userId)
    return info.changes > 0
  },

  findPendingReminders(userId: number, now: Date): Todo[] {
    const rows = db
      .prepare(`
        SELECT * FROM todos
        WHERE user_id = ?
          AND completed = 0
          AND reminder_minutes IS NOT NULL
          AND due_date IS NOT NULL
          AND last_notification_sent IS NULL
          AND datetime(due_date, '-' || reminder_minutes || ' minutes') <= ?
      `)
      .all(userId, now.toISOString()) as RawTodo[]
    return rows.map(mapTodo)
  },

  markNotificationSent(ids: number[], sentAt: string): void {
    if (ids.length === 0) return
    const placeholders = ids.map(() => '?').join(', ')
    db
      .prepare(`UPDATE todos SET last_notification_sent = ? WHERE id IN (${placeholders})`)
      .run(sentAt, ...ids)
  },
}

// ---------------------------------------------------------------------------
// Subtask operations
// ---------------------------------------------------------------------------

export const subtaskDB = {
  findByTodoId(todoId: number): Subtask[] {
    const rows = db
      .prepare('SELECT * FROM subtasks WHERE todo_id = ? ORDER BY position ASC, created_at ASC')
      .all(todoId) as RawSubtask[]
    return rows.map(mapSubtask)
  },

  findAllForUser(userId: number): Subtask[] {
    const rows = db
      .prepare(`
        SELECT s.* FROM subtasks s
        JOIN todos t ON t.id = s.todo_id
        WHERE t.user_id = ?
        ORDER BY s.position ASC, s.created_at ASC
      `)
      .all(userId) as RawSubtask[]
    return rows.map(mapSubtask)
  },

  create(todoId: number, dto: CreateSubtaskDto): Subtask {
    const { max } = db
      .prepare('SELECT COALESCE(MAX(position), -1) as max FROM subtasks WHERE todo_id = ?')
      .get(todoId) as { max: number }
    const row = db
      .prepare(`INSERT INTO subtasks (todo_id, title, position) VALUES (?, ?, ?) RETURNING *`)
      .get(todoId, dto.title.trim(), max + 1) as RawSubtask
    return mapSubtask(row)
  },

  update(id: number, todoId: number, dto: UpdateSubtaskDto): Subtask | null {
    const sets: string[] = []
    const values: unknown[] = []
    if (dto.title !== undefined) {
      sets.push('title = ?')
      values.push(dto.title)
    }
    if (dto.completed !== undefined) {
      sets.push('completed = ?')
      values.push(dto.completed ? 1 : 0)
    }
    if (sets.length === 0) return null
    values.push(id, todoId)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = db
      .prepare(`UPDATE subtasks SET ${sets.join(', ')} WHERE id = ? AND todo_id = ? RETURNING *`)
      .get(...(values as any[])) as RawSubtask | undefined
    return row ? mapSubtask(row) : null
  },

  delete(id: number, todoId: number): boolean {
    const info = db
      .prepare('DELETE FROM subtasks WHERE id = ? AND todo_id = ?')
      .run(id, todoId)
    return info.changes > 0
  },
}

// ---------------------------------------------------------------------------
// Tag operations
// ---------------------------------------------------------------------------

export const tagDB = {
  findAll(userId: number): Tag[] {
    return db
      .prepare('SELECT * FROM tags WHERE user_id = ? ORDER BY name ASC')
      .all(userId) as Tag[]
  },

  create(userId: number, dto: CreateTagDto): Tag {
    return db
      .prepare('INSERT INTO tags (user_id, name, color) VALUES (?, ?, ?) RETURNING *')
      .get(userId, dto.name.trim(), dto.color ?? '#3B82F6') as Tag
  },

  update(id: number, userId: number, dto: UpdateTagDto): Tag | null {
    const sets: string[] = []
    const values: unknown[] = []
    if (dto.name !== undefined) {
      sets.push('name = ?')
      values.push(dto.name.trim())
    }
    if (dto.color !== undefined) {
      sets.push('color = ?')
      values.push(dto.color)
    }
    if (sets.length === 0) return tagDB.findById(id, userId)
    values.push(id, userId)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = db
      .prepare(`UPDATE tags SET ${sets.join(', ')} WHERE id = ? AND user_id = ? RETURNING *`)
      .get(...(values as any[])) as Tag | undefined
    return row ?? null
  },

  findById(id: number, userId: number): Tag | null {
    return (
      (db.prepare('SELECT * FROM tags WHERE id = ? AND user_id = ?').get(id, userId) as
        | Tag
        | undefined) ?? null
    )
  },

  delete(id: number, userId: number): boolean {
    const info = db.prepare('DELETE FROM tags WHERE id = ? AND user_id = ?').run(id, userId)
    return info.changes > 0
  },

  getTagsForTodo(todoId: number): Tag[] {
    return db
      .prepare(
        `SELECT t.* FROM tags t
         JOIN todo_tags tt ON tt.tag_id = t.id
         WHERE tt.todo_id = ?
         ORDER BY t.name ASC`
      )
      .all(todoId) as Tag[]
  },

  getTagsForUser(userId: number): (Tag & { todo_id: number })[] {
    return db
      .prepare(
        `SELECT t.*, tt.todo_id as todo_id FROM tags t
         JOIN todo_tags tt ON tt.tag_id = t.id
         JOIN todos td ON td.id = tt.todo_id
         WHERE td.user_id = ?
         ORDER BY t.name ASC`
      )
      .all(userId) as (Tag & { todo_id: number })[]
  },

  setTagsForTodo(todoId: number, tagIds: number[]): void {
    const insert = db.prepare('INSERT INTO todo_tags (todo_id, tag_id) VALUES (?, ?)')
    const replace = db.transaction((ids: number[]) => {
      db.prepare('DELETE FROM todo_tags WHERE todo_id = ?').run(todoId)
      ids.forEach((tagId) => insert.run(todoId, tagId))
    })
    replace(tagIds)
  },
}

// ---------------------------------------------------------------------------
// Template operations (PRP 07)
// ---------------------------------------------------------------------------

export const templateDB = {
  findAll(userId: number): Template[] {
    const rows = db
      .prepare('SELECT * FROM templates WHERE user_id = ? ORDER BY category ASC, name ASC')
      .all(userId) as RawTemplate[]
    return rows.map(mapTemplate)
  },

  findById(id: number, userId: number): Template | null {
    const row = db
      .prepare('SELECT * FROM templates WHERE id = ? AND user_id = ?')
      .get(id, userId) as RawTemplate | undefined
    return row ? mapTemplate(row) : null
  },

  create(userId: number, dto: CreateTemplateDto): Template {
    const subtasksJson = JSON.stringify(dto.subtasks ?? [])
    const row = db
      .prepare(
        `INSERT INTO templates
           (user_id, name, description, category, title_template,
            priority, is_recurring, recurrence_pattern, reminder_minutes, subtasks_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         RETURNING *`
      )
      .get(
        userId,
        dto.name.trim(),
        dto.description ?? null,
        dto.category ?? null,
        dto.title_template.trim(),
        dto.priority ?? 'medium',
        dto.is_recurring ? 1 : 0,
        dto.recurrence_pattern ?? null,
        dto.reminder_minutes ?? null,
        subtasksJson
      ) as RawTemplate
    return mapTemplate(row)
  },

  delete(id: number, userId: number): boolean {
    const info = db.prepare('DELETE FROM templates WHERE id = ? AND user_id = ?').run(id, userId)
    return info.changes > 0
  },
}

// ---------------------------------------------------------------------------
// Holiday operations (PRP 10)
// ---------------------------------------------------------------------------

export const holidayDB = {
  findByMonth(year: number, month: number): Holiday[] {
    const prefix = `${year}-${String(month).padStart(2, '0')}`
    return db
      .prepare('SELECT * FROM holidays WHERE date LIKE ? ORDER BY date ASC')
      .all(`${prefix}-%`) as Holiday[]
  },
}
