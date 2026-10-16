import { describe, expect, it } from 'vitest'
import { habitKey, habitPot, potIsHard } from '../src/lib/pot'
import type { GroupOverview, SharedCheckin, SharedHabit } from '../src/lib/groups'

const today = '2026-10-16'
const member = (user_id: string, display_name: string) =>
  ({ user_id, display_name, role: 'member' as const, joined_at: '2026-10-01T00:00:00Z', today, last_checkin_date: null, checked_in_today: null })
const habit = (id: string, user_id: string, name: string, visibility: SharedHabit['visibility'] = 'notes'): SharedHabit =>
  ({ id, user_id, name, icon: '📵', type: 'avoid', schedule_days: [0, 1, 2, 3, 4, 5, 6], start_date: '2026-10-01', outcome_options: {}, unit: null, visibility })
const ck = (habit_id: string, user_id: string, date: string, outcome: SharedCheckin['outcome']): SharedCheckin =>
  ({ id: `${habit_id}-${date}`, habit_id, user_id, date, outcome, value_number: null, value_time: null, tags: [], note: null, updated_at: '' })

describe('potIsHard', () => {
  const cat = (good: number, mid: number, bad: number, missed: number) =>
    ({ key: 'k', name: 'K', icon: '', people: [], good, mid, bad, checkedIn: 0, missed })
  it('goes by the answers, not by missed check-ins', () => {
    expect(potIsHard(cat(2, 0, 0, 5))).toBe(false) // too few answers to say
    expect(potIsHard(cat(3, 0, 0, 10))).toBe(false)
    expect(potIsHard(cat(1, 0, 3, 0))).toBe(true)
  })
})

describe('habitKey', () => {
  it('ignores case, spaces and punctuation', () => {
    expect(habitKey('No Short-form Video')).toBe(habitKey(' no short form video'))
    expect(habitKey('Quiet Time')).not.toBe(habitKey('Purity'))
  })
})

describe('habitPot', () => {
  const o: GroupOverview = {
    group: { id: 'g', name: 'G', invite_code: 'X', is_admin: false },
    members: [member('a', 'Henro'), member('b', 'Jesse'), member('c', 'Jared')],
    habits: [
      habit('a1', 'a', 'No Short-form Video'), habit('b1', 'b', 'no short-form video'), habit('c1', 'c', 'No Short-form Video', 'checkin'),
      habit('a2', 'a', 'Quiet Time'),
    ],
    checkins: [
      ck('a1', 'a', '2026-10-15', 'bad'), ck('a1', 'a', '2026-10-14', 'bad'), ck('a1', 'a', '2026-10-16', 'good'),
      ck('b1', 'b', '2026-10-15', 'mid'),
      ck('c1', 'c', '2026-10-15', null),
      ...['10', '11', '12', '13', '14', '15'].map((d) => ck('a2', 'a', `2026-10-${d}`, 'good' as const)),
    ],
  }
  const pot = habitPot(o)

  it('puts the same habit from different people together, most-shared first', () => {
    expect(pot.map((c) => [c.name, c.people.map((p) => p.name)])).toEqual([
      ['No Short-form Video', ['Henro', 'Jesse', 'Jared']],
      ['Quiet Time', ['Henro']],
    ])
  })

  it('counts the last 7 days; today only once checked in; check-in-only stays private', () => {
    const v = pot[0]
    // Henro: 2 bad + 1 good (today) + 4 missed; Jesse: 1 mid + 5 missed; Jared: 1 checked in + 5 missed
    expect([v.good, v.mid, v.bad, v.checkedIn, v.missed]).toEqual([1, 1, 2, 1, 14])
    expect(potIsHard(v)).toBe(true) // 1 good, 1 mixed, 2 hard: the missed days don't count either way
    expect(potIsHard(pot[1])).toBe(false)
  })
})
