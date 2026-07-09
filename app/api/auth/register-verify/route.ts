// app/api/auth/register-verify/route.ts
// Phase 5 (PRP 11) — verifies a WebAuthn registration credential, stores it, and issues a session.

import { NextRequest, NextResponse } from 'next/server'
import { verifyRegistrationResponse, type RegistrationResponseJSON } from '@simplewebauthn/server'
import { isoBase64URL } from '@simplewebauthn/server/helpers'
import { userDB, authenticatorDB, challengeDB } from '@/lib/db'
import { createSessionToken, sessionCookieOptions } from '@/lib/auth'

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { username, credential } = body as {
    username?: string
    credential?: RegistrationResponseJSON
  }
  if (!username || typeof username !== 'string' || !credential) {
    return NextResponse.json({ error: 'Username and credential are required' }, { status: 400 })
  }

  const user = userDB.findByUsername(username.trim().toLowerCase())
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const storedChallenge = challengeDB.getLatest(user.id)
  if (!storedChallenge || new Date(storedChallenge.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Challenge expired' }, { status: 400 })
  }

  let verification
  try {
    verification = await verifyRegistrationResponse({
      response: credential,
      expectedChallenge: storedChallenge.challenge,
      expectedOrigin: process.env.ORIGIN ?? 'http://localhost:3000',
      expectedRPID: process.env.RP_ID ?? 'localhost',
    })
  } catch {
    return NextResponse.json({ error: 'Verification failed' }, { status: 400 })
  }

  if (!verification.verified || !verification.registrationInfo) {
    return NextResponse.json({ error: 'Verification failed' }, { status: 400 })
  }

  const { credential: cred } = verification.registrationInfo

  authenticatorDB.create({
    userId: user.id,
    credentialId: cred.id,
    credentialPublicKey: isoBase64URL.fromBuffer(cred.publicKey),
    counter: cred.counter ?? 0,
    transports: cred.transports ? JSON.stringify(cred.transports) : null,
  })

  challengeDB.delete(user.id)

  const token = await createSessionToken(user.id, user.username)
  const response = NextResponse.json({ verified: true, username: user.username })
  response.cookies.set(sessionCookieOptions(token))

  return response
}
