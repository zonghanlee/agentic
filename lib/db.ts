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

export interface CreateTodoDto {
  title: string
  due_date?: string | null
  priority?: Priority
}

export interface UpdateTodoDto {
  title?: string
  completed?: boolean
  due_date?: string | null
  priority?: Priority
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
`)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_PRIORITIES: Priority[] = ['high', 'medium', 'low']

export function isValidPriority(value: unknown): value is Priority {
  return typeof value === 'string' && (VALID_PRIORITIES as string[]).includes(value)
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
        `INSERT INTO todos (user_id, title, due_date, priority)
         VALUES (?, ?, ?, ?)
         RETURNING *`
      )
      .get(userId, dto.title, dto.due_date ?? null, dto.priority ?? 'medium') as RawTodo
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
}
