import { describe, expect, it } from 'vitest'
import { dayProgress, habitStreak, honestyStreak, type CheckinLike, type HabitRules } from '../src/lib/logic'

const daily: HabitRules = { id: 'p', type: 'avoid', schedule_days: [0, 1, 2, 3, 4, 5, 6], start_date: '2026-09-01', archived: false }
const c = (date: string, outcome: CheckinLike['outcome'], habit_id = 'p'): CheckinLike => ({ habit_id, date, outcome })

describe('habitStreak', () => {
  it('counts consecutive clean days, with Struggled counting as clean', () => {
    const list = [c('2026-09-01', 'good'), c('2026-09-02', 'mid'), c('2026-09-03', 'good')]
    expect(habitStreak(daily, list, '2026-09-03')).toEqual({ current: 3, longest: 3 })
  })

  it('a slip resets the current streak but keeps the longest', () => {
    const list = [c('2026-09-01', 'good'), c('2026-09-02', 'good'), c('2026-09-03', 'bad'), c('2026-09-04', 'good')]
    expect(habitStreak(daily, list, '2026-09-04')).toEqual({ current: 1, longest: 2 })
  })

  it('today without a check-in is pending, not a break', () => {
    const list = [c('2026-09-01', 'good'), c('2026-09-02', 'good')]
    expect(habitStreak(daily, list, '2026-09-03').current).toBe(2)
  })

  it('a missed (unanswered) past day breaks the streak', () => {
    const list = [c('2026-09-01', 'good'), c('2026-09-03', 'good')]
    expect(habitStreak(daily, list, '2026-09-03')).toEqual({ current: 1, longest: 1 })
  })

  it('ignores days the habit is not scheduled', () => {
    // Mon/Wed/Fri habit. 2026-09-07 is a Monday.
    const mwf: HabitRules = { ...daily, id: 'x', schedule_days: [1, 3, 5], start_date: '2026-09-07' }
    const list = [c('2026-09-07', 'good', 'x'), c('2026-09-09', 'good', 'x'), c('2026-09-11', 'good', 'x')]
    expect(habitStreak(mwf, list, '2026-09-13').current).toBe(3) // Sunday
  })

  it('counts back-filled check-ins before the start date', () => {
    const h = { ...daily, start_date: '2026-09-02' }
    expect(habitStreak(h, [c('2026-09-01', 'good'), c('2026-09-02', 'good')], '2026-09-02').current).toBe(2)
  })
})

describe('honestyStreak', () => {
  const quiet: HabitRules = { ...daily, id: 'q', type: 'done' }

  it('counts days where every due habit was answered, even with slips', () => {
    const list = [
      c('2026-09-01', 'bad'), c('2026-09-01', 'bad', 'q'),
      c('2026-09-02', 'good'), c('2026-09-02', 'mid', 'q'),
    ]
    expect(honestyStreak([daily, quiet], list, '2026-09-02')).toEqual({ current: 2, longest: 2 })
  })

  it('a partly-completed day breaks it', () => {
    const list = [c('2026-09-01', 'good'), c('2026-09-01', 'good', 'q'), c('2026-09-02', 'good')]
    expect(honestyStreak([daily, quiet], list, '2026-09-03').current).toBe(0)
  })

  it('today incomplete is still pending', () => {
    const list = [c('2026-09-01', 'good'), c('2026-09-01', 'good', 'q'), c('2026-09-02', 'good')]
    expect(honestyStreak([daily, quiet], list, '2026-09-02').current).toBe(1)
  })

  it('archived habits are ignored', () => {
    const list = [c('2026-09-01', 'good')]
    expect(honestyStreak([daily, { ...quiet, archived: true }], list, '2026-09-01').current).toBe(1)
  })
})

describe('dayProgress', () => {
  it('reports how many due habits are checked in', () => {
    const quiet: HabitRules = { ...daily, id: 'q' }
    expect(dayProgress([daily, quiet], [c('2026-09-01', 'good')], '2026-09-01')).toEqual({ due: 2, done: 1, complete: false })
  })
})
