// tests/11-authentication.spec.ts
// E2E tests for PRP 11 — WebAuthn/Passkeys Authentication.

import { test, expect } from '@playwright/test'
import { signIn } from './helpers'

async function addVirtualAuthenticator(page: import('@playwright/test').Page) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
    },
  })
}

test.describe('WebAuthn Authentication', () => {
  test('unauthenticated user visiting / is redirected to /login', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL('/login')
  })

  test('unauthenticated user visiting /calendar is redirected to /login', async ({ page }) => {
    await page.goto('/calendar')
    await expect(page).toHaveURL('/login')
  })

  test('registers a new user with a passkey and redirects to home', async ({ page }) => {
    await addVirtualAuthenticator(page)
    await page.goto('/login')
    await page.fill('[data-testid="username-input"]', 'testuser-auth-register')
    await page.click('[data-testid="register-btn"]')
    await expect(page).toHaveURL('/')
  })

  test('logs in with an existing passkey', async ({ page }) => {
    await addVirtualAuthenticator(page)
    await page.goto('/login')
    await page.fill('[data-testid="username-input"]', 'testuser-auth-login')
    // First registration creates the account + a passkey and logs in.
    await page.click('[data-testid="register-btn"]')
    await expect(page).toHaveURL('/')

    // Log out, then log back in with the same (virtual) passkey.
    await page.click('[data-testid="logout-btn"]')
    await expect(page).toHaveURL('/login')

    await page.fill('[data-testid="username-input"]', 'testuser-auth-login')
    await page.click('[data-testid="login-btn"]')
    await expect(page).toHaveURL('/')
  })

  test('logout clears the session and re-protects routes', async ({ page }) => {
    await signIn(page, 'testuser-auth-logout')
    await expect(page).toHaveURL('/')

    await page.click('[data-testid="logout-btn"]')
    await expect(page).toHaveURL('/login')

    await page.goto('/')
    await expect(page).toHaveURL('/login')
  })

  test('login with unknown username shows an error', async ({ page }) => {
    await addVirtualAuthenticator(page)
    await page.goto('/login')
    await page.fill('[data-testid="username-input"]', 'testuser-auth-does-not-exist')
    await page.click('[data-testid="login-btn"]')
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page).toHaveURL('/login')
  })
})
