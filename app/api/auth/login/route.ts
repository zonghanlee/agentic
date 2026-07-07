// app/api/auth/login/route.ts
// Phase 1: simple username-only login — finds or creates the user then issues a JWT session.
// Phase 5 (PRP 11) will replace this with WebAuthn/Passkeys registration + verification.

import { NextRequest, NextResponse } from 'next/server'
import { userDB } from '@/lib/db'
import { createSessionToken, sessionCookieOptions } from '@/lib/auth'

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { username } = body
  if (!username || typeof username !== 'string' || username.trim() === '') {
    return NextResponse.json({ error: 'Username is required' }, { status: 400 })
  }

  const trimmed = username.trim().toLowerCase()

  // Basic username format validation
  if (!/^[a-z0-9_-]{2,32}$/.test(trimmed)) {
    return NextResponse.json(
      {
        error:
          'Username must be 2–32 characters and contain only letters, numbers, underscores, or hyphens',
      },
      { status: 400 }
    )
  }

  let user = userDB.findByUsername(trimmed)
  if (!user) {
    user = userDB.create(trimmed)
  }

  const token = await createSessionToken(user.id, user.username)
  const response = NextResponse.json({ success: true, username: user.username })
  response.cookies.set(sessionCookieOptions(token))

  return response
}
