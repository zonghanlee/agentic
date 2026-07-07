'use client'

// app/page.tsx
// Main todo page — client component managing all todo state and UI.
// Phase 1: Todo CRUD (PRP 01) + Priority System (PRP 02).
// Phase 2: Recurring Todos (PRP 03) + Reminders (PRP 04) + Subtasks (PRP 05).

import { useState, useEffect, useMemo, useCallback, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { formatSingaporeDate, getSingaporeNow, getRelativeDueLabel } from '@/lib/timezone'
import type { Priority, Todo, UpdateTodoDto, RecurrencePattern, Subtask } from '@/lib/db'
import { useNotifications } from '@/lib/hooks/useNotifications'

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
  onClose: () => void
  onSave: (id: number, dto: UpdateTodoDto) => Promise<void>
}

function EditModal({ todo, onClose, onSave }: EditModalProps) {
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
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      await onSave(todo.id, {
        title: title.trim(),
        due_date: dueDate || null,
        priority,
        is_recurring: isRecurring,
        recurrence_pattern: isRecurring ? recurrencePattern : null,
        reminder_minutes: dueDate ? reminderMinutes : null,
      })
      onClose()
    } catch {
      setError('Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
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

  // Filter state
  const [priorityFilter, setPriorityFilter] = useState<Priority | 'all'>('all')

  // Modal state
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const fetchTodos = useCallback(async () => {
    setFetchError(null)
    try {
      const [todosRes, subtasksRes] = await Promise.all([
        fetch('/api/todos'),
        fetch('/api/todos/subtasks'),
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
    } catch {
      setFetchError('Failed to load todos. Please refresh.')
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    fetchTodos()
  }, [fetchTodos])

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
      setTodos((prev) => [data as Todo, ...prev].sort(sortTodos))
      setNewTitle('')
      setNewDueDate('')
      setNewPriority('medium')
      setNewIsRecurring(false)
      setNewRecurrencePattern('weekly')
      setNewReminderMinutes(null)
    } catch {
      setCreateError('Failed to create todo. Please try again.')
    } finally {
      setCreating(false)
    }
  }

  const handleUpdate = useCallback(async (id: number, dto: UpdateTodoDto) => {
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
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? updated : t)).sort(sortTodos)
    )
  }, [])

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
    () =>
      priorityFilter === 'all'
        ? todos
        : todos.filter((t) => t.priority === priorityFilter),
    [todos, priorityFilter]
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

          <button
            type="submit"
            data-testid="add-todo-btn"
            disabled={creating}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded-lg px-4 py-2 text-sm transition-colors"
          >
            {creating ? 'Adding…' : 'Add Todo'}
          </button>
        </form>

        {/* Priority filter */}
        <div className="flex items-center gap-3">
          <label htmlFor="priority-filter" className="text-sm text-gray-600 font-medium">
            Filter:
          </label>
          <select
            id="priority-filter"
            data-testid="priority-filter"
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as Priority | 'all')}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Priorities</option>
            <option value="high">High Priority</option>
            <option value="medium">Medium Priority</option>
            <option value="low">Low Priority</option>
          </select>
        </div>

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
    </main>
  )
}
