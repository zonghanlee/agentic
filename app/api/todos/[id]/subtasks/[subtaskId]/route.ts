// app/api/todos/[id]/subtasks/[subtaskId]/route.ts
// PUT    /api/todos/[id]/subtasks/[subtaskId] — update (complete/rename) a subtask
// DELETE /api/todos/[id]/subtasks/[subtaskId] — delete a subtask

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { todoDB, subtaskDB } from '@/lib/db'

type Params = Promise<{ id: string; subtaskId: string }>

export async function PUT(request: NextRequest, { params }: { params: Params }) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { id, subtaskId } = await params
  const todoId = Number(id)
  const sId = Number(subtaskId)

  if (!Number.isInteger(todoId) || todoId <= 0 || !Number.isInteger(sId) || sId <= 0) {
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })
  }

  const todo = todoDB.findById(todoId, session.userId)
  if (!todo) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const dto: { title?: string; completed?: boolean } = {}
  if (body.title !== undefined) {
    if (typeof body.title !== 'string' || body.title.trim() === '') {
      return NextResponse.json({ error: 'Title cannot be empty' }, { status: 400 })
    }
    dto.title = (body.title as string).trim()
  }
  if (body.completed !== undefined) {
    dto.completed = Boolean(body.completed)
  }

  const updated = subtaskDB.update(sId, todoId, dto)
  if (!updated) {
    return NextResponse.json({ error: 'Subtask not found' }, { status: 404 })
  }

  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: Params }) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { id, subtaskId } = await params
  const todoId = Number(id)
  const sId = Number(subtaskId)

  if (!Number.isInteger(todoId) || todoId <= 0 || !Number.isInteger(sId) || sId <= 0) {
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })
  }

  const todo = todoDB.findById(todoId, session.userId)
  if (!todo) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const deleted = subtaskDB.delete(sId, todoId)
  if (!deleted) {
    return NextResponse.json({ error: 'Subtask not found' }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}
