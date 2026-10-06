// Server-side helpers for sending notifications to a user's devices.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { sendWebPush, type VapidKeys } from './logic/webpush.ts'

export interface PushMessage {
  title: string
  body: string
  url: string // e.g. "#/checkin"
  tag?: string // same tag replaces an older notification instead of stacking
}

/** Send to every device of one user. Removes devices that no longer exist. Returns how many succeeded. */
export async function sendToUser(admin: SupabaseClient, vapid: VapidKeys, userId: string, msg: PushMessage): Promise<number> {
  const { data: subs, error } = await admin.from('push_subscriptions').select('id, endpoint, keys').eq('user_id', userId)
  if (error) throw error
  let sent = 0
  for (const sub of subs ?? []) {
    try {
      const status = await sendWebPush({ endpoint: sub.endpoint, keys: sub.keys }, msg, vapid)
      if (status === 404 || status === 410) {
        await admin.from('push_subscriptions').delete().eq('id', sub.id) // phone unsubscribed / app removed
      } else if (status >= 200 && status < 300) {
        sent++
      } else {
        console.warn(`push to ${new URL(sub.endpoint).host} failed with ${status}`)
      }
    } catch (e) {
      console.warn('push error', e)
    }
  }
  return sent
}

/**
 * Record (user, kind, ref) in notification_log. Returns false if it was already there,
 * which means this notification was sent before and must not be sent again.
 */
export async function claimNotification(admin: SupabaseClient, userId: string, kind: string, ref: string): Promise<boolean> {
  const { data, error } = await admin
    .from('notification_log')
    .upsert({ user_id: userId, kind, ref }, { onConflict: 'user_id,kind,ref', ignoreDuplicates: true })
    .select('id')
  if (error) throw error
  return (data?.length ?? 0) > 0
}
