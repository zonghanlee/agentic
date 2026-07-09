'use client'

// app/calendar/page.tsx
// PRP 10 — Calendar View. Monthly grid of todos colour-coded by priority,
// plus Singapore public holidays. Client component; shares data with app/page.tsx
// via the same /api/todos-backed dataset (fetched through /api/calendar).

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { getSingaporeNow } from '@/lib/timezone'
import type { Todo, Holiday, Priority } from '@/lib/db'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const PRIORITY_PILL: Record<Priority, string> = {
  high: 'bg-red-500 text-white',
  medium: 'bg-yellow-400 text-gray-900',
  low: 'bg-blue-400 text-white',
}

function buildCalendarDays(year: number, month: number): (Date | null)[] {
  // month is 1-indexed
  const firstDay = new Date(year, month - 1, 1)
  const lastDay = new Date(year, month, 0)
  const startPad = firstDay.getDay() // 0 = Sunday

  const days: (Date | null)[] = Array(startPad).fill(null)
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push(new Date(year, month - 1, d))
  }
  while (days.length % 7 !== 0) days.push(null)
  return days
}

function toDateStr(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export default function CalendarPage() {
  const now = getSingaporeNow()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [todos, setTodos] = useState<Todo[]>([])
  const [holidays, setHolidays] = useState<Holiday[]>([])

  const fetchCalendar = useCallback(async () => {
    const res = await fetch(`/api/calendar?year=${year}&month=${month}`)
    if (!res.ok) return
    const data = await res.json()
    setTodos(data.todos ?? [])
    setHolidays(data.holidays ?? [])
  }, [year, month])

  useEffect(() => {
    fetchCalendar()
  }, [fetchCalendar])

  const days = buildCalendarDays(year, month)

  const todosOnDay = (dateStr: string) => todos.filter((t) => t.due_date?.startsWith(dateStr))
  const holidayOnDay = (dateStr: string) => holidays.filter((h) => h.date === dateStr)

  const goToPrev = () => {
    if (month === 1) {
      setMonth(12)
      setYear((y) => y - 1)
    } else {
      setMonth((m) => m - 1)
    }
  }

  const goToNext = () => {
    if (month === 12) {
      setMonth(1)
      setYear((y) => y + 1)
    } else {
      setMonth((m) => m + 1)
    }
  }

  const goToToday = () => {
    const n = getSingaporeNow()
    setYear(n.getFullYear())
    setMonth(n.getMonth() + 1)
  }

  const todayStr = toDateStr(getSingaporeNow())

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">📅 Calendar</h1>
          <Link href="/" data-testid="list-view-btn" className="text-sm text-blue-600 hover:underline">
            ← List
          </Link>
        </div>
      </header>

      <div className="max-w-5xl mx-auto p-4">
        {/* Navigation */}
        <div className="flex items-center gap-3 mb-4">
          <button
            data-testid="prev-month-btn"
            onClick={goToPrev}
            className="px-3 py-1.5 border rounded hover:bg-gray-50"
          >
            ◀
          </button>
          <h2 data-testid="calendar-month-title" className="text-xl font-semibold flex-1 text-center">
            {MONTHS[month - 1]} {year}
          </h2>
          <button
            data-testid="next-month-btn"
            onClick={goToNext}
            className="px-3 py-1.5 border rounded hover:bg-gray-50"
          >
            ▶
          </button>
          <button
            data-testid="today-btn"
            onClick={goToToday}
            className="px-3 py-1.5 bg-blue-500 text-white rounded text-sm"
          >
            Today
          </button>
        </div>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 text-center text-xs font-medium text-gray-500 mb-1">
          {WEEKDAYS.map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>

        {/* Days grid */}
        <div className="grid grid-cols-7 border-l border-t">
          {days.map((day, i) => {
            const dateStr = day ? toDateStr(day) : ''
            const isToday = dateStr === todayStr
            const dayTodos = day ? todosOnDay(dateStr) : []
            const dayHolidays = day ? holidayOnDay(dateStr) : []

            return (
              <div
                key={i}
                data-testid={day ? `day-${dateStr}` : undefined}
                className={`min-h-[80px] border-r border-b p-1 ${day ? '' : 'bg-gray-50'}`}
              >
                {day && (
                  <>
                    <span
                      data-testid={isToday ? 'calendar-today' : undefined}
                      className={`text-sm font-medium block mb-0.5 ${
                        isToday
                          ? 'bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center'
                          : 'text-gray-700'
                      }`}
                    >
                      {day.getDate()}
                    </span>

                    {dayHolidays.map((h) => (
                      <p key={h.id} className="text-xs text-gray-400 italic truncate">
                        {h.name}
                      </p>
                    ))}

                    {dayTodos.map((t) => (
                      <span
                        key={t.id}
                        title={t.title}
                        className={`block text-xs px-1 py-0.5 rounded mb-0.5 truncate ${PRIORITY_PILL[t.priority]}`}
                      >
                        {t.title}
                      </span>
                    ))}
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </main>
  )
}
