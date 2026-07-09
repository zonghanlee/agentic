// app/api/templates/[id]/use/route.ts
// POST /api/templates/[id]/use — instantiate a todo from a template

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { templateDB, todoDB, subtaskDB, SubtaskTemplate } from '@/lib/db'

type Params = Promise<{ id: string }>

export async function POST(request: NextRequest, { params }: { params: Params }) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { id } = await params
  const templateId = Number(id)
  if (!Number.isInteger(templateId) || templateId <= 0) {
    return NextResponse.json({ error: 'Invalid template ID' }, { status: 400 })
  }

  const template = templateDB.findById(templateId, session.userId)
  if (!template) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  let dueDate: string | null = null
  const body = await request.json().catch(() => ({}))
  if (body && typeof body === 'object' && 'due_date' in body) {
    const value = (body as Record<string, unknown>).due_date
    if (typeof value === 'string' || value === null) {
      dueDate = value
    }
  }

  const todo = todoDB.create(session.userId, {
    title: template.title_template,
    due_date: dueDate,
    priority: template.priority,
    is_recurring: template.is_recurring,
    recurrence_pattern: template.recurrence_pattern ?? undefined,
    reminder_minutes: template.reminder_minutes ?? undefined,
  })

  let subtasks: SubtaskTemplate[] = []
  try {
    subtasks = JSON.parse(template.subtasks_json ?? '[]')
  } catch {
    subtasks = []
  }
  subtasks.forEach((s) => {
    subtaskDB.create(todo.id, { title: s.title })
  })

  return NextResponse.json(todo, { status: 201 })
}
