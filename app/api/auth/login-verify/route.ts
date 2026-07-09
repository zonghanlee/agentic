// app/api/auth/login-verify/route.ts
// Phase 5 (PRP 11) — verifies a WebAuthn authentication credential and refreshes the session.

import { NextRequest, NextResponse } from 'next/server'
import { verifyAuthenticationResponse, type AuthenticationResponseJSON } from '@simplewebauthn/server'
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
    credential?: AuthenticationResponseJSON
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

  const authenticator = authenticatorDB.findByCredentialId(credential.id, user.id)
  if (!authenticator) {
    return NextResponse.json({ error: 'Authenticator not found' }, { status: 400 })
  }

  let verification
  try {
    verification = await verifyAuthenticationResponse({
      response: credential,
      expectedChallenge: storedChallenge.challenge,
      expectedOrigin: process.env.ORIGIN ?? 'http://localhost:3000',
      expectedRPID: process.env.RP_ID ?? 'localhost',
      credential: {
        id: authenticator.credential_id,
        publicKey: isoBase64URL.toBuffer(authenticator.credential_public_key),
        counter: authenticator.counter,
        transports: authenticator.transports
          ? JSON.parse(authenticator.transports)
          : undefined,
      },
    })
  } catch {
    return NextResponse.json({ error: 'Authentication failed' }, { status: 400 })
  }

  if (!verification.verified) {
    return NextResponse.json({ error: 'Authentication failed' }, { status: 400 })
  }

  authenticatorDB.updateCounter(authenticator.id, verification.authenticationInfo.newCounter ?? 0)
  challengeDB.delete(user.id)

  const token = await createSessionToken(user.id, user.username)
  const response = NextResponse.json({ verified: true, username: user.username })
  response.cookies.set(sessionCookieOptions(token))

  return response
}
