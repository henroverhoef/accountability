import { supabase } from './supabase'

// App owner overview. The database only answers for accounts listed in app_admins
// (see the app_admin_overview migration), and never returns habits, answers or notes.

export interface AdminMember { user_id: string; name: string; role: 'admin' | 'member'; joined_at: string; last_checkin: string | null }
export interface AdminGroup { id: string; name: string; created_at: string; creator: string | null; checkins_7d: number; members: AdminMember[] }
export interface AdminUser {
  user_id: string; name: string; created_at: string; groups: number; habits: number
  last_checkin: string | null; notifications: boolean; login_code: boolean
  last_active?: string // latest of: opened the app, checked in, sent something, joined
  is_admin?: boolean
}
export interface AdminOverview {
  totals: { users: number; groups: number; habits: number; checkins: number; checkins_7d: number; active_users_7d: number; push_users: number }
  groups: AdminGroup[]
  users: AdminUser[]
}

export async function isAppAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_app_admin')
  return !error && data === true
}

export async function getAdminOverview(): Promise<AdminOverview> {
  const { data, error } = await supabase.rpc('admin_overview')
  if (error) throw error
  return data as AdminOverview
}

/** App owner: permanently remove someone's account and everything in it. */
export async function adminDeleteAccount(userId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_delete_account', { p_user: userId })
  if (error) throw error
}
