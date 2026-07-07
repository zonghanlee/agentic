// app/api/notifications/check/route.ts
// GET /api/notifications/check — returns todos with pending reminders and marks them sent

import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { todoDB } from '@/lib/db'
import { getSingaporeNow } from '@/lib/timezone'

export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const now = getSingaporeNow()
  const pending = todoDB.findPendingReminders(session.userId, now)

  if (pending.length > 0) {
    const ids = pending.map((t) => t.id)
    todoDB.markNotificationSent(ids, now.toISOString())
  }

  return NextResponse.json(pending)
}
