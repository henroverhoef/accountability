// Server settings that set themselves up: the first time the push function runs it
// creates notification (VAPID) keys and a scheduler secret and saves them in the
// server-only app_secrets table. Optional overrides: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY /
// VAPID_SUBJECT Edge Function secrets.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { b64urlEncode, generateVapidKeys, type VapidKeys } from './logic/webpush.ts'

export interface ServerConfig {
  vapid: VapidKeys
  cronSecret: string
}

async function readAll(admin: SupabaseClient): Promise<Map<string, string>> {
  const { data, error } = await admin.from('app_secrets').select('name, value')
  if (error) throw error
  return new Map((data ?? []).map((r) => [r.name as string, r.value as string]))
}

export async function getServerConfig(admin: SupabaseClient): Promise<ServerConfig> {
  let values = await readAll(admin)
  const missing: { name: string; value: string }[] = []

  if (!values.has('vapid_public') || !values.has('vapid_private')) {
    const keys = await generateVapidKeys()
    missing.push({ name: 'vapid_public', value: keys.publicKey }, { name: 'vapid_private', value: keys.privateKey })
  }
  if (!values.has('cron_secret')) {
    missing.push({ name: 'cron_secret', value: b64urlEncode(crypto.getRandomValues(new Uint8Array(32))) })
  }
  const pushUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/push`
  if (values.get('push_url') !== pushUrl) {
    await admin.from('app_secrets').upsert({ name: 'push_url', value: pushUrl, updated_at: new Date().toISOString() })
  }
  if (missing.length) {
    // ignoreDuplicates: if two requests race, the first one wins and both read it back.
    await admin.from('app_secrets').upsert(missing, { onConflict: 'name', ignoreDuplicates: true })
    values = await readAll(admin)
  }

  const envPublic = Deno.env.get('VAPID_PUBLIC_KEY')
  const envPrivate = Deno.env.get('VAPID_PRIVATE_KEY')
  return {
    vapid: {
      publicKey: envPublic && envPrivate ? envPublic : values.get('vapid_public')!,
      privateKey: envPublic && envPrivate ? envPrivate : values.get('vapid_private')!,
      subject: Deno.env.get('VAPID_SUBJECT') || 'mailto:steadfast@users.noreply.github.com',
    },
    cronSecret: values.get('cron_secret')!,
  }
}
