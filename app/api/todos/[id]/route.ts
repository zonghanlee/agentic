// app/api/todos/[id]/route.ts
// PUT    /api/todos/[id]  — update an existing todo
// DELETE /api/todos/[id]  — delete a todo

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { todoDB, isValidPriority, UpdateTodoDto } from '@/lib/db'
import { calculateNextDueDate } from '@/lib/timezone'

const VALID_RECURRENCE_PATTERNS = ['daily', 'weekly', 'monthly', 'yearly']

type Params = Promise<{ id: string }>

export async function PUT(request: NextRequest, { params }: { params: Params }) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { id } = await params
  const todoId = Number(id)
  if (!Number.isInteger(todoId) || todoId <= 0) {
    return NextResponse.json({ error: 'Invalid todo ID' }, { status: 400 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { title, completed, due_date, priority, is_recurring, recurrence_pattern, reminder_minutes } = body

  if (title !== undefined && (typeof title !== 'string' || title.trim() === '')) {
    return NextResponse.json({ error: 'Title cannot be empty' }, { status: 400 })
  }

  if (priority !== undefined && !isValidPriority(priority)) {
    return NextResponse.json(
      { error: 'Invalid priority value. Must be one of: high, medium, low' },
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

  const existing = todoDB.findById(todoId, session.userId)
  if (!existing) {
    return NextResponse.json({ error: 'Todo not found' }, { status: 404 })
  }

  const dto: UpdateTodoDto = {}
  if (title !== undefined) dto.title = (title as string).trim()
  if (completed !== undefined) dto.completed = Boolean(completed)
  if (due_date !== undefined) dto.due_date = due_date as string | null
  if (priority !== undefined && isValidPriority(priority)) dto.priority = priority
  if (is_recurring !== undefined) dto.is_recurring = Boolean(is_recurring)
  if (recurrence_pattern !== undefined) dto.recurrence_pattern = (recurrence_pattern as string | null) ?? null
  if (reminder_minutes !== undefined) dto.reminder_minutes = (reminder_minutes as number | null) ?? null

  // When reminder changes, reset last_notification_sent so the new reminder can fire
  if (reminder_minutes !== undefined && reminder_minutes !== existing.reminder_minutes) {
    dto.last_notification_sent = null
  }

  // Spawn the next recurring instance when completing a recurring todo
  if (dto.completed === true && !existing.completed && existing.is_recurring && existing.due_date) {
    const nextDue = calculateNextDueDate(existing.due_date, existing.recurrence_pattern!)
    todoDB.create(session.userId, {
      title: existing.title,
      due_date: nextDue,
      priority: existing.priority,
      is_recurring: true,
      recurrence_pattern: existing.recurrence_pattern ?? undefined,
      reminder_minutes: existing.reminder_minutes ?? undefined,
    })
  }

  const updated = todoDB.update(todoId, session.userId, dto)
  if (!updated) {
    return NextResponse.json({ error: 'Todo not found' }, { status: 404 })
  }

  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: Params }) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { id } = await params
  const todoId = Number(id)
  if (!Number.isInteger(todoId) || todoId <= 0) {
    return NextResponse.json({ error: 'Invalid todo ID' }, { status: 400 })
  }

  const deleted = todoDB.delete(todoId, session.userId)
  if (!deleted) {
    return NextResponse.json({ error: 'Todo not found' }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}
