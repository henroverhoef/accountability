import { describe, expect, it } from 'vitest'
import { evaluateAmount, evaluateScale, evaluateTime } from '../src/lib/logic'

describe('evaluateTime (target is "at or before")', () => {
  it('on time or early is success', () => {
    expect(evaluateTime('22:30', '22:30')).toBe('good')
    expect(evaluateTime('21:45', '22:30')).toBe('good')
  })
  it('late is a miss', () => {
    expect(evaluateTime('22:31', '22:30')).toBe('bad')
  })
  it('within the grace minutes is amber, after them red', () => {
    expect(evaluateTime('22:30', '22:30', 10)).toBe('good')
    expect(evaluateTime('22:31', '22:30', 10)).toBe('mid')
    expect(evaluateTime('22:40', '22:30', 10)).toBe('mid')
    expect(evaluateTime('22:41', '22:30', 10)).toBe('bad')
    // Target 22:00, 30 minutes grace: 22:15 is amber, not green.
    expect(evaluateTime('22:15', '22:00', 30)).toBe('mid')
  })
  it('after midnight counts as late, not early', () => {
    expect(evaluateTime('00:15', '22:30')).toBe('bad')
    expect(evaluateTime('01:30', '23:30', 120)).toBe('mid')
  })
  it('works for targets just after midnight', () => {
    expect(evaluateTime('23:50', '00:15')).toBe('good')
    expect(evaluateTime('00:30', '00:15')).toBe('bad')
  })
  it('accepts HH:MM:SS from the database', () => {
    expect(evaluateTime('22:00:00', '22:30:00')).toBe('good')
  })
})

describe('evaluateAmount', () => {
  it('at least', () => {
    expect(evaluateAmount(1, 1, 'at_least')).toBe('good')
    expect(evaluateAmount(0, 1, 'at_least')).toBe('bad')
  })
  it('at most', () => {
    expect(evaluateAmount(30, 30, 'at_most')).toBe('good')
    expect(evaluateAmount(31, 30, 'at_most')).toBe('bad')
  })
  it('no target means any entry counts', () => {
    expect(evaluateAmount(0, null, null)).toBe('good')
  })
  it('within the grace of the target is amber, further off red', () => {
    // At least 3 chapters, grace 1
    expect(evaluateAmount(3, 3, 'at_least', 1)).toBe('good')
    expect(evaluateAmount(2, 3, 'at_least', 1)).toBe('mid')
    expect(evaluateAmount(1, 3, 'at_least', 1)).toBe('bad')
    // At most 30 minutes, grace 10
    expect(evaluateAmount(35, 30, 'at_most', 10)).toBe('mid')
    expect(evaluateAmount(40, 30, 'at_most', 10)).toBe('mid')
    expect(evaluateAmount(41, 30, 'at_most', 10)).toBe('bad')
    // Decimals: at least 2 litres, grace 0.5
    expect(evaluateAmount(1.5, 2, 'at_least', 0.5)).toBe('mid')
    expect(evaluateAmount(1.4, 2, 'at_least', 0.5)).toBe('bad')
  })
  it('no grace (the default): met or not', () => {
    expect(evaluateAmount(2, 3, 'at_least')).toBe('bad')
    expect(evaluateAmount(2, 3, 'at_least', 0)).toBe('bad')
  })
})

describe('evaluateScale (score out of 10)', () => {
  it('7–10 is good, 4–6 mixed, 1–3 hard', () => {
    expect([10, 7].map(evaluateScale)).toEqual(['good', 'good'])
    expect([6, 4].map(evaluateScale)).toEqual(['mid', 'mid'])
    expect([3, 1].map(evaluateScale)).toEqual(['bad', 'bad'])
  })
})
