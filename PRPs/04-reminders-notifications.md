# PRP 04 — Reminders & Notifications

## Feature Overview

Allow users to set a reminder on any todo that has a due date. The system polls every minute for pending reminders and fires a **browser push notification** when the reminder time arrives. Each reminder fires exactly once per todo instance (tracked via `last_notification_sent`). All timing calculations use the **Singapore timezone**.

**Implementation phase**: Phase 2 — Core Features  
**Depends on**: 01 Todo CRUD (base schema includes `reminder_minutes`, `last_notification_sent`)  
**Required by**: 03 Recurring Todos (new recurring instances inherit `reminder_minutes`)

---

## User Stories

| As a… | I want to… | So that… |
|-------|-----------|----------|
| User | Enable browser notifications once | The app can alert me proactively |
| User | Set a reminder timing when creating a todo | I get notified before a deadline |
| User | Choose from preset intervals (15m–1 week) | I can match how much lead time I need |
| User | See a 🔔 badge on todos that have reminders | I can tell at a glance which todos will alert me |
| User | Receive exactly one notification per todo | I am not spammed with duplicate alerts |
| User | Have reminders work even with the browser tab in the background | I don't miss alerts when I'm in another app |

---

## User Flow

### Enabling Notifications (one-time)
1. User clicks **"🔔 Enable Notifications"** button (orange, top-right).
2. Browser shows its native permission prompt.
3. User grants permission.
4. Button changes to **"🔔 Notifications On"** with a green badge.
5. Client starts polling `/api/notifications/check` every 60 seconds.

### Setting a Reminder on a Todo
1. User creates or edits a todo that has a due date.
2. A **Reminder** dropdown appears below the due date picker (disabled if no due date set).
3. User selects an interval (e.g. `1 hour before`).
4. Todo is saved; a `🔔 1h` badge appears on the card.

### Receiving a Notification
1. Polling hits `/api/notifications/check`.
2. Server returns any todos whose reminder time has passed but `last_notification_sent` is NULL.
3. Client triggers `new Notification(title, { body })` for each.
4. Server marks `last_notification_sent = now()` for each fired notification.

### Removing a Reminder
1. User edits the todo.
2. User selects **"None"** in the Reminder dropdown.
3. `reminder_minutes` set to NULL; `last_notification_sent` reset to NULL.

---

## Technical Requirements

### Schema

Uses existing columns in the `todos` table (from PRP 01):

```sql
reminder_minutes       INTEGER,   -- minutes before due_date; NULL = no reminder
last_notification_sent TEXT        -- ISO 8601; NULL = not yet sent
```

### TypeScript Types

```typescript
// lib/db.ts
export type ReminderOption = 15 | 30 | 60 | 120 | 1440 | 2880 | 10080; // minutes

export const REMINDER_LABELS: Record<ReminderOption, string> = {
  15:    '15 minutes before',
  30:    '30 minutes before',
  60:    '1 hour before',
  120:   '2 hours before',
  1440:  '1 day before',
  2880:  '2 days before',
  10080: '1 week before',
};

export const REMINDER_BADGE: Record<ReminderOption, string> = {
  15:    '15m',
  30:    '30m',
  60:    '1h',
  120:   '2h',
  1440:  '1d',
  2880:  '2d',
  10080: '1w',
};
```

### Notification Check API

```typescript
// app/api/notifications/check/route.ts
import { getSession } from '@/lib/auth';
import { todoDB } from '@/lib/db';
import { getSingaporeNow } from '@/lib/timezone';
import { NextResponse } from 'next/server';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const now = getSingaporeNow();

  // Find todos where reminder should fire:
  //   due_date - reminder_minutes <= now  AND  last_notification_sent IS NULL
  const pending = todoDB.findPendingReminders(session.userId, now);

  if (pending.length > 0) {
    const ids = pending.map(t => t.id);
    todoDB.markNotificationSent(ids, now.toISOString());
  }

  return NextResponse.json(pending);
}
```

### Database Operations

```typescript
// lib/db.ts — additions to todoDB
findPendingReminders(userId: number, now: Date): Todo[] {
  return db.prepare(`
    SELECT * FROM todos
    WHERE user_id = ?
      AND completed = 0
      AND reminder_minutes IS NOT NULL
      AND due_date IS NOT NULL
      AND last_notification_sent IS NULL
      AND datetime(due_date, '-' || reminder_minutes || ' minutes') <= ?
  `).all(userId, now.toISOString()) as Todo[];
},

markNotificationSent(ids: number[], sentAt: string): void {
  const placeholders = ids.map(() => '?').join(', ');
  db.prepare(
    `UPDATE todos SET last_notification_sent = ? WHERE id IN (${placeholders})`
  ).run(sentAt, ...ids);
},
```

### Client-Side Polling Hook

```typescript
// lib/hooks/useNotifications.ts
import { useEffect, useRef, useCallback } from 'react';
import type { Todo } from '@/lib/db';

export function useNotifications(enabled: boolean) {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const check = useCallback(async () => {
    if (!enabled || Notification.permission !== 'granted') return;

    const res = await fetch('/api/notifications/check');
    if (!res.ok) return;

    const todos: Todo[] = await res.json();
    todos.forEach(todo => {
      new Notification(`Reminder: ${todo.title}`, {
        body: todo.due_date
          ? `Due: ${new Date(todo.due_date).toLocaleString('en-SG', { timeZone: 'Asia/Singapore' })}`
          : 'Task reminder',
        icon: '/favicon.ico',
      });
    });
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    check(); // immediate check on enable
    intervalRef.current = setInterval(check, 60_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [enabled, check]);
}
```

### Permission Request

```typescript
async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}
```

---

## UI Components

### Enable Notifications Button

```tsx
function NotificationButton({
  enabled,
  onEnable,
}: {
  enabled: boolean;
  onEnable: () => void;
}) {
  if (enabled) {
    return (
      <button className="bg-green-500 text-white px-3 py-1.5 rounded text-sm flex items-center gap-1">
        🔔 <span>Notifications On</span>
      </button>
    );
  }
  return (
    <button
      onClick={onEnable}
      className="bg-orange-500 hover:bg-orange-600 text-white px-3 py-1.5 rounded text-sm flex items-center gap-1"
    >
      🔔 <span>Enable Notifications</span>
    </button>
  );
}
```

### Reminder Dropdown (Form & Edit Modal)

```tsx
function ReminderSelect({
  value,
  hasDueDate,
  onChange,
}: {
  value: number | null;
  hasDueDate: boolean;
  onChange: (v: number | null) => void;
}) {
  return (
    <select
      value={value ?? ''}
      disabled={!hasDueDate}
      onChange={e => onChange(e.target.value ? Number(e.target.value) : null)}
      className="border rounded px-3 py-2 text-sm disabled:opacity-50"
    >
      <option value="">None</option>
      <option value="15">15 minutes before</option>
      <option value="30">30 minutes before</option>
      <option value="60">1 hour before</option>
      <option value="120">2 hours before</option>
      <option value="1440">1 day before</option>
      <option value="2880">2 days before</option>
      <option value="10080">1 week before</option>
    </select>
  );
}
```

### Reminder Badge

```tsx
const BADGE_MAP: Record<number, string> = {
  15: '15m', 30: '30m', 60: '1h', 120: '2h',
  1440: '1d', 2880: '2d', 10080: '1w',
};

function ReminderBadge({ minutes }: { minutes: number }) {
  const label = BADGE_MAP[minutes] ?? `${minutes}m`;
  return (
    <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-300 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-700">
      🔔 {label}
    </span>
  );
}
```

---

## Edge Cases

| Scenario | Expected Behaviour |
|----------|-------------------|
| Reminder set but no browser permission | Badge shown; no notification fired; user prompted to enable |
| Browser does not support Notifications API | Button hidden; no error thrown |
| Reminder time already passed when todo is created | `findPendingReminders` will catch it on the next poll (within 60s) |
| Todo completed before reminder fires | `completed = 1` excludes it from `findPendingReminders` query |
| Reminder dropdown enabled then due date removed | `reminder_minutes` reset to NULL; `last_notification_sent` reset to NULL |
| Multiple todos with same reminder time | All returned in one poll; all notifications fired; all marked sent |
| User changes reminder on a todo already sent | `last_notification_sent` should be reset to NULL so new reminder fires |
| Recurring todo completion (PRP 03) | New instance has `last_notification_sent = NULL` so reminder resets |
| Polling interval is exactly 60s | Reminder may fire up to 60s late; acceptable for this use case |
| Tab closed during poll interval | No notification; next tab open triggers immediate check |

---

## Acceptance Criteria

- [ ] "Enable Notifications" button visible in the top-right navigation area.
- [ ] Clicking the button triggers the native browser permission prompt.
- [ ] After permission granted, button changes to green "Notifications On".
- [ ] Reminder dropdown in create/edit forms is disabled when no due date is set.
- [ ] Reminder dropdown contains all 7 preset options plus "None".
- [ ] Todos with reminders display a `🔔 <label>` badge.
- [ ] Polling hits `/api/notifications/check` every 60 seconds when enabled.
- [ ] Notification fires only once per todo (duplicate prevented by `last_notification_sent`).
- [ ] Completed todos are excluded from reminder checks.
- [ ] Removing a reminder (selecting "None") resets `reminder_minutes` and `last_notification_sent`.
- [ ] API `/api/notifications/check` returns 401 for unauthenticated requests.
- [ ] Recurring todo's new instance (PRP 03) has `last_notification_sent = NULL` to allow the reminder to fire again.

---

## Testing Requirements

### E2E Tests (Playwright)

```typescript
// tests/04-reminders.spec.ts
test('reminder dropdown disabled when no due date', async ({ page }) => {
  await expect(page.locator('[data-testid="reminder-select"]')).toBeDisabled();
});

test('reminder badge appears after setting reminder', async ({ page }) => {
  await setTodoDueDate(page, futureIso(1));
  await page.selectOption('[data-testid="reminder-select"]', '60');
  await page.click('[data-testid="add-todo-btn"]');
  await expect(page.locator('text=🔔 1h')).toBeVisible();
});

test('notification fires when reminder time passes', async ({ page }) => {
  // Create a todo with due date 1 minute from now and 15m reminder
  // (effectively already in reminder window)
  // Wait for poll; check notification API was called
  const response = await page.request.get('/api/notifications/check');
  const todos = await response.json();
  expect(todos.length).toBeGreaterThan(0);
});

test('completed todo excluded from reminder check', async ({ page }) => {
  // Complete a todo that has a pending reminder
  await page.check('[data-testid="todo-checkbox-1"]');
  const response = await page.request.get('/api/notifications/check');
  const todos = await response.json();
  expect(todos.every((t: { id: number }) => t.id !== 1)).toBe(true);
});
```

### Unit Tests

- `findPendingReminders` returns only todos past reminder threshold
- `findPendingReminders` excludes completed todos
- `markNotificationSent` updates `last_notification_sent` for all given IDs
- `findPendingReminders` returns empty array if `last_notification_sent` already set
- `REMINDER_BADGE` map covers all 7 preset values
- `calculateNextDueDate` (PRP 03) — verify new instance has `last_notification_sent = null`

---

## Out of Scope

- Custom notification sounds or vibration patterns
- Email or SMS notifications
- Recurring reminder intervals (e.g. remind every 15m until dismissed)
- Notification history / log
- Snooze functionality
- Push notifications via service workers (only in-tab browser notifications)

---

## Success Metrics

- Notification fires within 60 seconds of the configured reminder time
- Zero duplicate notifications for a single todo instance
- `/api/notifications/check` responds in < 100 ms for 1000 todos
- `last_notification_sent` correctly set for 100% of todos after notification fires
- Reminder badge renders on 100% of todos with `reminder_minutes` set
