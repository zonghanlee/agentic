# PRP 09 — Export & Import

## Feature Overview

Allow users to **export** their todos in JSON format (for backup/restore) or CSV format (for spreadsheet analysis), and **import** todos from a previously exported JSON file. On import, new IDs are assigned to avoid collisions; all other todo properties are preserved. Tags and subtasks are excluded from the initial import scope (see Out of Scope) but the JSON export should include them for future compatibility.

**Implementation phase**: Phase 4 — Productivity  
**Depends on**: 01 Todo CRUD (todos must exist to export; import creates todos via CRUD layer)

---

## User Stories

| As a… | I want to… | So that… |
|-------|-----------|----------|
| User | Export my todos as JSON | I have a complete backup I can restore later |
| User | Export my todos as CSV | I can open my data in Excel or Google Sheets |
| User | Import a JSON file | I can restore todos to my account or move them between devices |
| User | See a success message after import | I know how many todos were created |
| User | Know that import creates new todos | I understand the behaviour and avoid accidental duplicates |

---

## User Flow

### Exporting JSON
1. User clicks **"Export JSON"** button (green, top-right area).
2. Browser downloads a file named `todos-YYYY-MM-DD.json` (Singapore date).
3. File contains an array of all the user's todos.

### Exporting CSV
1. User clicks **"Export CSV"** button (dark green, top-right area).
2. Browser downloads a file named `todos-YYYY-MM-DD.csv`.
3. File opens directly in spreadsheet applications.

### Importing
1. User clicks **"Import"** button (blue, top-right area).
2. Browser file picker opens, filtered to `.json` files.
3. User selects a JSON file.
4. File is read client-side, validated, and sent to the server.
5. Server creates new todos and returns the count.
6. Success toast: `"Successfully imported X todos"`.
7. Todo list refreshes.

---

## Technical Requirements

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/todos/export` | Download todos (JSON or CSV based on `?format=` param) |
| `POST` | `/api/todos/import` | Bulk-create todos from a JSON array |

#### `GET /api/todos/export`

```typescript
// app/api/todos/export/route.ts
import { getSession } from '@/lib/auth';
import { todoDB, subtaskDB, tagDB } from '@/lib/db';
import { getSingaporeNow } from '@/lib/timezone';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const format = request.nextUrl.searchParams.get('format') ?? 'json';
  const dateStr = getSingaporeNow().toISOString().slice(0, 10);
  const todos = todoDB.findAll(session.userId);

  if (format === 'csv') {
    const header = 'ID,Title,Completed,Due Date,Priority,Recurring,Pattern,Reminder\n';
    const rows = todos
      .map(t =>
        [
          t.id,
          `"${t.title.replace(/"/g, '""')}"`,
          t.completed,
          t.due_date ?? '',
          t.priority,
          t.is_recurring,
          t.recurrence_pattern ?? '',
          t.reminder_minutes ?? '',
        ].join(',')
      )
      .join('\n');

    return new NextResponse(header + rows, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="todos-${dateStr}.csv"`,
      },
    });
  }

  // JSON export — enrich with subtasks and tags
  const enriched = todos.map(todo => ({
    ...todo,
    subtasks: subtaskDB.findByTodoId(todo.id),
    tags: tagDB.getTagsForTodo(todo.id),
  }));

  return new NextResponse(JSON.stringify(enriched, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="todos-${dateStr}.json"`,
    },
  });
}
```

#### `POST /api/todos/import`

```typescript
// app/api/todos/import/route.ts
import { getSession } from '@/lib/auth';
import { todoDB } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

const VALID_PRIORITIES = ['high', 'medium', 'low'];
const VALID_PATTERNS = ['daily', 'weekly', 'monthly', 'yearly'];

interface ImportTodo {
  title: string;
  completed?: boolean;
  due_date?: string | null;
  priority?: string;
  is_recurring?: boolean;
  recurrence_pattern?: string | null;
  reminder_minutes?: number | null;
  created_at?: string;
}

function validateImportTodo(item: unknown): item is ImportTodo {
  if (typeof item !== 'object' || item === null) return false;
  const t = item as Record<string, unknown>;
  if (typeof t.title !== 'string' || t.title.trim() === '') return false;
  if (t.priority !== undefined && !VALID_PRIORITIES.includes(t.priority as string)) return false;
  if (t.recurrence_pattern !== undefined && t.recurrence_pattern !== null
      && !VALID_PATTERNS.includes(t.recurrence_pattern as string)) return false;
  return true;
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON format' }, { status: 400 });
  }

  if (!Array.isArray(body)) {
    return NextResponse.json({ error: 'Expected an array of todos' }, { status: 400 });
  }

  const invalids = body.filter(item => !validateImportTodo(item));
  if (invalids.length > 0) {
    return NextResponse.json(
      { error: `${invalids.length} item(s) failed validation` },
      { status: 400 }
    );
  }

  let created = 0;
  for (const item of body as ImportTodo[]) {
    todoDB.create(session.userId, {
      title: item.title.trim(),
      due_date: item.due_date ?? null,
      priority: VALID_PRIORITIES.includes(item.priority ?? '') ? item.priority as any : 'medium',
      is_recurring: !!item.is_recurring,
      recurrence_pattern: item.recurrence_pattern as any ?? null,
      reminder_minutes: item.reminder_minutes ?? null,
    });
    created++;
  }

  return NextResponse.json({ imported: created }, { status: 201 });
}
```

### TypeScript Types

```typescript
// lib/db.ts additions
export interface ExportedTodo extends Todo {
  subtasks: Subtask[];
  tags: Tag[];
}
```

### Client-Side Import Handler

```typescript
// app/page.tsx
async function handleImport(file: File): Promise<void> {
  let data: unknown;
  try {
    data = JSON.parse(await file.text());
  } catch {
    setError('Invalid JSON file. Please select a valid export file.');
    return;
  }

  const res = await fetch('/api/todos/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  const result = await res.json();

  if (!res.ok) {
    setError(result.error ?? 'Failed to import todos');
    return;
  }

  setSuccessMessage(`Successfully imported ${result.imported} todos`);
  await loadTodos(); // refresh list
}
```

---

## UI Components

### Export & Import Buttons

```tsx
function ExportImportBar({ onImport }: { onImport: (file: File) => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const triggerExport = (format: 'json' | 'csv') => {
    const link = document.createElement('a');
    link.href = `/api/todos/export?format=${format}`;
    link.click();
  };

  return (
    <div className="flex gap-2 items-center">
      <button
        onClick={() => triggerExport('json')}
        className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded text-sm"
      >
        Export JSON
      </button>
      <button
        onClick={() => triggerExport('csv')}
        className="bg-green-800 hover:bg-green-900 text-white px-3 py-1.5 rounded text-sm"
      >
        Export CSV
      </button>
      <button
        onClick={() => fileInputRef.current?.click()}
        className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1.5 rounded text-sm"
      >
        Import
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) onImport(file);
          e.target.value = ''; // reset so the same file can be re-imported
        }}
      />
    </div>
  );
}
```

### Success / Error Toast

```tsx
function Toast({ message, type }: { message: string; type: 'success' | 'error' }) {
  return (
    <div className={`fixed bottom-4 right-4 px-4 py-3 rounded shadow-lg text-white text-sm z-50
      ${type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
      {message}
    </div>
  );
}
```

---

## Edge Cases

| Scenario | Expected Behaviour |
|----------|-------------------|
| Empty JSON array `[]` | API returns `{ imported: 0 }`; success message: "Imported 0 todos" |
| File is not valid JSON | Client-side parse error; user shown friendly error message |
| JSON is valid but not an array | API returns 400 "Expected an array" |
| Item missing `title` field | Validation fails; API returns 400 with count of invalid items |
| Item has invalid `priority` value | Defaults to `'medium'`; no failure |
| Item has invalid `recurrence_pattern` | Stored as `null`; no failure |
| Import creates duplicate todos | Expected behaviour; import always creates new entries |
| Very large file (500+ todos) | Server processes synchronously; responds within a few seconds |
| User imports file exported by a different user | Works; new todos linked to importing user's `user_id` |
| Original IDs in file | Ignored; new IDs assigned by `AUTOINCREMENT` |
| CSV import | Not supported; file picker filtered to `.json` |
| No todos exist on export | Downloads an empty JSON array `[]` or CSV with header only |

---

## Acceptance Criteria

- [ ] "Export JSON" button downloads `todos-YYYY-MM-DD.json` with current Singapore date.
- [ ] JSON file contains all fields including `subtasks` and `tags` arrays.
- [ ] "Export CSV" button downloads `todos-YYYY-MM-DD.csv` with correct columns.
- [ ] "Import" button opens a file picker filtered to `.json`.
- [ ] Valid JSON file creates new todos and shows `"Successfully imported X todos"`.
- [ ] Imported todos appear in the list immediately after import.
- [ ] Imported todos are assigned new IDs (original IDs from file are discarded).
- [ ] Invalid JSON file shows a user-friendly error message.
- [ ] Missing or invalid `title` field causes import rejection with a 400.
- [ ] All export/import API endpoints return 401 for unauthenticated requests.
- [ ] CSV format includes comma-escaping for titles containing commas or quotes.

---

## Testing Requirements

### E2E Tests (Playwright)

```typescript
// tests/09-export-import.spec.ts
test('exports JSON file with todos', async ({ page }) => {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('[data-testid="export-json-btn"]'),
  ]);
  expect(download.suggestedFilename()).toMatch(/^todos-\d{4}-\d{2}-\d{2}\.json$/);
  const content = await (await download.createReadStream()).read();
  const todos = JSON.parse(content.toString());
  expect(Array.isArray(todos)).toBe(true);
});

test('imports todos from JSON file', async ({ page }) => {
  const json = JSON.stringify([{ title: 'Imported task', priority: 'low' }]);
  const buffer = Buffer.from(json);
  await page.locator('[data-testid="import-file-input"]').setInputFiles({
    name: 'todos.json',
    mimeType: 'application/json',
    buffer,
  });
  await expect(page.locator('text=Successfully imported 1 todos')).toBeVisible();
  await expect(page.locator('text=Imported task')).toBeVisible();
});

test('invalid JSON shows error', async ({ page }) => {
  await page.locator('[data-testid="import-file-input"]').setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from('NOT_JSON'),
  });
  await expect(page.locator('text=Invalid JSON file')).toBeVisible();
});
```

### Unit Tests

- `validateImportTodo` accepts valid item with title only
- `validateImportTodo` rejects item with missing title
- `validateImportTodo` rejects item with invalid priority
- CSV export escapes double quotes and commas in titles
- Export API returns correct `Content-Disposition` header with today's date
- Import with 0 items returns `{ imported: 0 }`

---

## Out of Scope

- Importing CSV files (export only)
- Importing subtasks and tags from JSON (data is included in export but not re-created on import — future enhancement)
- Merging/deduplicating on import
- Incremental/differential export
- Scheduled automatic exports

---

## Success Metrics

- JSON export completes in < 500 ms for 500 todos
- CSV export completes in < 500 ms for 500 todos
- Import of 100 todos completes in < 2 s
- 100% of todo fields preserved faithfully in JSON round-trip (export then import)
- Zero HTML injection vulnerabilities in CSV output (no unescaped formula injections: `=`, `+`, `-`, `@` prefixes handled)
