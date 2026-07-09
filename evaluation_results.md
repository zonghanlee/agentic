# Todo App — Evaluation Results

**Evaluated against:** [EVALUATION.md](EVALUATION.md)
**Evaluation Date:** 2026-07-09
**Evaluator:** Claude Code (Opus 4.8)
**Method:** Direct verification — production build, full Playwright suite (run twice for the flaky spec), manual reads of the DB layer / API routes / auth / hooks, and two parallel deep-audit passes over all 11 features. Findings below reflect the *actual* code state, not the progress notes.

---

## Final Score: 147 / 200 — ✅ Good (140–159)

> "Mostly complete, minor issues."

| Category | Score |
|----------|:-----:|
| Feature Completeness | **96 / 110** |
| Testing Coverage | **16 / 30** |
| Deployment | **13 / 30** |
| Quality & Performance | **22 / 30** |
| **Total** | **147 / 200** |

---

## Verification Summary

| Check | Result |
|-------|--------|
| Production build (`next build`) | ✅ Compiles cleanly, full TypeScript check with **0 errors**, all 24 routes generated |
| E2E suite (full run) | ⚠️ **115 passed / 7 failed** (all 7 in `05-subtasks.spec.ts`) |
| E2E failure root cause | Harness only — fail at `signIn` helper (`tests/helpers.ts:35`, WebAuthn virtual authenticator), **not** subtask logic |
| Isolated `05-subtasks.spec.ts` re-run | 0/18 (same sign-in failure) → confirms flaky harness, not a feature defect |
| "122 passing" claim in `progress.md` | ❌ Not reproducible (actual: 115/122) |
| Security posture | ✅ Parameterized queries, ownership checks, HTTP-only/secure/sameSite cookies, real `@simplewebauthn` v13, CSV formula-injection escaping |
| `console` statements in app code | Only 2 legitimate (`proxy.ts` dev warning, seed script) |

---

## 1. Feature Completeness — 96 / 110

| # | Feature | Score | Verdict | Notes |
|---|---------|:-----:|---------|-------|
| 01 | Todo CRUD | 10 | Complete | Full CRUD + Overdue/Pending/Completed sections + optimistic UI. **Gap:** future-date validation is client/HTML-only (`min` attr on create input, `page.tsx:1996`); not server-enforced and absent in edit form. |
| 02 | Priority System | 10 | Complete | Colored badges, auto-sort (`ORDER BY CASE priority`), filter dropdown, validation, default `medium`. **Gap:** no `dark:` variants anywhere — app has no dark mode. |
| 03 | Recurring Todos | 10 | Complete | All 4 patterns; next instance created on completion (`api/todos/[id]/route.ts:77-87`); correct date math (`lib/timezone.ts:38-58`); metadata inherited; 🔄 badge. |
| 04 | Reminders & Notifications | 10 | Complete | `Notification.requestPermission()` (`page.tsx:1694`), 60s polling (`useNotifications.ts:38`), 7 options, duplicate-prevention via `last_notification_sent` (marks sent in `api/notifications/check`), 🔔 badge. |
| 05 | Subtasks & Progress | 10 | Complete | CRUD + `ON DELETE CASCADE` + progress bar + X/Y counter all work. Test flakiness is harness-only. **Minor:** bar hardcoded blue at 100% (`page.tsx:200`), no green-at-complete state. |
| 06 | Tag System | 9 | Near-complete | Full tag CRUD, color picker, colored badges, dropdown filter, clear-all. **Gap:** "click badge to filter" not wired on todo cards (`TagPill` on cards has no `onClick`). Association uses `PUT` replace rather than POST/DELETE (functionally equivalent). |
| 07 | Template System | 6 | Partial | Save/use works. **Gaps:** no edit (`PUT /api/templates/[id]` and `templateDB.update` both absent); due-date-offset handler always sends `{}` (`page.tsx:1642`) so offset never applied; no category filter; save flow drops subtasks (stores `[]`). |
| 08 | Search & Filtering | 8 | Partial | Real-time title + subtask search, priority/tag/status/date filters, AND logic, clear-all, saved presets (bonus). **Gaps:** no tag-name search, no 300ms debounce (`setFilters` fires immediately), no persistent result-count summary. |
| 09 | Export & Import | 6 | Partial | Export strong (JSON enriched with subtasks/tags + CSV with injection escaping). **Gaps:** export has no `version` field (bare array); import **ignores subtasks/tags**, no ID remapping, no tag-conflict resolution — relationships not preserved on round-trip. |
| 10 | Calendar View | 7 | Partial | Grid, prev/next/today nav (with year rollover), day headers, today highlight, holidays, priority-colored todo pills all work. **Gaps:** no day-click modal, no count/overflow badge, no weekend styling, no `?month=YYYY-MM` URL state; holidays seeded via manual `tsx` script (not auto-seeded). API is `GET /api/calendar` (not `/api/holidays`). |
| 11 | Authentication (WebAuthn) | 10 | Complete | Real passkey register/login/logout via `@simplewebauthn` v13, challenge expiry, counter replay-protection, `GET /api/auth/me`, 7-day HTTP-only JWT cookie. `proxy.ts` **is** executed as middleware by Next 16 (build reports `ƒ Proxy (Middleware)`), so route protection is active. Naming differs from eval (`createSessionToken`/`sessionCookieOptions`; logout clears cookie directly, no `deleteSession`). |

**Feature subtotal: 96 / 110**

---

## 2. Testing Coverage — 16 / 30

| Sub-area | Max | Score | Notes |
|----------|:---:|:-----:|-------|
| E2E tests | 15 | 11 | Comprehensive 122-test suite across all 11 features, reusable `helpers.ts`, CDP virtual authenticator, `Asia/Singapore` timezone. **But not stable** (115/122; flaky sign-in helper). Eval's "passes consistently across 3 runs" not met. |
| Unit tests | 10 | 1 | **None exist.** Requested unit tests (DB CRUD, date calc, progress calc, ID remapping, validation) are all absent — everything is E2E. |
| Manual testing | 5 | 4 | Documented in `progress.md`; notifications manually verifiable. |

**Testing subtotal: 16 / 30**

---

## 3. Deployment — 13 / 30

| Sub-area | Max | Score | Notes |
|----------|:---:|:-----:|-------|
| Successful deployment | 15 | 4 | Production build passes and app is deployable, but **no evidence of an actual deployment**, and no `vercel.json` / `railway.json` / `nixpacks.toml` / `Procfile`, no live URL. |
| Environment configuration | 5 | 3 | `.env.local` present; vars documented in Railway guides. **Gaps:** no `.env.example`; `lib/db.ts:217` hardcodes DB path (`process.cwd()`), no `RAILWAY_VOLUME_MOUNT_PATH` support for persistent volumes. |
| Production testing | 5 | 1 | None evidenced. |
| Documentation | 5 | 5 | Strong: `RAILWAY_DEPLOYMENT.md` + `RAILWAY_SIMPLE_SETUP.md` + `README.md` + 2,051-line `USER_GUIDE.md`. |

**Deployment subtotal: 13 / 30**

---

## 4. Quality & Performance — 22 / 30

| Sub-area | Max | Score | Notes |
|----------|:---:|:-----:|-------|
| Code quality | 10 | 8 | TS strict, clean build, prepared statements, allow-list UPDATE builders, immutable mappers, thorough error handling, minimal `console`. **Deductions:** `app/page.tsx` is **2,372 lines** (violates project's own 800-line rule); no ESLint config file. |
| Performance | 10 | 7 | better-sqlite3 (sync) + WAL + prepared statements + priority sort. **Gap:** no explicit `CREATE INDEX` on `user_id` / `due_date` / FKs (eval requests these); client-side filtering fine at this scale. |
| Accessibility | 5 | 3 | Some `aria`/`role`/`htmlFor`/`<label>` usage (~25 in `page.tsx`), but no dark mode and no Lighthouse/WCAG audit. |
| Security | 5 | 4 | Excellent: parameterized queries (no SQLi), per-request ownership checks, secure cookies, WebAuthn, CSV injection guard, React XSS escaping. **Minor:** insecure JWT fallback default in `proxy.ts` (dev-only); no rate limiting. |

**Quality subtotal: 22 / 30**

---

## Highest-Leverage Improvements

Ranked by score impact per effort:

1. **Stabilize the E2E sign-in helper** (`tests/helpers.ts`) so the suite is reliably green (+~4 testing pts). Biggest cheap win — the feature works; only the WebAuthn virtual-authenticator setup is flaky.
2. **Add unit tests** for `calculateNextDueDate`, `computeProgress`, validation, and DB CRUD (+~8 testing pts).
3. **Actually deploy** (Railway) with a `.env.example` and volume-mounted DB path (+~10 deployment pts).
4. **Close Feature 07/09 gaps:** template edit (PUT) + working due-date offset; import that restores subtasks/tags with a `version` field and tag-conflict handling (+~4 feature pts).
5. **Add indexes** (`user_id`, `due_date`, FKs) and split `app/page.tsx` into smaller components (+~2 quality pts).

## Honesty Note

`progress.md` states "122 E2E tests passing." The reproducible result is **115/122** (7 harness-flaky). Recommend correcting that claim.

---

**Rating Scale Reference**

- 180–200: 🌟 Excellent
- 160–179: 🎯 Very Good
- **140–159: ✅ Good ← this project (147)**
- 120–139: ⚠️ Adequate
- 100–119: ❌ Incomplete
- < 100: ⛔ Not Ready
