// app/api/todos/[id]/route.ts
// PUT    /api/todos/[id]  — update an existing todo
// DELETE /api/todos/[id]  — delete a todo

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { todoDB, isValidPriority, UpdateTodoDto } from '@/lib/db'

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

  const { title, completed, due_date, priority } = body

  if (title !== undefined && (typeof title !== 'string' || title.trim() === '')) {
    return NextResponse.json({ error: 'Title cannot be empty' }, { status: 400 })
  }

  if (priority !== undefined && !isValidPriority(priority)) {
    return NextResponse.json(
      { error: 'Invalid priority value. Must be one of: high, medium, low' },
      { status: 400 }
    )
  }

  const dto: UpdateTodoDto = {}
  if (title !== undefined) dto.title = (title as string).trim()
  if (completed !== undefined) dto.completed = Boolean(completed)
  if (due_date !== undefined) dto.due_date = due_date as string | null
  if (priority !== undefined && isValidPriority(priority)) dto.priority = priority

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
