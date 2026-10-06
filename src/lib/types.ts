import type { HabitType, Outcome } from './logic'

export interface Profile {
  id: string
  display_name: string
  timezone: string
  checkin_reminder_time: string
  nudge_enabled: boolean
  nudge_delay_minutes: number
  morning_nudge_time: string
  onboarded: boolean
  quiet_start: string | null
  quiet_end: string | null
  notify_reminders: boolean
  notify_encouragement: boolean
  notify_sos: boolean
  notify_weekly: boolean
}

export type OutcomeLabels = Partial<Record<Outcome, string>>

export interface Habit {
  id: string
  user_id: string
  name: string
  icon: string
  type: HabitType
  schedule_days: number[]
  start_date: string
  target_value: number | null
  target_direction: 'at_least' | 'at_most' | null
  target_time: string | null
  grace_minutes: number
  unit: string | null
  outcome_options: OutcomeLabels
  tags: string[]
  reminder_time: string | null
  wind_down_minutes: number | null
  archived: boolean
  sort_order: number
}

export interface Checkin {
  id?: string
  habit_id: string
  user_id?: string
  date: string
  outcome: Outcome
  value_number: number | null
  value_time: string | null
  tags: string[]
  note: string | null
  updated_at?: string
}
