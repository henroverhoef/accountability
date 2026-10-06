// Decides WHICH notifications are due for one user right now.
// Pure function: the Edge Function loads data, calls dueReminders(), then sends.
// The scheduler runs every 5 minutes; a reminder is "due" during the 30 minutes after
// its time, and the notification_log table makes sure each one is only sent once.
import { addDays, localNow, timeToMinutes, weekdayOf } from './dates.ts'
import { isDue, type HabitRules } from './habits.ts'

export const REMINDER_WINDOW_MINUTES = 30

export interface ReminderProfile {
  timezone: string
  checkin_reminder_time: string | null
  nudge_enabled: boolean
  nudge_delay_minutes: number
  morning_nudge_time: string | null
  quiet_start: string | null
  quiet_end: string | null
  notify_reminders: boolean
  notify_weekly?: boolean
}

/** The weekly review notification goes out on Sunday at this local time. */
export const WEEKLY_REVIEW_TIME = '19:00'

export interface ReminderHabit extends HabitRules {
  name: string
  reminder_time: string | null
  wind_down_minutes: number | null
}

export interface PlannedPush {
  kind: string // e.g. "checkin", "nudge", "habit:<id>"
  ref: string // the day it is about; (kind, ref) is unique per user
  title: string
  body: string
  url: string // screen to open when tapped, e.g. "#/checkin"
}

/**
 * A reminder set for `atMinutes` on some day D (minutes after D's midnight; may be
 * negative or ≥ 1440 for "the evening before" / "the next morning").
 * Returns D if that reminder should fire now, otherwise null.
 */
export function firesFor(today: string, nowMinutes: number, atMinutes: number, windowMinutes = REMINDER_WINDOW_MINUTES): string | null {
  for (const k of [-1, 0, 1]) {
    const diff = nowMinutes - (k * 1440 + atMinutes)
    if (diff >= 0 && diff < windowMinutes) return addDays(today, k)
  }
  return null
}

/** Quiet hours may wrap past midnight (e.g. 22:00 → 06:00). */
export function inQuietHours(nowMinutes: number, start: string | null, end: string | null): boolean {
  if (!start || !end) return false
  const s = timeToMinutes(start)
  const e = timeToMinutes(end)
  if (s === e) return false
  return s < e ? nowMinutes >= s && nowMinutes < e : nowMinutes >= s || nowMinutes < e
}

export function dueReminders(
  now: Date,
  profile: ReminderProfile,
  habits: ReminderHabit[],
  checkins: { habit_id: string; date: string }[],
): PlannedPush[] {
  const { date: today, minutes } = localNow(now, profile.timezone)
  if (inQuietHours(minutes, profile.quiet_start, profile.quiet_end)) return []

  const out: PlannedPush[] = []

  if (profile.notify_weekly) {
    const day = firesFor(today, minutes, timeToMinutes(WEEKLY_REVIEW_TIME))
    if (day && weekdayOf(day) === 0) {
      out.push({ kind: 'weekly', ref: day, title: 'Steadfast', body: 'Your week in review is ready', url: '#/summary' })
    }
  }

  if (!profile.notify_reminders) return out

  const active = habits.filter((h) => !h.archived)
  const done = new Set(checkins.map((c) => `${c.habit_id}|${c.date}`))
  const checkedIn = (h: HabitRules, day: string) => done.has(`${h.id}|${day}`)
  const dayComplete = (day: string) => active.filter((h) => isDue(h, day)).every((h) => checkedIn(h, day))
  const checkinUrl = (day: string) => (day === today ? '#/checkin' : `#/checkin?day=${day}`)

  if (profile.checkin_reminder_time) {
    const at = timeToMinutes(profile.checkin_reminder_time)
    const day = firesFor(today, minutes, at)
    if (day && !dayComplete(day)) {
      out.push({ kind: 'checkin', ref: day, title: 'Steadfast', body: 'Time for your evening check-in', url: checkinUrl(day) })
    }
    if (profile.nudge_enabled) {
      const nudgeDay = firesFor(today, minutes, at + profile.nudge_delay_minutes)
      if (nudgeDay && !dayComplete(nudgeDay)) {
        out.push({ kind: 'nudge', ref: nudgeDay, title: 'Steadfast', body: 'Your check-in is still open. It only takes 30 seconds.', url: checkinUrl(nudgeDay) })
      }
    }
  }

  if (profile.nudge_enabled && profile.morning_nudge_time) {
    // Fires the morning AFTER day D, about day D.
    const day = firesFor(today, minutes, 1440 + timeToMinutes(profile.morning_nudge_time))
    if (day && !dayComplete(day)) {
      out.push({ kind: 'morning', ref: day, title: 'Good morning', body: 'Missed last night? You can still check in for yesterday.', url: checkinUrl(day) })
    }
  }

  for (const h of active) {
    if (h.reminder_time) {
      const day = firesFor(today, minutes, timeToMinutes(h.reminder_time))
      if (day && isDue(h, day) && !checkedIn(h, day)) {
        // Never put the name of an "avoid" habit in a notification (discretion).
        const body = h.type === 'avoid' ? 'A gentle reminder from Steadfast' : `Reminder: ${h.name}`
        out.push({ kind: `habit:${h.id}`, ref: day, title: 'Steadfast', body, url: checkinUrl(day) })
      }
    }
    if (h.type === 'time' && h.target_time && h.wind_down_minutes) {
      const day = firesFor(today, minutes, timeToMinutes(h.target_time) - h.wind_down_minutes)
      if (day && isDue(h, day) && !checkedIn(h, day)) {
        out.push({ kind: `winddown:${h.id}`, ref: day, title: 'Steadfast', body: 'Time to start winding down 🌙', url: '#/' })
      }
    }
  }
  return out
}
