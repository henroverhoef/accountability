// Everything to do with groups talks to the database through these functions.
import { supabase } from './supabase'
import type { HabitType, Outcome } from './logic'
import type { OutcomeLabels } from './types'

export type Visibility = 'private' | 'checkin' | 'result' | 'notes'

export const VISIBILITY_LABELS: Record<Visibility, string> = {
  private: 'Private',
  checkin: 'Check-in only',
  result: 'Result',
  notes: 'Result + notes (default)',
}

export const VISIBILITY_HELP: Record<Visibility, string> = {
  private: 'The group sees nothing about this habit.',
  checkin: 'The group sees that you checked in, not how it went.',
  result: 'The group sees how it went and your streak.',
  notes: 'The group also sees your tags and notes.',
}

export interface Group {
  id: string
  name: string
  invite_code: string
}

export interface GroupMember {
  user_id: string
  display_name: string
  role: 'admin' | 'member'
  joined_at: string
  today: string
  last_checkin_date: string | null
  checked_in_today: boolean | null // null = nothing due today
}

export interface SharedHabit {
  id: string
  user_id: string
  name: string
  icon: string
  type: HabitType
  schedule_days: number[]
  start_date: string
  outcome_options: OutcomeLabels
  unit: string | null
  question?: string | null
  visibility: Exclude<Visibility, 'private'>
}

export interface SharedCheckin {
  id: string
  habit_id: string
  user_id: string
  date: string
  outcome: Outcome | null // null when shared as "check-in only"
  value_number: number | null
  value_time: string | null
  tags: string[]
  note: string | null
  created_at?: string // when first saved (to spot "caught up the next morning")
  updated_at: string
}

export interface GroupOverview {
  group: Group & { is_admin: boolean }
  members: GroupMember[]
  habits: SharedHabit[]
  checkins: SharedCheckin[]
}

export interface Encouragement {
  id: string
  group_id: string
  from_user: string
  to_user: string | null
  checkin_id: string | null
  kind: 'prayer' | 'message' | 'sos' | 'kudos'
  message: string | null
  topic?: string | null // a prayer for the whole group about one shared habit
  from_prayer?: boolean // a word sent after praying (tagged with what the prayer was about)
  reply_to?: string | null // a kudos / prayer / word about this feed message
  created_at: string
}

export interface RecentEncouragement {
  id: string
  group_id: string
  group_name: string
  from_name: string
  kind: Encouragement['kind']
  message: string | null
  to_me: boolean
  checkin_id: string | null // which of MY check-ins a prayer or kudos was about
  created_at: string
}

async function unwrap<T>(p: PromiseLike<{ data: T | null; error: unknown }>): Promise<T> {
  const { data, error } = await p
  if (error) throw error
  return data as T
}

export const listMyGroups = () => unwrap<Group[]>(supabase.from('groups').select('id, name, invite_code').order('created_at'))
export const createGroup = (name: string) => unwrap<Group>(supabase.rpc('create_group', { p_name: name }))
export const joinGroup = (code: string) => unwrap<string>(supabase.rpc('join_group', { p_code: code }))
export const getOverview = (groupId: string) => unwrap<GroupOverview>(supabase.rpc('group_overview', { gid: groupId }))
export const regenerateCode = (groupId: string) => unwrap<string>(supabase.rpc('regenerate_invite_code', { gid: groupId }))
export const renameGroup = (groupId: string, name: string) => unwrap(supabase.from('groups').update({ name }).eq('id', groupId))
export const removeMember = (groupId: string, userId: string) =>
  unwrap(supabase.from('group_members').delete().eq('group_id', groupId).eq('user_id', userId))

/** The group feed: messages and SOS (kudos and prayers show on the check-ins instead). */
export const listEncouragements = (groupId: string) =>
  unwrap<Encouragement[]>(supabase.from('encouragements').select('*').eq('group_id', groupId).in('kind', ['message', 'sos'])
    .order('created_at', { ascending: false }).limit(50))

/** Kudos and prayers in a group over the last few weeks (shown as 🙏 2 / 👏 3 labels). */
export const listReactions = (groupId: string) =>
  unwrap<Encouragement[]>(supabase.from('encouragements').select('*').eq('group_id', groupId).in('kind', ['prayer', 'kudos'])
    .gte('created_at', new Date(Date.now() - 45 * 86400000).toISOString()).order('created_at', { ascending: false }).limit(1000))

// ---------- "I've called / had coffee with them" ----------------------------------
// When someone could use support, the group notes who followed up. The database never
// sends these to the person they're about.

export type FollowUpKind = 'call' | 'coffee'

export interface FollowUp {
  id: string
  group_id: string
  about_user: string
  from_user: string
  kind: FollowUpKind
  created_at: string
}

/** Days a call or coffee counts as "followed up" (a new week, a new nudge). */
export const FOLLOW_UP_DAYS = 7

export const listFollowUps = (groupId: string) =>
  unwrap<FollowUp[]>(supabase.from('support_followups').select('*').eq('group_id', groupId)
    .gte('created_at', new Date(Date.now() - FOLLOW_UP_DAYS * 86400000).toISOString()).order('created_at'))

export const addFollowUp = (groupId: string, aboutUser: string, kind: FollowUpKind) =>
  unwrap(supabase.from('support_followups').insert({ group_id: groupId, about_user: aboutUser, kind }))

export const removeFollowUp = (id: string) => unwrap(supabase.from('support_followups').delete().eq('id', id))

export const recentEncouragements = (limit = 3) => unwrap<RecentEncouragement[]>(supabase.rpc('recent_for_me', { p_limit: limit }))

export function sendEncouragement(e: {
  group_id: string; kind: Encouragement['kind']; to_user?: string | null; checkin_id?: string | null; message?: string | null; topic?: string | null
  from_prayer?: boolean; reply_to?: string | null
}) {
  return unwrap(supabase.from('encouragements').insert({ ...e, message: e.message?.trim() || null }))
}

/** My sharing choices: habit id -> group id -> visibility. */
export async function listMyShares(): Promise<{ habit_id: string; group_id: string; visibility: Visibility }[]> {
  return unwrap(supabase.from('habit_shares').select('habit_id, group_id, visibility'))
}

export async function setShare(habitId: string, groupId: string, visibility: Visibility) {
  if (visibility === 'private') {
    return unwrap(supabase.from('habit_shares').delete().eq('habit_id', habitId).eq('group_id', groupId))
  }
  return unwrap(supabase.from('habit_shares').upsert({ habit_id: habitId, group_id: groupId, visibility }, { onConflict: 'habit_id,group_id' }))
}

export function inviteLink(code: string) {
  return `${window.location.origin}${import.meta.env.BASE_URL}#/join/${code}`
}

// ---------- "I'll set aside time to pray later" -----------------------------------
// Private to you (RLS); the server sends a notification at remind_at. That's all: there's
// nothing to tick off afterwards.

export interface PrayerReminder {
  id: string
  group_id: string | null
  who: string // "Jesse" / "the group"
  what: string | null // "Purity"
  link: string | null
  remind_at: string
  sent_at: string | null
  // What the prayer is about, so a word sent from the planned moment is tagged the same way.
  to_user: string | null // null = the whole group
  checkin_id: string | null
  topic: string | null
  reply_to: string | null // a feed message
}

export const addPrayerReminder = (r: {
  group_id: string; who: string; what: string | null; link: string | null; remind_at: string
  to_user: string | null; checkin_id: string | null; topic: string | null; reply_to: string | null
}) => unwrap(supabase.from('prayer_reminders').insert(r))

export const getPrayerReminder = (id: string) => unwrap<PrayerReminder>(supabase.from('prayer_reminders').select('*').eq('id', id).single())

/** A word after praying: a personal message (the group's, for a group prayer), tagged with what it was about. */
export const sendPrayerWord = (w: {
  group_id: string; to_user: string | null; checkin_id: string | null; topic: string | null; reply_to?: string | null; message: string
}) => sendEncouragement({ ...w, kind: 'message', from_prayer: true })

/** One message or SOS (if you can see it), e.g. the one a planned prayer is about. */
export const getEncouragement = (id: string) => unwrap<Encouragement>(supabase.from('encouragements').select('*').eq('id', id).single())

/** Times you set aside to pray that are still coming up (or were in the last hour), for Home. */
export const listUpcomingPrayerReminders = () =>
  unwrap<PrayerReminder[]>(supabase.from('prayer_reminders').select('*')
    .gte('remind_at', new Date(Date.now() - 3600000).toISOString()).order('remind_at'))
