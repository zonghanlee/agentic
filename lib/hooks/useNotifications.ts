// lib/hooks/useNotifications.ts
// Polls /api/notifications/check every 60s and fires browser notifications.

import { useEffect, useRef, useCallback } from 'react'
import type { Todo } from '@/lib/db'
import { isoToSingapore } from '@/lib/timezone'

export function useNotifications(enabled: boolean) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const check = useCallback(async () => {
    if (!enabled || typeof window === 'undefined') return
    if (Notification.permission !== 'granted') return

    try {
      const res = await fetch('/api/notifications/check')
      if (!res.ok) return
      const todos: Todo[] = await res.json()
      todos.forEach((todo) => {
        new Notification(`Reminder: ${todo.title}`, {
          body: todo.due_date
            ? `Due: ${isoToSingapore(todo.due_date)}`
            : 'Task reminder',
          icon: '/favicon.ico',
        })
      })
    } catch {
      // Ignore network errors — notifications are best-effort
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) {
      if (intervalRef.current) clearInterval(intervalRef.current)
      return
    }
    check()
    intervalRef.current = setInterval(check, 60_000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [enabled, check])
}
