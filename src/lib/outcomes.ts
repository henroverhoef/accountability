import type { HabitType, Outcome } from './logic'
import type { Habit } from './types'

/** Default button labels for each habit type. Users can rename them per habit. */
export const DEFAULT_LABELS: Record<HabitType, Partial<Record<Outcome, string>>> = {
  avoid: { good: 'Clean', mid: 'Struggled', bad: 'Slipped' },
  done: { good: 'Done', mid: 'Partly', bad: 'Skipped' },
  time: { good: 'On time', bad: 'Late' },
  amount: { good: 'Target met', bad: 'Missed target' },
}

export const TYPE_NAMES: Record<HabitType, string> = {
  avoid: 'Avoid / break a habit',
  done: 'Done / not done',
  time: 'Time target',
  amount: 'Amount',
}

export function outcomeLabel(habit: Pick<Habit, 'type' | 'outcome_options'>, outcome: Outcome): string {
  return habit.outcome_options?.[outcome] || DEFAULT_LABELS[habit.type][outcome] || outcome
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
