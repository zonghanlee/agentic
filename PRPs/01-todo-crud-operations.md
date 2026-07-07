# PRP 01 — Todo CRUD Operations

## Feature Overview

The foundational feature of the Todo App: creating, reading, updating, and deleting todos. Todos store a title, completion state, optional due date/time, and a priority level. All date/time values are anchored to the **Singapore timezone** (`Asia/Singapore`). This feature is the dependency root — every other feature builds on it.

**Implementation phase**: Phase 1 — Foundation  
**Depends on**: None  
**Required by**: 02 Priority, 03 Recurring, 04 Reminders, 05 Subtasks, 06 Tags, 08 Search, 09 Export/Import, 10 Calendar

---

## User Stories

| As a… | I want to… | So that… |
|-------|-----------|----------|
| User | Create a todo with a title | I can track tasks I need to do |
| User | Set a due date/time on a todo | I know when the task must be completed |
| User | Mark a todo as complete | I can track my progress |
| User | Edit an existing todo | I can update details when plans change |
| User | Delete a todo | I can remove tasks that are no longer relevant |
| User | View all my todos separated by status | I get a clear overview of pending vs. completed work |
| User | See overdue todos highlighted | I can immediately spot what is late |

---

## User Flow

### Creating a Todo
1. User enters a title in the main input field at the top of the page.
2. User optionally sets a due date/time using the date-time picker.
3. User clicks **"Add"** (or presses Enter).
4. The todo appears at the top of the **Pending** section, sorted by priority then due date.
5. Input field clears ready for the next entry.

### Viewing Todos
- The page displays three sections:
  - **Overdue** (red background) — todos past their due date
  - **Pending** — incomplete todos not yet due
  - **Completed** — todos marked done
- Each section header shows the count, e.g. `Pending (5)`.
- Sections auto-hide when empty.

### Editing a Todo
1. User clicks **"Edit"** on a todo card.
2. An edit modal opens pre-filled with current values.
3. User modifies title and/or due date.
4. User clicks **"Update"**.
5. Modal closes; todo card refreshes with updated values.

### Completing a Todo
1. User clicks the checkbox on a todo card.
2. Todo moves instantly from **Pending/Overdue** to **Completed** section (optimistic UI).
3. Completed todo shows a strikethrough title.

### Deleting a Todo
1. User clicks the **"Delete"** (✕) button on a todo card.
2. A confirmation prompt appears.
3. On confirmation, the todo is removed from the list.

---

## Technical Requirements

### Database Schema

```sql
CREATE TABLE IF NOT EXISTS users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  username   TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS todos (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id               INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title                 TEXT NOT NULL,
  completed             INTEGER NOT NULL DEFAULT 0,   -- 0 | 1 (SQLite boolean)
  due_date              TEXT,                          -- ISO 8601, Singapore time
  priority              TEXT NOT NULL DEFAULT 'medium', -- 'high' | 'medium' | 'low'
  is_recurring          INTEGER NOT NULL DEFAULT 0,
  recurrence_pattern    TEXT,                          -- 'daily'|'weekly'|'monthly'|'yearly'
  reminder_minutes      INTEGER,                       -- minutes before due
  last_notification_sent TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);
```

> **Note**: `priority`, `is_recurring`, `recurrence_pattern`, and `reminder_minutes` columns are included in the base schema to avoid later migrations; PRP 02/03/04 fill their logic.

### TypeScript Types

```typescript
// lib/db.ts
export type Priority = 'high' | 'medium' | 'low';
export type RecurrencePattern = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface Todo {
  id: number;
  user_id: number;
  title: string;
  completed: boolean;
  due_date: string | null;       // ISO 8601 string, Singapore tz
  priority: Priority;
  is_recurring: boolean;
  recurrence_pattern: RecurrencePattern | null;
  reminder_minutes: number | null;
  last_notification_sent: string | null;
  created_at: string;
}

export interface CreateTodoDto {
  title: string;
  due_date?: string | null;
  priority?: Priority;
}

export interface UpdateTodoDto {
  title?: string;
  completed?: boolean;
  due_date?: string | null;
  priority?: Priority;
}
```

### Database Operations (`lib/db.ts`)

```typescript
import Database from 'better-sqlite3';
import path from 'path';

const db = new Database(path.join(process.cwd(), 'todos.db'));

// Run migrations once at startup
db.exec(`
  CREATE TABLE IF NOT EXISTS users (...);
  CREATE TABLE IF NOT EXISTS todos (...);
`);

export const todoDB = {
  findAll(userId: number): Todo[] {
    return db.prepare(
      `SELECT * FROM todos WHERE user_id = ? ORDER BY
        CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
        due_date ASC NULLS LAST, created_at DESC`
    ).all(userId) as Todo[];
  },

  findById(id: number, userId: number): Todo | null {
    return (db.prepare(
      'SELECT * FROM todos WHERE id = ? AND user_id = ?'
    ).get(id, userId) ?? null) as Todo | null;
  },

  create(userId: number, dto: CreateTodoDto): Todo {
    const result = db.prepare(
      `INSERT INTO todos (user_id, title, due_date, priority)
       VALUES (?, ?, ?, ?)
       RETURNING *`
    ).get(userId, dto.title, dto.due_date ?? null, dto.priority ?? 'medium') as Todo;
    return result;
  },

  update(id: number, userId: number, dto: UpdateTodoDto): Todo | null {
    const fields = Object.keys(dto)
      .map(k => `${k} = ?`)
      .join(', ');
    const values = [...Object.values(dto), id, userId];
    return (db.prepare(
      `UPDATE todos SET ${fields} WHERE id = ? AND user_id = ? RETURNING *`
    ).get(...values) ?? null) as Todo | null;
  },

  delete(id: number, userId: number): boolean {
    const info = db.prepare(
      'DELETE FROM todos WHERE id = ? AND user_id = ?'
    ).run(id, userId);
    return info.changes > 0;
  },
};
```

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/todos` | List all todos for the authenticated user |
| `POST` | `/api/todos` | Create a new todo |
| `PUT` | `/api/todos/[id]` | Update an existing todo |
| `DELETE` | `/api/todos/[id]` | Delete a todo |

#### `GET /api/todos`

```typescript
// app/api/todos/route.ts
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const todos = todoDB.findAll(session.userId);
  return NextResponse.json(todos);
}
```

#### `POST /api/todos`

```typescript
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await request.json();
  const { title, due_date, priority } = body;

  if (!title || typeof title !== 'string' || title.trim() === '') {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }

  const todo = todoDB.create(session.userId, {
    title: title.trim(),
    due_date: due_date ?? null,
    priority: priority ?? 'medium',
  });

  return NextResponse.json(todo, { status: 201 });
}
```

#### `PUT /api/todos/[id]`

```typescript
// app/api/todos/[id]/route.ts
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;
  const body = await request.json();

  const updated = todoDB.update(Number(id), session.userId, body);
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(updated);
}
```

#### `DELETE /api/todos/[id]`

```typescript
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;
  const deleted = todoDB.delete(Number(id), session.userId);
  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ success: true });
}
```

### Timezone Utility (`lib/timezone.ts`)

```typescript
// lib/timezone.ts
const TZ = 'Asia/Singapore';

export function getSingaporeNow(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
}

export function formatSingaporeDate(date: Date | string): string {
  return new Date(date).toLocaleString('en-SG', { timeZone: TZ });
}

export function isoToSingapore(isoString: string): string {
  return new Date(isoString).toLocaleString('en-SG', { timeZone: TZ });
}
```

---

## UI Components

### Todo Form (`app/page.tsx` — top section)

```tsx
'use client';
import { getSingaporeNow } from '@/lib/timezone';

function TodoForm({ onCreated }: { onCreated: () => void }) {
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');

  const minDate = (): string => {
    const now = getSingaporeNow();
    now.setMinutes(now.getMinutes() + 1);
    return now.toISOString().slice(0, 16);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    await fetch('/api/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title.trim(), due_date: dueDate || null }),
    });

    setTitle('');
    setDueDate('');
    onCreated();
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 mb-4">
      <input
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Add a new todo..."
        className="flex-1 border rounded px-3 py-2"
        required
      />
      <input
        type="datetime-local"
        value={dueDate}
        min={minDate()}
        onChange={e => setDueDate(e.target.value)}
        className="border rounded px-3 py-2"
      />
      <button type="submit" className="bg-blue-500 text-white px-4 py-2 rounded">
        Add
      </button>
    </form>
  );
}
```

### Todo Card

```tsx
function TodoCard({ todo, onUpdate, onDelete }: {
  todo: Todo;
  onUpdate: (id: number, patch: UpdateTodoDto) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}) {
  return (
    <div className={`flex items-center gap-3 p-3 border rounded ${todo.completed ? 'opacity-60' : ''}`}>
      <input
        type="checkbox"
        checked={todo.completed}
        onChange={() => onUpdate(todo.id, { completed: !todo.completed })}
      />
      <span className={todo.completed ? 'line-through text-gray-400' : ''}>
        {todo.title}
      </span>
      {todo.due_date && (
        <span className="text-sm text-gray-500 ml-auto">
          {formatSingaporeDate(todo.due_date)}
        </span>
      )}
      <button onClick={() => onDelete(todo.id)} className="text-red-500 hover:text-red-700">✕</button>
    </div>
  );
}
```

### Overdue Smart Display

```typescript
function getRelativeDueLabel(dueDateIso: string): { label: string; color: string } {
  const now = getSingaporeNow();
  const due = new Date(dueDateIso);
  const diffMs = due.getTime() - now.getTime();
  const diffMin = Math.round(diffMs / 60_000);

  if (diffMin < 0) {
    const abs = Math.abs(diffMin);
    if (abs < 60) return { label: `${abs}m overdue`, color: 'text-red-600' };
    if (abs < 1440) return { label: `${Math.floor(abs / 60)}h overdue`, color: 'text-red-600' };
    return { label: `${Math.floor(abs / 1440)}d overdue`, color: 'text-red-600' };
  }
  if (diffMin < 60) return { label: `Due in ${diffMin}m`, color: 'text-red-500' };
  if (diffMin < 1440) return { label: `Due in ${Math.floor(diffMin / 60)}h`, color: 'text-orange-500' };
  if (diffMin < 10080) return { label: `Due in ${Math.floor(diffMin / 1440)}d`, color: 'text-yellow-500' };
  return { label: formatSingaporeDate(dueDateIso), color: 'text-blue-500' };
}
```

---

## Edge Cases

| Scenario | Expected Behaviour |
|----------|-------------------|
| Empty or whitespace-only title | 400 error; form prevents submission |
| Due date in the past (on creation) | Reject with validation error; `min` attribute enforced in picker |
| Due date exactly 1 minute in the future | Accepted |
| `due_date` left blank | Stored as `NULL`; no due-date display shown |
| Editing title to empty string | 400 error; modal prevents save |
| Deleting a todo with subtasks | CASCADE deletes all subtasks (future PRP 05) |
| Concurrent edits by same user | Last write wins (SQLite serialised writes) |
| Very long title (> 1000 chars) | Accepted by DB; UI truncates with ellipsis |
| SQL special characters in title | Parameterised queries prevent injection |
| Non-numeric `id` in URL | `Number(id)` returns `NaN`; DB returns null; 404 returned |

---

## Acceptance Criteria

- [ ] A todo can be created with a title only (no due date required).
- [ ] A todo can be created with a title and due date/time.
- [ ] Due date must be at least 1 minute in the future at creation time.
- [ ] All displayed dates/times use Singapore timezone.
- [ ] Todos are listed in priority-then-due-date order.
- [ ] Overdue todos appear in a separate **Overdue** section with red styling.
- [ ] Completed todos appear in a separate **Completed** section with strikethrough.
- [ ] Empty sections auto-hide.
- [ ] Marking complete moves todo to Completed instantly (optimistic UI).
- [ ] Edit modal pre-fills all current values.
- [ ] Updating title or due date persists to the database.
- [ ] Deleting a todo removes it from the list and database.
- [ ] Unauthenticated requests to any `/api/todos` endpoint return HTTP 401.
- [ ] Title containing only spaces is rejected with a user-visible error.

---

## Testing Requirements

### E2E Tests (Playwright)

```typescript
// tests/01-todo-crud.spec.ts
test('creates a todo with title only', async ({ page }) => {
  await page.fill('[data-testid="todo-input"]', 'Buy groceries');
  await page.click('[data-testid="add-todo-btn"]');
  await expect(page.locator('text=Buy groceries')).toBeVisible();
});

test('creates a todo with due date', async ({ page }) => {
  const future = new Date(Date.now() + 2 * 60 * 60 * 1000);
  await page.fill('[data-testid="todo-input"]', 'Submit report');
  await page.fill('[data-testid="due-date-input"]', future.toISOString().slice(0, 16));
  await page.click('[data-testid="add-todo-btn"]');
  await expect(page.locator('text=Submit report')).toBeVisible();
});

test('marks a todo as complete', async ({ page }) => {
  // create then complete
  await page.check('[data-testid="todo-checkbox-1"]');
  await expect(page.locator('[data-testid="completed-section"]')).toContainText('Todo');
});

test('deletes a todo', async ({ page }) => {
  await page.click('[data-testid="delete-todo-1"]');
  await page.click('[data-testid="confirm-delete"]');
  await expect(page.locator('text=Buy groceries')).not.toBeVisible();
});

test('rejects empty title', async ({ page }) => {
  await page.click('[data-testid="add-todo-btn"]');
  await expect(page.locator('[data-testid="todo-input"]:invalid')).toBeVisible();
});
```

### Unit Tests

- `todoDB.create` inserts correct row and returns full object
- `todoDB.update` changes only specified fields
- `todoDB.delete` removes row and returns false for missing ID
- `getRelativeDueLabel` returns correct colour and text for each time bracket
- `getSingaporeNow` returns date in SGT zone

---

## Out of Scope

- Bulk operations (multi-select delete/complete) — future enhancement
- Drag-and-drop reordering — future enhancement
- Rich text or markdown in titles — excluded by design
- Attachments or file uploads
- Sharing todos with other users

---

## Success Metrics

- Todo creation round-trip < 300 ms on local dev server
- Zero data loss on concurrent reads/writes (SQLite serialises)
- 100% of API endpoints return structured JSON errors with HTTP codes
- All date/time values stored and displayed consistently in Singapore timezone
- E2E suite for CRUD passes in < 30 s
