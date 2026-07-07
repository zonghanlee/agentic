// lib/timezone.ts
// All date/time operations in the app MUST use these helpers — never use new Date() directly.

const TZ = 'Asia/Singapore'

/**
 * Returns the current time expressed in Singapore local time.
 * Using toLocaleString conversion avoids any Intl.DateTimeFormat issues.
 */
export function getSingaporeNow(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: TZ }))
}

/**
 * Formats any date value as a human-readable Singapore local date/time string.
 */
export function formatSingaporeDate(date: Date | string): string {
  return new Date(date).toLocaleString('en-SG', {
    timeZone: TZ,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Converts an ISO 8601 string to a Singapore local date/time string.
 */
export function isoToSingapore(isoString: string): string {
  return new Date(isoString).toLocaleString('en-SG', { timeZone: TZ })
}

/**
 * Calculates the next due date for a recurring todo based on the recurrence pattern.
 */
export function calculateNextDueDate(
  currentDueDate: string,
  pattern: 'daily' | 'weekly' | 'monthly' | 'yearly'
): string {
  const date = new Date(currentDueDate)
  switch (pattern) {
    case 'daily':
      date.setDate(date.getDate() + 1)
      break
    case 'weekly':
      date.setDate(date.getDate() + 7)
      break
    case 'monthly':
      date.setMonth(date.getMonth() + 1)
      break
    case 'yearly':
      date.setFullYear(date.getFullYear() + 1)
      break
  }
  return date.toISOString()
}

/**
 * Returns a relative due-date label and Tailwind colour class for display on a todo card.
 */
export function getRelativeDueLabel(dueDateIso: string): { label: string; color: string } {
  const now = getSingaporeNow()
  const due = new Date(dueDateIso)
  const diffMs = due.getTime() - now.getTime()
  const diffMin = Math.round(diffMs / 60_000)

  if (diffMin < 0) {
    const abs = Math.abs(diffMin)
    if (abs < 60) return { label: `${abs}m overdue`, color: 'text-red-600' }
    if (abs < 1440) return { label: `${Math.floor(abs / 60)}h overdue`, color: 'text-red-600' }
    return { label: `${Math.floor(abs / 1440)}d overdue`, color: 'text-red-600' }
  }
  if (diffMin < 60) return { label: `Due in ${diffMin}m`, color: 'text-red-500' }
  if (diffMin < 1440) return { label: `Due in ${Math.floor(diffMin / 60)}h`, color: 'text-orange-500' }
  if (diffMin < 10080) return { label: `Due in ${Math.floor(diffMin / 1440)}d`, color: 'text-yellow-500' }
  return { label: formatSingaporeDate(dueDateIso), color: 'text-blue-500' }
}
