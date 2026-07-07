# PRP 10 — Calendar View

## Feature Overview

A dedicated `/calendar` page that displays the user's todos on a **monthly calendar grid**, colour-coded by priority. Singapore public holidays are shown with special styling. Users can navigate between months and click dates to see details. The calendar is a separate route from the main list view; both views share the same data source.

**Implementation phase**: Phase 4 — Productivity  
**Depends on**: 01 Todo CRUD (todos must exist to display on calendar)

---

## User Stories

| As a… | I want to… | So that… |
|-------|-----------|----------|
| User | See a monthly calendar of my todos | I get a big-picture view of my schedule |
| User | See todos colour-coded by priority on the calendar | I can spot heavy or critical days at a glance |
| User | Navigate to previous and next months | I can plan ahead or review past months |
| User | Jump back to the current month | I can quickly re-orient |
| User | See Singapore public holidays on the calendar | I can plan around them |
| User | See the current day highlighted | I always know where "today" is |

---

## User Flow

### Accessing the Calendar
1. User clicks **"Calendar"** button (purple) in the top navigation.
2. Browser navigates to `/calendar`.
3. Current month is displayed by default, anchored to Singapore timezone.

### Navigating Months
1. User clicks **◀** (previous month) or **▶** (next month) arrow buttons.
2. Calendar re-renders with the new month; todos and holidays update.
3. **"Today"** button jumps back to the current month.

### Viewing Todos on the Calendar
- Todos appear on their `due_date` cell.
- Each todo shown as a small coloured pill: 🔴 High / 🟡 Medium / 🔵 Low.
- If multiple todos share a date, they stack vertically.
- Todo title truncated to fit the cell.

### Viewing Holidays
- Singapore public holidays appear below the date number.
- Holiday name shown in a distinct style (e.g. grey italic or coloured banner).
- Holidays are pre-seeded in the database from a script.

### Returning to List View
- User clicks the browser **Back** button or a **"List"** navigation button.

---

## Technical Requirements

### Database Schema

```sql
CREATE TABLE IF NOT EXISTS holidays (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  date    TEXT NOT NULL,   -- YYYY-MM-DD, Singapore date
  name    TEXT NOT NULL,
  UNIQUE(date, name)
);
```

Holiday data is populated via a seed script (not entered by users):

```bash
# scripts/seed-holidays.ts
npx tsx scripts/seed-holidays.ts
```

### TypeScript Types

```typescript
// lib/db.ts
export interface Holiday {
  id: number;
  date: string;   // YYYY-MM-DD
  name: string;
}
```

### Database Operations

```typescript
// lib/db.ts — holidayDB
export const holidayDB = {
  findByMonth(year: number, month: number): Holiday[] {
    // month is 1-indexed
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    return db.prepare(
      "SELECT * FROM holidays WHERE date LIKE ? ORDER BY date ASC"
    ).all(`${prefix}-%`) as Holiday[];
  },
};
```

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/calendar` | Returns todos and holidays for a given month |

#### `GET /api/calendar?year=2025&month=11`

```typescript
// app/api/calendar/route.ts
import { getSession } from '@/lib/auth';
import { todoDB, holidayDB } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { searchParams } = request.nextUrl;
  const year = Number(searchParams.get('year'));
  const month = Number(searchParams.get('month'));

  if (!year || !month || month < 1 || month > 12) {
    return NextResponse.json({ error: 'Invalid year or month' }, { status: 400 });
  }

  // Fetch todos that have a due_date in the given month
  const allTodos = todoDB.findAll(session.userId);
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const monthTodos = allTodos.filter(
    t => t.due_date && t.due_date.startsWith(prefix)
  );

  const holidays = holidayDB.findByMonth(year, month);

  return NextResponse.json({ todos: monthTodos, holidays });
}
```

### Calendar Page Route

```typescript
// app/calendar/page.tsx
'use client';
```

The calendar page is a **client component** that:
1. Reads the current month/year from state (defaults to Singapore timezone).
2. Fetches `/api/calendar?year=Y&month=M` on mount and when month changes.
3. Renders a grid-based calendar.

### Calendar Grid Logic

```typescript
function buildCalendarDays(year: number, month: number): (Date | null)[] {
  // month is 1-indexed
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const startPad = firstDay.getDay(); // 0 = Sunday

  const days: (Date | null)[] = Array(startPad).fill(null);
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push(new Date(year, month - 1, d));
  }
  // pad end to complete last row
  while (days.length % 7 !== 0) days.push(null);
  return days;
}
```

### Timezone Handling

Always derive the current month from Singapore time:

```typescript
import { getSingaporeNow } from '@/lib/timezone';

const now = getSingaporeNow();
const [year, setYear] = useState(now.getFullYear());
const [month, setMonth] = useState(now.getMonth() + 1); // 1-indexed
```

---

## UI Components

### Calendar Page (`app/calendar/page.tsx`)

```tsx
'use client';
import { useState, useEffect } from 'react';
import { getSingaporeNow } from '@/lib/timezone';
import type { Todo, Holiday } from '@/lib/db';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const PRIORITY_PILL: Record<string, string> = {
  high:   'bg-red-500 text-white',
  medium: 'bg-yellow-400 text-gray-900',
  low:    'bg-blue-400 text-white',
};

export default function CalendarPage() {
  const now = getSingaporeNow();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);

  useEffect(() => {
    fetch(`/api/calendar?year=${year}&month=${month}`)
      .then(r => r.json())
      .then(data => {
        setTodos(data.todos ?? []);
        setHolidays(data.holidays ?? []);
      });
  }, [year, month]);

  const days = buildCalendarDays(year, month);

  const todosOnDay = (dateStr: string) =>
    todos.filter(t => t.due_date?.startsWith(dateStr));

  const holidayOnDay = (dateStr: string) =>
    holidays.filter(h => h.date === dateStr);

  const goToPrev = () => {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };

  const goToNext = () => {
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  const goToToday = () => {
    const n = getSingaporeNow();
    setYear(n.getFullYear());
    setMonth(n.getMonth() + 1);
  };

  const todayStr = getSingaporeNow().toISOString().slice(0, 10);

  return (
    <div className="max-w-5xl mx-auto p-4">
      {/* Navigation */}
      <div className="flex items-center gap-3 mb-4">
        <button onClick={goToPrev} className="px-3 py-1.5 border rounded hover:bg-gray-50">◀</button>
        <h2 className="text-xl font-semibold flex-1 text-center">
          {MONTHS[month - 1]} {year}
        </h2>
        <button onClick={goToNext} className="px-3 py-1.5 border rounded hover:bg-gray-50">▶</button>
        <button onClick={goToToday} className="px-3 py-1.5 bg-blue-500 text-white rounded text-sm">
          Today
        </button>
      </div>

      {/* Weekday Headers */}
      <div className="grid grid-cols-7 text-center text-xs font-medium text-gray-500 mb-1">
        {WEEKDAYS.map(d => <div key={d}>{d}</div>)}
      </div>

      {/* Days Grid */}
      <div className="grid grid-cols-7 border-l border-t">
        {days.map((day, i) => {
          const dateStr = day ? day.toISOString().slice(0, 10) : '';
          const isToday = dateStr === todayStr;
          const dayTodos = day ? todosOnDay(dateStr) : [];
          const dayHolidays = day ? holidayOnDay(dateStr) : [];

          return (
            <div
              key={i}
              className={`min-h-[80px] border-r border-b p-1 ${day ? '' : 'bg-gray-50 dark:bg-gray-900'}`}
            >
              {day && (
                <>
                  <span className={`text-sm font-medium block mb-0.5 ${
                    isToday
                      ? 'bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center'
                      : 'text-gray-700 dark:text-gray-300'
                  }`}>
                    {day.getDate()}
                  </span>

                  {/* Holidays */}
                  {dayHolidays.map(h => (
                    <p key={h.id} className="text-xs text-gray-400 italic truncate">{h.name}</p>
                  ))}

                  {/* Todos */}
                  {dayTodos.map(t => (
                    <span
                      key={t.id}
                      title={t.title}
                      className={`block text-xs px-1 py-0.5 rounded mb-0.5 truncate ${PRIORITY_PILL[t.priority]}`}
                    >
                      {t.title}
                    </span>
                  ))}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

### Navigation Button in Main Page

```tsx
// app/page.tsx — top navigation
<Link href="/calendar">
  <button className="bg-purple-500 hover:bg-purple-600 text-white px-3 py-1.5 rounded text-sm">
    Calendar
  </button>
</Link>
```

---

## Holiday Seed Script

```typescript
// scripts/seed-holidays.ts
import Database from 'better-sqlite3';
import path from 'path';

const db = new Database(path.join(process.cwd(), 'todos.db'));

const SINGAPORE_HOLIDAYS_2025 = [
  { date: '2025-01-01', name: "New Year's Day" },
  { date: '2025-01-29', name: 'Chinese New Year' },
  { date: '2025-01-30', name: 'Chinese New Year (Day 2)' },
  { date: '2025-03-31', name: 'Hari Raya Puasa' },
  { date: '2025-04-18', name: 'Good Friday' },
  { date: '2025-05-01', name: 'Labour Day' },
  { date: '2025-05-12', name: 'Vesak Day' },
  { date: '2025-06-07', name: 'Hari Raya Haji' },
  { date: '2025-08-09', name: 'National Day' },
  { date: '2025-10-20', name: 'Deepavali' },
  { date: '2025-12-25', name: 'Christmas Day' },
];

const insert = db.prepare(
  'INSERT OR IGNORE INTO holidays (date, name) VALUES (?, ?)'
);

const insertAll = db.transaction((holidays: typeof SINGAPORE_HOLIDAYS_2025) => {
  holidays.forEach(h => insert.run(h.date, h.name));
});

insertAll(SINGAPORE_HOLIDAYS_2025);
console.log(`Seeded ${SINGAPORE_HOLIDAYS_2025.length} Singapore public holidays.`);
```

---

## Edge Cases

| Scenario | Expected Behaviour |
|----------|-------------------|
| Month with no todos | Calendar renders normally; all day cells are empty |
| Todo with no due date | Not shown on calendar (only due-dated todos are displayed) |
| Multiple todos on same day | Stack vertically; overflow handled with CSS `overflow-hidden` |
| More todos than cell height allows | Show first N; remainder truncated (no click-to-expand in MVP) |
| Navigating to a past month | Shows historical todos with their original due dates |
| Navigating to a future month | Shows planned todos |
| Year boundary: December → January | Year increments correctly; January of new year fetched |
| `today` in December and viewing January of next year | "Today" button resets to December of current year |
| Holidays table empty (seed not run) | Calendar renders without holiday entries; no error |
| Timezone mismatch (browser != SGT) | `getSingaporeNow()` ensures month boundaries use SGT |
| API `month` param out of range (0 or 13) | API returns 400 |

---

## Acceptance Criteria

- [ ] `/calendar` route renders a monthly grid view.
- [ ] Default month shown is the current month in Singapore timezone.
- [ ] ◀ / ▶ buttons navigate to previous/next month.
- [ ] "Today" button returns to the current Singapore month.
- [ ] Current day is visually highlighted (blue circle or equivalent).
- [ ] Todos with due dates appear on their corresponding day cell.
- [ ] Todo pills are colour-coded: red = high, yellow = medium, blue = low.
- [ ] Singapore public holidays appear on the calendar when seeded.
- [ ] Empty day cells render without errors.
- [ ] "Calendar" button in the main list navigates to `/calendar`.
- [ ] API `/api/calendar` returns 401 for unauthenticated requests.
- [ ] API `/api/calendar` returns 400 for invalid year/month parameters.

---

## Testing Requirements

### E2E Tests (Playwright)

```typescript
// tests/10-calendar.spec.ts
test('navigates to calendar page', async ({ page }) => {
  await page.click('[data-testid="calendar-nav-btn"]');
  await expect(page).toHaveURL('/calendar');
});

test('displays current month and year', async ({ page }) => {
  await page.goto('/calendar');
  const now = new Date().toLocaleString('en-SG', { timeZone: 'Asia/Singapore' });
  // e.g. verify "November 2025" or similar is shown
  await expect(page.locator('[data-testid="calendar-month-title"]')).toBeVisible();
});

test('navigates to next and previous month', async ({ page }) => {
  await page.goto('/calendar');
  const initialTitle = await page.locator('[data-testid="calendar-month-title"]').textContent();
  await page.click('[data-testid="next-month-btn"]');
  const nextTitle = await page.locator('[data-testid="calendar-month-title"]').textContent();
  expect(nextTitle).not.toBe(initialTitle);
  await page.click('[data-testid="prev-month-btn"]');
  expect(await page.locator('[data-testid="calendar-month-title"]').textContent()).toBe(initialTitle);
});

test('today button returns to current month', async ({ page }) => {
  await page.goto('/calendar');
  await page.click('[data-testid="next-month-btn"]');
  await page.click('[data-testid="next-month-btn"]');
  await page.click('[data-testid="today-btn"]');
  // Verify current month shown (check today's date cell is highlighted)
  await expect(page.locator('[data-testid="calendar-today"]')).toBeVisible();
});

test('todo appears on its due date', async ({ page }) => {
  // Assume a todo exists with due_date today
  const today = new Date().toISOString().slice(0, 10);
  await page.goto('/calendar');
  await expect(page.locator(`[data-testid="day-${today}"]`)).toContainText('');
  // More specific: check a known todo title appears in that cell
});
```

### Unit Tests

- `buildCalendarDays` generates correct number of cells (multiple of 7)
- `buildCalendarDays` starts with correct padding for a given month's first weekday
- `buildCalendarDays` produces 28, 29, 30, or 31 non-null cells matching the month
- `holidayDB.findByMonth(2025, 11)` returns only November 2025 holidays
- API returns 400 for `month=0` and `month=13`

---

## Out of Scope

- Week or day view (monthly only for MVP)
- Click on a date to create a todo directly from the calendar
- Drag-and-drop rescheduling on the calendar
- Showing completed todos on the calendar
- Multiple calendar month display
- iCal / Google Calendar sync

---

## Success Metrics

- Calendar page loads (API + render) in < 500 ms
- Month navigation re-renders in < 100 ms (client-side date grid + one API fetch)
- 100% of todos with due dates in the current month appear on the correct calendar day
- Today's date cell always highlighted correctly in Singapore timezone
- Zero rendering errors for months with 28, 29, 30, and 31 days
