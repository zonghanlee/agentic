// app/api/templates/route.ts
// GET  /api/templates — list all templates for the authenticated user
// POST /api/templates — create a new template

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { templateDB, isValidPriority, RecurrencePattern, SubtaskTemplate } from '@/lib/db'

const VALID_RECURRENCE_PATTERNS = ['daily', 'weekly', 'monthly', 'yearly']

export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const templates = templateDB.findAll(session.userId)
  return NextResponse.json(templates)
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

  const {
    name,
    description,
    category,
    title_template,
    priority,
    is_recurring,
    recurrence_pattern,
    reminder_minutes,
    subtasks,
  } = body

  if (!name || typeof name !== 'string' || name.trim() === '') {
    return NextResponse.json({ error: 'Template name is required' }, { status: 400 })
  }

  if (!title_template || typeof title_template !== 'string' || title_template.trim() === '') {
    return NextResponse.json({ error: 'title_template is required' }, { status: 400 })
  }

  if (priority !== undefined && !isValidPriority(priority)) {
    return NextResponse.json(
      { error: 'Invalid priority value. Must be one of: high, medium, low' },
      { status: 400 }
    )
  }

  if (
    recurrence_pattern !== undefined &&
    recurrence_pattern !== null &&
    !VALID_RECURRENCE_PATTERNS.includes(recurrence_pattern as string)
  ) {
    return NextResponse.json(
      { error: 'Invalid recurrence pattern. Must be: daily, weekly, monthly, or yearly' },
      { status: 400 }
    )
  }

  if (subtasks !== undefined && !Array.isArray(subtasks)) {
    return NextResponse.json({ error: 'subtasks must be an array' }, { status: 400 })
  }

  const template = templateDB.create(session.userId, {
    name: name.trim(),
    description: (description as string | null | undefined) ?? null,
    category: (category as string | null | undefined) ?? null,
    title_template: title_template.trim(),
    priority: isValidPriority(priority) ? priority : 'medium',
    is_recurring: Boolean(is_recurring),
    recurrence_pattern: (recurrence_pattern as RecurrencePattern | null | undefined) ?? null,
    reminder_minutes: (reminder_minutes as number | null | undefined) ?? null,
    subtasks: subtasks as SubtaskTemplate[] | undefined,
  })

  return NextResponse.json(template, { status: 201 })
}
