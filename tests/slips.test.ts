import { describe, expect, it } from 'vitest'
import { slipAverage, slipDay, slipOutcome, slipText, worseOutcome, type SlipLike } from '../src/lib/logic'

const s = (date: string, amount: number | null, habit_id = 'shorts'): SlipLike => ({ habit_id, date, amount, lost_count: amount === null })

describe('slips', () => {
  const log = [s('2026-11-06', 5), s('2026-11-06', 2), s('2026-11-06', 3, 'other'), s('2026-11-05', 4)]

  it('adds up one habit’s day', () => {
    expect(slipDay(log, 'shorts', '2026-11-06')).toEqual({ total: 7, lostCount: false, logs: 2 })
    expect(slipDay(log, 'shorts', '2026-11-04')).toEqual({ total: 0, lostCount: false, logs: 0 })
  })

  it('any slip is red by default; a habit can allow some as yellow', () => {
    expect(slipOutcome({ total: 1, lostCount: false, logs: 1 })).toBe('bad')
    expect(slipOutcome({ total: 2, lostCount: false, logs: 1 }, 2)).toBe('mid')
    expect(slipOutcome({ total: 3, lostCount: false, logs: 2 }, 2)).toBe('bad')
  })

  it('lost count is red; nothing logged says nothing', () => {
    expect(slipOutcome({ total: 0, lostCount: true, logs: 1 }, 10)).toBe('bad')
    expect(slipOutcome({ total: 0, lostCount: false, logs: 0 })).toBeNull()
  })

  it('a check-in never ends up better than the slips say', () => {
    expect(worseOutcome('good', 'bad')).toBe('bad')
    expect(worseOutcome('bad', 'mid')).toBe('bad')
    expect(worseOutcome('mid', 'good')).toBe('mid')
  })

  it('says it in the habit’s unit', () => {
    expect(slipText({ total: 7, lostCount: false }, 'videos')).toBe('7 videos')
    expect(slipText({ total: 1, lostCount: false })).toBe('1 time')
    expect(slipText({ total: 3, lostCount: false }, ' ')).toBe('3 times')
    expect(slipText({ total: 3, lostCount: true }, 'minutes')).toBe('lost count')
  })

  it('averages the previous week (today not included)', () => {
    expect(slipAverage(log, 'shorts', '2026-11-06')).toBeCloseTo(4 / 7)
  })
})
