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

/** Make a new personal login code (any older code stops working). */
export async function createLoginCode(): Promise<string> {
  const { data, error } = await supabase.functions.invoke('login', { body: { action: 'create' } })
  if (error) throw new Error(await functionError(error))
  return (data as { code: string }).code
}

/** Sign in on this phone with a login code from another phone. */
export async function signInWithLoginCode(code: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('login', { body: { action: 'redeem', code } })
  if (error) throw new Error(await functionError(error))
  const { error: verifyError } = await supabase.auth.verifyOtp({ token_hash: (data as { token_hash: string }).token_hash, type: 'magiclink' })
  if (verifyError) throw verifyError
}

/** Edge Function errors hide the message in the response body. */
async function functionError(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response }).context
  try {
    const body = await ctx?.json()
    if (body?.error) return body.error
  } catch {
    /* not JSON */
  }
  return error instanceof Error ? error.message : String(error)
}
