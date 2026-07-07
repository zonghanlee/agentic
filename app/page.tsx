'use client'

// app/page.tsx
// Main todo page — client component managing all todo state and UI.
// Phase 1: Todo CRUD (PRP 01) + Priority System (PRP 02).

import { useState, useEffect, useMemo, useCallback, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { formatSingaporeDate, getSingaporeNow, getRelativeDueLabel } from '@/lib/timezone'
import type { Priority, Todo, UpdateTodoDto } from '@/lib/db'

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
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) {
      setError('Title cannot be empty')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSave(todo.id, {
        title: title.trim(),
        due_date: dueDate || null,
        priority,
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
              onChange={(e) => setDueDate(e.target.value)}
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
  onToggle: (id: number, completed: boolean) => Promise<void>
  onEdit: (todo: Todo) => void
  onDelete: (id: number) => void
}

function TodoCard({ todo, onToggle, onEdit, onDelete }: TodoCardProps) {
  const dueInfo = todo.due_date ? getRelativeDueLabel(todo.due_date) : null

  return (
    <div
      className={`flex items-start gap-3 p-4 bg-white rounded-xl border border-gray-200 shadow-sm transition-opacity ${
        todo.completed ? 'opacity-60' : ''
      }`}
    >
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
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <PriorityBadge priority={todo.priority} />
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

  // Create-form state
  const [newTitle, setNewTitle] = useState('')
  const [newDueDate, setNewDueDate] = useState('')
  const [newPriority, setNewPriority] = useState<Priority>('medium')
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
      const res = await fetch('/api/todos')
      if (res.status === 401) {
        router.push('/login')
        return
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: Todo[] = await res.json()
      setTodos(data)
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
      // Optimistic update
      setTodos((prev) =>
        prev.map((t) => (t.id === id ? { ...t, completed } : t))
      )
      try {
        await handleUpdate(id, { completed })
      } catch {
        // Revert on failure
        setTodos((prev) =>
          prev.map((t) => (t.id === id ? { ...t, completed: !completed } : t))
        )
      }
    },
    [handleUpdate]
  )

  async function handleDeleteConfirm() {
    if (deletingId === null) return
    const id = deletingId
    setDeletingId(null)
    setTodos((prev) => prev.filter((t) => t.id !== id))
    try {
      const res = await fetch(`/api/todos/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        await fetchTodos() // Re-fetch if delete failed
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
          <button
            onClick={handleLogout}
            className="text-sm text-gray-500 hover:text-gray-800"
          >
            Sign out
          </button>
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
                onChange={(e) => setNewDueDate(e.target.value)}
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
                      onToggle={handleToggle}
                      onEdit={setEditingTodo}
                      onDelete={setDeletingId}
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
                      onToggle={handleToggle}
                      onEdit={setEditingTodo}
                      onDelete={setDeletingId}
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
                      onToggle={handleToggle}
                      onEdit={setEditingTodo}
                      onDelete={setDeletingId}
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
