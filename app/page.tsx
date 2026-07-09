'use client'

// app/page.tsx
// Main todo page — client component managing all todo state and UI.
// Phase 1: Todo CRUD (PRP 01) + Priority System (PRP 02).
// Phase 2: Recurring Todos (PRP 03) + Reminders (PRP 04) + Subtasks (PRP 05).
// Phase 3: Tag System (PRP 06) + Search & Filtering (PRP 08).
// Phase 4: Template System (PRP 07) + Export & Import (PRP 09) + Calendar nav (PRP 10).

import { useState, useEffect, useMemo, useCallback, useRef, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { formatSingaporeDate, getSingaporeNow, getRelativeDueLabel } from '@/lib/timezone'
import type { Priority, Todo, UpdateTodoDto, RecurrencePattern, Subtask, Tag, Template } from '@/lib/db'
import { useNotifications } from '@/lib/hooks/useNotifications'

// ---------------------------------------------------------------------------
// Search & Filtering types (PRP 08)
// ---------------------------------------------------------------------------

export interface FilterState {
  query: string
  priority: Priority | 'all'
  tagId: number | null
  completion: 'all' | 'incomplete' | 'completed'
  dateFrom: string
  dateTo: string
}

export interface FilterPreset {
  id: string
  name: string
  filters: FilterState
}

const DEFAULT_FILTERS: FilterState = {
  query: '',
  priority: 'all',
  tagId: null,
  completion: 'all',
  dateFrom: '',
  dateTo: '',
}

const PRESETS_KEY = 'todoFilterPresets'

function loadPresets(): FilterPreset[] {
  try {
    return JSON.parse(localStorage.getItem(PRESETS_KEY) ?? '[]')
  } catch {
    return []
  }
}

function persistPresets(presets: FilterPreset[]): void {
  try {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(presets))
  } catch {
    // localStorage unavailable (e.g. private mode) — fail silently
  }
}

function isFilterActive(filters: FilterState): boolean {
  return (
    filters.query !== '' ||
    filters.priority !== 'all' ||
    filters.tagId !== null ||
    filters.completion !== 'all' ||
    filters.dateFrom !== '' ||
    filters.dateTo !== ''
  )
}

function applyFilters(
  todos: Todo[],
  subtasksMap: Record<number, Subtask[]>,
  tagsMap: Record<number, Tag[]>,
  filters: FilterState
): Todo[] {
  const q = filters.query.toLowerCase().trim()

  return todos.filter((todo) => {
    if (q) {
      const inTitle = todo.title.toLowerCase().includes(q)
      const inSubtasks = (subtasksMap[todo.id] ?? []).some((s) =>
        s.title.toLowerCase().includes(q)
      )
      if (!inTitle && !inSubtasks) return false
    }

    if (filters.priority !== 'all' && todo.priority !== filters.priority) return false

    if (filters.tagId !== null) {
      if (!(tagsMap[todo.id] ?? []).some((t) => t.id === filters.tagId)) return false
    }

    if (filters.completion === 'incomplete' && todo.completed) return false
    if (filters.completion === 'completed' && !todo.completed) return false

    if (filters.dateFrom || filters.dateTo) {
      if (!todo.due_date) return false
      const due = todo.due_date.slice(0, 10)
      if (filters.dateFrom && due < filters.dateFrom) return false
      if (filters.dateTo && due > filters.dateTo) return false
    }

    return true
  })
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PRIORITY_BADGE: Record<Priority, string> = {
  high: 'bg-red-100 text-red-700 border border-red-300',
  medium: 'bg-yellow-100 text-yellow-700 border border-yellow-300',
  low: 'bg-blue-100 text-blue-700 border border-blue-300',
}

const PRIORITY_LABEL: Record<Priority, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

const PATTERN_LABEL: Record<RecurrencePattern, string> = {
  daily: 'daily',
  weekly: 'weekly',
  monthly: 'monthly',
  yearly: 'yearly',
}

// Maps reminder_minutes values to short display labels (client-side only)
const REMINDER_BADGE_MAP: Record<number, string> = {
  15: '15m',
  30: '30m',
  60: '1h',
  120: '2h',
  1440: '1d',
  2880: '2d',
  10080: '1w',
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span
      data-testid="priority-badge"
      className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_BADGE[priority]}`}
    >
      {PRIORITY_LABEL[priority]}
    </span>
  )
}

function RecurrenceBadge({ pattern }: { pattern: RecurrencePattern }) {
  return (
    <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-300">
      🔄 {PATTERN_LABEL[pattern]}
    </span>
  )
}

function ReminderBadge({ minutes }: { minutes: number }) {
  const label = REMINDER_BADGE_MAP[minutes] ?? `${minutes}m`
  return (
    <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-300">
      🔔 {label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Progress bar
// ---------------------------------------------------------------------------

function computeProgress(subtasks: Subtask[]): { completed: number; total: number; pct: number } {
  const total = subtasks.length
  const completed = subtasks.filter((s) => s.completed).length
  const pct = total === 0 ? 0 : Math.round((completed / total) * 100)
  return { completed, total, pct }
}

function ProgressBar({ todoId, subtasks }: { todoId: number; subtasks: Subtask[] }) {
  const { completed, total, pct } = computeProgress(subtasks)
  if (total === 0) return null
  return (
    <div className="mt-2" data-testid={`progress-container-${todoId}`}>
      <div className="flex justify-between text-xs text-gray-500 mb-1">
        <span data-testid={`subtask-counter-${todoId}`}>{completed}/{total} subtasks</span>
        <span>{pct}%</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-1.5">
        <div
          data-testid={`progress-bar-${todoId}`}
          className="bg-blue-500 h-1.5 rounded-full transition-all duration-200"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Subtask panel
// ---------------------------------------------------------------------------

interface SubtaskPanelProps {
  todoId: number
  subtasks: Subtask[]
  onAdd: (title: string) => Promise<void>
  onToggle: (subtaskId: number, completed: boolean) => Promise<void>
  onDelete: (subtaskId: number) => Promise<void>
}

function SubtaskPanel({ todoId, subtasks, onAdd, onToggle, onDelete }: SubtaskPanelProps) {
  const [input, setInput] = useState('')

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    if (!input.trim()) return
    await onAdd(input.trim())
    setInput('')
  }

  return (
    <div className="mt-3 border-t border-gray-100 pt-3">
      <ul className="space-y-1 mb-2">
        {subtasks.map((s) => (
          <li key={s.id} className="flex items-center gap-2">
            <input
              data-testid={`subtask-checkbox-${s.id}`}
              type="checkbox"
              checked={s.completed}
              onChange={() => onToggle(s.id, !s.completed)}
              className="h-3.5 w-3.5 rounded border-gray-300 accent-blue-600 cursor-pointer"
            />
            <span
              className={`flex-1 text-sm ${s.completed ? 'line-through text-gray-400' : 'text-gray-700'}`}
            >
              {s.title}
            </span>
            <button
              data-testid={`delete-subtask-${s.id}`}
              onClick={() => onDelete(s.id)}
              className="text-gray-400 hover:text-red-500 text-xs px-1"
              aria-label={`Delete subtask "${s.title}"`}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          data-testid={`subtask-input-${todoId}`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Add subtask…"
          className="flex-1 text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
        <button
          type="submit"
          className="text-sm bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded border border-gray-300"
        >
          Add
        </button>
      </form>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tag pill (PRP 06)
// ---------------------------------------------------------------------------

function TagPill({
  tag,
  selected,
  onClick,
}: {
  tag: Tag
  selected?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      data-testid={`tag-pill-${tag.name}`}
      onClick={onClick}
      style={{
        backgroundColor: selected ? tag.color : 'transparent',
        borderColor: tag.color,
        color: selected ? '#fff' : tag.color,
      }}
      className="text-xs px-2 py-0.5 rounded-full border font-medium transition-colors max-w-[10rem] truncate"
    >
      {selected && '✓ '}
      {tag.name}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Tag management modal (PRP 06)
// ---------------------------------------------------------------------------

interface TagModalProps {
  tags: Tag[]
  onClose: () => void
  onCreate: (name: string, color: string) => Promise<void>
  onUpdate: (id: number, name: string, color: string) => Promise<void>
  onDelete: (id: number) => Promise<void>
}

function TagModal({ tags, onClose, onCreate, onUpdate, onDelete }: TagModalProps) {
  const [name, setName] = useState('')
  const [color, setColor] = useState('#3B82F6')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      if (editingId !== null) {
        await onUpdate(editingId, name.trim(), color)
      } else {
        await onCreate(name.trim(), color)
      }
      setName('')
      setColor('#3B82F6')
      setEditingId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save tag')
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Manage Tags</h2>

        <form onSubmit={handleSubmit} className="flex gap-2 mb-4">
          <input
            data-testid="tag-name-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tag name"
            required
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="border border-gray-300 rounded-lg px-1 py-1 h-10 w-10 cursor-pointer"
          />
          <input
            type="text"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            placeholder="#3B82F6"
            pattern="^#[0-9A-Fa-f]{6}$"
            className="border border-gray-300 rounded-lg px-3 py-2 w-28 font-mono text-sm"
          />
          <button
            type="submit"
            data-testid="create-tag-btn"
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm"
          >
            {editingId ? 'Update' : 'Create Tag'}
          </button>
        </form>

        {error && (
          <p className="text-sm text-red-600 mb-3" role="alert">
            {error}
          </p>
        )}

        <ul className="space-y-2 max-h-64 overflow-y-auto">
          {tags.map((tag) => (
            <li key={tag.id} className="flex items-center justify-between">
              <TagPill tag={tag} selected />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(tag.id)
                    setName(tag.name)
                    setColor(tag.color)
                  }}
                  className="text-sm text-blue-600 hover:underline"
                >
                  Edit
                </button>
                <button
                  type="button"
                  data-testid={`delete-tag-${tag.name}`}
                  onClick={() => onDelete(tag.id)}
                  className="text-sm text-red-500 hover:underline"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
          {tags.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">No tags yet.</p>
          )}
        </ul>

        <button
          type="button"
          data-testid="close-tag-modal"
          onClick={onClose}
          className="mt-4 text-gray-500 hover:underline text-sm"
        >
          Close
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tag filter dropdown (PRP 06)
// ---------------------------------------------------------------------------

function TagFilter({
  tags,
  value,
  onChange,
}: {
  tags: Tag[]
  value: number | null
  onChange: (id: number | null) => void
}) {
  if (tags.length === 0) return null
  return (
    <select
      data-testid="tag-filter"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
      className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      <option value="">All Tags</option>
      {tags.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  )
}

// ---------------------------------------------------------------------------
// Search bar (PRP 08)
// ---------------------------------------------------------------------------

function SearchBar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative flex-1 min-w-48">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
      <input
        data-testid="search-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search todos and subtasks..."
        className="w-full border border-gray-300 rounded-lg pl-9 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {value && (
        <button
          type="button"
          data-testid="clear-search-btn"
          onClick={() => onChange('')}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          aria-label="Clear search"
        >
          ✕
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Advanced filters panel (PRP 08)
// ---------------------------------------------------------------------------

interface AdvancedPanelProps {
  filters: FilterState
  presets: FilterPreset[]
  onChange: (filters: FilterState) => void
  onApplyPreset: (preset: FilterPreset) => void
  onDeletePreset: (id: string) => void
}

function AdvancedPanel({ filters, presets, onChange, onApplyPreset, onDeletePreset }: AdvancedPanelProps) {
  return (
    <div className="border border-gray-200 rounded-lg p-4 mb-3 bg-gray-50">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1">Status</label>
          <select
            data-testid="completion-filter"
            value={filters.completion}
            onChange={(e) =>
              onChange({ ...filters, completion: e.target.value as FilterState['completion'] })
            }
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="all">All Todos</option>
            <option value="incomplete">Incomplete Only</option>
            <option value="completed">Completed Only</option>
          </select>
        </div>

        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1">Due Date From</label>
          <input
            data-testid="date-from-input"
            type="date"
            value={filters.dateFrom}
            onChange={(e) => onChange({ ...filters, dateFrom: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1">Due Date To</label>
          <input
            data-testid="date-to-input"
            type="date"
            value={filters.dateTo}
            onChange={(e) => onChange({ ...filters, dateTo: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
      </div>

      {presets.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-medium text-gray-500 mb-1">Saved Filter Presets</p>
          <div className="flex flex-wrap gap-2">
            {presets.map((preset) => (
              <span
                key={preset.id}
                className="flex items-center gap-1 bg-white border border-gray-300 rounded-full px-3 py-1 text-sm"
              >
                <button
                  type="button"
                  data-testid={`preset-${preset.name}`}
                  onClick={() => onApplyPreset(preset)}
                  className="hover:underline"
                >
                  {preset.name}
                </button>
                <button
                  type="button"
                  data-testid={`delete-preset-${preset.name}`}
                  onClick={() => onDeletePreset(preset.id)}
                  className="text-gray-400 hover:text-red-500"
                  aria-label={`Delete preset "${preset.name}"`}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Save filter modal (PRP 08)
// ---------------------------------------------------------------------------

function SaveFilterModal({
  filters,
  onSave,
  onClose,
}: {
  filters: FilterState
  onSave: (preset: FilterPreset) => void
  onClose: () => void
}) {
  const [name, setName] = useState('')

  const summary = [
    filters.query && `Search: "${filters.query}"`,
    filters.priority !== 'all' && `Priority: ${filters.priority}`,
    filters.tagId !== null && `Tag ID: ${filters.tagId}`,
    filters.completion !== 'all' && `Completion: ${filters.completion}`,
    (filters.dateFrom || filters.dateTo) && `Date: ${filters.dateFrom || '…'} → ${filters.dateTo || '…'}`,
  ].filter(Boolean) as string[]

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Save Filter Preset</h2>
        <ul className="text-sm text-gray-600 mb-4 space-y-1">
          {summary.map((s, i) => (
            <li key={i}>• {s}</li>
          ))}
        </ul>
        <input
          data-testid="preset-name-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Preset name"
          required
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="save-preset-confirm"
            disabled={!name.trim()}
            onClick={() => onSave({ id: Date.now().toString(), name: name.trim(), filters })}
            className="px-4 py-2 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Templates (PRP 07)
// ---------------------------------------------------------------------------

interface TemplateFormState {
  title: string
  priority: Priority
  isRecurring: boolean
  pattern: RecurrencePattern
  reminder: number | null
}

function SaveTemplateModal({
  formState,
  onSave,
  onClose,
}: {
  formState: TemplateFormState
  onSave: (name: string, description: string, category: string) => Promise<void>
  onClose: () => void
}) {
  const [name, setName] = useState(formState.title)
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    try {
      await onSave(name.trim(), description.trim(), category.trim())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save template')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Save as Template</h2>
        <input
          data-testid="template-name-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Template name"
          required
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          data-testid="template-description-input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          data-testid="template-category-input"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="Category (optional)"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {error && (
          <p className="text-sm text-red-600 mb-3" role="alert">
            {error}
          </p>
        )}
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-300 text-sm hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="save-template-confirm"
            disabled={saving || !name.trim()}
            onClick={handleSave}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm"
          >
            {saving ? 'Saving…' : 'Save Template'}
          </button>
        </div>
      </div>
    </div>
  )
}

function TemplatesModal({
  templates,
  onUse,
  onDelete,
  onClose,
}: {
  templates: Template[]
  onUse: (id: number) => Promise<void>
  onDelete: (id: number) => Promise<void>
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        data-testid="templates-modal"
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] overflow-y-auto p-6"
      >
        <h2 className="text-lg font-semibold text-gray-900 mb-4">📋 Templates</h2>
        {templates.length === 0 && (
          <p className="text-gray-400 text-sm text-center py-4">No templates saved yet.</p>
        )}
        <ul className="space-y-3">
          {templates.map((t) => (
            <li key={t.id} className="border border-gray-200 rounded-lg p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900">{t.name}</p>
                  {t.description && <p className="text-sm text-gray-500">{t.description}</p>}
                  <div className="flex gap-1.5 mt-1 flex-wrap">
                    {t.category && (
                      <span className="text-xs bg-gray-100 px-2 py-0.5 rounded-full text-gray-600">
                        {t.category}
                      </span>
                    )}
                    <PriorityBadge priority={t.priority} />
                    {t.is_recurring && t.recurrence_pattern && (
                      <RecurrenceBadge pattern={t.recurrence_pattern} />
                    )}
                    {t.reminder_minutes != null && <ReminderBadge minutes={t.reminder_minutes} />}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    data-testid={`use-template-${t.id}`}
                    onClick={async () => {
                      await onUse(t.id)
                      onClose()
                    }}
                    className="text-sm bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded"
                  >
                    Use
                  </button>
                  <button
                    type="button"
                    data-testid={`delete-template-${t.id}`}
                    onClick={() => onDelete(t.id)}
                    className="text-sm text-red-500 hover:underline"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 text-sm text-gray-500 hover:underline"
        >
          Close
        </button>
      </div>
    </div>
  )
}

function UseTemplateDropdown({
  templates,
  onSelect,
}: {
  templates: Template[]
  onSelect: (id: number) => void
}) {
  if (templates.length === 0) return null
  return (
    <select
      data-testid="use-template-select"
      defaultValue=""
      onChange={(e) => {
        if (e.target.value) onSelect(Number(e.target.value))
        e.target.value = ''
      }}
      className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      <option value="" disabled>
        Use Template
      </option>
      {templates.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
          {t.category ? ` (${t.category})` : ''}
        </option>
      ))}
    </select>
  )
}

// ---------------------------------------------------------------------------
// Export / Import (PRP 09)
// ---------------------------------------------------------------------------

function ExportImportBar({ onImport }: { onImport: (file: File) => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  function triggerExport(format: 'json' | 'csv') {
    const link = document.createElement('a')
    link.href = `/api/todos/export?format=${format}`
    link.click()
  }

  return (
    <div className="flex gap-2 items-center">
      <button
        type="button"
        data-testid="export-json-btn"
        onClick={() => triggerExport('json')}
        className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded text-sm"
      >
        Export JSON
      </button>
      <button
        type="button"
        data-testid="export-csv-btn"
        onClick={() => triggerExport('csv')}
        className="bg-green-800 hover:bg-green-900 text-white px-3 py-1.5 rounded text-sm"
      >
        Export CSV
      </button>
      <button
        type="button"
        data-testid="import-btn"
        onClick={() => fileInputRef.current?.click()}
        className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1.5 rounded text-sm"
      >
        Import
      </button>
      <input
        ref={fileInputRef}
        data-testid="import-file-input"
        type="file"
        accept=".json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onImport(file)
          e.target.value = ''
        }}
      />
    </div>
  )
}

function Toast({ message, type }: { message: string; type: 'success' | 'error' }) {
  return (
    <div
      role="status"
      className={`fixed bottom-4 right-4 px-4 py-3 rounded shadow-lg text-white text-sm z-50 ${
        type === 'success' ? 'bg-green-600' : 'bg-red-600'
      }`}
    >
      {message}
    </div>
  )
}

function PrioritySelect({
  value,
  onChange,
  id,
  testId,
}: {
  value: Priority
  onChange: (p: Priority) => void
  id?: string
  testId?: string
}) {
  return (
    <select
      id={id}
      data-testid={testId}
      value={value}
      onChange={(e) => onChange(e.target.value as Priority)}
      className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      <option value="high">🔴 High</option>
      <option value="medium">🟡 Medium</option>
      <option value="low">🔵 Low</option>
    </select>
  )
}

// ---------------------------------------------------------------------------
// Edit modal
// ---------------------------------------------------------------------------

interface EditModalProps {
  todo: Todo
  tags: Tag[]
  selectedTagIds: number[]
  onClose: () => void
  onSave: (id: number, dto: UpdateTodoDto, tagIds: number[]) => Promise<void>
}

function EditModal({ todo, tags, selectedTagIds, onClose, onSave }: EditModalProps) {
  const [title, setTitle] = useState(todo.title)
  const [dueDate, setDueDate] = useState(todo.due_date ? todo.due_date.slice(0, 16) : '')
  const [priority, setPriority] = useState<Priority>(todo.priority)
  const [isRecurring, setIsRecurring] = useState(todo.is_recurring)
  const [recurrencePattern, setRecurrencePattern] = useState<RecurrencePattern>(
    todo.recurrence_pattern ?? 'weekly'
  )
  const [reminderMinutes, setReminderMinutes] = useState<number | null>(
    todo.reminder_minutes ?? null
  )
  const [tagIds, setTagIds] = useState<number[]>(selectedTagIds)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggleTag(id: number) {
    setTagIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) {
      setError('Title cannot be empty')
      return
    }
    if (isRecurring && !dueDate) {
      setError('A due date is required for recurring todos')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSave(
        todo.id,
        {
          title: title.trim(),
          due_date: dueDate || null,
          priority,
          is_recurring: isRecurring,
          recurrence_pattern: isRecurring ? recurrencePattern : null,
          reminder_minutes: dueDate ? reminderMinutes : null,
        },
        tagIds
      )
      onClose()
    } catch {
      setError('Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      data-testid="edit-modal"
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Edit Todo</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="edit-title" className="block text-sm font-medium text-gray-700 mb-1">
              Title
            </label>
            <input
              id="edit-title"
              data-testid="edit-title-input"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="edit-due-date" className="block text-sm font-medium text-gray-700 mb-1">
              Due Date (optional)
            </label>
            <input
              id="edit-due-date"
              data-testid="edit-due-date-input"
              type="datetime-local"
              value={dueDate}
              onChange={(e) => {
                setDueDate(e.target.value)
                if (!e.target.value) {
                  setIsRecurring(false)
                  setReminderMinutes(null)
                }
              }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="edit-priority" className="block text-sm font-medium text-gray-700 mb-1">
              Priority
            </label>
            <PrioritySelect
              id="edit-priority"
              testId="edit-priority-select"
              value={priority}
              onChange={setPriority}
            />
          </div>

          <div>
            <label htmlFor="edit-reminder" className="block text-sm font-medium text-gray-700 mb-1">
              Reminder
            </label>
            <select
              id="edit-reminder"
              data-testid="edit-reminder-select"
              value={reminderMinutes ?? ''}
              disabled={!dueDate}
              onChange={(e) => setReminderMinutes(e.target.value ? Number(e.target.value) : null)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
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
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                data-testid="edit-recurring-checkbox"
                type="checkbox"
                checked={isRecurring}
                disabled={!dueDate}
                onChange={(e) => setIsRecurring(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 accent-blue-600"
              />
              <span className="text-sm font-medium text-gray-700">Repeat</span>
            </label>

            {isRecurring && (
              <select
                data-testid="edit-recurrence-pattern-select"
                value={recurrencePattern}
                onChange={(e) => setRecurrencePattern(e.target.value as RecurrencePattern)}
                className="border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            )}

            {!dueDate && (
              <span className="text-xs text-gray-400">Set a due date to enable</span>
            )}
          </div>

          {tags.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tags</label>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <TagPill
                    key={tag.id}
                    tag={tag}
                    selected={tagIds.includes(tag.id)}
                    onClick={() => toggleTag(tag.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          )}

          <div className="flex gap-3 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              data-testid="update-todo-btn"
              disabled={saving}
              className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg"
            >
              {saving ? 'Saving…' : 'Update'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Delete confirmation modal
// ---------------------------------------------------------------------------

function DeleteModal({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Delete Todo?</h2>
        <p className="text-sm text-gray-500 mb-5">This action cannot be undone.</p>
        <div className="flex gap-3 justify-end">
          <button
            data-testid="cancel-delete"
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            data-testid="confirm-delete"
            onClick={onConfirm}
            className="px-4 py-2 text-sm text-white bg-red-600 hover:bg-red-700 rounded-lg"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Todo card
// ---------------------------------------------------------------------------

interface TodoCardProps {
  todo: Todo
  subtasks: Subtask[]
  tags: Tag[]
  subtasksExpanded: boolean
  onToggle: (id: number, completed: boolean) => Promise<void>
  onEdit: (todo: Todo) => void
  onDelete: (id: number) => void
  onToggleSubtasksExpanded: (id: number) => void
  onAddSubtask: (todoId: number, title: string) => Promise<void>
  onToggleSubtask: (todoId: number, subtaskId: number, completed: boolean) => Promise<void>
  onDeleteSubtask: (todoId: number, subtaskId: number) => Promise<void>
}

function TodoCard({
  todo,
  subtasks,
  tags,
  subtasksExpanded,
  onToggle,
  onEdit,
  onDelete,
  onToggleSubtasksExpanded,
  onAddSubtask,
  onToggleSubtask,
  onDeleteSubtask,
}: TodoCardProps) {
  const dueInfo = todo.due_date ? getRelativeDueLabel(todo.due_date) : null
  const { total } = computeProgress(subtasks)

  return (
    <div
      className={`p-4 bg-white rounded-xl border border-gray-200 shadow-sm transition-opacity ${
        todo.completed ? 'opacity-60' : ''
      }`}
    >
      <div className="flex items-start gap-3">
        <input
          data-testid={`todo-checkbox-${todo.id}`}
          type="checkbox"
          checked={todo.completed}
          onChange={() => onToggle(todo.id, !todo.completed)}
          className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-blue-600 cursor-pointer"
          aria-label={`Mark "${todo.title}" as ${todo.completed ? 'incomplete' : 'complete'}`}
        />

        <div className="flex-1 min-w-0">
          <p
            data-testid="todo-title"
            className={`text-sm font-medium ${todo.completed ? 'line-through text-gray-400' : 'text-gray-900'}`}
          >
            {todo.title}
          </p>
          {dueInfo && (
            <p className={`text-xs mt-0.5 ${dueInfo.color}`}>{dueInfo.label}</p>
          )}
          <div className="flex flex-wrap gap-1 mt-1">
            <PriorityBadge priority={todo.priority} />
            {todo.is_recurring && todo.recurrence_pattern && (
              <RecurrenceBadge pattern={todo.recurrence_pattern} />
            )}
            {todo.reminder_minutes != null && (
              <ReminderBadge minutes={todo.reminder_minutes} />
            )}
            {tags.map((tag) => (
              <TagPill key={tag.id} tag={tag} selected />
            ))}
          </div>
          <ProgressBar todoId={todo.id} subtasks={subtasks} />
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            data-testid={`subtask-toggle-${todo.id}`}
            onClick={() => onToggleSubtasksExpanded(todo.id)}
            className="text-xs text-blue-600 hover:underline flex items-center gap-0.5 px-1 py-1"
          >
            {subtasksExpanded ? '▼' : '▶'} Tasks{total > 0 ? ` (${total})` : ''}
          </button>
          <button
            data-testid={`edit-todo-${todo.id}`}
            onClick={() => onEdit(todo)}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded hover:bg-blue-50"
          >
            Edit
          </button>
          <button
            data-testid={`delete-todo-${todo.id}`}
            onClick={() => onDelete(todo.id)}
            className="text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1 rounded hover:bg-red-50"
          >
            ✕
          </button>
        </div>
      </div>

      {subtasksExpanded && (
        <SubtaskPanel
          todoId={todo.id}
          subtasks={subtasks}
          onAdd={(title) => onAddSubtask(todo.id, title)}
          onToggle={(sid, completed) => onToggleSubtask(todo.id, sid, completed)}
          onDelete={(sid) => onDeleteSubtask(todo.id, sid)}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section header
// ---------------------------------------------------------------------------

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-2">
      {title} <span className="font-normal text-gray-400">({count})</span>
    </h2>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function HomePage() {
  const router = useRouter()
  const [todos, setTodos] = useState<Todo[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Subtask state
  const [subtasksMap, setSubtasksMap] = useState<Record<number, Subtask[]>>({})
  const [expandedSubtasks, setExpandedSubtasks] = useState<Set<number>>(new Set())

  // Tag state (PRP 06)
  const [tags, setTags] = useState<Tag[]>([])
  const [tagsMap, setTagsMap] = useState<Record<number, Tag[]>>({})
  const [tagModalOpen, setTagModalOpen] = useState(false)
  const [newSelectedTagIds, setNewSelectedTagIds] = useState<number[]>([])

  // Notifications state
  const [notificationsEnabled, setNotificationsEnabled] = useState(false)
  useNotifications(notificationsEnabled)

  // Create-form state
  const [newTitle, setNewTitle] = useState('')
  const [newDueDate, setNewDueDate] = useState('')
  const [newPriority, setNewPriority] = useState<Priority>('medium')
  const [newIsRecurring, setNewIsRecurring] = useState(false)
  const [newRecurrencePattern, setNewRecurrencePattern] = useState<RecurrencePattern>('weekly')
  const [newReminderMinutes, setNewReminderMinutes] = useState<number | null>(null)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // Filter state (PRP 08)
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [saveFilterModalOpen, setSaveFilterModalOpen] = useState(false)
  const [presets, setPresets] = useState<FilterPreset[]>([])

  useEffect(() => {
    setPresets(loadPresets())
  }, [])

  // Template state (PRP 07)
  const [templates, setTemplates] = useState<Template[]>([])
  const [saveTemplateModalOpen, setSaveTemplateModalOpen] = useState(false)
  const [templatesModalOpen, setTemplatesModalOpen] = useState(false)

  // Export / import state (PRP 09)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(timer)
  }, [toast])

  // Modal state
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const fetchTodos = useCallback(async () => {
    setFetchError(null)
    try {
      const [todosRes, subtasksRes, tagsRes, todoTagsRes] = await Promise.all([
        fetch('/api/todos'),
        fetch('/api/todos/subtasks'),
        fetch('/api/tags'),
        fetch('/api/todos/tags'),
      ])
      if (todosRes.status === 401) {
        router.push('/login')
        return
      }
      if (!todosRes.ok) throw new Error(`HTTP ${todosRes.status}`)
      const todosData: Todo[] = await todosRes.json()
      setTodos(todosData)

      if (subtasksRes.ok) {
        const subtasksData: Subtask[] = await subtasksRes.json()
        const map: Record<number, Subtask[]> = {}
        subtasksData.forEach((s) => {
          if (!map[s.todo_id]) map[s.todo_id] = []
          map[s.todo_id].push(s)
        })
        setSubtasksMap(map)
      }

      if (tagsRes.ok) {
        setTags(await tagsRes.json())
      }

      if (todoTagsRes.ok) {
        const todoTagsData: (Tag & { todo_id: number })[] = await todoTagsRes.json()
        const map: Record<number, Tag[]> = {}
        todoTagsData.forEach(({ todo_id, ...tag }) => {
          if (!map[todo_id]) map[todo_id] = []
          map[todo_id].push(tag as Tag)
        })
        setTagsMap(map)
      }
    } catch {
      setFetchError('Failed to load todos. Please refresh.')
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    fetchTodos()
  }, [fetchTodos])

  const fetchTemplates = useCallback(async () => {
    const res = await fetch('/api/templates')
    if (res.ok) setTemplates(await res.json())
  }, [])

  useEffect(() => {
    fetchTemplates()
  }, [fetchTemplates])

  // ---------------------------------------------------------------------------
  // CRUD handlers
  // ---------------------------------------------------------------------------

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (!newTitle.trim()) return
    if (newIsRecurring && !newDueDate) {
      setCreateError('A due date is required for recurring todos')
      return
    }
    setCreating(true)
    setCreateError(null)

    try {
      const res = await fetch('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle.trim(),
          due_date: newDueDate || null,
          priority: newPriority,
          is_recurring: newIsRecurring,
          recurrence_pattern: newIsRecurring ? newRecurrencePattern : null,
          reminder_minutes: newDueDate ? newReminderMinutes : null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setCreateError(data.error ?? 'Failed to create todo')
        return
      }
      const created = data as Todo
      setTodos((prev) => [created, ...prev].sort(sortTodos))

      if (newSelectedTagIds.length > 0) {
        await setTagsForTodo(created.id, newSelectedTagIds)
      }

      setNewTitle('')
      setNewDueDate('')
      setNewPriority('medium')
      setNewIsRecurring(false)
      setNewRecurrencePattern('weekly')
      setNewReminderMinutes(null)
      setNewSelectedTagIds([])
    } catch {
      setCreateError('Failed to create todo. Please try again.')
    } finally {
      setCreating(false)
    }
  }

  const setTagsForTodo = useCallback(async (todoId: number, tagIds: number[]) => {
    const res = await fetch(`/api/todos/${todoId}/tags`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tagIds }),
    })
    if (!res.ok) return
    const updatedTags: Tag[] = await res.json()
    setTagsMap((prev) => ({ ...prev, [todoId]: updatedTags }))
  }, [])

  const handleUpdate = useCallback(
    async (id: number, dto: UpdateTodoDto, tagIds?: number[]) => {
      const res = await fetch(`/api/todos/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dto),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Update failed')
      }
      const updated: Todo = await res.json()
      setTodos((prev) => prev.map((t) => (t.id === id ? updated : t)).sort(sortTodos))

      if (tagIds !== undefined) {
        await setTagsForTodo(id, tagIds)
      }
    },
    [setTagsForTodo]
  )

  const handleToggle = useCallback(
    async (id: number, completed: boolean) => {
      const todo = todos.find((t) => t.id === id)
      const isRecurringCompletion = completed && todo?.is_recurring

      // Optimistic update
      setTodos((prev) =>
        prev.map((t) => (t.id === id ? { ...t, completed } : t))
      )
      try {
        await handleUpdate(id, { completed })
        // Fetch all todos to pick up the new recurring instance
        if (isRecurringCompletion) {
          await fetchTodos()
        }
      } catch {
        // Revert on failure
        setTodos((prev) =>
          prev.map((t) => (t.id === id ? { ...t, completed: !completed } : t))
        )
      }
    },
    [handleUpdate, todos, fetchTodos]
  )

  async function handleDeleteConfirm() {
    if (deletingId === null) return
    const id = deletingId
    setDeletingId(null)
    setTodos((prev) => prev.filter((t) => t.id !== id))
    setSubtasksMap((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    setTagsMap((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    try {
      const res = await fetch(`/api/todos/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        await fetchTodos()
      }
    } catch {
      await fetchTodos()
    }
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  // ---------------------------------------------------------------------------
  // Template handlers (PRP 07)
  // ---------------------------------------------------------------------------

  async function handleSaveTemplate(name: string, description: string, category: string) {
    const res = await fetch('/api/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        description: description || undefined,
        category: category || undefined,
        title_template: newTitle.trim(),
        priority: newPriority,
        is_recurring: newIsRecurring,
        recurrence_pattern: newIsRecurring ? newRecurrencePattern : null,
        reminder_minutes: newReminderMinutes,
      }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? 'Failed to save template')
    setTemplates((prev) => [...prev, data as Template])
    setSaveTemplateModalOpen(false)
  }

  const handleUseTemplate = useCallback(
    async (templateId: number) => {
      const res = await fetch(`/api/templates/${templateId}/use`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res.ok) return
      await fetchTodos()
    },
    [fetchTodos]
  )

  async function handleDeleteTemplate(id: number) {
    const res = await fetch(`/api/templates/${id}`, { method: 'DELETE' })
    if (!res.ok) return
    setTemplates((prev) => prev.filter((t) => t.id !== id))
  }

  // ---------------------------------------------------------------------------
  // Export / import handlers (PRP 09)
  // ---------------------------------------------------------------------------

  async function handleImport(file: File) {
    let data: unknown
    try {
      data = JSON.parse(await file.text())
    } catch {
      setToast({ message: 'Invalid JSON file. Please select a valid export file.', type: 'error' })
      return
    }

    try {
      const res = await fetch('/api/todos/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const result = await res.json()
      if (!res.ok) {
        setToast({ message: result.error ?? 'Failed to import todos', type: 'error' })
        return
      }
      setToast({ message: `Successfully imported ${result.imported} todos`, type: 'success' })
      await fetchTodos()
    } catch {
      setToast({ message: 'Failed to import todos', type: 'error' })
    }
  }

  // ---------------------------------------------------------------------------
  // Notification handler
  // ---------------------------------------------------------------------------

  async function handleEnableNotifications() {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    if (Notification.permission === 'denied') return
    const result = await Notification.requestPermission()
    setNotificationsEnabled(result === 'granted')
  }

  // ---------------------------------------------------------------------------
  // Subtask handlers
  // ---------------------------------------------------------------------------

  function toggleSubtasksExpanded(todoId: number) {
    setExpandedSubtasks((prev) => {
      const next = new Set(prev)
      if (next.has(todoId)) {
        next.delete(todoId)
      } else {
        next.add(todoId)
      }
      return next
    })
  }

  async function handleAddSubtask(todoId: number, title: string) {
    const res = await fetch(`/api/todos/${todoId}/subtasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    })
    if (!res.ok) return
    const newSubtask: Subtask = await res.json()
    setSubtasksMap((prev) => ({
      ...prev,
      [todoId]: [...(prev[todoId] ?? []), newSubtask],
    }))
  }

  async function handleToggleSubtask(todoId: number, subtaskId: number, completed: boolean) {
    // Optimistic update
    setSubtasksMap((prev) => ({
      ...prev,
      [todoId]: (prev[todoId] ?? []).map((s) =>
        s.id === subtaskId ? { ...s, completed } : s
      ),
    }))
    try {
      const res = await fetch(`/api/todos/${todoId}/subtasks/${subtaskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed }),
      })
      if (!res.ok) {
        setSubtasksMap((prev) => ({
          ...prev,
          [todoId]: (prev[todoId] ?? []).map((s) =>
            s.id === subtaskId ? { ...s, completed: !completed } : s
          ),
        }))
      }
    } catch {
      setSubtasksMap((prev) => ({
        ...prev,
        [todoId]: (prev[todoId] ?? []).map((s) =>
          s.id === subtaskId ? { ...s, completed: !completed } : s
        ),
      }))
    }
  }

  async function handleDeleteSubtask(todoId: number, subtaskId: number) {
    setSubtasksMap((prev) => ({
      ...prev,
      [todoId]: (prev[todoId] ?? []).filter((s) => s.id !== subtaskId),
    }))
    try {
      const res = await fetch(`/api/todos/${todoId}/subtasks/${subtaskId}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const r2 = await fetch(`/api/todos/${todoId}/subtasks`)
        if (r2.ok) {
          const subtasks: Subtask[] = await r2.json()
          setSubtasksMap((prev) => ({ ...prev, [todoId]: subtasks }))
        }
      }
    } catch {
      const r2 = await fetch(`/api/todos/${todoId}/subtasks`)
      if (r2.ok) {
        const subtasks: Subtask[] = await r2.json()
        setSubtasksMap((prev) => ({ ...prev, [todoId]: subtasks }))
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Tag handlers (PRP 06)
  // ---------------------------------------------------------------------------

  async function handleCreateTag(name: string, color: string) {
    const res = await fetch('/api/tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, color }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? 'Failed to create tag')
    setTags((prev) => [...prev, data as Tag].sort((a, b) => a.name.localeCompare(b.name)))
  }

  async function handleUpdateTag(id: number, name: string, color: string) {
    const res = await fetch(`/api/tags/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, color }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? 'Failed to update tag')
    const updated = data as Tag
    setTags((prev) =>
      prev.map((t) => (t.id === id ? updated : t)).sort((a, b) => a.name.localeCompare(b.name))
    )
    setTagsMap((prev) => {
      const next: Record<number, Tag[]> = {}
      Object.entries(prev).forEach(([todoId, todoTags]) => {
        next[Number(todoId)] = todoTags.map((t) => (t.id === id ? updated : t))
      })
      return next
    })
  }

  async function handleDeleteTag(id: number) {
    const res = await fetch(`/api/tags/${id}`, { method: 'DELETE' })
    if (!res.ok) return
    setTags((prev) => prev.filter((t) => t.id !== id))
    setTagsMap((prev) => {
      const next: Record<number, Tag[]> = {}
      Object.entries(prev).forEach(([todoId, todoTags]) => {
        next[Number(todoId)] = todoTags.filter((t) => t.id !== id)
      })
      return next
    })
    if (filters.tagId === id) {
      setFilters((prev) => ({ ...prev, tagId: null }))
    }
  }

  function toggleNewSelectedTag(id: number) {
    setNewSelectedTagIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]))
  }

  // ---------------------------------------------------------------------------
  // Filter preset handlers (PRP 08)
  // ---------------------------------------------------------------------------

  function handleClearFilters() {
    setFilters(DEFAULT_FILTERS)
  }

  function handleSavePreset(preset: FilterPreset) {
    const next = [...presets, preset]
    setPresets(next)
    persistPresets(next)
    setSaveFilterModalOpen(false)
  }

  function handleApplyPreset(preset: FilterPreset) {
    setFilters(preset.filters)
  }

  function handleDeletePreset(id: string) {
    const next = presets.filter((p) => p.id !== id)
    setPresets(next)
    persistPresets(next)
  }

  // ---------------------------------------------------------------------------
  // Sorting & filtering
  // ---------------------------------------------------------------------------

  const PRIORITY_ORDER: Record<Priority, number> = { high: 1, medium: 2, low: 3 }

  function sortTodos(a: Todo, b: Todo): number {
    const pDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
    if (pDiff !== 0) return pDiff
    if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date)
    if (a.due_date) return -1
    if (b.due_date) return 1
    return b.created_at.localeCompare(a.created_at)
  }

  const filteredTodos = useMemo(
    () => applyFilters(todos, subtasksMap, tagsMap, filters),
    [todos, subtasksMap, tagsMap, filters]
  )

  const now = getSingaporeNow()

  const overdueTodos = useMemo(
    () =>
      filteredTodos.filter(
        (t) => !t.completed && t.due_date && new Date(t.due_date) < now
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filteredTodos]
  )

  const pendingTodos = useMemo(
    () =>
      filteredTodos.filter(
        (t) => !t.completed && !(t.due_date && new Date(t.due_date) < now)
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filteredTodos]
  )

  const completedTodos = useMemo(
    () => filteredTodos.filter((t) => t.completed),
    [filteredTodos]
  )

  // ---------------------------------------------------------------------------
  // Min date for the create form (1 minute from now)
  // ---------------------------------------------------------------------------

  function getMinDate(): string {
    const d = getSingaporeNow()
    d.setMinutes(d.getMinutes() + 1)
    return d.toISOString().slice(0, 16)
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">📝 Todo App</h1>
          <div className="flex items-center gap-3">
            <Link href="/calendar">
              <button
                type="button"
                data-testid="calendar-nav-btn"
                className="bg-purple-500 hover:bg-purple-600 text-white px-3 py-1.5 rounded text-sm"
              >
                Calendar
              </button>
            </Link>
            {typeof window !== 'undefined' && 'Notification' in window && (
              notificationsEnabled ? (
                <span className="bg-green-500 text-white px-3 py-1.5 rounded text-sm flex items-center gap-1">
                  🔔 <span>Notifications On</span>
                </span>
              ) : (
                <button
                  onClick={handleEnableNotifications}
                  className="bg-orange-500 hover:bg-orange-600 text-white px-3 py-1.5 rounded text-sm flex items-center gap-1"
                >
                  🔔 <span>Enable Notifications</span>
                </button>
              )
            )}
            <button
              onClick={handleLogout}
              className="text-sm text-gray-500 hover:text-gray-800"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Create form */}
        <form
          onSubmit={handleCreate}
          className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4"
        >
          <h2 className="text-base font-semibold text-gray-800">Add a Todo</h2>

          <div>
            <input
              data-testid="todo-input"
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="What needs to be done?"
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-48">
              <label htmlFor="due-date" className="block text-xs text-gray-500 mb-1">
                Due Date (optional)
              </label>
              <input
                id="due-date"
                data-testid="due-date-input"
                type="datetime-local"
                value={newDueDate}
                min={getMinDate()}
                onChange={(e) => {
                  setNewDueDate(e.target.value)
                  if (!e.target.value) {
                    setNewIsRecurring(false)
                    setNewReminderMinutes(null)
                  }
                }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label htmlFor="priority-select" className="block text-xs text-gray-500 mb-1">
                Priority
              </label>
              <PrioritySelect
                id="priority-select"
                testId="priority-select"
                value={newPriority}
                onChange={setNewPriority}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label htmlFor="reminder-select" className="block text-xs text-gray-500 mb-1">
                Reminder
              </label>
              <select
                id="reminder-select"
                data-testid="reminder-select"
                value={newReminderMinutes ?? ''}
                disabled={!newDueDate}
                onChange={(e) => setNewReminderMinutes(e.target.value ? Number(e.target.value) : null)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
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
            </div>

            <div className="flex items-center gap-3 pb-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  data-testid="recurring-checkbox"
                  type="checkbox"
                  checked={newIsRecurring}
                  disabled={!newDueDate}
                  onChange={(e) => setNewIsRecurring(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 accent-blue-600"
                />
                <span className="text-sm text-gray-700">Repeat</span>
              </label>

              {newIsRecurring && (
                <select
                  data-testid="recurrence-pattern-select"
                  value={newRecurrencePattern}
                  onChange={(e) => setNewRecurrencePattern(e.target.value as RecurrencePattern)}
                  className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              )}
            </div>
          </div>

          {createError && (
            <p className="text-sm text-red-600" role="alert">
              {createError}
            </p>
          )}

          {tags.length > 0 && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Tags</label>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <TagPill
                    key={tag.id}
                    tag={tag}
                    selected={newSelectedTagIds.includes(tag.id)}
                    onClick={() => toggleNewSelectedTag(tag.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {newTitle.trim() && (
            <button
              type="button"
              data-testid="save-as-template-btn"
              onClick={() => setSaveTemplateModalOpen(true)}
              className="text-sm text-blue-600 hover:underline flex items-center gap-1"
            >
              💾 Save as Template
            </button>
          )}

          <button
            type="submit"
            data-testid="add-todo-btn"
            disabled={creating}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded-lg px-4 py-2 text-sm transition-colors"
          >
            {creating ? 'Adding…' : 'Add Todo'}
          </button>
        </form>

        {/* Templates & export/import */}
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <div className="flex flex-wrap gap-2 items-center">
            <button
              type="button"
              data-testid="templates-btn"
              onClick={() => setTemplatesModalOpen(true)}
              className="text-sm text-gray-700 border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50"
            >
              📋 Templates
            </button>
            <UseTemplateDropdown templates={templates} onSelect={handleUseTemplate} />
          </div>
          <ExportImportBar onImport={handleImport} />
        </div>

        {/* Manage tags */}
        <div className="flex justify-end">
          <button
            type="button"
            data-testid="manage-tags-btn"
            onClick={() => setTagModalOpen(true)}
            className="text-sm text-blue-600 hover:underline"
          >
            + Manage Tags
          </button>
        </div>

        {/* Search & filter bar */}
        <div className="flex flex-wrap gap-2 items-center">
          <SearchBar value={filters.query} onChange={(q) => setFilters({ ...filters, query: q })} />

          <select
            id="priority-filter"
            data-testid="priority-filter"
            value={filters.priority}
            onChange={(e) => setFilters({ ...filters, priority: e.target.value as Priority | 'all' })}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Priorities</option>
            <option value="high">High Priority</option>
            <option value="medium">Medium Priority</option>
            <option value="low">Low Priority</option>
          </select>

          <TagFilter
            tags={tags}
            value={filters.tagId}
            onChange={(id) => setFilters({ ...filters, tagId: id })}
          />

          <button
            type="button"
            data-testid="advanced-toggle"
            onClick={() => setShowAdvanced((prev) => !prev)}
            className="text-sm text-gray-600 hover:text-gray-900 px-2 py-1.5"
          >
            {showAdvanced ? '▼' : '▶'} Advanced
          </button>

          {isFilterActive(filters) && (
            <>
              <button
                type="button"
                data-testid="clear-all-btn"
                onClick={handleClearFilters}
                className="bg-red-100 text-red-700 px-3 py-1.5 rounded-lg text-sm"
              >
                Clear All
              </button>
              <button
                type="button"
                data-testid="save-filter-btn"
                onClick={() => setSaveFilterModalOpen(true)}
                className="bg-green-100 text-green-700 px-3 py-1.5 rounded-lg text-sm"
              >
                💾 Save Filter
              </button>
            </>
          )}
        </div>

        {showAdvanced && (
          <AdvancedPanel
            filters={filters}
            presets={presets}
            onChange={setFilters}
            onApplyPreset={handleApplyPreset}
            onDeletePreset={handleDeletePreset}
          />
        )}

        {/* Content area */}
        {loading ? (
          <p className="text-sm text-gray-500 text-center py-8">Loading todos…</p>
        ) : fetchError ? (
          <p className="text-sm text-red-600 text-center py-8" role="alert">
            {fetchError}
          </p>
        ) : (
          <div className="space-y-6">
            {/* Overdue section */}
            {overdueTodos.length > 0 && (
              <section data-testid="overdue-section">
                <SectionHeader title="⚠️ Overdue" count={overdueTodos.length} />
                <div className="space-y-2">
                  {overdueTodos.map((todo) => (
                    <TodoCard
                      key={todo.id}
                      todo={todo}
                      subtasks={subtasksMap[todo.id] ?? []}
                      tags={tagsMap[todo.id] ?? []}
                      subtasksExpanded={expandedSubtasks.has(todo.id)}
                      onToggle={handleToggle}
                      onEdit={setEditingTodo}
                      onDelete={setDeletingId}
                      onToggleSubtasksExpanded={toggleSubtasksExpanded}
                      onAddSubtask={handleAddSubtask}
                      onToggleSubtask={handleToggleSubtask}
                      onDeleteSubtask={handleDeleteSubtask}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Pending section */}
            {pendingTodos.length > 0 && (
              <section data-testid="pending-section">
                <SectionHeader title="📋 Pending" count={pendingTodos.length} />
                <div className="space-y-2">
                  {pendingTodos.map((todo) => (
                    <TodoCard
                      key={todo.id}
                      todo={todo}
                      subtasks={subtasksMap[todo.id] ?? []}
                      tags={tagsMap[todo.id] ?? []}
                      subtasksExpanded={expandedSubtasks.has(todo.id)}
                      onToggle={handleToggle}
                      onEdit={setEditingTodo}
                      onDelete={setDeletingId}
                      onToggleSubtasksExpanded={toggleSubtasksExpanded}
                      onAddSubtask={handleAddSubtask}
                      onToggleSubtask={handleToggleSubtask}
                      onDeleteSubtask={handleDeleteSubtask}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Empty state */}
            {overdueTodos.length === 0 && pendingTodos.length === 0 && completedTodos.length === 0 && (
              <div className="text-center py-12">
                <p className="text-gray-400 text-lg">✅ All clear!</p>
                <p className="text-gray-400 text-sm mt-1">Add your first todo above.</p>
              </div>
            )}

            {/* Completed section */}
            {completedTodos.length > 0 && (
              <section data-testid="completed-section">
                <SectionHeader title="✅ Completed" count={completedTodos.length} />
                <div className="space-y-2">
                  {completedTodos.map((todo) => (
                    <TodoCard
                      key={todo.id}
                      todo={todo}
                      subtasks={subtasksMap[todo.id] ?? []}
                      tags={tagsMap[todo.id] ?? []}
                      subtasksExpanded={expandedSubtasks.has(todo.id)}
                      onToggle={handleToggle}
                      onEdit={setEditingTodo}
                      onDelete={setDeletingId}
                      onToggleSubtasksExpanded={toggleSubtasksExpanded}
                      onAddSubtask={handleAddSubtask}
                      onToggleSubtask={handleToggleSubtask}
                      onDeleteSubtask={handleDeleteSubtask}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      {/* Edit modal */}
      {editingTodo && (
        <EditModal
          todo={editingTodo}
          tags={tags}
          selectedTagIds={(tagsMap[editingTodo.id] ?? []).map((t) => t.id)}
          onClose={() => setEditingTodo(null)}
          onSave={handleUpdate}
        />
      )}

      {/* Delete confirmation modal */}
      {deletingId !== null && (
        <DeleteModal
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeletingId(null)}
        />
      )}

      {/* Tag management modal */}
      {tagModalOpen && (
        <TagModal
          tags={tags}
          onClose={() => setTagModalOpen(false)}
          onCreate={handleCreateTag}
          onUpdate={handleUpdateTag}
          onDelete={handleDeleteTag}
        />
      )}

      {/* Save filter preset modal */}
      {saveFilterModalOpen && (
        <SaveFilterModal
          filters={filters}
          onSave={handleSavePreset}
          onClose={() => setSaveFilterModalOpen(false)}
        />
      )}

      {/* Save template modal */}
      {saveTemplateModalOpen && (
        <SaveTemplateModal
          formState={{
            title: newTitle,
            priority: newPriority,
            isRecurring: newIsRecurring,
            pattern: newRecurrencePattern,
            reminder: newReminderMinutes,
          }}
          onSave={handleSaveTemplate}
          onClose={() => setSaveTemplateModalOpen(false)}
        />
      )}

      {/* Templates manager modal */}
      {templatesModalOpen && (
        <TemplatesModal
          templates={templates}
          onUse={handleUseTemplate}
          onDelete={handleDeleteTemplate}
          onClose={() => setTemplatesModalOpen(false)}
        />
      )}

      {/* Import / export toast */}
      {toast && <Toast message={toast.message} type={toast.type} />}
    </main>
  )
}
