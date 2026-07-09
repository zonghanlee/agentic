// app/api/tags/[id]/route.ts
// PUT    /api/tags/[id] — update a tag's name and/or color
// DELETE /api/tags/[id] — delete a tag

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { tagDB, isValidHexColor } from '@/lib/db'

type Params = Promise<{ id: string }>

export async function PUT(request: NextRequest, { params }: { params: Params }) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { id } = await params
  const tagId = Number(id)
  if (!Number.isInteger(tagId) || tagId <= 0) {
    return NextResponse.json({ error: 'Invalid tag ID' }, { status: 400 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { name, color } = body

  if (name !== undefined && (typeof name !== 'string' || name.trim() === '')) {
    return NextResponse.json({ error: 'Tag name cannot be empty' }, { status: 400 })
  }

  if (color !== undefined && !isValidHexColor(color)) {
    return NextResponse.json({ error: 'Color must be a valid hex code' }, { status: 400 })
  }

  const existing = tagDB.findById(tagId, session.userId)
  if (!existing) {
    return NextResponse.json({ error: 'Tag not found' }, { status: 404 })
  }

  try {
    const updated = tagDB.update(tagId, session.userId, {
      name: name as string | undefined,
      color: color as string | undefined,
    })
    if (!updated) {
      return NextResponse.json({ error: 'Tag not found' }, { status: 404 })
    }
    return NextResponse.json(updated)
  } catch {
    return NextResponse.json({ error: 'Tag name already exists' }, { status: 409 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Params }) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { id } = await params
  const tagId = Number(id)
  if (!Number.isInteger(tagId) || tagId <= 0) {
    return NextResponse.json({ error: 'Invalid tag ID' }, { status: 400 })
  }

  const deleted = tagDB.delete(tagId, session.userId)
  if (!deleted) {
    return NextResponse.json({ error: 'Tag not found' }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}
