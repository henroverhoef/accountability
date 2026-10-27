import { describe, expect, it } from 'vitest'
import { commitmentSnoozed, commitmentStat, planCommitmentPrompts, strugglingToCommit, type HabitRules, type SupportCheckin, type SupportPrompt } from '../src/lib/logic'

const TODAY = '2026-10-27' // window: 10-13 … 10-26
const exercise = (extra: Partial<HabitRules> = {}): HabitRules =>
  ({ id: 'ex', type: 'done', schedule_days: [0, 1, 2, 3, 4, 5, 6], start_date: '2026-09-01', archived: false, ...extra })
/** One check-in per day for the days ending yesterday (oldest first). */
const days = (outcomes: SupportCheckin['outcome'][], habit_id = 'ex', end = '2026-10-26') =>
  outcomes.map((outcome, i) => {
    const d = new Date(end + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - (outcomes.length - 1 - i))
    return { habit_id, date: d.toISOString().slice(0, 10), outcome }
  })

describe('commitmentStat', () => {
  it('scores two weeks of a daily habit: kept 1, partly 0.5, skipped or missed 0', () => {
    // 5 kept, 2 partly, 3 skipped, 4 days never checked in
    const list = days(['good', 'good', 'good', 'good', 'good', 'mid', 'mid', 'bad', 'bad', 'bad'])
    expect(commitmentStat(exercise(), list, TODAY)).toEqual({ due: 14, kept: 5, partly: 2, score: 6 / 14 })
    expect(strugglingToCommit(exercise(), list, TODAY)).toBe(true)
  })

  it('kept more than half the time is fine', () => {
    expect(strugglingToCommit(exercise(), days(Array(8).fill('good')), TODAY)).toBe(false)
  })

  it('only counts the days it is due (3 days a week)', () => {
    const mwf = exercise({ schedule_days: [1, 3, 5] }) // window has 6 Mon/Wed/Fri
    const list = days(Array(14).fill('good')).filter((c) => [1, 3, 5].includes(new Date(c.date + 'T12:00:00Z').getUTCDay()))
    expect(commitmentStat(mwf, list, TODAY)).toMatchObject({ due: 6, kept: 6, score: 1 })
    expect(strugglingToCommit(mwf, [{ habit_id: 'ex', date: '2026-10-26', outcome: 'bad' }], TODAY)).toBe(true) // skipped Monday, missed the rest
    expect(strugglingToCommit(mwf, [], TODAY)).toBe(false) // Monday (last night) can still be caught up: 5 due days
  })

  it('last night can still be caught up', () => {
    const list = days(Array(13).fill('good'), 'ex', '2026-10-25')
    expect(commitmentStat(exercise(), list, TODAY)).toMatchObject({ due: 13, kept: 13 })
  })

  it('does not apply to habits you avoid, scores, new habits or too few due days', () => {
    expect(commitmentStat(exercise({ type: 'avoid' }), [], TODAY)).toBeNull()
    expect(commitmentStat(exercise({ type: 'scale' }), [], TODAY)).toBeNull()
    expect(commitmentStat(exercise({ start_date: '2026-10-20' }), [], TODAY)).toBeNull()
    expect(commitmentStat(exercise({ schedule_days: [6] }), [], TODAY)).toBeNull() // only 2 Saturdays
  })

  it('time and amount habits are commitments too', () => {
    expect(strugglingToCommit(exercise({ type: 'time' }), days(Array(14).fill('bad')), TODAY)).toBe(true)
    expect(strugglingToCommit(exercise({ type: 'amount' }), days(Array(14).fill('bad')), TODAY)).toBe(true)
  })

  it('a check-in without a visible result counts as kept (what a group sees for "check-in only")', () => {
    expect(strugglingToCommit(exercise(), days(Array(14).fill(null)), TODAY)).toBe(false)
  })
})

describe('commitmentSnoozed', () => {
  const now = new Date('2026-10-27T12:00:00Z')
  const at = (daysAgo: number) => new Date(now.getTime() - daysAgo * 86400000).toISOString()
  it('"I need to change" waits two weeks, "I\'ll pray about it" three days', () => {
    expect(commitmentSnoozed([{ habit_id: 'ex', answer: 'change', created_at: at(13) }], 'ex', now)).toBe(true)
    expect(commitmentSnoozed([{ habit_id: 'ex', answer: 'change', created_at: at(15) }], 'ex', now)).toBe(false)
    expect(commitmentSnoozed([{ habit_id: 'ex', answer: 'pray', created_at: at(2) }], 'ex', now)).toBe(true)
    expect(commitmentSnoozed([{ habit_id: 'ex', answer: 'pray', created_at: at(4) }], 'ex', now)).toBe(false)
    expect(commitmentSnoozed([{ habit_id: 'other', answer: 'change', created_at: at(1) }], 'ex', now)).toBe(false)
  })
})

describe('planCommitmentPrompts', () => {
  const people = [
    { id: 'henro', name: 'Henro', today: TODAY },
    { id: 'jesse', name: 'Jesse', today: TODAY },
  ]
  const base = {
    recipients: people.map((p) => ({ ...p, self: true, group: true })),
    people,
    members: [{ group_id: 'g', user_id: 'henro' }, { group_id: 'g', user_id: 'jesse' }],
    habits: [{ ...exercise(), user_id: 'henro' }],
    checkins: days(Array(14).fill('bad')).map((c) => ({ ...c, user_id: 'henro' })),
    shares: [{ habit_id: 'ex', group_id: 'g', visibility: 'result' as const }],
    answers: [],
    now: new Date('2026-10-27T10:00:00Z'),
    already: [] as SupportPrompt[],
  }

  it('asks the person, and tells the group without naming the habit', () => {
    const plan = planCommitmentPrompts(base)
    expect(plan.map((p) => [p.user_id, p.kind, p.ref])).toEqual([
      ['henro', 'commit_self', '2026-10-26'],
      ['jesse', 'commit:henro', 'g:2026-10-26'],
    ])
    expect(plan[1].body).toContain('Henro has found it hard to keep one of their commitments')
    expect(plan.map((p) => p.body).join(' ')).not.toContain('ex')
  })

  it('the group only sees habits shared with it', () => {
    const plan = planCommitmentPrompts({ ...base, shares: [] })
    expect(plan.map((p) => p.user_id)).toEqual(['henro'])
  })

  it('not again to the person after they answered, and not on top of a support prompt', () => {
    const answered = planCommitmentPrompts({ ...base, answers: [{ user_id: 'henro', habit_id: 'ex', answer: 'change', created_at: '2026-10-25T08:00:00Z' }] })
    expect(answered.map((p) => p.kind)).toEqual(['commit:henro'])
    const support = [
      { user_id: 'henro', kind: 'support_self', ref: '2026-10-26' },
      { user_id: 'jesse', kind: 'support:henro', ref: 'g:2026-10-26' },
    ] as SupportPrompt[]
    expect(planCommitmentPrompts({ ...base, already: support })).toEqual([])
  })
})
