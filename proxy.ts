// proxy.ts
// Protects the main app routes by verifying the session cookie.
// Unauthenticated requests are redirected to /login.

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    // In development, fall back to a known-insecure default so the app starts.
    // A warning is logged to the server console.
    console.warn('[proxy] JWT_SECRET not set — using insecure default')
    return new TextEncoder().encode('change-me-to-a-random-32-byte-hex-string-in-production')
  }
  return new TextEncoder().encode(secret)
}

export async function proxy(request: NextRequest) {
  const token = request.cookies.get('session')?.value

  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  try {
    await jwtVerify(token, getSecret())
    return NextResponse.next()
  } catch {
    const response = NextResponse.redirect(new URL('/login', request.url))
    response.cookies.delete('session')
    return response
  }
}

export const config = {
  matcher: ['/', '/calendar/:path*'],
}
