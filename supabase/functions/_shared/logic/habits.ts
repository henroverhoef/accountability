// Pure rules about habits and check-ins (no database, no UI).
import { timeToMinutes, weekdayOf } from './dates.ts'

export type HabitType = 'avoid' | 'done' | 'time' | 'amount' | 'scale'
/** good = green, mid = amber, bad = red. */
export type Outcome = 'good' | 'mid' | 'bad'

export interface HabitRules {
  id: string
  type: HabitType
  schedule_days: number[] // 0 = Sunday … 6 = Saturday
  start_date: string // first day this habit counts
  archived: boolean
  target_time?: string | null
  target_value?: number | null
  target_direction?: 'at_least' | 'at_most' | null
  grace_minutes?: number | null
}

export interface CheckinLike {
  habit_id: string
  date: string
  outcome: Outcome
}

/** Is this habit expected to be checked in on this date? */
export function isDue(habit: HabitRules, date: string): boolean {
  if (habit.archived) return false
  if (date < habit.start_date) return false
  return habit.schedule_days.includes(weekdayOf(date))
}

/** Clean and Struggled both count as a "clean day"; Done and Partly both keep a streak. */
export function isSuccess(outcome: Outcome | undefined | null): boolean {
  return outcome === 'good' || outcome === 'mid'
}

/**
 * Time target (e.g. "in bed by 22:30"): success if actual is at or before target + grace.
 * Times are compared within ±12 hours of the target, so 00:15 counts as 105 minutes
 * LATE for a 22:30 target (not 22 hours early).
 */
export function evaluateTime(actual: string, target: string, graceMinutes = 0): Outcome {
  let diff = timeToMinutes(actual) - timeToMinutes(target)
  if (diff > 720) diff -= 1440
  if (diff <= -720) diff += 1440
  return diff <= graceMinutes ? 'good' : 'bad'
}

/** Amount target (e.g. "at least 1 chapter", "at most 30 minutes"). */
export function evaluateAmount(
  value: number,
  target: number | null | undefined,
  direction: 'at_least' | 'at_most' | null | undefined,
): Outcome {
  if (target === null || target === undefined) return 'good'
  if (direction === 'at_most') return value <= target ? 'good' : 'bad'
  return value >= target ? 'good' : 'bad'
}

/**
 * Score out of 10 (e.g. "How thankful was I today?"):
 * 7–10 = good (green), 4–6 = mixed (amber), 1–3 = hard (red).
 */
export function evaluateScale(score: number): Outcome {
  if (score >= 7) return 'good'
  if (score >= 4) return 'mid'
  return 'bad'
}
