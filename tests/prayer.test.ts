import { describe, expect, it } from 'vitest'
import { joinNames, prayerMoments } from '../supabase/functions/_shared/logic/prayer'

describe('prayerMoments', () => {
  it('puts prayers at the same time together, earliest first', () => {
    const rows = [
      { who: 'Alec', remind_at: '2026-10-16T12:00:00+00:00' },
      { who: 'Jesse', remind_at: '2026-10-16T11:00:00+00:00' },
      { who: 'Jared', remind_at: '2026-10-16T11:00:00.000Z' }, // same moment, other spelling
    ]
    expect(prayerMoments(rows).map((m) => m.items.map((r) => r.who))).toEqual([['Jesse', 'Jared'], ['Alec']])
  })
})

describe('joinNames', () => {
  it('reads naturally', () => {
    expect(joinNames(['Jesse'])).toBe('Jesse')
    expect(joinNames(['Jesse', 'Jared'])).toBe('Jesse and Jared')
    expect(joinNames(['Jesse', 'Jared', 'Jesse', 'the group'])).toBe('Jesse, Jared and the group')
  })
})
