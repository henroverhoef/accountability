// Edge Function "push": sends all of Steadfast's notifications.
//
//   {"type":"tick"}   – every 5 minutes from pg_cron: reminders, nudges, wind-down …
//   {"type":"test"}   – from the Settings screen: "Send test notification" to yourself
//
// tick requests must carry the x-cron-secret header (the CRON_SECRET secret).
// test requests must carry the signed-in user's token (Authorization: Bearer …).
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { addDays } from '../_shared/logic/dates.ts'
import { dueReminders, type ReminderHabit, type ReminderProfile } from '../_shared/logic/reminders.ts'
import { claimNotification, sendToUser, vapidFromEnv } from '../_shared/sender.ts'
import type { VapidKeys } from '../_shared/logic/webpush.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const CRON_SECRET = Deno.env.get('CRON_SECRET')

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const body = await req.json().catch(() => ({}))
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
    const vapid = vapidFromEnv()
    const fromCron = Boolean(CRON_SECRET) && req.headers.get('x-cron-secret') === CRON_SECRET

    if (body.type === 'tick') {
      if (!fromCron) return json({ error: 'forbidden' }, 403)
      return json(await tick(admin, vapid))
    }

    if (body.type === 'test') {
      const userId = await signedInUser(req)
      if (!userId) return json({ error: 'not signed in' }, 401)
      const sent = await sendToUser(admin, vapid, userId, {
        title: 'Steadfast',
        body: 'Notifications are working 👍',
        url: '#/',
        tag: 'test',
      })
      return json({ sent })
    }

    return json({ error: 'unknown type' }, 400)
  } catch (e) {
    console.error(e)
    return json({ error: String(e instanceof Error ? e.message : e) }, 500)
  }
})

async function signedInUser(req: Request): Promise<string | null> {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return null
  const client = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } })
  const { data } = await client.auth.getUser(token)
  return data.user?.id ?? null
}

/** Every 5 minutes: work out which reminders are due for every user with a device, and send them. */
async function tick(admin: SupabaseClient, vapid: VapidKeys) {
  const now = new Date()
  const { data: subs, error: subErr } = await admin.from('push_subscriptions').select('user_id')
  if (subErr) throw subErr
  const userIds = [...new Set((subs ?? []).map((s) => s.user_id as string))]
  if (userIds.length === 0) return { users: 0, sent: 0 }

  const utcToday = now.toISOString().slice(0, 10)
  const [profiles, habits, checkins] = await Promise.all([
    admin.from('profiles').select('*').in('id', userIds),
    admin.from('habits').select('*').in('user_id', userIds).eq('archived', false),
    admin.from('checkins').select('user_id, habit_id, date').in('user_id', userIds).gte('date', addDays(utcToday, -3)),
  ])
  if (profiles.error) throw profiles.error
  if (habits.error) throw habits.error
  if (checkins.error) throw checkins.error

  let sent = 0
  for (const profile of profiles.data ?? []) {
    const mine = (habits.data ?? []).filter((h) => h.user_id === profile.id) as ReminderHabit[]
    const myCheckins = (checkins.data ?? []).filter((c) => c.user_id === profile.id)
    const planned = dueReminders(now, profile as ReminderProfile, mine, myCheckins)

    for (const p of planned) {
      if (!(await claimNotification(admin, profile.id, p.kind, p.ref))) continue // already sent
      sent += await sendToUser(admin, vapid, profile.id, { title: p.title, body: p.body, url: p.url, tag: p.kind })
    }
  }
  return { users: userIds.length, sent }
}
