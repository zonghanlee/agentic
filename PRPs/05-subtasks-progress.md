# PRP 05 — Subtasks & Progress Tracking

## Feature Overview

Allow users to break a todo into smaller **subtasks** (checklist items). Each subtask has a title, a completion state, and an ordering position. A visual progress bar and `X/Y subtasks` counter update in real-time. Deleting a parent todo cascades and removes all its subtasks. Subtask titles are also searched by the search feature (PRP 08).

**Implementation phase**: Phase 2 — Core Features  
**Depends on**: 01 Todo CRUD (parent `todos` table must exist)  
**Required by**: 07 Template System (templates serialize subtasks as JSON)

---

## User Stories

| As a… | I want to… | So that… |
|-------|-----------|----------|
| User | Add subtasks to a todo | I can break complex tasks into smaller steps |
| User | Check off individual subtasks | I can track partial progress within a task |
| User | See a progress bar on a todo | I get a visual sense of how far along I am |
| User | See "X/Y subtasks" text | I know the exact count at a glance |
| User | Delete a subtask | I can remove steps that are no longer needed |
| User | Expand/collapse the subtask list | I keep the UI uncluttered when subtasks aren't the focus |
| User | Know subtasks are deleted with their parent | I don't end up with orphaned data |

---

## User Flow

### Adding Subtasks
1. User clicks **"▶ Subtasks"** button on a todo card to expand the subtask panel.
2. An input field appears at the bottom of the panel.
3. User types a subtask title and presses **Enter** or clicks **"Add"**.
4. Subtask appears in the list immediately; progress bar and counter update.
5. Repeat for additional subtasks.

### Completing a Subtask
1. User clicks the checkbox next to a subtask.
2. Subtask title gains strikethrough styling.
3. Progress bar and counter update instantly (optimistic UI).

### Uncompleting a Subtask
1. User clicks a checked subtask's checkbox.
2. Strikethrough removed; counter decrements.

### Deleting a Subtask
1. User clicks the **✕** button on the right of a subtask row.
2. Subtask is removed; progress bar and counter update.

### Collapsing Subtasks
1. User clicks **"▼ Subtasks"** to toggle the list closed.
2. The progress bar and counter remain visible on the todo card even when collapsed.

---

## Technical Requirements

### Database Schema

```sql
CREATE TABLE IF NOT EXISTS subtasks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  todo_id    INTEGER NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  completed  INTEGER NOT NULL DEFAULT 0,   -- 0 | 1
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

> `ON DELETE CASCADE` ensures all subtasks are removed when the parent todo is deleted.

### TypeScript Types

```typescript
// lib/db.ts
export interface Subtask {
  id: number;
  todo_id: number;
  title: string;
  completed: boolean;
  position: number;
  created_at: string;
}

export interface CreateSubtaskDto {
  title: string;
}

export interface UpdateSubtaskDto {
  title?: string;
  completed?: boolean;
}
```

### Database Operations

```typescript
// lib/db.ts — subtaskDB
export const subtaskDB = {
  findByTodoId(todoId: number): Subtask[] {
    return db.prepare(
      'SELECT * FROM subtasks WHERE todo_id = ? ORDER BY position ASC, created_at ASC'
    ).all(todoId) as Subtask[];
  },

  create(todoId: number, dto: CreateSubtaskDto): Subtask {
    const maxPos = (db.prepare(
      'SELECT COALESCE(MAX(position), -1) as max FROM subtasks WHERE todo_id = ?'
    ).get(todoId) as { max: number }).max;

    return db.prepare(
      `INSERT INTO subtasks (todo_id, title, position)
       VALUES (?, ?, ?)
       RETURNING *`
    ).get(todoId, dto.title.trim(), maxPos + 1) as Subtask;
  },

  update(id: number, todoId: number, dto: UpdateSubtaskDto): Subtask | null {
    const fields = Object.keys(dto).map(k => `${k} = ?`).join(', ');
    const values = [...Object.values(dto), id, todoId];
    return (db.prepare(
      `UPDATE subtasks SET ${fields} WHERE id = ? AND todo_id = ? RETURNING *`
    ).get(...values) ?? null) as Subtask | null;
  },

  delete(id: number, todoId: number): boolean {
    const info = db.prepare(
      'DELETE FROM subtasks WHERE id = ? AND todo_id = ?'
    ).run(id, todoId);
    return info.changes > 0;
  },
};
```

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/todos/[id]/subtasks` | List all subtasks for a todo |
| `POST` | `/api/todos/[id]/subtasks` | Add a subtask to a todo |
| `PUT` | `/api/todos/[id]/subtasks/[subtaskId]` | Update (complete/rename) a subtask |
| `DELETE` | `/api/todos/[id]/subtasks/[subtaskId]` | Delete a subtask |

#### `GET /api/todos/[id]/subtasks`

```typescript
// app/api/todos/[id]/subtasks/route.ts
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;

  // Verify the parent todo belongs to the authenticated user
  const todo = todoDB.findById(Number(id), session.userId);
  if (!todo) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const subtasks = subtaskDB.findByTodoId(Number(id));
  return NextResponse.json(subtasks);
}
```

#### `POST /api/todos/[id]/subtasks`

```typescript
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;
  const todo = todoDB.findById(Number(id), session.userId);
  if (!todo) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { title } = await request.json();
  if (!title || title.trim() === '') {
    return NextResponse.json({ error: 'Subtask title is required' }, { status: 400 });
  }

  const subtask = subtaskDB.create(Number(id), { title });
  return NextResponse.json(subtask, { status: 201 });
}
```

#### `PUT /api/todos/[id]/subtasks/[subtaskId]`

```typescript
// app/api/todos/[id]/subtasks/[subtaskId]/route.ts
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; subtaskId: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id, subtaskId } = await params;
  const todo = todoDB.findById(Number(id), session.userId);
  if (!todo) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json();
  const updated = subtaskDB.update(Number(subtaskId), Number(id), body);
  if (!updated) return NextResponse.json({ error: 'Subtask not found' }, { status: 404 });

  return NextResponse.json(updated);
}
```

#### `DELETE /api/todos/[id]/subtasks/[subtaskId]`

```typescript
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; subtaskId: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id, subtaskId } = await params;
  const todo = todoDB.findById(Number(id), session.userId);
  if (!todo) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const deleted = subtaskDB.delete(Number(subtaskId), Number(id));
  if (!deleted) return NextResponse.json({ error: 'Subtask not found' }, { status: 404 });

  return NextResponse.json({ success: true });
}
```

---

## UI Components

### Progress Computation

```typescript
function computeProgress(subtasks: Subtask[]): { completed: number; total: number; pct: number } {
  const total = subtasks.length;
  const completed = subtasks.filter(s => s.completed).length;
  const pct = total === 0 ? 0 : Math.round((completed / total) * 100);
  return { completed, total, pct };
}
```

### Progress Bar

```tsx
function ProgressBar({ subtasks }: { subtasks: Subtask[] }) {
  const { completed, total, pct } = computeProgress(subtasks);
  if (total === 0) return null;

  return (
    <div className="mt-2">
      <div className="flex justify-between text-xs text-gray-500 mb-1">
        <span>{completed}/{total} subtasks</span>
        <span>{pct}%</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-1.5 dark:bg-gray-700">
        <div
          className="bg-blue-500 h-1.5 rounded-full transition-all duration-200"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
```

### Subtask List Panel

```tsx
function SubtaskPanel({
  todoId,
  subtasks,
  onAdd,
  onToggle,
  onDelete,
}: {
  todoId: number;
  subtasks: Subtask[];
  onAdd: (title: string) => Promise<void>;
  onToggle: (subtaskId: number, completed: boolean) => Promise<void>;
  onDelete: (subtaskId: number) => Promise<void>;
}) {
  const [input, setInput] = useState('');

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    await onAdd(input.trim());
    setInput('');
  };

  return (
    <div className="mt-3 border-t pt-3">
      <ul className="space-y-1 mb-2">
        {subtasks.map(s => (
          <li key={s.id} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={s.completed}
              onChange={() => onToggle(s.id, !s.completed)}
            />
            <span className={`flex-1 text-sm ${s.completed ? 'line-through text-gray-400' : ''}`}>
              {s.title}
            </span>
            <button
              onClick={() => onDelete(s.id)}
              className="text-gray-400 hover:text-red-500 text-xs"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Add subtask..."
          className="flex-1 text-sm border rounded px-2 py-1"
        />
        <button type="submit" className="text-sm bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded">
          Add
        </button>
      </form>
    </div>
  );
}
```

### Expand/Collapse Toggle on Todo Card

```tsx
function SubtaskToggle({
  todoId,
  subtasks,
  expanded,
  onToggle,
}: {
  todoId: number;
  subtasks: Subtask[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const { total } = computeProgress(subtasks);

  return (
    <button
      onClick={onToggle}
      className="text-xs text-blue-600 hover:underline flex items-center gap-1"
    >
      {expanded ? '▼' : '▶'} Subtasks {total > 0 && `(${total})`}
    </button>
  );
}
```

---

## Edge Cases

| Scenario | Expected Behaviour |
|----------|-------------------|
| Empty subtask title | 400 error; form prevents submission |
| Deleting parent todo | `ON DELETE CASCADE` removes all subtasks automatically |
| Completing all subtasks | Progress bar shows 100%; parent todo remains incomplete (independent) |
| Zero subtasks | Progress bar and counter hidden entirely |
| Subtask title with SQL special chars | Parameterised query prevents injection |
| Accessing subtasks for a todo that belongs to another user | Ownership check on parent todo returns 404 |
| Completing a subtask while parent is complete | Allowed (subtask state is independent) |
| Very long subtask title | Truncated with CSS ellipsis; stored fully in DB |
| Rapid consecutive subtask adds | Each add sequential (SQLite serialises writes); positions assigned correctly |

---

## Acceptance Criteria

- [ ] "▶ Subtasks" button visible on every todo card.
- [ ] Clicking the button expands a subtask panel with an input field.
- [ ] Adding a subtask with an empty title is rejected (no submission).
- [ ] Subtask appears in the list immediately after creation.
- [ ] Checking a subtask marks it complete with strikethrough.
- [ ] Progress bar visible on the todo card (even when panel is collapsed) once at least one subtask exists.
- [ ] `X/Y subtasks` counter updates in real-time.
- [ ] Deleting a subtask removes it from the list and recalculates progress.
- [ ] Deleting the parent todo also deletes all its subtasks (verified via DB).
- [ ] All subtask API endpoints return 401 for unauthenticated requests.
- [ ] Subtask endpoints return 404 if the parent todo does not belong to the authenticated user.

---

## Testing Requirements

### E2E Tests (Playwright)

```typescript
// tests/05-subtasks.spec.ts
test('adds a subtask to a todo', async ({ page }) => {
  await page.click('[data-testid="subtask-toggle-1"]');
  await page.fill('[data-testid="subtask-input-1"]', 'Buy milk');
  await page.press('[data-testid="subtask-input-1"]', 'Enter');
  await expect(page.locator('text=Buy milk')).toBeVisible();
});

test('progress bar shows correct percentage', async ({ page }) => {
  // Add 2 subtasks; complete 1
  await page.check('[data-testid="subtask-checkbox-1"]');
  await expect(page.locator('[data-testid="progress-bar-1"]')).toHaveAttribute(
    'style',
    /width: 50%/
  );
  await expect(page.locator('[data-testid="subtask-counter-1"]')).toHaveText('1/2 subtasks');
});

test('deleting subtask updates counter', async ({ page }) => {
  await page.click('[data-testid="delete-subtask-1"]');
  await expect(page.locator('[data-testid="subtask-counter-1"]')).toHaveText('0/1 subtasks');
});

test('deleting todo removes its subtasks', async ({ page }) => {
  const response = await page.request.get('/api/todos/1/subtasks');
  // After parent deleted, endpoint should 404
  await page.click('[data-testid="delete-todo-1"]');
  const r2 = await page.request.get('/api/todos/1/subtasks');
  expect(r2.status()).toBe(404);
});
```

### Unit Tests

- `computeProgress([])` returns `{ completed: 0, total: 0, pct: 0 }`
- `computeProgress` with all complete returns `pct: 100`
- `subtaskDB.create` assigns incrementing positions
- `subtaskDB.delete` returns `false` for wrong `todo_id`
- DB cascade confirmed: deleting a todo row removes subtask rows

---

## Out of Scope

- Drag-and-drop reordering of subtasks
- Nesting subtasks (sub-subtasks)
- Assigning subtasks to different users
- Subtask due dates or priorities
- Bulk complete all subtasks

---

## Success Metrics

- Progress bar renders within one render cycle of subtask toggle
- Subtask creation round-trip < 200 ms on local dev
- `ON DELETE CASCADE` confirmed working via automated DB test
- Zero orphaned subtask rows after parent todo deletion
- Progress calculation is 100% accurate (verified across 0%, 50%, 100% states)
