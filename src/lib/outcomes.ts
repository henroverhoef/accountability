import type { HabitType, Outcome } from './logic'
import type { Habit } from './types'

/** Default button labels for each habit type. Users can rename them per habit. */
export const DEFAULT_LABELS: Record<HabitType, Partial<Record<Outcome, string>>> = {
  avoid: { good: 'Clean', mid: 'Struggled', bad: 'Slipped' },
  done: { good: 'Done', mid: 'Partly', bad: 'Skipped' },
  time: { good: 'On time', bad: 'Late' },
  amount: { good: 'Target met', bad: 'Missed target' },
  scale: { good: 'Strong (7–10)', mid: 'Mixed (4–6)', bad: 'Hard (1–3)' },
}

export const TYPE_NAMES: Record<HabitType, string> = {
  avoid: 'Avoid / break a habit',
  done: 'Done / not done',
  time: 'Time target',
  amount: 'Amount',
  scale: 'Score out of 10',
}

export function outcomeLabel(habit: Pick<Habit, 'type' | 'outcome_options'>, outcome: Outcome): string {
  return habit.outcome_options?.[outcome] || DEFAULT_LABELS[habit.type][outcome] || outcome
}

/** Types whose answers come in three levels (green / amber / red). */
export function hasMidOutcome(type: HabitType): boolean {
  return type === 'avoid' || type === 'done' || type === 'scale'
}

/**
 * The answer in words, for showing a check-in anywhere:
 * "Clean", "7/10", "On time · 22:15", "Target met · 2 chapters".
 * outcome may be null when a habit is shared as "check-in only".
 */
export function describeAnswer(
  habit: Pick<Habit, 'type' | 'outcome_options' | 'unit'>,
  c: { outcome: Outcome | null; value_number?: number | null; value_time?: string | null },
): string {
  if (!c.outcome) return 'Checked in'
  if (habit.type === 'scale' && c.value_number != null) return `${c.value_number}/10`
  const label = outcomeLabel(habit, c.outcome)
  if (habit.type === 'time' && c.value_time) return `${label} · ${c.value_time.slice(0, 5)}`
  if (habit.type === 'amount' && c.value_number != null) return `${label} · ${c.value_number}${habit.unit ? ` ${habit.unit}` : ''}`
  return label
}

/** Average of the scores (for "score out of 10" habits), e.g. "6.4", or null if none. */
export function averageScore(checkins: { value_number?: number | null }[]): string | null {
  const scores = checkins.map((c) => c.value_number).filter((v): v is number => typeof v === 'number')
  if (scores.length === 0) return null
  return (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1).replace(/\.0$/, '')
}

/** Which outcomes a person picks by tapping (time & amount are calculated instead). */
export function tappableOutcomes(type: HabitType): Outcome[] {
  return type === 'avoid' || type === 'done' ? ['good', 'mid', 'bad'] : []
}

export const OUTCOME_STYLES: Record<Outcome, { on: string; dot: string }> = {
  good: { on: 'bg-emerald-600 text-white border-emerald-600', dot: 'bg-emerald-500' },
  mid: { on: 'bg-amber-400 text-slate-900 border-amber-400', dot: 'bg-amber-400' },
  bad: { on: 'bg-rose-600 text-white border-rose-600', dot: 'bg-rose-500' },
}

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function formatDate(date: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }) {
  return new Date(date + 'T12:00:00Z').toLocaleDateString(undefined, { ...opts, timeZone: 'UTC' })
}

export function shortTime(t: string | null | undefined): string {
  return t ? t.slice(0, 5) : ''
}
