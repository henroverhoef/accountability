// Weekly review: what happened this week, per habit, and which tags show up on hard days.
import { addDays, weekdayOf } from './dates.ts'
import { isDue, type CheckinLike, type HabitRules, type Outcome } from './habits.ts'

export interface HabitWeek {
  habitId: string
  due: number // days it was due (up to today)
  counts: Record<Outcome, number>
  missed: number // due days with no check-in (today only counts once it's over)
}

export interface WeeklySummary {
  start: string // Monday
  end: string // Sunday
  daysSoFar: number // days of this week up to today
  checkinDays: number // days where every due habit was checked in
  habits: HabitWeek[]
  topTags: { tag: string; count: number }[] // from Struggled / Slipped / missed-target days
}

/** Monday of the week containing `date`. */
export function weekStart(date: string): string {
  return addDays(date, -((weekdayOf(date) + 6) % 7))
}

export function weeklySummary(
  habits: HabitRules[],
  checkins: (CheckinLike & { tags?: string[] })[],
  start: string,
  today: string,
): WeeklySummary {
  const end = addDays(start, 6)
  const last = end < today ? end : today
  const days: string[] = []
  for (let d = start; d <= last; d = addDays(d, 1)) days.push(d)

  const inWeek = checkins.filter((c) => c.date >= start && c.date <= end)
  const byKey = new Map(inWeek.map((c) => [`${c.habit_id}|${c.date}`, c]))
  const active = habits.filter((h) => !h.archived)

  const habitWeeks: HabitWeek[] = active.map((h) => {
    const counts: Record<Outcome, number> = { good: 0, mid: 0, bad: 0 }
    let due = 0
    let missed = 0
    for (const d of days) {
      if (!isDue(h, d)) continue
      due++
      const c = byKey.get(`${h.id}|${d}`)
      if (c) counts[c.outcome]++
      else if (d !== today) missed++
    }
    return { habitId: h.id, due, counts, missed }
  })

  let checkinDays = 0
  for (const d of days) {
    const due = active.filter((h) => isDue(h, d))
    if (due.length > 0 && due.every((h) => byKey.has(`${h.id}|${d}`))) checkinDays++
  }

  const tagCounts = new Map<string, number>()
  for (const c of inWeek) {
    if (c.outcome === 'good') continue
    for (const t of c.tags ?? []) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1)
  }
  const topTags = [...tagCounts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, 5)

  return { start, end, daysSoFar: days.length, checkinDays, habits: habitWeeks, topTags }
}
