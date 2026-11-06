// "I just gave in": slips on a habit you're breaking (avoid habits), logged as they happen.
//
// Each log adds to the day's count ("+5 videos"), or says you lost count. The day's colour
// follows from the count: by default any slip is red (it's a habit you don't want in your
// life); a habit can allow up to N as yellow. No slips logged says nothing: the check-in
// still asks as usual.
import type { Outcome } from './habits.ts'

export interface SlipLike {
  habit_id: string
  date: string
  amount: number | null // null when you lost count
  lost_count: boolean
}

export interface SlipDay {
  total: number
  lostCount: boolean
  logs: number
}

export function slipDay(slips: SlipLike[], habitId: string, date: string): SlipDay {
  const day = slips.filter((s) => s.habit_id === habitId && s.date === date)
  return {
    total: day.reduce((sum, s) => sum + (s.amount ?? 0), 0),
    lostCount: day.some((s) => s.lost_count),
    logs: day.length,
  }
}

/** The day's colour from its slips: up to `yellowMax` yellow, more (or lost count) red; none logged → null. */
export function slipOutcome(day: SlipDay, yellowMax = 0): Outcome | null {
  if (day.lostCount) return 'bad'
  if (day.total === 0) return null
  return day.total <= yellowMax ? 'mid' : 'bad'
}

const RANK: Record<Outcome, number> = { good: 0, mid: 1, bad: 2 }

/** The harder of two answers (a check-in can't say "clean" once you've logged a slip). */
export function worseOutcome(a: Outcome, b: Outcome): Outcome {
  return RANK[a] >= RANK[b] ? a : b
}

/** "7 videos", "1 time", "lost count". `unit` is what the habit counts in ("videos", "minutes"). */
export function slipText(day: Pick<SlipDay, 'total' | 'lostCount'>, unit?: string | null): string {
  if (day.lostCount) return 'lost count'
  return `${day.total} ${unit?.trim() || (day.total === 1 ? 'time' : 'times')}`
}

/** Average slips per day over the `days` days before `today` (for "usually"). */
export function slipAverage(slips: SlipLike[], habitId: string, today: string, days = 7): number {
  const before = slips.filter((s) => s.habit_id === habitId && s.date < today)
  const dates = new Set<string>()
  for (let i = 1; i <= days; i++) {
    const d = new Date(today + 'T12:00:00Z')
    d.setUTCDate(d.getUTCDate() - i)
    dates.add(d.toISOString().slice(0, 10))
  }
  const total = before.filter((s) => dates.has(s.date)).reduce((sum, s) => sum + (s.amount ?? 0), 0)
  return total / days
}
