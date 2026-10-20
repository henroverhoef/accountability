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

/**
 * A habit's two streaks:
 *  🔥  `current`: days in a row that went well enough (green or yellow; a red or a missed day resets it).
 *  ❤️‍🔥 `green`: days in a row that were green. A yellow day resets it to 0 while 🔥 carries on,
 *     and it only shows again once the new green run is MORE than half of the 🔥 streak
 *     (green 5 days, yellow on day 6, green again from day 7: ❤️‍🔥 is back on day 13 with 7).
 *     0 while it doesn't show.
 */
export interface HabitStreak extends Streak {
  green: number
  longestGreen: number
  greenBackIn: number // while ❤️‍🔥 doesn't show: how many more green days until it does
}

/** Clean-day / success streak for ONE habit. */
export function habitStreak(habit: HabitRules, checkins: CheckinLike[], today: string): HabitStreak {
  const byDate = new Map<string, Outcome>()
  for (const c of checkins) if (c.habit_id === habit.id) byDate.set(c.date, c.outcome)

  // Allow back-filled check-ins before the start date (e.g. "yesterday" on day one).
  const start = earliest([habit.start_date, ...byDate.keys()])!
  const rules = { ...habit, start_date: start, archived: false }

  let longest = 0
  let run = 0
  let greenRun = 0 // green days in a row since the last yellow
  let longestGreen = 0
  for (let d = start; d <= today; d = addDays(d, 1)) {
    if (!isDue(rules, d)) continue
    const outcome = byDate.get(d)
    if (isSuccess(outcome)) {
      run++
      longest = Math.max(longest, run)
      greenRun = outcome === 'good' ? greenRun + 1 : 0
      if (shows(greenRun, run)) longestGreen = Math.max(longestGreen, greenRun)
    } else if (outcome === undefined && d === today) {
      // pending – doesn't break anything
    } else {
      run = 0
      greenRun = 0
    }
  }
  return {
    current: run,
    longest,
    green: shows(greenRun, run) ? greenRun : 0,
    longestGreen,
    greenBackIn: shows(greenRun, run) ? 0 : run - 2 * greenRun + 1, // smallest k with greenRun + k > (run + k) / 2
  }
}

function shows(greenRun: number, run: number): boolean {
  return greenRun > 0 && greenRun * 2 > run
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
