// app/api/calendar/route.ts
// GET /api/calendar?year=YYYY&month=M — todos and holidays for a given month

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { todoDB, holidayDB } from '@/lib/db'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { searchParams } = request.nextUrl
  const year = Number(searchParams.get('year'))
  const month = Number(searchParams.get('month'))

  if (!year || !month || month < 1 || month > 12) {
    return NextResponse.json({ error: 'Invalid year or month' }, { status: 400 })
  }

  const allTodos = todoDB.findAll(session.userId)
  const prefix = `${year}-${String(month).padStart(2, '0')}`
  const monthTodos = allTodos.filter((t) => t.due_date && t.due_date.startsWith(prefix))

  const holidays = holidayDB.findByMonth(year, month)

  return NextResponse.json({ todos: monthTodos, holidays })
}
