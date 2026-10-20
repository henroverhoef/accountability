import { describe, expect, it } from 'vitest'
import { dayProgress, habitStreak, honestyStreak, type CheckinLike, type HabitRules } from '../src/lib/logic'

const daily: HabitRules = { id: 'p', type: 'avoid', schedule_days: [0, 1, 2, 3, 4, 5, 6], start_date: '2026-09-01', archived: false }
const c = (date: string, outcome: CheckinLike['outcome'], habit_id = 'p'): CheckinLike => ({ habit_id, date, outcome })

describe('habitStreak', () => {
  it('counts consecutive clean days, with Struggled counting as clean', () => {
    const list = [c('2026-09-01', 'good'), c('2026-09-02', 'mid'), c('2026-09-03', 'good')]
    expect(habitStreak(daily, list, '2026-09-03')).toMatchObject({ current: 3, longest: 3 })
  })

  it('a slip resets the current streak but keeps the longest', () => {
    const list = [c('2026-09-01', 'good'), c('2026-09-02', 'good'), c('2026-09-03', 'bad'), c('2026-09-04', 'good')]
    expect(habitStreak(daily, list, '2026-09-04')).toMatchObject({ current: 1, longest: 2 })
  })

  it('today without a check-in is pending, not a break', () => {
    const list = [c('2026-09-01', 'good'), c('2026-09-02', 'good')]
    expect(habitStreak(daily, list, '2026-09-03').current).toBe(2)
  })

  it('a missed (unanswered) past day breaks the streak', () => {
    const list = [c('2026-09-01', 'good'), c('2026-09-03', 'good')]
    expect(habitStreak(daily, list, '2026-09-03')).toMatchObject({ current: 1, longest: 1 })
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

describe('habitStreak: ❤️‍🔥 green streak', () => {
  // Day n of September (day 1 = 2026-09-01).
  const day = (n: number) => `2026-09-${String(n).padStart(2, '0')}`
  const days = (from: number, to: number, outcome: CheckinLike['outcome']) =>
    Array.from({ length: to - from + 1 }, (_, i) => c(day(from + i), outcome))

  it('all green: ❤️‍🔥 and 🔥 are the same', () => {
    expect(habitStreak(daily, days(1, 5, 'good'), day(5))).toMatchObject({ current: 5, green: 5, longestGreen: 5, greenBackIn: 0 })
  })

  it('a yellow day resets ❤️‍🔥 but 🔥 carries on', () => {
    const list = [...days(1, 5, 'good'), c(day(6), 'mid')]
    expect(habitStreak(daily, list, day(6))).toMatchObject({ current: 6, green: 0, longestGreen: 5, greenBackIn: 7 })
  })

  it('❤️‍🔥 comes back once the new green run is more than half of 🔥', () => {
    // Green 1–5, yellow on 6, green from 7: on day 12 it's 6 of 12 (not more than half)…
    const list = [...days(1, 5, 'good'), c(day(6), 'mid'), ...days(7, 20, 'good')]
    expect(habitStreak(daily, list, day(12))).toMatchObject({ current: 12, green: 0, greenBackIn: 1 })
    // …and on day 13 it's 7 of 13.
    expect(habitStreak(daily, list, day(13))).toMatchObject({ current: 13, green: 7, greenBackIn: 0 })
    expect(habitStreak(daily, list, day(20))).toMatchObject({ current: 20, green: 14, longestGreen: 14 })
  })

  it('counts down to the comeback', () => {
    const list = [...days(1, 5, 'good'), c(day(6), 'mid'), ...days(7, 9, 'good')]
    expect(habitStreak(daily, list, day(9)).greenBackIn).toBe(4) // back on day 13
  })

  it('today not checked in yet changes nothing', () => {
    const list = [...days(1, 5, 'good'), c(day(6), 'mid'), ...days(7, 13, 'good')]
    expect(habitStreak(daily, list, day(14))).toMatchObject({ current: 13, green: 7 })
  })

  it('a red day resets both, and the next green day starts both again', () => {
    const list = [...days(1, 5, 'good'), c(day(6), 'mid'), c(day(7), 'bad'), c(day(8), 'good')]
    expect(habitStreak(daily, list, day(7))).toMatchObject({ current: 0, green: 0 })
    expect(habitStreak(daily, list, day(8))).toMatchObject({ current: 1, green: 1, longestGreen: 5 })
  })

  it('a yellow first day: 🔥 1, no ❤️‍🔥 until there are more greens than yellows', () => {
    const list = [c(day(1), 'mid'), ...days(2, 3, 'good')]
    expect(habitStreak(daily, list, day(1))).toMatchObject({ current: 1, green: 0, greenBackIn: 2 })
    expect(habitStreak(daily, list, day(2))).toMatchObject({ current: 2, green: 0, greenBackIn: 1 })
    expect(habitStreak(daily, list, day(3))).toMatchObject({ current: 3, green: 2 })
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
