# PRP 11 — WebAuthn / Passkeys Authentication

## Feature Overview

Implement **passwordless authentication** using the WebAuthn/Passkeys standard. Users register with a username and their device's biometric authenticator (fingerprint, Face ID) or a hardware security key. Subsequent logins use the same passkey. Authenticated sessions are managed via **HTTP-only JWT cookies** with a 7-day expiry. Route middleware protects the main app pages (`/` and `/calendar`).

**Implementation phase**: Phase 5 — Infrastructure (can be developed in parallel or added last)  
**Depends on**: None (all other features depend on this providing a `session.userId`)  
**Required by**: All other features (authentication gate for every API route)

> **Note**: The app is functional without authentication during development — stub `getSession()` to always return a fixed userId. Implement full WebAuthn before production deployment.

---

## User Stories

| As a… | I want to… | So that… |
|-------|-----------|----------|
| User | Register with a username and passkey | I can create a secure account without a password |
| User | Log in using my biometric or security key | I authenticate quickly and securely |
| User | Stay logged in for 7 days | I don't have to re-authenticate every session |
| User | Log out | I can end my session on shared devices |
| User | Be redirected to login if not authenticated | Unauthorised users cannot access my todos |
| Developer | Protect all API routes with session checks | Only authenticated users can read/write data |

---

## User Flow

### Registration
1. User visits `/login`.
2. User enters a **username** in the registration form.
3. User clicks **"Register with Passkey"**.
4. Client calls `POST /api/auth/register-options` to get a WebAuthn challenge.
5. Browser invokes the authenticator (biometrics, PIN, security key).
6. Client sends the credential to `POST /api/auth/register-verify`.
7. Server verifies the credential and creates a `users` row and an `authenticators` row.
8. Server sets an HTTP-only JWT cookie (`session`).
9. User is redirected to `/` (main todo page).

### Login
1. User visits `/login`.
2. User enters their **username** in the login form.
3. User clicks **"Login with Passkey"**.
4. Client calls `POST /api/auth/login-options` to get a challenge.
5. Browser invokes the authenticator.
6. Client sends the credential to `POST /api/auth/login-verify`.
7. Server verifies the credential, updates the counter.
8. Server sets/refreshes the JWT cookie.
9. User is redirected to `/`.

### Logout
1. User clicks **"Logout"** button.
2. Client calls `POST /api/auth/logout`.
3. Server clears the `session` cookie.
4. User is redirected to `/login`.

### Protected Route Access
- Unauthenticated users visiting `/` or `/calendar` are redirected to `/login` by middleware.
- All `/api/*` routes that require authentication call `getSession()` and return 401 if null.

---

## Technical Requirements

### Dependencies

```json
{
  "@simplewebauthn/server": "^9.x",
  "@simplewebauthn/browser": "^9.x",
  "jose": "^5.x"
}
```

### Database Schema

```sql
-- Already defined in PRP 01:
CREATE TABLE IF NOT EXISTS users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  username   TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS authenticators (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id       TEXT UNIQUE NOT NULL,   -- base64url-encoded
  credential_public_key TEXT NOT NULL,        -- base64url-encoded
  counter             INTEGER NOT NULL DEFAULT 0,
  transports          TEXT,                   -- JSON array of transport strings
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS challenges (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,
  challenge  TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### TypeScript Types

```typescript
// lib/db.ts
export interface User {
  id: number;
  username: string;
  created_at: string;
}

export interface Authenticator {
  id: number;
  user_id: number;
  credential_id: string;         // base64url
  credential_public_key: string; // base64url
  counter: number;
  transports: string | null;     // JSON string e.g. '["internal","hybrid"]'
  created_at: string;
}
```

### Session Management (`lib/auth.ts`)

```typescript
// lib/auth.ts
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? 'REPLACE_IN_PRODUCTION_MIN_32_CHARS'
);

const COOKIE_NAME = 'session';
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days in seconds

export interface SessionPayload {
  userId: number;
  username: string;
}

export async function createSession(payload: SessionPayload): Promise<void> {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(SECRET);

  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: MAX_AGE,
    path: '/',
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, SECRET);
    return { userId: payload.userId as number, username: payload.username as string };
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  (await cookies()).delete(COOKIE_NAME);
}
```

### Route Middleware (`middleware.ts`)

```typescript
// middleware.ts (project root)
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? 'REPLACE_IN_PRODUCTION_MIN_32_CHARS'
);

const PROTECTED_PATHS = ['/', '/calendar'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!PROTECTED_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next();
  }

  const token = request.cookies.get('session')?.value;
  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  try {
    await jwtVerify(token, SECRET);
    return NextResponse.next();
  } catch {
    return NextResponse.redirect(new URL('/login', request.url));
  }
}

export const config = {
  matcher: ['/', '/calendar', '/calendar/:path*'],
};
```

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/auth/register-options` | Generate registration challenge |
| `POST` | `/api/auth/register-verify` | Verify and store new credential |
| `POST` | `/api/auth/login-options` | Generate authentication challenge |
| `POST` | `/api/auth/login-verify` | Verify credential and create session |
| `POST` | `/api/auth/logout` | Clear session cookie |
| `GET` | `/api/auth/me` | Return current session info |

#### `POST /api/auth/register-options`

```typescript
// app/api/auth/register-options/route.ts
import { generateRegistrationOptions } from '@simplewebauthn/server';
import { userDB, challengeDB } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const { username } = await request.json();
  if (!username?.trim()) {
    return NextResponse.json({ error: 'Username is required' }, { status: 400 });
  }

  // Get or create user
  let user = userDB.findByUsername(username.trim());
  if (!user) user = userDB.create(username.trim());

  const existingAuthenticators = authenticatorDB.findByUserId(user.id);

  const options = await generateRegistrationOptions({
    rpName: 'Todo App',
    rpID: process.env.RP_ID ?? 'localhost',
    userID: new TextEncoder().encode(String(user.id)),
    userName: user.username,
    attestationType: 'none',
    excludeCredentials: existingAuthenticators.map(a => ({
      id: a.credential_id,
      type: 'public-key',
    })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  });

  // Store challenge temporarily (expires in 5 minutes)
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  challengeDB.store(user.id, options.challenge, expiresAt);

  return NextResponse.json(options);
}
```

#### `POST /api/auth/register-verify`

```typescript
// app/api/auth/register-verify/route.ts
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { userDB, authenticatorDB, challengeDB } from '@/lib/db';
import { createSession } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const { username, credential } = await request.json();

  const user = userDB.findByUsername(username);
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const storedChallenge = challengeDB.getLatest(user.id);
  if (!storedChallenge || new Date(storedChallenge.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Challenge expired' }, { status: 400 });
  }

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: credential,
      expectedChallenge: storedChallenge.challenge,
      expectedOrigin: process.env.ORIGIN ?? 'http://localhost:3000',
      expectedRPID: process.env.RP_ID ?? 'localhost',
    });
  } catch (err) {
    return NextResponse.json({ error: 'Verification failed' }, { status: 400 });
  }

  if (!verification.verified || !verification.registrationInfo) {
    return NextResponse.json({ error: 'Verification failed' }, { status: 400 });
  }

  const { credential: cred } = verification.registrationInfo;

  authenticatorDB.create({
    userId: user.id,
    credentialId: isoBase64URL.fromBuffer(cred.id),
    credentialPublicKey: isoBase64URL.fromBuffer(cred.publicKey),
    counter: cred.counter ?? 0,
    transports: JSON.stringify(credential.response?.transports ?? []),
  });

  challengeDB.delete(user.id);
  await createSession({ userId: user.id, username: user.username });

  return NextResponse.json({ verified: true });
}
```

#### `POST /api/auth/login-options`

```typescript
// app/api/auth/login-options/route.ts
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { userDB, authenticatorDB, challengeDB } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const { username } = await request.json();

  const user = userDB.findByUsername(username?.trim());
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const authenticators = authenticatorDB.findByUserId(user.id);

  const options = await generateAuthenticationOptions({
    rpID: process.env.RP_ID ?? 'localhost',
    allowCredentials: authenticators.map(a => ({
      id: a.credential_id,
      type: 'public-key',
    })),
    userVerification: 'preferred',
  });

  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  challengeDB.store(user.id, options.challenge, expiresAt);

  return NextResponse.json(options);
}
```

#### `POST /api/auth/login-verify`

```typescript
// app/api/auth/login-verify/route.ts
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { userDB, authenticatorDB, challengeDB } from '@/lib/db';
import { createSession } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const { username, credential } = await request.json();

  const user = userDB.findByUsername(username);
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const storedChallenge = challengeDB.getLatest(user.id);
  if (!storedChallenge || new Date(storedChallenge.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Challenge expired' }, { status: 400 });
  }

  const credentialId = credential.id;
  const authenticator = authenticatorDB.findByCredentialId(credentialId, user.id);
  if (!authenticator) {
    return NextResponse.json({ error: 'Authenticator not found' }, { status: 400 });
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: credential,
      expectedChallenge: storedChallenge.challenge,
      expectedOrigin: process.env.ORIGIN ?? 'http://localhost:3000',
      expectedRPID: process.env.RP_ID ?? 'localhost',
      credential: {
        id: authenticator.credential_id,
        publicKey: isoBase64URL.toBuffer(authenticator.credential_public_key),
        counter: authenticator.counter ?? 0,
        transports: JSON.parse(authenticator.transports ?? '[]'),
      },
    });
  } catch {
    return NextResponse.json({ error: 'Authentication failed' }, { status: 400 });
  }

  if (!verification.verified) {
    return NextResponse.json({ error: 'Authentication failed' }, { status: 400 });
  }

  // Update counter to prevent replay attacks
  authenticatorDB.updateCounter(
    authenticator.id,
    verification.authenticationInfo.newCounter ?? 0
  );

  challengeDB.delete(user.id);
  await createSession({ userId: user.id, username: user.username });

  return NextResponse.json({ verified: true });
}
```

#### `POST /api/auth/logout`

```typescript
// app/api/auth/logout/route.ts
import { clearSession } from '@/lib/auth';
import { NextResponse } from 'next/server';

export async function POST() {
  await clearSession();
  return NextResponse.json({ success: true });
}
```

---

## UI Components

### Login Page (`app/login/page.tsx`)

```tsx
'use client';
import { useState } from 'react';
import {
  startRegistration,
  startAuthentication,
} from '@simplewebauthn/browser';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleRegister = async () => {
    setLoading(true); setError('');
    try {
      const optRes = await fetch('/api/auth/register-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });
      const options = await optRes.json();
      if (!optRes.ok) throw new Error(options.error);

      const credential = await startRegistration(options);

      const verRes = await fetch('/api/auth/register-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, credential }),
      });
      const result = await verRes.json();
      if (!verRes.ok) throw new Error(result.error);

      router.push('/');
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    setLoading(true); setError('');
    try {
      const optRes = await fetch('/api/auth/login-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });
      const options = await optRes.json();
      if (!optRes.ok) throw new Error(options.error);

      const credential = await startAuthentication(options);

      const verRes = await fetch('/api/auth/login-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, credential }),
      });
      const result = await verRes.json();
      if (!verRes.ok) throw new Error(result.error);

      router.push('/');
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-8 w-full max-w-sm shadow">
        <h1 className="text-2xl font-bold mb-6 text-center">Todo App</h1>
        {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
        <input
          value={username}
          onChange={e => setUsername(e.target.value)}
          placeholder="Username"
          className="w-full border rounded px-3 py-2 mb-4"
          disabled={loading}
        />
        <button
          onClick={handleRegister}
          disabled={!username.trim() || loading}
          className="w-full bg-blue-500 text-white py-2 rounded mb-2 disabled:opacity-50"
        >
          Register with Passkey
        </button>
        <button
          onClick={handleLogin}
          disabled={!username.trim() || loading}
          className="w-full border py-2 rounded disabled:opacity-50"
        >
          Login with Passkey
        </button>
      </div>
    </div>
  );
}
```

### Logout Button (in main app header)

```tsx
async function handleLogout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/login';
}

// In JSX:
<button onClick={handleLogout} className="text-sm text-gray-500 hover:underline">
  Logout
</button>
```

---

## Environment Variables

```env
# .env.local
JWT_SECRET=your-min-32-character-secret-here-keep-private
RP_ID=localhost                         # domain without port
ORIGIN=http://localhost:3000            # full origin including protocol+port
NODE_ENV=development
```

In production (e.g. Railway):
```env
JWT_SECRET=<random 64-char string>
RP_ID=your-app-domain.up.railway.app
ORIGIN=https://your-app-domain.up.railway.app
NODE_ENV=production
```

---

## Edge Cases

| Scenario | Expected Behaviour |
|----------|-------------------|
| Username already registered, user tries "Register" | `generateRegistrationOptions` excludes existing credentials; user effectively adds a new authenticator |
| Username does not exist on login | API returns 404 "User not found" |
| Authenticator not found for credential ID | API returns 400 "Authenticator not found" |
| Challenge expired (> 5 min) | API returns 400 "Challenge expired" |
| WebAuthn not supported in browser | `startRegistration` / `startAuthentication` throws; caught and shown to user |
| User cancels biometric prompt | `startRegistration` throws; error shown to user |
| JWT secret not set | Falls back to weak default — **must** be set in production |
| Counter not incremented by authenticator | Use `?? 0` fallback to prevent crash; log warning |
| Same credential re-registration attempt | `excludeCredentials` prevents it at the authenticator level |
| Cookie set on HTTP in production | `secure: true` only when `NODE_ENV === 'production'` |
| Concurrent logins from multiple tabs | Each tab has its own challenge; race condition possible — handle gracefully |
| Session cookie tampered | `jwtVerify` fails; user redirected to `/login` |

---

## Acceptance Criteria

- [ ] `/login` page renders registration and login forms.
- [ ] Registering with a new username and passkey creates a user and sets a JWT cookie.
- [ ] Logging in with an existing passkey refreshes the JWT cookie.
- [ ] Authenticated user is redirected to `/` after login/register.
- [ ] Unauthenticated visit to `/` or `/calendar` redirects to `/login`.
- [ ] Logout clears the session cookie and redirects to `/login`.
- [ ] All `/api/*` routes return 401 without a valid session.
- [ ] JWT cookie is HTTP-only (not accessible via `document.cookie`).
- [ ] JWT expiry is 7 days.
- [ ] Counter updated after each successful authentication (replay attack prevention).
- [ ] Challenge expires after 5 minutes.
- [ ] `RP_ID` and `ORIGIN` are configurable via environment variables.

---

## Testing Requirements

### E2E Tests (Playwright)

Playwright requires the `--enable-features=WebAuthenticationAPI` flag and virtual authenticator setup:

```typescript
// playwright.config.ts
use: {
  timezoneId: 'Asia/Singapore',
  launchOptions: {
    args: ['--enable-features=WebAuthenticationAPI'],
  },
}
```

```typescript
// tests/01-authentication.spec.ts
import { chromium } from '@playwright/test';

test('registers and is redirected to home', async ({ browser }) => {
  const context = await browser.newContext();
  const cdp = await context.newCDPSession(await context.newPage());
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
    },
  });

  const page = await context.newPage();
  await page.goto('/login');
  await page.fill('[data-testid="username-input"]', 'testuser');
  await page.click('[data-testid="register-btn"]');
  await page.waitForURL('/');
  await expect(page).toHaveURL('/');
});

test('unauthenticated user redirected to login', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL('/login');
});

test('logout clears session', async ({ page }) => {
  // ... (after logging in)
  await page.click('[data-testid="logout-btn"]');
  await expect(page).toHaveURL('/login');
  await page.goto('/');
  await expect(page).toHaveURL('/login');
});
```

### Unit Tests

- `createSession` sets an HTTP-only cookie with correct `maxAge`
- `getSession` returns null for missing or invalid tokens
- `getSession` returns null for expired tokens
- `clearSession` deletes the session cookie
- Middleware redirects unauthenticated requests to `/login`
- Middleware allows authenticated requests through
- `challengeDB.store` and `challengeDB.getLatest` round-trip correctly
- Counter update saves new counter value via `authenticatorDB.updateCounter`

---

## Out of Scope

- Multiple passkeys per account management UI
- Password-based authentication fallback
- OAuth / social login (Google, GitHub)
- Email-based magic links
- Two-factor authentication (2FA)
- Account deletion
- Username change

---

## Security Notes

1. **JWT_SECRET must be at least 32 random characters** and stored securely — never commit to source control.
2. **`RP_ID` must match the exact domain** without protocol or port; mismatch causes all authentications to fail.
3. **`ORIGIN` must match exactly** (include protocol and port in development).
4. **Counter check** prevents replay attacks; never skip counter validation.
5. **`httpOnly: true`** cookie flag prevents XSS access to the session token.
6. **`secure: true`** in production ensures cookie is only sent over HTTPS.
7. **`sameSite: 'lax'`** provides CSRF protection while allowing normal navigation.
8. **Challenge expiry** (5 minutes) limits the window for replay attacks.
9. Never log the raw JWT or credential public keys.

---

## Success Metrics

- Registration flow completes in < 2 s (network + authenticator interaction excluded)
- Login flow completes in < 1 s (same exclusion)
- Zero session tokens accessible via `document.cookie` (HTTP-only enforced)
- 100% of protected routes redirect unauthenticated users
- Counter updated correctly after every successful login (verified in DB)
- JWT expiry behaves correctly: session invalid after 7 days
