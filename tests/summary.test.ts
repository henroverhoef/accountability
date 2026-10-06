import { describe, expect, it } from 'vitest'
import { weekStart, weeklySummary, type HabitRules } from '../src/lib/logic'
import { dueReminders, type ReminderProfile } from '../supabase/functions/_shared/logic/reminders'

const p: HabitRules = { id: 'p', type: 'avoid', schedule_days: [0, 1, 2, 3, 4, 5, 6], start_date: '2026-01-01', archived: false }
const q: HabitRules = { id: 'q', type: 'done', schedule_days: [1, 3, 5], start_date: '2026-01-01', archived: false }

describe('weekStart', () => {
  it('returns the Monday', () => {
    expect(weekStart('2026-10-06')).toBe('2026-10-05') // Tue -> Mon
    expect(weekStart('2026-10-05')).toBe('2026-10-05')
    expect(weekStart('2026-10-11')).toBe('2026-10-05') // Sunday belongs to the week before
  })
})

describe('weeklySummary', () => {
  const checkins = [
    { habit_id: 'p', date: '2026-10-05', outcome: 'good' as const, tags: [] },
    { habit_id: 'p', date: '2026-10-06', outcome: 'mid' as const, tags: ['late night', 'tired'] },
    { habit_id: 'p', date: '2026-10-07', outcome: 'bad' as const, tags: ['late night'] },
    { habit_id: 'q', date: '2026-10-05', outcome: 'good' as const, tags: [] },
    { habit_id: 'q', date: '2026-10-07', outcome: 'bad' as const, tags: ['busy'] },
    { habit_id: 'p', date: '2026-10-12', outcome: 'bad' as const, tags: ['next week'] }, // outside
  ]
  const s = weeklySummary([p, q], checkins, '2026-10-05', '2026-10-08') // Thursday, not checked in yet

  it('counts outcomes and missed days per habit', () => {
    expect(s.habits.find((h) => h.habitId === 'p')).toEqual({ habitId: 'p', due: 4, counts: { good: 1, mid: 1, bad: 1 }, missed: 0 })
    expect(s.habits.find((h) => h.habitId === 'q')).toEqual({ habitId: 'q', due: 2, counts: { good: 1, mid: 0, bad: 1 }, missed: 0 })
  })
  it('counts complete check-in days', () => {
    expect(s.daysSoFar).toBe(4)
    expect(s.checkinDays).toBe(3)
  })
  it('finds the most common tags on hard days', () => {
    expect(s.topTags).toEqual([{ tag: 'late night', count: 2 }, { tag: 'busy', count: 1 }, { tag: 'tired', count: 1 }])
  })
  it('counts past days without a check-in as missed', () => {
    const s2 = weeklySummary([p], [], '2026-10-05', '2026-10-11')
    expect(s2.habits[0].missed).toBe(6) // Sunday (today) is not over yet
  })
})

describe('weekly review notification', () => {
  const profile: ReminderProfile = {
    timezone: 'Africa/Johannesburg', checkin_reminder_time: null, nudge_enabled: false, nudge_delay_minutes: 60,
    morning_nudge_time: null, quiet_start: null, quiet_end: null, notify_reminders: false, notify_weekly: true,
  }
  it('fires on Sunday 19:00 local time only', () => {
    expect(dueReminders(new Date('2026-10-11T17:00:00Z'), profile, [], []).map((r) => r.kind)).toEqual(['weekly'])
    expect(dueReminders(new Date('2026-10-10T17:00:00Z'), profile, [], [])).toEqual([]) // Saturday
    expect(dueReminders(new Date('2026-10-11T17:00:00Z'), { ...profile, notify_weekly: false }, [], [])).toEqual([])
  })
})
