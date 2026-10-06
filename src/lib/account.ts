// "Export my data" and "Delete my account".
import { supabase } from './supabase'

/** Everything the database will show you about yourself, as one JSON file. */
export async function exportMyData(): Promise<Blob> {
  const tables = ['profiles', 'habits', 'checkins', 'habit_shares', 'groups', 'group_members', 'encouragements', 'push_subscriptions'] as const
  const out: Record<string, unknown> = { exported_at: new Date().toISOString(), app: 'Steadfast' }
  for (const t of tables) {
    const { data, error } = await supabase.from(t).select('*')
    if (error) throw error
    out[t] = data
  }
  return new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' })
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Permanently deletes the account and ALL data (see the phase 4 migration). */
export async function deleteMyAccount() {
  const { error } = await supabase.rpc('delete_my_account')
  if (error) throw error
}
