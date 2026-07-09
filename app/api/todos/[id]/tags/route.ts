// app/api/todos/[id]/tags/route.ts
// GET /api/todos/[id]/tags — list tags applied to a todo
// PUT /api/todos/[id]/tags — replace all tags on a todo

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { todoDB, tagDB } from '@/lib/db'

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

  return NextResponse.json(tagDB.getTagsForTodo(todoId))
}

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

  const { tagIds } = body
  if (!Array.isArray(tagIds) || !tagIds.every((v) => Number.isInteger(v))) {
    return NextResponse.json({ error: 'tagIds must be an array of numbers' }, { status: 400 })
  }

  // Only allow tags owned by the requesting user
  const ownedTagIds = new Set(tagDB.findAll(session.userId).map((t) => t.id))
  const validTagIds = (tagIds as number[]).filter((tagId) => ownedTagIds.has(tagId))

  tagDB.setTagsForTodo(todoId, validTagIds)
  return NextResponse.json(tagDB.getTagsForTodo(todoId))
}
