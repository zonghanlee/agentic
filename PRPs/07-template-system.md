# PRP 07 — Template System

## Feature Overview

Allow users to save frequently-used todo configurations as **templates** and create new todos from them instantly. A template captures the todo's title, priority, recurrence settings, and reminder timing. Subtasks are serialized as a JSON array and stored in the template row. Templates belong to individual users and can be organized by optional category.

**Implementation phase**: Phase 4 — Productivity  
**Depends on**:
- 01 Todo CRUD (todo creation logic reused when applying a template)
- 05 Subtasks (subtasks JSON structure mirrors subtask model)

> **Note**: Tags and specific due dates are intentionally NOT saved in templates — they are applied at creation time.

---

## User Stories

| As a… | I want to… | So that… |
|-------|-----------|----------|
| User | Save the current form as a template | I can reuse common todo configurations |
| User | Apply a template from a dropdown | I instantly create a todo with all my preset settings |
| User | Browse and manage templates in a modal | I can view, use, or delete saved templates |
| User | Assign a name, description, and category to a template | I can organise my template library |
| User | See a preview of template settings | I know what will be created before I apply it |
| User | Delete templates I no longer need | I can keep my library tidy |

---

## User Flow

### Saving a Template
1. User fills in the todo form: title, priority, recurrence settings, and reminder timing.
2. While title is non-empty, a **"💾 Save as Template"** button appears.
3. User clicks the button; a **Save Template** modal opens.
4. Modal pre-fills the name with the todo title.
5. User enters/edits the template name, optionally adds description and category.
6. User clicks **"Save Template"**.
7. Template saved; modal closes; "Saved!" confirmation shown briefly.

### Using a Template (Dropdown)
1. In the todo form, user opens the **"Use Template"** dropdown.
2. Dropdown lists all templates (format: `Name (Category)` if category set).
3. User selects a template.
4. A new todo is created immediately with template's title, priority, recurrence pattern, and reminder.
5. Dropdown resets to placeholder.

### Using a Template (Manager Modal)
1. User clicks **"📋 Templates"** button in the top navigation.
2. Templates modal opens, listing all saved templates.
3. User clicks **"Use"** on any template.
4. Todo created; modal closes automatically.

### Deleting a Template
1. User opens the Templates modal.
2. Clicks **"Delete"** next to a template.
3. Confirms deletion.
4. Template removed from library; existing todos created from it are unaffected.

---

## Technical Requirements

### Database Schema

```sql
CREATE TABLE IF NOT EXISTS templates (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  description         TEXT,
  category            TEXT,
  title_template      TEXT NOT NULL,           -- default title for new todo
  priority            TEXT NOT NULL DEFAULT 'medium',
  is_recurring        INTEGER NOT NULL DEFAULT 0,
  recurrence_pattern  TEXT,
  reminder_minutes    INTEGER,
  subtasks_json       TEXT NOT NULL DEFAULT '[]', -- JSON array of {title, position}
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### TypeScript Types

```typescript
// lib/db.ts
export interface Template {
  id: number;
  user_id: number;
  name: string;
  description: string | null;
  category: string | null;
  title_template: string;
  priority: Priority;
  is_recurring: boolean;
  recurrence_pattern: RecurrencePattern | null;
  reminder_minutes: number | null;
  subtasks_json: string;       // JSON-encoded SubtaskTemplate[]
  created_at: string;
}

export interface SubtaskTemplate {
  title: string;
  position: number;
}

export interface CreateTemplateDto {
  name: string;
  description?: string;
  category?: string;
  title_template: string;
  priority?: Priority;
  is_recurring?: boolean;
  recurrence_pattern?: RecurrencePattern | null;
  reminder_minutes?: number | null;
  subtasks?: SubtaskTemplate[];
}
```

### Database Operations

```typescript
// lib/db.ts — templateDB
export const templateDB = {
  findAll(userId: number): Template[] {
    return db.prepare(
      'SELECT * FROM templates WHERE user_id = ? ORDER BY category ASC, name ASC'
    ).all(userId) as Template[];
  },

  create(userId: number, dto: CreateTemplateDto): Template {
    const subtasksJson = JSON.stringify(dto.subtasks ?? []);
    return db.prepare(`
      INSERT INTO templates
        (user_id, name, description, category, title_template,
         priority, is_recurring, recurrence_pattern, reminder_minutes, subtasks_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `).get(
      userId,
      dto.name.trim(),
      dto.description ?? null,
      dto.category ?? null,
      dto.title_template.trim(),
      dto.priority ?? 'medium',
      dto.is_recurring ? 1 : 0,
      dto.recurrence_pattern ?? null,
      dto.reminder_minutes ?? null,
      subtasksJson
    ) as Template;
  },

  delete(id: number, userId: number): boolean {
    return db.prepare(
      'DELETE FROM templates WHERE id = ? AND user_id = ?'
    ).run(id, userId).changes > 0;
  },
};
```

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/templates` | List all templates for the authenticated user |
| `POST` | `/api/templates` | Create a new template |
| `DELETE` | `/api/templates/[id]` | Delete a template |
| `POST` | `/api/templates/[id]/use` | Instantiate a todo from a template |

#### `POST /api/templates/[id]/use`

This is the key endpoint that converts a template to a live todo:

```typescript
// app/api/templates/[id]/use/route.ts
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;
  const template = templateDB.findById(Number(id), session.userId);
  if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Optionally accept a due_date in the request body
  const body = await request.json().catch(() => ({}));
  const dueDate: string | null = body.due_date ?? null;

  // Create the todo
  const todo = todoDB.create(session.userId, {
    title: template.title_template,
    due_date: dueDate,
    priority: template.priority,
    is_recurring: template.is_recurring,
    recurrence_pattern: template.recurrence_pattern ?? undefined,
    reminder_minutes: template.reminder_minutes ?? undefined,
  });

  // Create subtasks from JSON
  const subtasks: SubtaskTemplate[] = JSON.parse(template.subtasks_json ?? '[]');
  subtasks.forEach(s => {
    subtaskDB.create(todo.id, { title: s.title });
  });

  return NextResponse.json(todo, { status: 201 });
}
```

---

## UI Components

### "Save as Template" Button

```tsx
// Appears in the create form only when title is non-empty
{title.trim() && (
  <button
    type="button"
    onClick={() => setShowSaveTemplateModal(true)}
    className="text-sm text-blue-600 hover:underline flex items-center gap-1"
  >
    💾 Save as Template
  </button>
)}
```

### Save Template Modal

```tsx
function SaveTemplateModal({
  formState,
  onSave,
  onClose,
}: {
  formState: { title: string; priority: Priority; isRecurring: boolean; pattern: RecurrencePattern | null; reminder: number | null };
  onSave: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(formState.title);
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');

  const handleSave = async () => {
    await fetch('/api/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        description: description || undefined,
        category: category || undefined,
        title_template: formState.title,
        priority: formState.priority,
        is_recurring: formState.isRecurring,
        recurrence_pattern: formState.pattern,
        reminder_minutes: formState.reminder,
      }),
    });
    onSave();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-sm">
        <h2 className="text-lg font-semibold mb-4">Save as Template</h2>
        <input value={name} onChange={e => setName(e.target.value)}
          placeholder="Template name" className="w-full border rounded px-3 py-2 mb-2" required />
        <input value={description} onChange={e => setDescription(e.target.value)}
          placeholder="Description (optional)" className="w-full border rounded px-3 py-2 mb-2" />
        <input value={category} onChange={e => setCategory(e.target.value)}
          placeholder="Category (optional)" className="w-full border rounded px-3 py-2 mb-4" />
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded border text-sm">Cancel</button>
          <button onClick={handleSave} className="px-4 py-2 rounded bg-blue-500 text-white text-sm">
            Save Template
          </button>
        </div>
      </div>
    </div>
  );
}
```

### Templates Manager Modal

```tsx
function TemplatesModal({ templates, onUse, onDelete, onClose }: TemplatesModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto">
        <h2 className="text-lg font-semibold mb-4">📋 Templates</h2>
        {templates.length === 0 && (
          <p className="text-gray-500 text-sm">No templates saved yet.</p>
        )}
        <ul className="space-y-3">
          {templates.map(t => (
            <li key={t.id} className="border rounded p-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium">{t.name}</p>
                  {t.description && <p className="text-sm text-gray-500">{t.description}</p>}
                  <div className="flex gap-1.5 mt-1 flex-wrap">
                    {t.category && (
                      <span className="text-xs bg-gray-100 px-2 py-0.5 rounded-full">{t.category}</span>
                    )}
                    <PriorityBadge priority={t.priority} />
                    {t.is_recurring && <RecurrenceBadge pattern={t.recurrence_pattern!} />}
                    {t.reminder_minutes && <ReminderBadge minutes={t.reminder_minutes} />}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { onUse(t.id); onClose(); }}
                    className="text-sm bg-green-500 text-white px-3 py-1 rounded">Use</button>
                  <button onClick={() => onDelete(t.id)}
                    className="text-sm text-red-500 hover:underline">Delete</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
        <button onClick={onClose} className="mt-4 text-sm text-gray-500 hover:underline">Close</button>
      </div>
    </div>
  );
}
```

### Use Template Dropdown

```tsx
function UseTemplateDropdown({ templates, onSelect }: {
  templates: Template[];
  onSelect: (id: number) => void;
}) {
  if (templates.length === 0) return null;
  return (
    <select
      defaultValue=""
      onChange={e => { if (e.target.value) onSelect(Number(e.target.value)); e.target.value = ''; }}
      className="border rounded px-3 py-2 text-sm"
    >
      <option value="" disabled>Use Template</option>
      {templates.map(t => (
        <option key={t.id} value={t.id}>
          {t.name}{t.category ? ` (${t.category})` : ''}
        </option>
      ))}
    </select>
  );
}
```

---

## Edge Cases

| Scenario | Expected Behaviour |
|----------|-------------------|
| Template name is empty or whitespace | API returns 400; form prevents save |
| Template with subtasks applied | Subtasks created in the new todo with correct positions |
| Template `subtasks_json` is malformed JSON | `JSON.parse` fallback to `[]`; no crash |
| Deleting a template | Existing todos created from it remain unchanged |
| Applying a template while the todo form has existing input | Template creates a fresh todo; form state is unchanged |
| No templates exist | Dropdown and "📋 Templates" modal show empty state gracefully |
| Recurring template applied without a due date | Todo created without due date; recurrence checkbox set but effectively inert until due date added |
| Template `reminder_minutes` applied to a todo without due date | `reminder_minutes` stored but reminder badge shows a tooltip: "Set a due date for this reminder to activate" |
| Two templates with same name | Allowed (no unique constraint on name per user) |
| Very long `subtasks_json` | SQLite TEXT handles unlimited length; parsed correctly |

---

## Acceptance Criteria

- [ ] "💾 Save as Template" button appears only when the title field is non-empty.
- [ ] Saving a template persists name, description, category, priority, recurrence, and reminder to the DB.
- [ ] Template manager modal opens via "📋 Templates" button.
- [ ] All saved templates are listed with their metadata.
- [ ] Clicking "Use" in the manager modal creates a todo and closes the modal.
- [ ] Using a template via the dropdown creates a todo instantly.
- [ ] Templates with subtasks create all subtasks in the new todo.
- [ ] Deleting a template removes it from the list only (existing todos unaffected).
- [ ] All template API endpoints return 401 for unauthenticated requests.
- [ ] `subtasks_json` stored as valid JSON array in the DB.

---

## Testing Requirements

### E2E Tests (Playwright)

```typescript
// tests/07-templates.spec.ts
test('saves a template from form', async ({ page }) => {
  await page.fill('[data-testid="todo-input"]', 'Weekly review');
  await page.selectOption('[data-testid="priority-select"]', 'high');
  await page.click('[data-testid="save-as-template-btn"]');
  await page.fill('[data-testid="template-name-input"]', 'My Weekly Review');
  await page.click('[data-testid="save-template-confirm"]');
  await expect(page.locator('text=My Weekly Review')).not.toBeVisible(); // modal closed
});

test('applies template from dropdown', async ({ page }) => {
  await page.selectOption('[data-testid="use-template-select"]', { label: 'My Weekly Review' });
  await expect(page.locator('[data-testid="todo-list"]')).toContainText('Weekly review');
});

test('template manager shows saved templates', async ({ page }) => {
  await page.click('[data-testid="templates-btn"]');
  await expect(page.locator('text=My Weekly Review')).toBeVisible();
});

test('using template from manager creates todo and closes modal', async ({ page }) => {
  await page.click('[data-testid="templates-btn"]');
  await page.click('[data-testid="use-template-1"]');
  await expect(page.locator('[data-testid="templates-modal"]')).not.toBeVisible();
  await expect(page.locator('[data-testid="todo-list"]')).toContainText('Weekly review');
});
```

### Unit Tests

- `templateDB.create` stores subtasks as valid JSON string
- `JSON.parse(template.subtasks_json)` returns correct array after round-trip
- `POST /api/templates/[id]/use` creates todo + subtasks atomically
- Template delete does not cascade to todos

---

## Out of Scope

- Template sharing between users
- Template versioning / history
- Editing template content after creation (currently delete + recreate)
- Scheduling templates to apply automatically
- Template import/export (separate from main export)

---

## Success Metrics

- Template creation completes in < 300 ms
- Applying a template (including subtask creation) completes in < 400 ms
- `subtasks_json` round-trips (save → parse → create) without data loss
- Zero todos created without the expected subtasks when template has subtasks
- Template modal loads all templates in < 200 ms for up to 50 templates
