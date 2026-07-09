// app/api/auth/register-options/route.ts
// Phase 5 (PRP 11) — generates a WebAuthn registration challenge for a (new or existing) user.

import { NextRequest, NextResponse } from 'next/server'
import { generateRegistrationOptions } from '@simplewebauthn/server'
import { userDB, authenticatorDB, challengeDB } from '@/lib/db'

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
  if (!user) user = userDB.create(trimmed)

  const existingAuthenticators = authenticatorDB.findByUserId(user.id)

  const options = await generateRegistrationOptions({
    rpName: 'Todo App',
    rpID: process.env.RP_ID ?? 'localhost',
    userName: user.username,
    userID: new TextEncoder().encode(String(user.id)),
    attestationType: 'none',
    excludeCredentials: existingAuthenticators.map((a) => ({ id: a.credential_id })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  })

  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()
  challengeDB.store(user.id, options.challenge, expiresAt)

  return NextResponse.json(options)
}
