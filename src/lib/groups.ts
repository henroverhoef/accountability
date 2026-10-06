// Everything to do with groups talks to the database through these functions.
import { supabase } from './supabase'
import type { HabitType, Outcome } from './logic'
import type { OutcomeLabels } from './types'

export type Visibility = 'private' | 'checkin' | 'result' | 'notes'

export const VISIBILITY_LABELS: Record<Visibility, string> = {
  private: 'Private',
  checkin: 'Check-in only',
  result: 'Result',
  notes: 'Result + notes',
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
  kind: 'prayer' | 'message' | 'sos'
  message: string | null
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

export const listEncouragements = (groupId: string) =>
  unwrap<Encouragement[]>(supabase.from('encouragements').select('*').eq('group_id', groupId).order('created_at', { ascending: false }).limit(50))

export const recentEncouragements = (limit = 3) => unwrap<RecentEncouragement[]>(supabase.rpc('recent_encouragements', { p_limit: limit }))

export function sendEncouragement(e: { group_id: string; kind: Encouragement['kind']; to_user?: string | null; checkin_id?: string | null; message?: string | null }) {
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
