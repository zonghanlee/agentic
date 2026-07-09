// app/api/todos/tags/route.ts
// GET /api/todos/tags — bulk fetch all tag associations for the authenticated user's todos

import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { tagDB } from '@/lib/db'

export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const tags = tagDB.getTagsForUser(session.userId)
  return NextResponse.json(tags)
}
