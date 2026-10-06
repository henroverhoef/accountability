// Streak calculations. A streak only looks at days the habit was DUE
// (so a Mon/Wed/Fri habit is not broken by Tuesday).
// Today never breaks a streak: if you haven't checked in yet, it's still "pending".
import { addDays } from './dates.ts'
import { isDue, isSuccess, type CheckinLike, type HabitRules, type Outcome } from './habits.ts'

export interface Streak {
  current: number
  longest: number
}

function earliest(dates: string[]): string | undefined {
  return dates.reduce<string | undefined>((min, d) => (min === undefined || d < min ? d : min), undefined)
}

/** Clean-day / success streak for ONE habit. */
export function habitStreak(habit: HabitRules, checkins: CheckinLike[], today: string): Streak {
  const byDate = new Map<string, Outcome>()
  for (const c of checkins) if (c.habit_id === habit.id) byDate.set(c.date, c.outcome)

  // Allow back-filled check-ins before the start date (e.g. "yesterday" on day one).
  const start = earliest([habit.start_date, ...byDate.keys()])!
  const rules = { ...habit, start_date: start, archived: false }

  let longest = 0
  let run = 0
  for (let d = start; d <= today; d = addDays(d, 1)) {
    if (!isDue(rules, d)) continue
    const outcome = byDate.get(d)
    if (isSuccess(outcome)) {
      run++
      longest = Math.max(longest, run)
    } else if (outcome === undefined && d === today) {
      // pending – doesn't break anything
    } else {
      run = 0
    }
  }
  return { current: run, longest }
}

/**
 * Honesty streak: consecutive days on which you checked in on EVERY habit that was due,
 * whatever the answers were. Days with nothing due are skipped.
 */
export function honestyStreak(habits: HabitRules[], checkins: CheckinLike[], today: string): Streak {
  const active = habits.filter((h) => !h.archived)
  const done = new Set(checkins.map((c) => `${c.habit_id}|${c.date}`))
  const start = earliest(active.map((h) => h.start_date))
  if (!start) return { current: 0, longest: 0 }

  let longest = 0
  let run = 0
  for (let d = start; d <= today; d = addDays(d, 1)) {
    const due = active.filter((h) => isDue(h, d))
    if (due.length === 0) continue
    const complete = due.every((h) => done.has(`${h.id}|${d}`))
    if (complete) {
      run++
      longest = Math.max(longest, run)
    } else if (d !== today) {
      run = 0
    }
  }
  return { current: run, longest }
}

/** How many of the habits due on `date` have been checked in? */
export function dayProgress(habits: HabitRules[], checkins: CheckinLike[], date: string) {
  const due = habits.filter((h) => isDue(h, date))
  const doneIds = new Set(checkins.filter((c) => c.date === date).map((c) => c.habit_id))
  const done = due.filter((h) => doneIds.has(h.id)).length
  return { due: due.length, done, complete: due.length > 0 && done === due.length }
}
