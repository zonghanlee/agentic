# PRP 02 — Priority System

## Feature Overview

Assign one of three priority levels — **High**, **Medium**, or **Low** — to every todo. Todos are automatically sorted by priority (High first), then by due date. Priority is visually indicated by colour-coded badges and can be changed at any time. A filter dropdown allows users to narrow the list to a single priority tier.

**Implementation phase**: Phase 1 — Foundation  
**Depends on**: 01 Todo CRUD (priority column already present in base schema)  
**Required by**: 08 Search & Filtering (priority filter), 09 Export/Import (priority field)

---

## User Stories

| As a… | I want to… | So that… |
|-------|-----------|----------|
| User | Assign a priority when creating a todo | I can communicate how urgent the task is |
| User | See colour-coded badges on each todo | I can scan the list and spot urgent items instantly |
| User | Change priority on an existing todo | I can reprioritise as circumstances change |
| User | Filter the list by priority | I can focus on only the most critical tasks |
| User | Have todos auto-sorted by priority | I always see the most important items at the top |

---

## User Flow

### Assigning Priority on Creation
1. User types a title in the todo form.
2. User selects a priority from the **Priority** dropdown (defaults to `Medium`).
3. User clicks **"Add"**.
4. The new todo appears with the corresponding colour badge, sorted above lower-priority items.

### Changing Priority
1. User clicks **"Edit"** on a todo.
2. The edit modal shows the current priority pre-selected.
3. User changes the priority dropdown.
4. User clicks **"Update"**.
5. Badge colour updates immediately; sort order refreshes.

### Filtering by Priority
1. User opens the **Priority** filter dropdown (default: `All Priorities`).
2. User selects `High Priority`.
3. List instantly shows only high-priority todos.
4. Section counts update (e.g. `Pending (2)`).
5. Selecting `All Priorities` restores the full list.

---

## Technical Requirements

### Schema Change

The `priority` column is part of the base `todos` table from PRP 01:

```sql
priority TEXT NOT NULL DEFAULT 'medium'  -- 'high' | 'medium' | 'low'
```

No additional migration needed; the column is present from the start.

### TypeScript Types

```typescript
// lib/db.ts (extends PRP 01 types)
export type Priority = 'high' | 'medium' | 'low';

// Already part of Todo interface:
// priority: Priority;
```

### Sorting Logic

Priority ordering is enforced at the database query level:

```sql
ORDER BY
  CASE priority
    WHEN 'high'   THEN 1
    WHEN 'medium' THEN 2
    ELSE               3
  END,
  due_date ASC NULLS LAST,
  created_at DESC
```

### API Changes

No new endpoints required. The existing `POST /api/todos` and `PUT /api/todos/[id]` already accept and persist the `priority` field.

**Input validation** (add to POST and PUT handlers):

```typescript
const VALID_PRIORITIES: Priority[] = ['high', 'medium', 'low'];

if (priority && !VALID_PRIORITIES.includes(priority)) {
  return NextResponse.json({ error: 'Invalid priority value' }, { status: 400 });
}
```

### Client-Side Filtering

Priority filtering is performed client-side because the full todo list is already loaded:

```typescript
// app/page.tsx
const [priorityFilter, setPriorityFilter] = useState<Priority | 'all'>('all');

const filteredTodos = useMemo(() =>
  priorityFilter === 'all'
    ? todos
    : todos.filter(t => t.priority === priorityFilter),
  [todos, priorityFilter]
);
```

---

## UI Components

### Priority Badge

```tsx
const PRIORITY_STYLES: Record<Priority, string> = {
  high:   'bg-red-100 text-red-700 border border-red-300',
  medium: 'bg-yellow-100 text-yellow-700 border border-yellow-300',
  low:    'bg-blue-100 text-blue-700 border border-blue-300',
};

function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_STYLES[priority]}`}>
      {priority.charAt(0).toUpperCase() + priority.slice(1)}
    </span>
  );
}
```

### Priority Dropdown (Form & Edit Modal)

```tsx
function PrioritySelect({
  value,
  onChange,
}: {
  value: Priority;
  onChange: (p: Priority) => void;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value as Priority)}
      className="border rounded px-3 py-2"
    >
      <option value="high">🔴 High</option>
      <option value="medium">🟡 Medium</option>
      <option value="low">🔵 Low</option>
    </select>
  );
}
```

### Priority Filter Dropdown

```tsx
function PriorityFilter({
  value,
  onChange,
}: {
  value: Priority | 'all';
  onChange: (v: Priority | 'all') => void;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value as Priority | 'all')}
      className="border rounded px-3 py-2"
    >
      <option value="all">All Priorities</option>
      <option value="high">High Priority</option>
      <option value="medium">Medium Priority</option>
      <option value="low">Low Priority</option>
    </select>
  );
}
```

### Dark Mode Support

```tsx
const PRIORITY_STYLES_DARK: Record<Priority, string> = {
  high:   'dark:bg-red-900/30 dark:text-red-300 dark:border-red-700',
  medium: 'dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-700',
  low:    'dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700',
};
```

---

## Edge Cases

| Scenario | Expected Behaviour |
|----------|-------------------|
| `priority` omitted in POST body | Defaults to `'medium'` |
| Invalid priority value (e.g. `'urgent'`) | API returns 400 with descriptive error |
| Priority filter active + completing a todo | Completed todo moves to Completed section; filter still active |
| All todos filtered out by priority | Empty state shown for each section; sections auto-hide |
| Overdue todos with High priority | Appear in Overdue section with red badge (priority still shown) |
| Dark mode | Badge colours adapt using dark: variants |
| Changing priority while filter active | If new priority doesn't match filter, todo disappears from view |

---

## Acceptance Criteria

- [ ] Priority dropdown in create form defaults to `Medium`.
- [ ] Badge colours match: High = red, Medium = yellow, Low = blue.
- [ ] Todos sorted: High → Medium → Low; ties broken by due date then created_at.
- [ ] Priority badge visible on every todo card in all three sections (Overdue, Pending, Completed).
- [ ] Priority can be changed via the edit modal and persists after page refresh.
- [ ] Priority filter dropdown correctly shows only matching todos.
- [ ] Selecting `All Priorities` restores the unfiltered list.
- [ ] Invalid priority value in API body returns HTTP 400.
- [ ] Dark mode renders badges with legible contrast.
- [ ] Section counts reflect filtered results (e.g. `Pending (2)` not total).

---

## Testing Requirements

### E2E Tests (Playwright)

```typescript
// tests/02-priority.spec.ts
test('creates high-priority todo with red badge', async ({ page }) => {
  await page.fill('[data-testid="todo-input"]', 'Critical task');
  await page.selectOption('[data-testid="priority-select"]', 'high');
  await page.click('[data-testid="add-todo-btn"]');
  await expect(page.locator('[data-testid="priority-badge"]').first()).toHaveText('High');
  await expect(page.locator('[data-testid="priority-badge"]').first()).toHaveClass(/text-red/);
});

test('high-priority todos appear before medium and low', async ({ page }) => {
  // Create low then high; verify high is first in list
  await createTodo(page, 'Low task', 'low');
  await createTodo(page, 'High task', 'high');
  const titles = await page.locator('[data-testid="todo-title"]').allTextContents();
  expect(titles[0]).toBe('High task');
});

test('priority filter shows only matching todos', async ({ page }) => {
  await page.selectOption('[data-testid="priority-filter"]', 'high');
  const badges = await page.locator('[data-testid="priority-badge"]').allTextContents();
  expect(badges.every(b => b === 'High')).toBe(true);
});

test('changing priority updates badge', async ({ page }) => {
  await page.click('[data-testid="edit-todo-1"]');
  await page.selectOption('[data-testid="edit-priority-select"]', 'low');
  await page.click('[data-testid="update-todo-btn"]');
  await expect(page.locator('[data-testid="priority-badge"]').first()).toHaveText('Low');
});
```

### Unit Tests

- `PRIORITY_STYLES` map covers all three priority values
- Sort comparator places `high` before `medium` before `low`
- API rejects invalid priority string with 400
- `PriorityBadge` renders correct class for each priority

---

## Out of Scope

- Custom priority levels beyond High/Medium/Low
- Numeric priority (1–10 scale)
- Priority-based deadlines or SLAs
- Bulk priority assignment

---

## Success Metrics

- Priority badge renders within one render cycle of todo creation (no flash)
- Filter operation completes in < 50 ms for 500 todos (client-side)
- 100% of todos have a non-null priority at all times
- No 400 errors for valid priority values passed by the UI
