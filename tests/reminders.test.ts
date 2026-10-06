import { describe, expect, it } from 'vitest'
import { dueReminders, firesFor, inQuietHours, type ReminderHabit, type ReminderProfile } from '../supabase/functions/_shared/logic/reminders'
import { localNow } from '../supabase/functions/_shared/logic/dates'

const profile: ReminderProfile = {
  timezone: 'Africa/Johannesburg', // UTC+2, no daylight saving
  checkin_reminder_time: '21:30:00',
  nudge_enabled: true,
  nudge_delay_minutes: 60,
  morning_nudge_time: '07:30:00',
  quiet_start: null,
  quiet_end: null,
  notify_reminders: true,
}
const habit: ReminderHabit = {
  id: 'h1', name: 'Quiet Time', type: 'done', schedule_days: [0, 1, 2, 3, 4, 5, 6], start_date: '2026-01-01', archived: false,
  reminder_time: null, wind_down_minutes: null,
}
const kinds = (now: string, p = profile, habits = [habit], checkins: { habit_id: string; date: string }[] = []) =>
  dueReminders(new Date(now), p, habits, checkins).map((r) => `${r.kind}@${r.ref}`)

describe('localNow (timezones)', () => {
  it('converts UTC to the user’s local day and time', () => {
    expect(localNow(new Date('2026-10-06T22:30:00Z'), 'Africa/Johannesburg')).toEqual({ date: '2026-10-07', minutes: 30 })
    expect(localNow(new Date('2026-10-06T22:30:00Z'), 'America/New_York')).toEqual({ date: '2026-10-06', minutes: 18 * 60 + 30 })
  })
  it('handles daylight saving (London is UTC+1 in summer, UTC+0 in winter)', () => {
    expect(localNow(new Date('2026-07-01T20:30:00Z'), 'Europe/London').minutes).toBe(21 * 60 + 30)
    expect(localNow(new Date('2026-12-01T20:30:00Z'), 'Europe/London').minutes).toBe(20 * 60 + 30)
  })
  it('falls back to Johannesburg for an unknown timezone', () => {
    expect(localNow(new Date('2026-10-06T10:00:00Z'), 'Not/AZone').minutes).toBe(12 * 60)
  })
})

describe('firesFor', () => {
  it('fires during the 30 minutes after the time', () => {
    expect(firesFor('2026-10-06', 21 * 60 + 30, 21 * 60 + 30)).toBe('2026-10-06')
    expect(firesFor('2026-10-06', 21 * 60 + 59, 21 * 60 + 30)).toBe('2026-10-06')
    expect(firesFor('2026-10-06', 22 * 60, 21 * 60 + 30)).toBeNull()
    expect(firesFor('2026-10-06', 21 * 60 + 29, 21 * 60 + 30)).toBeNull()
  })
  it('handles reminders that spill past midnight (about the previous day)', () => {
    // 23:30 reminder + 60 min nudge = 00:30 the next day, still about the 6th.
    expect(firesFor('2026-10-07', 35, 23 * 60 + 30 + 60)).toBe('2026-10-06')
  })
  it('handles times before midnight of the day (wind-down for a 00:30 target)', () => {
    expect(firesFor('2026-10-06', 23 * 60 + 35, 30 - 60)).toBe('2026-10-07')
  })
})

describe('quiet hours', () => {
  it('wraps around midnight', () => {
    expect(inQuietHours(23 * 60, '22:00', '06:00')).toBe(true)
    expect(inQuietHours(5 * 60, '22:00', '06:00')).toBe(true)
    expect(inQuietHours(12 * 60, '22:00', '06:00')).toBe(false)
  })
  it('works within one day', () => {
    expect(inQuietHours(13 * 60, '12:00', '14:00')).toBe(true)
    expect(inQuietHours(14 * 60, '12:00', '14:00')).toBe(false)
  })
})

describe('dueReminders', () => {
  it('sends the evening check-in reminder at 21:30 local time (19:30 UTC in Johannesburg)', () => {
    expect(kinds('2026-10-06T19:30:00Z')).toEqual(['checkin@2026-10-06'])
    expect(kinds('2026-10-06T19:25:00Z')).toEqual([])
  })
  it('uses the user’s timezone (New York 21:30 = 01:30 UTC the next day)', () => {
    expect(kinds('2026-10-07T01:30:00Z', { ...profile, timezone: 'America/New_York' })).toEqual(['checkin@2026-10-06'])
  })
  it('skips the reminder if already checked in', () => {
    expect(kinds('2026-10-06T19:30:00Z', profile, [habit], [{ habit_id: 'h1', date: '2026-10-06' }])).toEqual([])
  })
  it('nudges an hour later if still not checked in', () => {
    expect(kinds('2026-10-06T20:35:00Z')).toEqual(['nudge@2026-10-06'])
    expect(kinds('2026-10-06T20:35:00Z', { ...profile, nudge_enabled: false })).toEqual([])
  })
  it('sends a morning nudge about yesterday if it was missed', () => {
    expect(kinds('2026-10-07T05:30:00Z')).toEqual(['morning@2026-10-06'])
    expect(kinds('2026-10-07T05:30:00Z', profile, [habit], [{ habit_id: 'h1', date: '2026-10-06' }])).toEqual([])
  })
  it('respects quiet hours and the master switch', () => {
    expect(kinds('2026-10-06T19:30:00Z', { ...profile, quiet_start: '21:00', quiet_end: '06:00' })).toEqual([])
    expect(kinds('2026-10-06T19:30:00Z', { ...profile, notify_reminders: false })).toEqual([])
  })
  it('sends per-habit reminders only on scheduled days, without naming avoid habits', () => {
    const qt = { ...habit, reminder_time: '06:00' }
    const avoid: ReminderHabit = { ...habit, id: 'h2', name: 'Secret', type: 'avoid', reminder_time: '06:00' }
    const r = dueReminders(new Date('2026-10-06T04:00:00Z'), profile, [qt, avoid], [])
    expect(r.map((x) => x.kind)).toEqual(['habit:h1', 'habit:h2'])
    expect(r[0].body).toContain('Quiet Time')
    expect(r[1].body).not.toContain('Secret')
    // 2026-10-06 is a Tuesday; a weekend-only habit is not reminded.
    expect(kinds('2026-10-06T04:00:00Z', profile, [{ ...qt, schedule_days: [0, 6] }])).toEqual([])
  })
  it('sends a wind-down reminder before a bedtime target', () => {
    const bed: ReminderHabit = { ...habit, id: 'b', type: 'time', target_time: '22:30:00', wind_down_minutes: 30 }
    // 22:00 local = 20:00 UTC; the daily check-in nudge isn't due then.
    expect(kinds('2026-10-06T20:00:00Z', { ...profile, checkin_reminder_time: null }, [bed])).toEqual(['winddown:b@2026-10-06'])
  })
  it('does not remind about a day with nothing due', () => {
    expect(kinds('2026-10-06T19:30:00Z', profile, [{ ...habit, schedule_days: [0] }])).toEqual([])
  })
})
