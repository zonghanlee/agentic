// app/api/auth/login-options/route.ts
// Phase 5 (PRP 11) — generates a WebAuthn authentication challenge for an existing user.

import { NextRequest, NextResponse } from 'next/server'
import { generateAuthenticationOptions } from '@simplewebauthn/server'
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

  const user = userDB.findByUsername(username.trim().toLowerCase())
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const authenticators = authenticatorDB.findByUserId(user.id)

  const options = await generateAuthenticationOptions({
    rpID: process.env.RP_ID ?? 'localhost',
    allowCredentials: authenticators.map((a) => ({ id: a.credential_id })),
    userVerification: 'preferred',
  })

  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()
  challengeDB.store(user.id, options.challenge, expiresAt)

  return NextResponse.json(options)
}
