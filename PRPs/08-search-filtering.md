# PRP 08 — Search & Filtering

## Feature Overview

A real-time, multi-criteria filtering system. Users can search todo titles and subtask titles, filter by priority and tag, filter by completion status and date range, and save any combination of active filters as a named **preset** stored in browser `localStorage`. All filtering is performed client-side for instant responsiveness. Filters combine with **AND** logic.

**Implementation phase**: Phase 3 — Organisation  
**Depends on**:
- 01 Todo CRUD (todo list must exist)
- 06 Tag System (tag filter requires tags to exist; tag filter hidden if no tags)

---

## User Stories

| As a… | I want to… | So that… |
|-------|-----------|----------|
| User | Type in a search box and see results instantly | I can find a specific todo without scrolling |
| User | Filter todos by priority | I can focus on urgent tasks |
| User | Filter todos by tag | I can view a single category at a time |
| User | Filter by completion status | I can separately review done vs. pending tasks |
| User | Filter todos by a due date range | I can see what is due this week |
| User | Save a set of filters as a preset | I can reapply a complex search in one click |
| User | Clear all active filters at once | I can quickly return to the full list |

---

## User Flow

### Basic Search
1. User focuses the search input at the top of the todo list.
2. Typing updates the filtered list in real-time (no submit required).
3. Todos whose title **or** any subtask title contains the query (case-insensitive) are shown.
4. A **✕** clear button appears once text is entered.

### Quick Filters
- **Priority dropdown**: selects a priority tier; combined with search.
- **Tag dropdown**: selects a tag; combined with search and priority.
- **Advanced toggle**: reveals the advanced filters panel.

### Advanced Filters
1. User clicks **"▶ Advanced"**; panel expands.
2. User selects completion status: `All / Incomplete / Completed`.
3. User sets optional due date range via two date inputs (`From` / `To`).
4. Saved presets are listed as clickable pills at the bottom of the panel.

### Saving a Preset
1. User applies any filter combination.
2. A **"💾 Save Filter"** button appears.
3. User clicks it; a small modal opens showing a summary of active filters.
4. User enters a preset name and clicks **"Save"**.
5. Preset stored in `localStorage`; pill appears in the advanced panel.

### Applying a Preset
1. User opens the Advanced panel.
2. Clicks a preset pill.
3. All stored filters applied instantly.

### Clearing Filters
- **"Clear All"** button (red) appears whenever any filter is active.
- Clicking it resets all filter state to defaults.

---

## Technical Requirements

### No New API Endpoints Required

All filtering is client-side. The existing `GET /api/todos` returns the full list; the client filters in memory.

Subtask data needed for search must either:
- Be included in `GET /api/todos` response (embed `subtasks` array on each todo), **or**
- Fetched separately via `GET /api/todos/[id]/subtasks` per todo (expensive — avoid).

**Recommended**: Augment `GET /api/todos` to join subtasks:

```typescript
// lib/db.ts — todoDB.findAll (extended)
findAll(userId: number): (Todo & { subtasks: Subtask[] })[] {
  const todos = db.prepare(
    `SELECT * FROM todos WHERE user_id = ? ORDER BY
      CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
      due_date ASC NULLS LAST, created_at DESC`
  ).all(userId) as Todo[];

  return todos.map(todo => ({
    ...todo,
    subtasks: subtaskDB.findByTodoId(todo.id),
    tags: tagDB.getTagsForTodo(todo.id),
  }));
}
```

### TypeScript Types

```typescript
// app/page.tsx (client state)
export interface FilterState {
  query: string;
  priority: Priority | 'all';
  tagId: number | null;
  completion: 'all' | 'incomplete' | 'completed';
  dateFrom: string;   // YYYY-MM-DD or ''
  dateTo: string;     // YYYY-MM-DD or ''
}

export interface FilterPreset {
  id: string;                  // uuid or timestamp string
  name: string;
  filters: FilterState;
}

const DEFAULT_FILTERS: FilterState = {
  query: '',
  priority: 'all',
  tagId: null,
  completion: 'all',
  dateFrom: '',
  dateTo: '',
};
```

### Client-Side Filtering Logic

```typescript
// Pure function — easy to unit test
function applyFilters(
  todos: (Todo & { subtasks: Subtask[]; tags: Tag[] })[],
  filters: FilterState
): typeof todos {
  const q = filters.query.toLowerCase().trim();

  return todos.filter(todo => {
    // 1. Text search (title + subtask titles)
    if (q) {
      const inTitle = todo.title.toLowerCase().includes(q);
      const inSubtasks = todo.subtasks.some(s => s.title.toLowerCase().includes(q));
      if (!inTitle && !inSubtasks) return false;
    }

    // 2. Priority
    if (filters.priority !== 'all' && todo.priority !== filters.priority) return false;

    // 3. Tag
    if (filters.tagId !== null) {
      if (!todo.tags.some(t => t.id === filters.tagId)) return false;
    }

    // 4. Completion
    if (filters.completion === 'incomplete' && todo.completed) return false;
    if (filters.completion === 'completed' && !todo.completed) return false;

    // 5. Date range (only todos WITH due dates match date filters)
    if (filters.dateFrom || filters.dateTo) {
      if (!todo.due_date) return false;
      const due = todo.due_date.slice(0, 10); // YYYY-MM-DD
      if (filters.dateFrom && due < filters.dateFrom) return false;
      if (filters.dateTo && due > filters.dateTo) return false;
    }

    return true;
  });
}
```

### Preset Storage

```typescript
const PRESETS_KEY = 'todoFilterPresets';

function loadPresets(): FilterPreset[] {
  try {
    return JSON.parse(localStorage.getItem(PRESETS_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function savePreset(preset: FilterPreset): void {
  const presets = loadPresets();
  localStorage.setItem(PRESETS_KEY, JSON.stringify([...presets, preset]));
}

function deletePreset(id: string): void {
  const presets = loadPresets().filter(p => p.id !== id);
  localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
}
```

---

## UI Components

### Search Bar

```tsx
function SearchBar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative flex-1">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Search todos and subtasks..."
        className="w-full border rounded pl-9 pr-8 py-2"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
        >
          ✕
        </button>
      )}
    </div>
  );
}
```

### Filter Bar (Quick Filters)

```tsx
function FilterBar({ filters, tags, onChange, onClear, onSave }: FilterBarProps) {
  const isActive = filters.query || filters.priority !== 'all' || filters.tagId !== null
    || filters.completion !== 'all' || filters.dateFrom || filters.dateTo;

  return (
    <div className="flex flex-wrap gap-2 items-center mb-3">
      <SearchBar value={filters.query} onChange={q => onChange({ ...filters, query: q })} />
      <PriorityFilter value={filters.priority} onChange={p => onChange({ ...filters, priority: p })} />
      <TagFilter tags={tags} value={filters.tagId} onChange={id => onChange({ ...filters, tagId: id })} />
      <AdvancedToggle />
      {isActive && (
        <>
          <button onClick={onClear} className="bg-red-100 text-red-700 px-3 py-1.5 rounded text-sm">
            Clear All
          </button>
          <button onClick={onSave} className="bg-green-100 text-green-700 px-3 py-1.5 rounded text-sm">
            💾 Save Filter
          </button>
        </>
      )}
    </div>
  );
}
```

### Advanced Filters Panel

```tsx
function AdvancedPanel({ filters, presets, onChange, onApplyPreset, onDeletePreset }: AdvancedPanelProps) {
  return (
    <div className="border rounded p-4 mb-3 bg-gray-50 dark:bg-gray-800">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Completion Status */}
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1">Status</label>
          <select
            value={filters.completion}
            onChange={e => onChange({ ...filters, completion: e.target.value as FilterState['completion'] })}
            className="w-full border rounded px-3 py-2 text-sm"
          >
            <option value="all">All Todos</option>
            <option value="incomplete">Incomplete Only</option>
            <option value="completed">Completed Only</option>
          </select>
        </div>

        {/* Date From */}
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1">Due Date From</label>
          <input
            type="date"
            value={filters.dateFrom}
            onChange={e => onChange({ ...filters, dateFrom: e.target.value })}
            className="w-full border rounded px-3 py-2 text-sm"
          />
        </div>

        {/* Date To */}
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1">Due Date To</label>
          <input
            type="date"
            value={filters.dateTo}
            onChange={e => onChange({ ...filters, dateTo: e.target.value })}
            className="w-full border rounded px-3 py-2 text-sm"
          />
        </div>
      </div>

      {/* Saved Presets */}
      {presets.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-medium text-gray-500 mb-1">Saved Filter Presets</p>
          <div className="flex flex-wrap gap-2">
            {presets.map(preset => (
              <span key={preset.id} className="flex items-center gap-1 bg-white border rounded-full px-3 py-1 text-sm">
                <button onClick={() => onApplyPreset(preset)} className="hover:underline">{preset.name}</button>
                <button onClick={() => onDeletePreset(preset.id)} className="text-gray-400 hover:text-red-500">✕</button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

### Save Filter Modal

```tsx
function SaveFilterModal({ filters, onSave, onClose }: SaveFilterModalProps) {
  const [name, setName] = useState('');

  const summary = [
    filters.query && `Search: "${filters.query}"`,
    filters.priority !== 'all' && `Priority: ${filters.priority}`,
    filters.tagId !== null && `Tag ID: ${filters.tagId}`,
    filters.completion !== 'all' && `Completion: ${filters.completion}`,
    (filters.dateFrom || filters.dateTo) && `Date: ${filters.dateFrom || '…'} → ${filters.dateTo || '…'}`,
  ].filter(Boolean);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-sm">
        <h2 className="text-lg font-semibold mb-3">Save Filter Preset</h2>
        <ul className="text-sm text-gray-600 dark:text-gray-300 mb-4 space-y-1">
          {summary.map((s, i) => <li key={i}>• {s}</li>)}
        </ul>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Preset name"
          className="w-full border rounded px-3 py-2 mb-4"
          required
        />
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 border rounded text-sm">Cancel</button>
          <button
            disabled={!name.trim()}
            onClick={() => onSave({ id: Date.now().toString(), name: name.trim(), filters })}
            className="px-4 py-2 bg-green-500 text-white rounded text-sm disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
```

---

## Edge Cases

| Scenario | Expected Behaviour |
|----------|-------------------|
| Query matches subtask but not parent title | Parent todo still shown (due to subtask match) |
| All filters applied, no todos match | Empty state shown for each section; sections auto-hide |
| Date range `From > To` | UI should prevent or warn; filter shows no results gracefully |
| localStorage unavailable (private mode) | `loadPresets` returns `[]`; save silently fails or shows error |
| Preset with a tag ID whose tag was deleted | Filter applied; tag filter produces no match (tag no longer exists); no crash |
| Applying preset while search box has text | Preset REPLACES all current filters including the search text |
| Filter by completion "Completed" while priority filter also active | Both conditions must be met (AND logic) |
| Very large todo list (1000 items) | Client-side filter should complete < 50 ms |
| Unicode or emoji in search query | Case-insensitive comparison still works (`toLowerCase()`) |

---

## Acceptance Criteria

- [ ] Typing in the search box filters in real-time without page reload.
- [ ] Search matches todo titles AND subtask titles, case-insensitively.
- [ ] Clear (✕) button removes search query.
- [ ] Priority filter dropdown correctly narrows the list.
- [ ] Tag filter dropdown hidden when no tags exist.
- [ ] Advanced panel expands/collapses on toggle.
- [ ] Completion status filter works for `All / Incomplete / Completed`.
- [ ] Date range filter excludes todos without a due date.
- [ ] All filters combine with AND logic.
- [ ] "Clear All" button resets all filters to defaults.
- [ ] "💾 Save Filter" button appears only when at least one filter is active.
- [ ] Preset is persisted in `localStorage` and survives page refresh.
- [ ] Applying a preset replaces all current filter values.
- [ ] Deleting a preset removes it from the panel.
- [ ] Section counts (e.g. `Pending (3)`) reflect filtered results.

---

## Testing Requirements

### E2E Tests (Playwright)

```typescript
// tests/08-search-filtering.spec.ts
test('search filters by title', async ({ page }) => {
  await page.fill('[data-testid="search-input"]', 'meeting');
  const titles = await page.locator('[data-testid="todo-title"]').allTextContents();
  expect(titles.every(t => t.toLowerCase().includes('meeting'))).toBe(true);
});

test('search matches subtask titles', async ({ page }) => {
  // Assume todo "Project Alpha" has subtask "Send report"
  await page.fill('[data-testid="search-input"]', 'send report');
  await expect(page.locator('text=Project Alpha')).toBeVisible();
});

test('clear all resets filters', async ({ page }) => {
  await page.fill('[data-testid="search-input"]', 'xyz');
  await page.click('[data-testid="clear-all-btn"]');
  await expect(page.locator('[data-testid="search-input"]')).toHaveValue('');
});

test('saves and applies filter preset', async ({ page }) => {
  await page.fill('[data-testid="search-input"]', 'work');
  await page.click('[data-testid="save-filter-btn"]');
  await page.fill('[data-testid="preset-name-input"]', 'Work Items');
  await page.click('[data-testid="save-preset-confirm"]');
  await page.click('[data-testid="clear-all-btn"]');
  // Open advanced panel and apply preset
  await page.click('[data-testid="advanced-toggle"]');
  await page.click('[data-testid="preset-Work Items"]');
  await expect(page.locator('[data-testid="search-input"]')).toHaveValue('work');
});
```

### Unit Tests

- `applyFilters` with empty `FilterState` returns original list unchanged
- `applyFilters` query matches subtask, not title — todo is included
- `applyFilters` priority filter excludes non-matching todos
- `applyFilters` date range excludes todos without `due_date`
- `applyFilters` AND logic: query + priority must both match
- `loadPresets` returns `[]` when localStorage is empty
- `savePreset` → `loadPresets` round-trip preserves all fields
- `deletePreset` removes only the targeted preset by ID

---

## Out of Scope

- Server-side search / full-text SQLite FTS5
- OR logic between filter criteria
- Search history or autocomplete suggestions
- Syncing presets across devices (localStorage is device-local)
- Natural language date filters (e.g. "due this week")

---

## Success Metrics

- Search input response < 50 ms for 500 todos (client-side)
- Filter preset save/load round-trip data-loss-free
- All filter combinations tested with AND logic correctness
- Empty state rendered gracefully (no layout breaks)
- Section count labels always reflect currently filtered result counts
