import { describe, expect, it } from 'vitest'
import { evaluateAmount, evaluateTime } from '../src/lib/logic'

describe('evaluateTime (target is "at or before")', () => {
  it('on time or early is success', () => {
    expect(evaluateTime('22:30', '22:30')).toBe('good')
    expect(evaluateTime('21:45', '22:30')).toBe('good')
  })
  it('late is a miss', () => {
    expect(evaluateTime('22:31', '22:30')).toBe('bad')
  })
  it('grace minutes extend the target', () => {
    expect(evaluateTime('22:40', '22:30', 10)).toBe('good')
    expect(evaluateTime('22:41', '22:30', 10)).toBe('bad')
  })
  it('after midnight counts as late, not early', () => {
    expect(evaluateTime('00:15', '22:30')).toBe('bad')
    expect(evaluateTime('01:30', '23:30', 120)).toBe('good')
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
})
