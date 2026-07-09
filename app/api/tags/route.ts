// app/api/tags/route.ts
// GET  /api/tags — list all tags for the authenticated user
// POST /api/tags — create a new tag

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { tagDB, isValidHexColor } from '@/lib/db'

export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const tags = tagDB.findAll(session.userId)
  return NextResponse.json(tags)
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

  const { name, color } = body

  if (!name || typeof name !== 'string' || name.trim() === '') {
    return NextResponse.json({ error: 'Tag name is required' }, { status: 400 })
  }

  if (color !== undefined && !isValidHexColor(color)) {
    return NextResponse.json({ error: 'Color must be a valid hex code' }, { status: 400 })
  }

  try {
    const tag = tagDB.create(session.userId, {
      name: name as string,
      color: color as string | undefined,
    })
    return NextResponse.json(tag, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Tag name already exists' }, { status: 409 })
  }
}
