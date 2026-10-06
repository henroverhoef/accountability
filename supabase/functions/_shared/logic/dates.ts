// Date helpers. All "dates" in this app are plain strings like "2026-10-06"
// meaning a calendar day in the USER'S timezone (stored in their profile).
// Times are "HH:MM" (or "HH:MM:SS" as Postgres returns them).

export const DEFAULT_TIMEZONE = 'Africa/Johannesburg'

export interface LocalNow {
  date: string // YYYY-MM-DD in the given timezone
  minutes: number // minutes since local midnight (0..1439)
}

/** What day and time is it right now for someone in timezone `tz`? */
export function localNow(now: Date, tz: string): LocalNow {
  let fmt: Intl.DateTimeFormat
  try {
    fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
  } catch {
    return localNow(now, DEFAULT_TIMEZONE)
  }
  const parts: Record<string, string> = {}
  for (const p of fmt.formatToParts(now)) parts[p.type] = p.value
  const hour = Number(parts.hour) % 24
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: hour * 60 + Number(parts.minute),
  }
}

/** Add (or subtract) whole days from a YYYY-MM-DD date. */
export function addDays(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** 0 = Sunday … 6 = Saturday */
export function weekdayOf(date: string): number {
  return new Date(date + 'T00:00:00Z').getUTCDay()
}

/** Number of days from a to b (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000)
}

/** "22:30" or "22:30:00" -> 1350 */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + (m || 0)
}

/** 1350 -> "22:30" (wraps around midnight) */
export function minutesToTime(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/** List of dates from `from` to `to` inclusive. */
export function dateRange(from: string, to: string): string[] {
  const out: string[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d)
  return out
}
