// app/api/todos/export/route.ts
// GET /api/todos/export — download todos as JSON (default) or CSV

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { todoDB, subtaskDB, tagDB, ExportedTodo } from '@/lib/db'
import { getSingaporeNow } from '@/lib/timezone'

function csvEscape(value: string): string {
  // Neutralise formula injection for values that would otherwise be
  // interpreted as spreadsheet formulas when opened in Excel/Sheets.
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value
  return `"${safe.replace(/"/g, '""')}"`
}

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const format = request.nextUrl.searchParams.get('format') ?? 'json'
  const dateStr = getSingaporeNow().toISOString().slice(0, 10)
  const todos = todoDB.findAll(session.userId)

  if (format === 'csv') {
    const header = 'ID,Title,Completed,Due Date,Priority,Recurring,Pattern,Reminder\n'
    const rows = todos
      .map((t) =>
        [
          t.id,
          csvEscape(t.title),
          t.completed,
          t.due_date ?? '',
          t.priority,
          t.is_recurring,
          t.recurrence_pattern ?? '',
          t.reminder_minutes ?? '',
        ].join(',')
      )
      .join('\n')

    return new NextResponse(header + rows, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="todos-${dateStr}.csv"`,
      },
    })
  }

  const enriched: ExportedTodo[] = todos.map((todo) => ({
    ...todo,
    subtasks: subtaskDB.findByTodoId(todo.id),
    tags: tagDB.getTagsForTodo(todo.id),
  }))

  return new NextResponse(JSON.stringify(enriched, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="todos-${dateStr}.json"`,
    },
  })
}
