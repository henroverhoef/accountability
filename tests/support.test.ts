import { describe, expect, it } from 'vitest'
import { needsSupport, planSupportPrompts, sharedForGroup, supportReason, weekKey, weekScore, type HabitRules, type SupportCheckin } from '../src/lib/logic'

const daily = (id: string, extra: Partial<HabitRules> = {}): HabitRules =>
  ({ id, type: 'avoid', schedule_days: [0, 1, 2, 3, 4, 5, 6], start_date: '2026-09-01', archived: false, ...extra })
const c = (habit_id: string, date: string, outcome: SupportCheckin['outcome']): SupportCheckin => ({ habit_id, date, outcome })
/** One check-in per day for `days` days ending on `end`. */
const days = (habit_id: string, end: string, outcomes: SupportCheckin['outcome'][]) =>
  outcomes.map((o, i) => {
    const d = new Date(end + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - (outcomes.length - 1 - i))
    return c(habit_id, d.toISOString().slice(0, 10), o)
  })

describe('weekScore', () => {
  it('scores good 1, mid 0.5, bad 0, missed 0', () => {
    const list = [c('p', '2026-10-01', 'good'), c('p', '2026-10-02', 'mid'), c('p', '2026-10-03', 'bad')]
    // 7 days ending 10-07: 3 answered (1.5 points) + 4 missed
    expect(weekScore([daily('p')], list, '2026-10-07')).toBeCloseTo(1.5 / 7)
  })

  it('a check-in without a visible result counts as showing up', () => {
    expect(weekScore([daily('p')], days('p', '2026-10-07', Array(7).fill(null)), '2026-10-07')).toBe(1)
  })

  it('leaves out still-open days and needs enough data', () => {
    const list = days('p', '2026-10-06', Array(6).fill('good'))
    expect(weekScore([daily('p')], list, '2026-10-07', { openFrom: '2026-10-07' })).toBe(1)
    expect(weekScore([daily('p', { start_date: '2026-10-05' })], [], '2026-10-07')).toBeNull() // only 3 due days
  })

  it('only counts days a habit is scheduled and active', () => {
    const weekdaysOnly = daily('p', { schedule_days: [1, 2, 3, 4, 5] })
    const list = days('p', '2026-10-09', ['good', 'good', 'good', 'good', 'good']) // Mon–Fri
    expect(weekScore([weekdaysOnly], list, '2026-10-11')).toBe(1)
    expect(weekScore([daily('a', { archived: true })], [], '2026-10-11')).toBeNull()
  })
})

describe('needsSupport', () => {
  const today = '2026-10-12'
  it('a hard stretch of more than a few days triggers it', () => {
    const list = days('p', '2026-10-11', ['good', 'bad', 'bad', 'mid', 'bad', 'bad', 'bad', 'bad', 'good', 'bad'])
    expect(needsSupport([daily('p')], list, today)).toBe(true)
  })

  it('one bad patch in an otherwise good stretch does not', () => {
    const list = days('p', '2026-10-11', ['good', 'good', 'good', 'good', 'good', 'good', 'good', 'bad', 'bad', 'bad'])
    expect(needsSupport([daily('p')], list, today)).toBe(false) // earlier week still fine
  })

  it('a good week of mostly clean days is fine, even with a slip', () => {
    const list = days('p', '2026-10-11', ['good', 'good', 'good', 'bad', 'good', 'good', 'mid', 'good', 'good', 'good'])
    expect(needsSupport([daily('p')], list, today)).toBe(false)
  })

  it('a missing check-in for last night is not held against anyone yet', () => {
    const list = days('p', '2026-10-10', ['bad', 'bad', 'bad', 'good', 'good', 'good', 'good', 'good', 'good'])
    expect(needsSupport([daily('p')], list, today)).toBe(false)
  })

  it('a week of silence counts too', () => {
    const list = days('p', '2026-10-01', ['bad', 'bad', 'good'])
    expect(needsSupport([daily('p')], list, today)).toBe(true)
  })

  it('new users are left alone until there is enough to go on', () => {
    expect(needsSupport([daily('p', { start_date: '2026-10-10' })], [c('p', '2026-10-10', 'bad')], today)).toBe(false)
  })
})

describe('sharedForGroup', () => {
  it('drops private habits and hides results of check-in-only ones', () => {
    const habits = [daily('a'), daily('b'), daily('private')]
    const list = [c('a', '2026-10-10', 'bad'), c('b', '2026-10-10', 'bad'), c('private', '2026-10-10', 'bad')]
    const out = sharedForGroup(habits, list, [{ habit_id: 'a', visibility: 'notes' }, { habit_id: 'b', visibility: 'checkin' }])
    expect(out.habits.map((h) => h.id)).toEqual(['a', 'b'])
    expect(out.checkins).toEqual([c('a', '2026-10-10', 'bad'), c('b', '2026-10-10', null)])
  })
})

describe('weekKey', () => {
  it('is the Monday of the week', () => {
    expect(weekKey('2026-10-12')).toBe('2026-10-12') // Monday
    expect(weekKey('2026-10-18')).toBe('2026-10-12') // Sunday
    expect(weekKey('2026-10-11')).toBe('2026-10-05')
  })
})

describe('planSupportPrompts', () => {
  const today = '2026-10-12'
  const hard = ['bad', 'bad', 'bad', 'bad', 'bad', 'bad', 'bad', 'bad', 'bad', 'bad'] as const
  const people = [{ id: 'jesse', name: 'Jesse', today }, { id: 'henro', name: 'Henro', today }, { id: 'tim', name: 'Tim', today }]
  const members = [
    { group_id: 'g1', user_id: 'jesse' }, { group_id: 'g1', user_id: 'henro' },
    { group_id: 'g2', user_id: 'jesse' }, { group_id: 'g2', user_id: 'tim' },
  ]
  const habits = [{ ...daily('purity'), user_id: 'jesse' }, { ...daily('sleep'), user_id: 'jesse' }]
  const checkins = [...days('purity', '2026-10-11', [...hard]), ...days('sleep', '2026-10-11', Array(10).fill('mid'))]
    .map((c) => ({ ...c, user_id: 'jesse' }))
  const all = (r: string) => ({ ...people.find((p) => p.id === r)!, self: true, group: true })

  it('prompts the person and only groups that can see the hard habit', () => {
    const shares = [
      { habit_id: 'purity', group_id: 'g1', visibility: 'notes' as const },
      { habit_id: 'sleep', group_id: 'g2', visibility: 'result' as const }, // g2 only sees so-so sleep (0.5: not low)
    ]
    const out = planSupportPrompts({ recipients: [all('jesse'), all('henro'), all('tim')], people, members, habits, checkins, shares })
    expect(out.map((p) => `${p.user_id}:${p.kind}:${p.ref}`)).toEqual([
      'jesse:support_self:2026-10-12',
      'henro:support:jesse:g1:2026-10-12',
    ])
    expect(out[1].body).toContain('Jesse could use some extra support')
  })

  it('a private habit never reaches the group', () => {
    const out = planSupportPrompts({ recipients: [all('henro')], people, members, habits, checkins, shares: [] })
    expect(out).toEqual([])
  })

  it('respects who wants which prompts', () => {
    const shares = [{ habit_id: 'purity', group_id: 'g1', visibility: 'notes' as const }]
    const out = planSupportPrompts({
      recipients: [{ ...all('jesse'), self: false }, { ...all('henro'), group: false }], people, members, habits, checkins, shares,
    })
    expect(out).toEqual([])
  })
})

describe('supportReason', () => {
  const today = '2026-10-12'
  it('hard when the answers themselves are hard', () => {
    const list = days('p', '2026-10-11', ['bad', 'bad', 'mid', 'bad', 'bad', 'bad', 'bad', 'bad', 'good', 'bad'])
    expect(supportReason([daily('p')], list, today)).toBe('hard')
  })
  it('quiet when it is mostly missing check-ins', () => {
    const list = days('p', '2026-10-03', ['good', 'good'])
    expect(supportReason([daily('p')], list, today)).toBe('quiet')
    // a couple of good answers among many gaps is still "quiet", not "hard"
    expect(supportReason([daily('p')], [...list, c('p', '2026-10-09', 'good')], today)).toBe('quiet')
  })
  it('nothing when things are going fine', () => {
    expect(supportReason([daily('p')], days('p', '2026-10-11', Array(10).fill('good')), today)).toBeNull()
  })
})

describe('planSupportPrompts wording', () => {
  it('a member who has gone quiet gets a "reach out" prompt, and no self prompt', () => {
    const people = [{ id: 'r', name: 'Ruben', today: '2026-10-12' }, { id: 'h', name: 'Henro', today: '2026-10-12' }]
    const members = [{ group_id: 'g', user_id: 'r' }, { group_id: 'g', user_id: 'h' }]
    const habits = [{ ...daily('x', { start_date: '2026-10-01' }), user_id: 'r' }]
    const out = planSupportPrompts({
      recipients: people.map((p) => ({ ...p, self: true, group: true })), people, members, habits, checkins: [],
      shares: [{ habit_id: 'x', group_id: 'g', visibility: 'notes' }],
    })
    expect(out.map((p) => p.user_id + ':' + p.kind)).toEqual(['h:support:r'])
    expect(out[0].body).toContain('Ruben hasn’t checked in much lately')
  })
})
