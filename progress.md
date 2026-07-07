# Project Progress

## Overview

Todo App — Next.js 16, React 19, Tailwind CSS 4, better-sqlite3, WebAuthn (Phase 5), Playwright E2E tests.
All date/time operations use the **Singapore timezone** (`Asia/Singapore`).

---

## All 11 Features (Full Spec)

### Phase 1 — Foundation
| # | Feature | PRP | Key Deliverables |
|---|---------|-----|-----------------|
| 01 | **Todo CRUD** | `PRPs/01-todo-crud-operations.md` | Create / read / update / delete todos; title + due date + completion state; Singapore timezone; Overdue / Pending / Completed sections; optimistic UI |
| 02 | **Priority System** | `PRPs/02-priority-system.md` | High / Medium / Low priority; colour-coded badges (red / yellow / blue); auto-sort by priority then due date; client-side priority filter |

### Phase 2 — Core Features
| # | Feature | PRP | Key Deliverables |
|---|---------|-----|-----------------|
| 03 | **Recurring Todos** | `PRPs/03-recurring-todos.md` | Daily / weekly / monthly / yearly patterns; on completion auto-creates next instance with same settings and calculated due date; 🔄 badge |
| 04 | **Reminders & Notifications** | `PRPs/04-reminders-notifications.md` | Browser push notifications; configurable lead time (15 min – 1 week); polling every minute; fires exactly once per instance via `last_notification_sent` |
| 05 | **Subtasks & Progress** | `PRPs/05-subtasks-progress.md` | Checklist items per todo; visual progress bar; `X/Y` counter; position ordering; cascade delete with parent |

### Phase 3 — Organisation
| # | Feature | PRP | Key Deliverables |
|---|---------|-----|-----------------|
| 06 | **Tag System** | `PRPs/06-tag-system.md` | User-created colour-coded labels; many-to-many todos ↔ tags via join table; tag filter dropdown; tag CRUD |
| 08 | **Search & Filtering** | `PRPs/08-search-filtering.md` | Real-time title + subtask search; filter by priority, tag, status, date range; AND-logic combination; filter presets in `localStorage` |

### Phase 4 — Productivity
| # | Feature | PRP | Key Deliverables |
|---|---------|-----|-----------------|
| 07 | **Template System** | `PRPs/07-template-system.md` | Save todo config (title, priority, recurrence, reminder, subtasks) as reusable template; apply template creates todo with offset due date; optional categories |
| 09 | **Export & Import** | `PRPs/09-export-import.md` | JSON export (full data) + CSV export (spreadsheet); JSON import with ID remapping; relationship preservation |
| 10 | **Calendar View** | `PRPs/10-calendar-view.md` | `/calendar` route; monthly grid; todos colour-coded by priority; Singapore public holidays; month navigation |

### Phase 5 — Infrastructure
| # | Feature | PRP | Key Deliverables |
|---|---------|-----|-----------------|
| 11 | **WebAuthn / Passkeys Auth** | `PRPs/11-authentication-webauthn.md` | Passwordless registration + login via biometrics / hardware key; HTTP-only JWT session cookie (7-day); route protection via `proxy.ts` |

---

## What Has Been Done

### ✅ Phase 1 — Complete

#### PRP 01 — Todo CRUD
- `lib/db.ts` — SQLite schema (`users`, `todos`), `userDB` + `todoDB` CRUD with safe explicit-field UPDATE, boolean mapping
- `lib/timezone.ts` — `getSingaporeNow()`, `formatSingaporeDate()`, `getRelativeDueLabel()`
- `lib/auth.ts` — JWT session via `jose` (`createSessionToken`, `getSession`, `sessionCookieOptions`)
- `proxy.ts` — route protection (Next.js 16 renamed `middleware` → `proxy`)
- `GET /api/todos` — list todos sorted by priority → due date → created_at
- `POST /api/todos` — create with title validation
- `PUT /api/todos/[id]` — update any combination of fields
- `DELETE /api/todos/[id]` — delete with 404 guard
- `app/page.tsx` — Overdue / Pending / Completed sections; create form; edit modal; delete confirmation; optimistic toggle
- `app/login/page.tsx` — username login form (Phase 1 placeholder; replaced by WebAuthn in Phase 5)
- `POST /api/auth/login` — find-or-create user, issue JWT session
- `POST /api/auth/logout` — clear session cookie

#### PRP 02 — Priority System
- `Priority` type + `isValidPriority()` guard in `lib/db.ts`
- Colour-coded `PriorityBadge` component (red / yellow / blue) on every todo card
- `PrioritySelect` dropdown in create form (defaults to Medium) and edit modal
- Client-side `priorityFilter` state with `useMemo` filtering
- API returns 400 for invalid priority values

#### Infrastructure & Tests
- `package.json` — Next.js 16.2.10, React 19, Tailwind CSS 4, better-sqlite3, jose, Playwright
- `next.config.ts` — `serverExternalPackages: ['better-sqlite3']`
- `postcss.config.mjs` — Tailwind CSS 4 PostCSS plugin
- `playwright.config.ts` — `timezoneId: 'Asia/Singapore'`, auto-starts dev server
- `tests/helpers.ts` — `signIn()`, `createTodo()`, `clearTodos()` (with `beforeEach` + `afterEach` isolation)
- `tests/01-todo-crud.spec.ts` — 11 E2E tests
- `tests/02-priority.spec.ts` — 8 E2E tests

---

## What Is Pending

### 🔲 Phase 2 — Core Features
- **PRP 03 — Recurring Todos**: recurring checkbox + pattern select in form; auto-create next instance on completion; 🔄 badge; extend `UpdateTodoDto` with `is_recurring` + `recurrence_pattern`
- **PRP 04 — Reminders & Notifications**: reminder select in form (15m / 30m / 1h / 2h / 1d / 2d / 1w); `GET /api/notifications/check` endpoint; polling hook `useNotifications`; 🔔 badge; browser `Notification` permission flow
- **PRP 05 — Subtasks & Progress**: `subtasks` table; `subtaskDB` CRUD; `GET/POST /api/todos/[id]/subtasks`; `PUT/DELETE /api/subtasks/[id]`; inline checklist UI; progress bar component

### 🔲 Phase 3 — Organisation
- **PRP 06 — Tag System**: `tags` + `todo_tags` tables; `tagDB` CRUD; `GET/POST /api/tags`; `PUT/DELETE /api/tags/[id]`; `POST/DELETE /api/todos/[id]/tags/[tagId]`; tag pill UI; tag filter dropdown
- **PRP 08 — Search & Filtering**: search input with debounce; filter by tag, status, date range; combined AND logic; `localStorage` filter presets; `useSearchFilter` hook

### 🔲 Phase 4 — Productivity
- **PRP 07 — Template System**: `templates` table; `templateDB` CRUD; `GET/POST /api/templates`; `POST /api/templates/[id]/use`; template manager UI; subtasks JSON serialization; due date offset
- **PRP 09 — Export & Import**: `GET /api/todos/export` (JSON + CSV); `POST /api/todos/import` (JSON with ID remapping); export/import buttons in UI
- **PRP 10 — Calendar View**: `/calendar` route + `app/calendar/page.tsx`; monthly grid component; priority colour-coding; Singapore public holidays seed script; month navigation

### 🔲 Phase 5 — Infrastructure
- **PRP 11 — WebAuthn Auth**: install `@simplewebauthn/server` + `@simplewebauthn/browser`; `authenticators` table; `POST /api/auth/register-options`, `/register-verify`, `/login-options`, `/login-verify`; replace `app/login/page.tsx` simple form with passkey flow; update `lib/auth.ts` if needed

---

## Dependency Map

```
01 Todo CRUD  ──► 02 Priority (done)
              ──► 03 Recurring
              ──► 04 Reminders
              ──► 05 Subtasks ──► 07 Templates
              ──► 06 Tags     ──► 08 Search
              ──► 09 Export/Import
              ──► 10 Calendar
06 Tags       ──► 08 Search
11 WebAuthn   ──► gates all features in production
```
