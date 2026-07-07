# PRP 03 — Recurring Todos

## Feature Overview

Allow users to mark a todo as **recurring** with a pattern of `daily`, `weekly`, `monthly`, or `yearly`. When a recurring todo is marked complete, the system automatically creates the next instance with the same settings (priority, tags, reminder, recurrence pattern) and a calculated new due date. The current instance is marked complete normally. This feature requires a due date to be meaningful.

**Implementation phase**: Phase 2 — Core Features  
**Depends on**: 01 Todo CRUD (base todo schema and CRUD operations)  
**Required by**: 07 Template System (templates can carry recurrence settings)

---

## User Stories

| As a… | I want to… | So that… |
|-------|-----------|----------|
| User | Mark a todo as recurring when creating it | It automatically reappears on a schedule |
| User | Choose a recurrence pattern (daily/weekly/monthly/yearly) | I can match the pattern to my routine |
| User | See a visual badge showing the recurrence pattern | I can distinguish recurring tasks at a glance |
| User | Complete a recurring todo and have the next one created | I don't have to manually recreate repeating tasks |
| User | See the next occurrence's due date immediately | I know when the task will appear again |
| User | Have the new instance inherit all my original settings | I don't have to reconfigure priority, tags, or reminders each time |

---

## User Flow

### Creating a Recurring Todo
1. User fills in the todo title.
2. User **checks the "Repeat" checkbox**.
3. A **recurrence pattern dropdown** appears; user selects `daily`, `weekly`, `monthly`, or `yearly`.
4. User **sets a due date** (required — the system cannot calculate the next occurrence without it).
5. User clicks **"Add"**.
6. The todo is created with a **🔄 badge** showing the pattern (e.g. `🔄 weekly`).

### Completing a Recurring Todo
1. User checks the todo's checkbox.
2. Current todo is marked complete and moves to the **Completed** section.
3. A **new todo** is automatically created with:
   - Same title
   - Same priority
   - Same recurrence pattern (`is_recurring = true`, same `recurrence_pattern`)
   - Same `reminder_minutes` (if set)
   - Same tags
   - Due date = old due date + pattern interval
4. The new instance appears in **Pending** with the next due date.

### Editing a Recurring Todo
1. User clicks **"Edit"** on a recurring todo.
2. Edit modal shows the recurrence checkbox (pre-checked) and pattern dropdown.
3. User can change the pattern or uncheck recurring entirely.
4. Saving updates the current instance only (no retroactive changes to past instances).

---

## Technical Requirements

### Schema

Uses existing columns in the `todos` table (from PRP 01):

```sql
is_recurring       INTEGER NOT NULL DEFAULT 0,   -- 0 | 1
recurrence_pattern TEXT,                          -- 'daily'|'weekly'|'monthly'|'yearly'
```

No new tables required.

### TypeScript Types

```typescript
// lib/db.ts
export type RecurrencePattern = 'daily' | 'weekly' | 'monthly' | 'yearly';

// Extends CreateTodoDto from PRP 01
export interface CreateTodoDto {
  title: string;
  due_date?: string | null;
  priority?: Priority;
  is_recurring?: boolean;
  recurrence_pattern?: RecurrencePattern | null;
  reminder_minutes?: number | null;
}
```

### Due Date Calculation

```typescript
// lib/timezone.ts
export function calculateNextDueDate(
  currentDueDate: string,
  pattern: RecurrencePattern
): string {
  const date = new Date(currentDueDate);

  switch (pattern) {
    case 'daily':
      date.setDate(date.getDate() + 1);
      break;
    case 'weekly':
      date.setDate(date.getDate() + 7);
      break;
    case 'monthly':
      date.setMonth(date.getMonth() + 1);
      break;
    case 'yearly':
      date.setFullYear(date.getFullYear() + 1);
      break;
  }

  return date.toISOString();
}
```

### Completing a Recurring Todo (API Logic)

The `PUT /api/todos/[id]` handler must detect when `completed` is being set to `true` on a recurring todo and create the next instance:

```typescript
// app/api/todos/[id]/route.ts  — PUT handler
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const todoId = Number(id);

  const existing = todoDB.findById(todoId, session.userId);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Complete recurring todo → spawn next instance
  if (body.completed === true && existing.is_recurring && existing.due_date) {
    const nextDue = calculateNextDueDate(existing.due_date, existing.recurrence_pattern!);

    const nextTodo = todoDB.create(session.userId, {
      title: existing.title,
      due_date: nextDue,
      priority: existing.priority,
      is_recurring: true,
      recurrence_pattern: existing.recurrence_pattern ?? undefined,
      reminder_minutes: existing.reminder_minutes ?? undefined,
    });

    // Copy tags if tag system is implemented (PRP 06)
    // copyTagsToNewTodo(existing.id, nextTodo.id);
  }

  const updated = todoDB.update(todoId, session.userId, body);
  return NextResponse.json(updated);
}
```

### Validation Rules

```typescript
const VALID_PATTERNS: RecurrencePattern[] = ['daily', 'weekly', 'monthly', 'yearly'];

// In POST/PUT handlers:
if (is_recurring && !due_date) {
  return NextResponse.json(
    { error: 'A due date is required for recurring todos' },
    { status: 400 }
  );
}

if (is_recurring && recurrence_pattern && !VALID_PATTERNS.includes(recurrence_pattern)) {
  return NextResponse.json({ error: 'Invalid recurrence pattern' }, { status: 400 });
}

if (is_recurring && !recurrence_pattern) {
  return NextResponse.json(
    { error: 'Recurrence pattern is required when is_recurring is true' },
    { status: 400 }
  );
}
```

---

## UI Components

### Recurrence Toggle in Todo Form

```tsx
function RecurrenceFields({
  isRecurring,
  pattern,
  hasDueDate,
  onToggle,
  onPatternChange,
}: {
  isRecurring: boolean;
  pattern: RecurrencePattern;
  hasDueDate: boolean;
  onToggle: (v: boolean) => void;
  onPatternChange: (p: RecurrencePattern) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={isRecurring}
          disabled={!hasDueDate}
          onChange={e => onToggle(e.target.checked)}
        />
        <span className="text-sm">Repeat</span>
      </label>

      {isRecurring && (
        <select
          value={pattern}
          onChange={e => onPatternChange(e.target.value as RecurrencePattern)}
          className="border rounded px-2 py-1 text-sm"
        >
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
          <option value="yearly">Yearly</option>
        </select>
      )}

      {!hasDueDate && (
        <span className="text-xs text-gray-400">Set a due date to enable recurrence</span>
      )}
    </div>
  );
}
```

### Recurrence Badge on Todo Card

```tsx
const PATTERN_LABEL: Record<RecurrencePattern, string> = {
  daily:   'daily',
  weekly:  'weekly',
  monthly: 'monthly',
  yearly:  'yearly',
};

function RecurrenceBadge({ pattern }: { pattern: RecurrencePattern }) {
  return (
    <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-300 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-700">
      🔄 {PATTERN_LABEL[pattern]}
    </span>
  );
}
```

---

## Edge Cases

| Scenario | Expected Behaviour |
|----------|-------------------|
| Recurring todo without due date | API returns 400; "Repeat" checkbox disabled in UI when no due date |
| Monthly recurrence on Jan 31 | Next due = Feb 28/29 (JS `setMonth` handles this natively) |
| Yearly recurrence on Feb 29 (leap year) | Next due = Feb 28 the following year |
| Completing recurring todo with no tags yet | Next instance created without tags (no error) |
| Unchecking "recurring" on edit | Sets `is_recurring = 0`, clears `recurrence_pattern`; no new instance on next complete |
| Deleting a recurring todo | Only current instance deleted; no cascading to future instances (none exist yet) |
| Recurring todo with reminder | Next instance inherits same `reminder_minutes` and resets `last_notification_sent` to NULL |
| User completes recurring todo twice rapidly | Second complete just marks an already-completed todo; no duplicate next instance created (check `!existing.completed` before spawning) |

---

## Acceptance Criteria

- [ ] "Repeat" checkbox appears in the create form.
- [ ] Recurrence pattern dropdown appears only when "Repeat" is checked.
- [ ] "Repeat" checkbox is disabled when no due date is set.
- [ ] Creating a recurring todo shows a `🔄 <pattern>` badge on the card.
- [ ] Completing a recurring todo creates a new pending instance with the correct next due date.
- [ ] The new instance inherits: title, priority, recurrence settings, and reminder_minutes.
- [ ] The completed original moves to the Completed section normally.
- [ ] Monthly/yearly boundary dates (Jan 31, Feb 29) are handled without errors.
- [ ] API returns 400 if `is_recurring = true` without `due_date`.
- [ ] API returns 400 if `recurrence_pattern` is not one of the four valid values.
- [ ] Editing a recurring todo to non-recurring stops future spawning.

---

## Testing Requirements

### E2E Tests (Playwright)

```typescript
// tests/03-recurring.spec.ts
test('recurring checkbox disabled without due date', async ({ page }) => {
  await page.fill('[data-testid="todo-input"]', 'Daily habit');
  await expect(page.locator('[data-testid="recurring-checkbox"]')).toBeDisabled();
});

test('creates recurring todo with weekly badge', async ({ page }) => {
  const due = futureIso(1); // 1 day from now
  await page.fill('[data-testid="todo-input"]', 'Weekly review');
  await page.fill('[data-testid="due-date-input"]', due);
  await page.check('[data-testid="recurring-checkbox"]');
  await page.selectOption('[data-testid="recurrence-pattern-select"]', 'weekly');
  await page.click('[data-testid="add-todo-btn"]');
  await expect(page.locator('text=🔄 weekly')).toBeVisible();
});

test('completing recurring todo creates next instance', async ({ page }) => {
  // Setup: create weekly todo
  // Complete it
  await page.check('[data-testid="todo-checkbox-1"]');
  // Verify new instance with next week's date
  await expect(page.locator('[data-testid="pending-section"]')).toContainText('Weekly review');
});

test('non-recurring completion does not spawn new todo', async ({ page }) => {
  const countBefore = await page.locator('[data-testid="todo-card"]').count();
  await page.check('[data-testid="non-recurring-checkbox"]');
  const countAfter = await page.locator('[data-testid="todo-card"]').count();
  expect(countAfter).toBe(countBefore - 1); // moved to completed
});
```

### Unit Tests

- `calculateNextDueDate('2025-01-31', 'monthly')` → `'2025-02-28'`
- `calculateNextDueDate('2024-02-29', 'yearly')` → `'2025-02-28'`
- `calculateNextDueDate('2025-11-01', 'weekly')` → `'2025-11-08'`
- `calculateNextDueDate('2025-11-01', 'daily')` → `'2025-11-02'`
- PUT handler creates next instance when completing recurring todo with due date
- PUT handler does NOT create next instance for non-recurring todos

---

## Out of Scope

- Custom intervals (e.g. every 3 days, every 2 weeks)
- End date / limited occurrences (e.g. repeat 5 times then stop)
- Skip occurrence / pause recurring series
- Editing all future occurrences in a series at once
- Bi-weekly or quarterly patterns

---

## Success Metrics

- Next occurrence created within the same API response cycle as the completion
- Boundary-date calculations (Jan 31 → Feb 28) produce zero errors
- Recurrence badge visible on 100% of recurring todo cards
- No orphaned `is_recurring = true` todos without a `recurrence_pattern`
