// app/api/templates/[id]/route.ts
// DELETE /api/templates/[id] — delete a template

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { templateDB } from '@/lib/db'

type Params = Promise<{ id: string }>

export async function DELETE(_req: NextRequest, { params }: { params: Params }) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { id } = await params
  const templateId = Number(id)
  if (!Number.isInteger(templateId) || templateId <= 0) {
    return NextResponse.json({ error: 'Invalid template ID' }, { status: 400 })
  }

  const deleted = templateDB.delete(templateId, session.userId)
  if (!deleted) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}
