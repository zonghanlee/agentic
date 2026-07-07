// app/api/todos/subtasks/route.ts
// GET /api/todos/subtasks — bulk fetch all subtasks for the authenticated user's todos

import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { subtaskDB } from '@/lib/db'

export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const subtasks = subtaskDB.findAllForUser(session.userId)
  return NextResponse.json(subtasks)
}
