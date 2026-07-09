'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { startRegistration, startAuthentication } from '@simplewebauthn/browser'

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleRegister(e?: FormEvent) {
    e?.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const optionsRes = await fetch('/api/auth/register-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      })
      const options = await optionsRes.json()
      if (!optionsRes.ok) throw new Error(options.error ?? 'Registration failed')

      const credential = await startRegistration(options)

      const verifyRes = await fetch('/api/auth/register-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, credential }),
      })
      const result = await verifyRes.json()
      if (!verifyRes.ok) throw new Error(result.error ?? 'Registration failed')

      router.push('/')
      router.refresh()
    } catch (err) {
      setError((err as Error).message ?? 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleLogin() {
    setError(null)
    setLoading(true)

    try {
      const optionsRes = await fetch('/api/auth/login-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      })
      const options = await optionsRes.json()
      if (!optionsRes.ok) throw new Error(options.error ?? 'Login failed')

      const credential = await startAuthentication(options)

      const verifyRes = await fetch('/api/auth/login-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, credential }),
      })
      const result = await verifyRes.json()
      if (!verifyRes.ok) throw new Error(result.error ?? 'Login failed')

      router.push('/')
      router.refresh()
    } catch (err) {
      setError((err as Error).message ?? 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Todo App</h1>
        <p className="text-sm text-gray-500 mb-6">
          Sign in passwordlessly with your device&apos;s biometrics or a security key.
        </p>

        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
              Username
            </label>
            <input
              id="username"
              data-testid="username-input"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. alice"
              autoComplete="username webauthn"
              required
              minLength={2}
              maxLength={32}
              pattern="[a-zA-Z0-9_-]+"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            data-testid="register-btn"
            disabled={!username.trim() || loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded-lg px-4 py-2 text-sm transition-colors"
          >
            {loading ? 'Working…' : 'Register with Passkey'}
          </button>

          <button
            type="button"
            data-testid="login-btn"
            onClick={handleLogin}
            disabled={!username.trim() || loading}
            className="w-full border border-gray-300 hover:bg-gray-50 disabled:opacity-50 text-gray-700 font-medium rounded-lg px-4 py-2 text-sm transition-colors"
          >
            {loading ? 'Working…' : 'Login with Passkey'}
          </button>
        </form>
      </div>
    </main>
  )
}
