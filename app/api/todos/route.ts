// app/api/todos/route.ts
// GET  /api/todos  — list todos for the authenticated user
// POST /api/todos  — create a new todo

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { todoDB, isValidPriority } from '@/lib/db'

const VALID_RECURRENCE_PATTERNS = ['daily', 'weekly', 'monthly', 'yearly']

export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const todos = todoDB.findAll(session.userId)
  return NextResponse.json(todos)
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { title, due_date, priority, is_recurring, recurrence_pattern, reminder_minutes } = body

  if (!title || typeof title !== 'string' || title.trim() === '') {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 })
  }

  if (priority !== undefined && !isValidPriority(priority)) {
    return NextResponse.json(
      { error: 'Invalid priority value. Must be one of: high, medium, low' },
      { status: 400 }
    )
  }

  if (due_date !== undefined && due_date !== null && typeof due_date !== 'string') {
    return NextResponse.json({ error: 'due_date must be an ISO 8601 string or null' }, { status: 400 })
  }

  if (is_recurring && !due_date) {
    return NextResponse.json(
      { error: 'A due date is required for recurring todos' },
      { status: 400 }
    )
  }

  if (is_recurring && !recurrence_pattern) {
    return NextResponse.json(
      { error: 'Recurrence pattern is required when is_recurring is true' },
      { status: 400 }
    )
  }

  if (
    recurrence_pattern !== undefined &&
    recurrence_pattern !== null &&
    !VALID_RECURRENCE_PATTERNS.includes(recurrence_pattern as string)
  ) {
    return NextResponse.json(
      { error: 'Invalid recurrence pattern. Must be: daily, weekly, monthly, or yearly' },
      { status: 400 }
    )
  }

  if (
    reminder_minutes !== undefined &&
    reminder_minutes !== null &&
    typeof reminder_minutes !== 'number'
  ) {
    return NextResponse.json({ error: 'reminder_minutes must be a number or null' }, { status: 400 })
  }

  const todo = todoDB.create(session.userId, {
    title: title.trim(),
    due_date: (due_date as string | null | undefined) ?? null,
    priority: isValidPriority(priority) ? priority : 'medium',
    is_recurring: Boolean(is_recurring),
    recurrence_pattern: (recurrence_pattern as string | null | undefined) ?? null,
    reminder_minutes: (reminder_minutes as number | null | undefined) ?? null,
  })

  return NextResponse.json(todo, { status: 201 })
}
