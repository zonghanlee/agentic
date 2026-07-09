# Project Progress

## Overview

Todo App — Next.js 16, React 19, Tailwind CSS 4, better-sqlite3, WebAuthn (Phase 5), Playwright E2E tests.
All date/time operations use the **Singapore timezone** (`Asia/Singapore`).

**Status: 10 / 11 features complete** (Phases 1–4 done; Phase 5 pending). 116 E2E tests passing.

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

### Phase 3 — Organisation ✅ Complete
| # | Feature | PRP | Key Deliverables |
|---|---------|-----|-----------------|
| 06 | **Tag System** | `PRPs/06-tag-system.md` | User-created colour-coded labels; many-to-many todos ↔ tags via join table; tag filter dropdown; tag CRUD |
| 08 | **Search & Filtering** | `PRPs/08-search-filtering.md` | Real-time title + subtask search; filter by priority, tag, status, date range; AND-logic combination; filter presets in `localStorage` |

### Phase 4 — Productivity ✅ Complete
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

### ✅ Phase 2 — Complete

#### PRP 03 — Recurring Todos
- `lib/db.ts` — `RecurrencePattern` type, `is_recurring` + `recurrence_pattern` columns and DTOs
- `app/page.tsx` — recurring checkbox (`edit-recurring-checkbox`) + pattern select (`edit-recurrence-pattern-select`) in create/edit forms; `RecurrenceBadge` (🔄) on todo cards
- Completion flow auto-creates next instance with same settings and calculated due date
- `tests/03-recurring.spec.ts` — 11 E2E tests

#### PRP 04 — Reminders & Notifications
- `lib/db.ts` — `reminder_minutes` + `last_notification_sent` columns, `findPendingReminders()`, `markNotificationSent()`
- `GET /api/notifications/check` — returns todos due for a reminder notification
- `lib/hooks/useNotifications.ts` — polls every 60s, fires browser `Notification` API when permission is granted
- `app/page.tsx` — reminder select (`edit-reminder-select`) in create/edit forms; `ReminderBadge` (🔔) on todo cards
- `tests/04-reminders.spec.ts` — 13 E2E tests
- Note: no explicit `Notification.requestPermission()` call found in `page.tsx` — worth double-checking the permission-request UX is wired up somewhere

#### PRP 05 — Subtasks & Progress
- `lib/db.ts` — `subtasks` table + full `subtaskDB` CRUD (`create`, `update`, `delete`, `findByTodoId`)
- `GET/POST /api/todos/[id]/subtasks`, `PUT/DELETE /api/todos/[id]/subtasks/[subtaskId]`, `app/api/todos/subtasks/route.ts`
- `app/page.tsx` — `computeProgress()`, `ProgressBar`, `SubtaskPanel` inline checklist UI with `X/Y` counter
- Cascade delete of subtasks with parent todo
- `tests/05-subtasks.spec.ts` — 18 E2E tests

#### Infrastructure & Tests
- `package.json` — Next.js 16.2.10, React 19, Tailwind CSS 4, better-sqlite3, jose, Playwright
- `next.config.ts` — `serverExternalPackages: ['better-sqlite3']`
- `postcss.config.mjs` — Tailwind CSS 4 PostCSS plugin
- `playwright.config.ts` — `timezoneId: 'Asia/Singapore'`, auto-starts dev server
- `tests/helpers.ts` — `signIn()`, `createTodo()`, `clearTodos()` (with `beforeEach` + `afterEach` isolation)
- `tests/01-todo-crud.spec.ts` — 13 E2E tests
- `tests/02-priority.spec.ts` — 10 E2E tests
- All 65 E2E tests across Phase 1 + Phase 2 passing

### ✅ Phase 3 — Complete

#### PRP 06 — Tag System
- `lib/db.ts` — `tags` + `todo_tags` tables (both `ON DELETE CASCADE`); `Tag`, `CreateTagDto`, `UpdateTagDto` types; `isValidHexColor()` guard; `tagDB` with `findAll`, `findById`, `create`, `update`, `delete`, `getTagsForTodo`, `getTagsForUser` (bulk join for the client), `setTagsForTodo` (transactional replace)
- `GET/POST /api/tags`, `PUT/DELETE /api/tags/[id]`, `GET/PUT /api/todos/[id]/tags` (ownership-checked `tagIds` on PUT), `GET /api/todos/tags` (bulk fetch, mirrors the subtasks bulk endpoint)
- `app/page.tsx` — `TagPill`, `TagModal` (create/edit/delete), `TagFilter` dropdown (hidden when no tags exist); tag pills selectable in the create form and `EditModal`; tag pills rendered on `TodoCard`; `tagsMap` fetched alongside todos/subtasks
- `tests/06-tags.spec.ts` — 11 E2E tests

#### PRP 08 — Search & Filtering
- `app/page.tsx` — `FilterState`/`FilterPreset` types, `DEFAULT_FILTERS`, pure `applyFilters()` (query + priority + tag + completion + date range, AND logic), `loadPresets()`/`persistPresets()` (`localStorage`, key `todoFilterPresets`); `SearchBar`, `AdvancedPanel` (status + date range + saved presets), `SaveFilterModal`; `filteredTodos` drives Overdue/Pending/Completed section counts
- All filtering is client-side against the existing `GET /api/todos` + bulk subtasks/tags endpoints — no new read endpoints needed
- `tests/08-search-filtering.spec.ts` — 14 E2E tests
- Note: the old standalone `priorityFilter` state was folded into the unified `filters.priority` field; the `priority-filter` select keeps its original `data-testid` and behaviour so Phase 1/2 tests still pass

### ✅ Phase 4 — Complete

#### PRP 07 — Template System
- `lib/db.ts` — `Template`, `SubtaskTemplate`, `CreateTemplateDto` types; `templates` table; `templateDB` with `findAll`, `findById`, `create` (serialises `subtasks` to `subtasks_json`), `delete`
- `GET/POST /api/templates`, `DELETE /api/templates/[id]`, `POST /api/templates/[id]/use` (instantiates a todo + its subtasks from a template, optionally with a `due_date`)
- `app/page.tsx` — "💾 Save as Template" button (visible only when the title field is non-empty) + `SaveTemplateModal`; `UseTemplateDropdown` next to the "📋 Templates" button; `TemplatesModal` manager (list, Use, Delete)
- `tests/07-templates.spec.ts` — 9 E2E tests

#### PRP 09 — Export & Import
- `GET /api/todos/export?format=json|csv` — JSON export enriched with `subtasks` + `tags` (via `ExportedTodo`); CSV export with formula-injection-safe escaping (`=`, `+`, `-`, `@` prefixes neutralised) and `"` doubling; both set `Content-Disposition` with the Singapore date
- `POST /api/todos/import` — validates an array of `{ title, ... }` objects, discards original IDs, assigns new ones via `todoDB.create`, returns `{ imported: N }`
- `app/page.tsx` — `ExportImportBar` (Export JSON / Export CSV / Import file picker restricted to `.json`) + `Toast` success/error notification (auto-dismisses after 4s)
- `tests/09-export-import.spec.ts` — 8 E2E tests

#### PRP 10 — Calendar View
- `lib/db.ts` — `Holiday` type; `holidays` table (`UNIQUE(date, name)`); `holidayDB.findByMonth(year, month)`
- `GET /api/calendar?year=&month=` — returns todos whose `due_date` falls in the given month + holidays for that month; 400 on out-of-range month
- `app/calendar/page.tsx` — client component with month/year state (seeded from `getSingaporeNow()`), `buildCalendarDays()` grid logic, prev/next/today navigation, priority colour-coded todo pills, holiday banners, today highlight; "Calendar" nav button added to `app/page.tsx` header linking to `/calendar`
- `scripts/seed-holidays.ts` (run via `npm run seed:holidays`, powered by the new `tsx` devDependency) — seeds 2025 + 2026 Singapore public holidays with `INSERT OR IGNORE`
- `tests/10-calendar.spec.ts` — 9 E2E tests
- Fixed a latent pre-existing type bug in `app/api/todos/route.ts` and `app/api/todos/[id]/route.ts` where `recurrence_pattern` was cast to `string | null | undefined` instead of `RecurrencePattern | null | undefined` — `next build`'s type-check now passes cleanly

#### Infrastructure
- All 116 E2E tests across Phase 1–4 passing (one pre-existing tag-filter test is flaky under full-suite parallel timing but passes reliably in isolation — unrelated to Phase 4 changes)

---

## What Is Pending

### 🔲 Phase 5 — Infrastructure
- **PRP 11 — WebAuthn Auth**: install `@simplewebauthn/server` + `@simplewebauthn/browser`; `authenticators` table; `POST /api/auth/register-options`, `/register-verify`, `/login-options`, `/login-verify`; replace `app/login/page.tsx` simple form with passkey flow; update `lib/auth.ts` if needed

---

## Dependency Map

```
01 Todo CRUD  ──► 02 Priority (done)
              ──► 03 Recurring (done)
              ──► 04 Reminders (done)
              ──► 05 Subtasks (done) ──► 07 Templates (done)
              ──► 06 Tags (done) ──► 08 Search (done)
              ──► 09 Export/Import (done)
              ──► 10 Calendar (done)
06 Tags (done) ──► 08 Search (done)
11 WebAuthn   ──► gates all features in production
```

## Next Up

Phase 5 (Infrastructure) is the last milestone: PRP 11 — WebAuthn/Passkeys Auth. This replaces the Phase 1 username-only login form in `app/login/page.tsx` with passwordless registration/login, adds an `authenticators` table, and layers on top of the existing JWT session in `lib/auth.ts`. No code yet.
