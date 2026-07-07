# PRP 06 — Tag System

## Feature Overview

A colour-coded tagging system that lets users create custom labels and apply multiple tags to any todo. Tags are user-specific (each user manages their own tag library). The many-to-many relationship between todos and tags is managed through a join table. Tags cascade-delete from todos when the tag is removed. A tag filter dropdown in the main list narrows todos to those carrying the selected tag.

**Implementation phase**: Phase 3 — Organisation  
**Depends on**: 01 Todo CRUD (parent `todos` table must exist; `user_id` scoping required)  
**Required by**: 08 Search & Filtering (tag filter dropdown), 09 Export/Import (tags included in export)

---

## User Stories

| As a… | I want to… | So that… |
|-------|-----------|----------|
| User | Create colour-coded tags | I can categorise todos with visual labels |
| User | Assign multiple tags to a todo | I can cross-categorise (e.g. both "Work" and "Urgent") |
| User | Filter todos by a single tag | I can focus on one category at a time |
| User | Edit a tag's name or colour | I can refine my tagging system over time |
| User | Delete a tag | I can clean up unused labels without affecting other data |
| User | See tag pills on todo cards | I can tell at a glance what category a task belongs to |

---

## User Flow

### Creating a Tag
1. User clicks **"+ Manage Tags"** button near the todo form.
2. A **Tag Management** modal opens.
3. User enters a tag name, selects a colour (picker or hex code), and clicks **"Create Tag"**.
4. Tag appears in the tag list inside the modal.

### Applying Tags to a Todo
**On creation:**
1. If tags exist, tag pills appear below the create form.
2. User clicks a pill to select it (checkmark appears, background turns tag colour).
3. Multiple tags can be toggled on/off.
4. Tag association saved when "Add" is clicked.

**On edit:**
1. Edit modal shows all tags as selectable pills pre-reflecting current assignments.
2. User toggles tags; clicks "Update".

### Filtering by Tag
1. User selects a tag from the **"All Tags"** dropdown in the filter bar.
2. Only todos bearing that tag are shown.
3. Section counts update.
4. Selecting "All Tags" clears the filter.

### Editing / Deleting a Tag
1. User opens the Tag Management modal.
2. Clicks **"Edit"** → updates name/colour → clicks **"Update"**.
3. Clicks **"Delete"** → confirms → tag removed; all `todo_tags` rows referencing it are cascade-deleted.

---

## Technical Requirements

### Database Schema

```sql
CREATE TABLE IF NOT EXISTS tags (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  color      TEXT NOT NULL DEFAULT '#3B82F6',  -- hex colour
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, name)   -- no duplicate tag names per user
);

CREATE TABLE IF NOT EXISTS todo_tags (
  todo_id INTEGER NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
  tag_id  INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (todo_id, tag_id)
);
```

> Both foreign keys use `ON DELETE CASCADE` so deleting a todo or a tag automatically cleans up the join table.

### TypeScript Types

```typescript
// lib/db.ts
export interface Tag {
  id: number;
  user_id: number;
  name: string;
  color: string;
  created_at: string;
}

export interface CreateTagDto {
  name: string;
  color?: string;
}

export interface UpdateTagDto {
  name?: string;
  color?: string;
}
```

### Database Operations

```typescript
// lib/db.ts — tagDB
export const tagDB = {
  findAll(userId: number): Tag[] {
    return db.prepare(
      'SELECT * FROM tags WHERE user_id = ? ORDER BY name ASC'
    ).all(userId) as Tag[];
  },

  create(userId: number, dto: CreateTagDto): Tag {
    return db.prepare(
      `INSERT INTO tags (user_id, name, color) VALUES (?, ?, ?) RETURNING *`
    ).get(userId, dto.name.trim(), dto.color ?? '#3B82F6') as Tag;
  },

  update(id: number, userId: number, dto: UpdateTagDto): Tag | null {
    const fields = Object.keys(dto).map(k => `${k} = ?`).join(', ');
    const values = [...Object.values(dto), id, userId];
    return (db.prepare(
      `UPDATE tags SET ${fields} WHERE id = ? AND user_id = ? RETURNING *`
    ).get(...values) ?? null) as Tag | null;
  },

  delete(id: number, userId: number): boolean {
    const info = db.prepare(
      'DELETE FROM tags WHERE id = ? AND user_id = ?'
    ).run(id, userId);
    return info.changes > 0;
  },

  // Many-to-many helpers
  getTagsForTodo(todoId: number): Tag[] {
    return db.prepare(`
      SELECT t.* FROM tags t
      JOIN todo_tags tt ON tt.tag_id = t.id
      WHERE tt.todo_id = ?
      ORDER BY t.name ASC
    `).all(todoId) as Tag[];
  },

  setTagsForTodo(todoId: number, tagIds: number[]): void {
    db.prepare('DELETE FROM todo_tags WHERE todo_id = ?').run(todoId);
    const insert = db.prepare(
      'INSERT INTO todo_tags (todo_id, tag_id) VALUES (?, ?)'
    );
    const insertMany = db.transaction((ids: number[]) => {
      ids.forEach(tagId => insert.run(todoId, tagId));
    });
    insertMany(tagIds);
  },
};
```

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/tags` | List all tags for the authenticated user |
| `POST` | `/api/tags` | Create a new tag |
| `PUT` | `/api/tags/[id]` | Update a tag |
| `DELETE` | `/api/tags/[id]` | Delete a tag |
| `PUT` | `/api/todos/[id]/tags` | Replace all tags on a todo (array of tag IDs) |

#### `GET /api/tags`

```typescript
// app/api/tags/route.ts
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const tags = tagDB.findAll(session.userId);
  return NextResponse.json(tags);
}
```

#### `POST /api/tags`

```typescript
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { name, color } = await request.json();
  if (!name || name.trim() === '') {
    return NextResponse.json({ error: 'Tag name is required' }, { status: 400 });
  }
  if (color && !/^#[0-9A-Fa-f]{6}$/.test(color)) {
    return NextResponse.json({ error: 'Color must be a valid hex code' }, { status: 400 });
  }

  try {
    const tag = tagDB.create(session.userId, { name, color });
    return NextResponse.json(tag, { status: 201 });
  } catch {
    // UNIQUE constraint violation (duplicate name for this user)
    return NextResponse.json({ error: 'Tag name already exists' }, { status: 409 });
  }
}
```

#### `PUT /api/todos/[id]/tags`

```typescript
// app/api/todos/[id]/tags/route.ts
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;
  const todo = todoDB.findById(Number(id), session.userId);
  if (!todo) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { tagIds } = await request.json();
  if (!Array.isArray(tagIds)) {
    return NextResponse.json({ error: 'tagIds must be an array' }, { status: 400 });
  }

  tagDB.setTagsForTodo(Number(id), tagIds);
  return NextResponse.json({ success: true });
}
```

---

## UI Components

### Tag Pill

```tsx
function TagPill({
  tag,
  selected,
  onClick,
}: {
  tag: Tag;
  selected?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        backgroundColor: selected ? tag.color : 'transparent',
        borderColor: tag.color,
        color: selected ? '#fff' : tag.color,
      }}
      className="text-xs px-2 py-0.5 rounded-full border font-medium transition-colors"
    >
      {selected && '✓ '}
      {tag.name}
    </button>
  );
}
```

### Tag Management Modal

```tsx
function TagModal({
  tags,
  onClose,
  onCreated,
  onUpdated,
  onDeleted,
}: TagModalProps) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#3B82F6');
  const [editingId, setEditingId] = useState<number | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId !== null) {
      await fetch(`/api/tags/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color }),
      });
      onUpdated();
    } else {
      await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color }),
      });
      onCreated();
    }
    setName('');
    setColor('#3B82F6');
    setEditingId(null);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
        <h2 className="text-lg font-semibold mb-4">Manage Tags</h2>
        <form onSubmit={handleSubmit} className="flex gap-2 mb-4">
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Tag name"
            className="flex-1 border rounded px-3 py-2"
            required
          />
          <input
            type="color"
            value={color}
            onChange={e => setColor(e.target.value)}
            className="border rounded px-1 py-1 h-10 w-10 cursor-pointer"
          />
          <input
            type="text"
            value={color}
            onChange={e => setColor(e.target.value)}
            placeholder="#3B82F6"
            className="border rounded px-3 py-2 w-28 font-mono text-sm"
            pattern="^#[0-9A-Fa-f]{6}$"
          />
          <button type="submit" className="bg-blue-500 text-white px-4 py-2 rounded">
            {editingId ? 'Update' : 'Create Tag'}
          </button>
        </form>

        <ul className="space-y-2">
          {tags.map(tag => (
            <li key={tag.id} className="flex items-center justify-between">
              <TagPill tag={tag} selected />
              <div className="flex gap-2">
                <button onClick={() => { setEditingId(tag.id); setName(tag.name); setColor(tag.color); }}
                  className="text-sm text-blue-600 hover:underline">Edit</button>
                <button onClick={() => onDeleted(tag.id)}
                  className="text-sm text-red-500 hover:underline">Delete</button>
              </div>
            </li>
          ))}
        </ul>

        <button onClick={onClose} className="mt-4 text-gray-500 hover:underline text-sm">Close</button>
      </div>
    </div>
  );
}
```

### Tag Filter Dropdown

```tsx
function TagFilter({ tags, value, onChange }: {
  tags: Tag[];
  value: number | null;
  onChange: (id: number | null) => void;
}) {
  if (tags.length === 0) return null;
  return (
    <select
      value={value ?? ''}
      onChange={e => onChange(e.target.value ? Number(e.target.value) : null)}
      className="border rounded px-3 py-2"
    >
      <option value="">All Tags</option>
      {tags.map(t => (
        <option key={t.id} value={t.id}>{t.name}</option>
      ))}
    </select>
  );
}
```

---

## Edge Cases

| Scenario | Expected Behaviour |
|----------|-------------------|
| Duplicate tag name for same user | API returns 409; user shown "Tag name already exists" |
| Duplicate tag name across different users | Allowed (UNIQUE is per-user via `(user_id, name)`) |
| Invalid hex colour submitted | API returns 400 |
| Deleting a tag used by many todos | `ON DELETE CASCADE` in `todo_tags` removes all associations |
| Applying a tag owned by another user | Ownership not directly checked on `todo_tags` PUT — validate by ensuring all supplied `tagIds` exist in `tagDB.findAll(userId)` |
| Setting empty tag list on a todo | `setTagsForTodo(todoId, [])` deletes all existing associations |
| Tag filter active + todo edited to remove that tag | Todo disappears from filtered view on next refresh |
| Creating a todo with tags before any tags exist | Tag pills section hidden from form when no tags exist |
| Very long tag name | Stored as-is; UI truncates pill text with overflow ellipsis |
| Color picker + hex input desync | Both inputs bound to same state value; changing one updates the other |

---

## Acceptance Criteria

- [ ] "Manage Tags" button opens the Tag Management modal.
- [ ] Tags can be created with a name and a colour (default `#3B82F6`).
- [ ] Duplicate tag names for the same user return HTTP 409.
- [ ] Tag pills appear below the create form (only when tags exist).
- [ ] Multiple tags can be selected simultaneously when creating/editing a todo.
- [ ] Selected tags appear as coloured pills on the todo card.
- [ ] Tag filter dropdown hides when no tags exist.
- [ ] Filtering by a tag shows only todos with that tag applied.
- [ ] Editing a tag updates its appearance on all todo cards that carry it.
- [ ] Deleting a tag removes it from the tag list and from all todo cards.
- [ ] All tag API endpoints return 401 for unauthenticated requests.
- [ ] `todo_tags` rows are cascade-deleted when a todo or tag is deleted.

---

## Testing Requirements

### E2E Tests (Playwright)

```typescript
// tests/06-tags.spec.ts
test('creates a tag and it appears in the form', async ({ page }) => {
  await page.click('[data-testid="manage-tags-btn"]');
  await page.fill('[data-testid="tag-name-input"]', 'Work');
  await page.click('[data-testid="create-tag-btn"]');
  await page.click('[data-testid="close-tag-modal"]');
  await expect(page.locator('text=Work')).toBeVisible(); // in form
});

test('applies a tag to a todo', async ({ page }) => {
  await page.click('[data-testid="tag-pill-Work"]');
  await page.fill('[data-testid="todo-input"]', 'Team meeting');
  await page.click('[data-testid="add-todo-btn"]');
  await expect(page.locator('[data-testid="todo-card-1"] >> text=Work')).toBeVisible();
});

test('tag filter shows only tagged todos', async ({ page }) => {
  await page.selectOption('[data-testid="tag-filter"]', 'Work');
  const cards = page.locator('[data-testid="todo-card"]');
  for (const card of await cards.all()) {
    await expect(card.locator('text=Work')).toBeVisible();
  }
});

test('deleting tag removes it from todos', async ({ page }) => {
  await page.click('[data-testid="manage-tags-btn"]');
  await page.click('[data-testid="delete-tag-Work"]');
  await page.click('[data-testid="close-tag-modal"]');
  await expect(page.locator('text=Work')).not.toBeVisible();
});
```

### Unit Tests

- `tagDB.create` stores name and colour correctly
- `tagDB.create` throws on duplicate `(user_id, name)`
- `tagDB.setTagsForTodo` replaces existing associations atomically
- `tagDB.getTagsForTodo` returns only tags for the given todo
- CASCADE: deleting a tag row removes `todo_tags` rows for that tag
- Hex validation regex accepts `#3B82F6` and rejects `#ZZZ`, `3B82F6`, `#3b82f6ff`

---

## Out of Scope

- Tag hierarchies or nested categories
- Shared/global tags across users
- Tag-based automation or rules
- Tag colour gradients
- Tag usage analytics (most used, etc.)

---

## Success Metrics

- Tag creation and association operations complete in < 200 ms
- Zero orphaned `todo_tags` rows after tag or todo deletion (verified via automated DB test)
- Tag pills render with correct background/text colour on first render
- Filter correctly hides 100% of non-matching todos
- No UNIQUE constraint collisions for valid operations (different users can have same tag name)
