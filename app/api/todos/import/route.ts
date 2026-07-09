// app/api/todos/import/route.ts
// POST /api/todos/import — bulk-create todos from a JSON array (new IDs assigned)

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { todoDB, Priority, RecurrencePattern } from '@/lib/db'

const VALID_PRIORITIES = ['high', 'medium', 'low']
const VALID_PATTERNS = ['daily', 'weekly', 'monthly', 'yearly']

interface ImportTodo {
  title: string
  due_date?: string | null
  priority?: string
  is_recurring?: boolean
  recurrence_pattern?: string | null
  reminder_minutes?: number | null
}

function validateImportTodo(item: unknown): item is ImportTodo {
  if (typeof item !== 'object' || item === null) return false
  const t = item as Record<string, unknown>
  if (typeof t.title !== 'string' || t.title.trim() === '') return false
  if (t.priority !== undefined && !VALID_PRIORITIES.includes(t.priority as string)) return false
  if (
    t.recurrence_pattern !== undefined &&
    t.recurrence_pattern !== null &&
    !VALID_PATTERNS.includes(t.recurrence_pattern as string)
  )
    return false
  return true
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON format' }, { status: 400 })
  }

  if (!Array.isArray(body)) {
    return NextResponse.json({ error: 'Expected an array of todos' }, { status: 400 })
  }

  const invalids = body.filter((item) => !validateImportTodo(item))
  if (invalids.length > 0) {
    return NextResponse.json(
      { error: `${invalids.length} item(s) failed validation` },
      { status: 400 }
    )
  }

  let created = 0
  for (const item of body as ImportTodo[]) {
    todoDB.create(session.userId, {
      title: item.title.trim(),
      due_date: item.due_date ?? null,
      priority: (VALID_PRIORITIES.includes(item.priority ?? '')
        ? item.priority
        : 'medium') as Priority,
      is_recurring: Boolean(item.is_recurring),
      recurrence_pattern: (item.recurrence_pattern ?? null) as RecurrencePattern | null,
      reminder_minutes: item.reminder_minutes ?? null,
    })
    created++
  }

  return NextResponse.json({ imported: created }, { status: 201 })
}
