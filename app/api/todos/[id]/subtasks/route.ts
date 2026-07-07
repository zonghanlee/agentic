// app/api/todos/[id]/subtasks/route.ts
// GET  /api/todos/[id]/subtasks — list subtasks for a todo
// POST /api/todos/[id]/subtasks — add a subtask to a todo

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { todoDB, subtaskDB } from '@/lib/db'

type Params = Promise<{ id: string }>

export async function GET(_req: NextRequest, { params }: { params: Params }) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { id } = await params
  const todoId = Number(id)
  if (!Number.isInteger(todoId) || todoId <= 0) {
    return NextResponse.json({ error: 'Invalid todo ID' }, { status: 400 })
  }

  const todo = todoDB.findById(todoId, session.userId)
  if (!todo) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const subtasks = subtaskDB.findByTodoId(todoId)
  return NextResponse.json(subtasks)
}

export async function POST(request: NextRequest, { params }: { params: Params }) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { id } = await params
  const todoId = Number(id)
  if (!Number.isInteger(todoId) || todoId <= 0) {
    return NextResponse.json({ error: 'Invalid todo ID' }, { status: 400 })
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

  const { title } = body
  if (!title || typeof title !== 'string' || title.trim() === '') {
    return NextResponse.json({ error: 'Subtask title is required' }, { status: 400 })
  }

  const subtask = subtaskDB.create(todoId, { title: title.trim() })
  return NextResponse.json(subtask, { status: 201 })
}
