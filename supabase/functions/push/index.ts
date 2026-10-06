// Edge Function "push": sends all of Steadfast's notifications.
//
//   {"type":"tick"}   – every 5 minutes from pg_cron: reminders, nudges, wind-down …
//   {"type":"encouragement","id":…} – from a database trigger when someone prays,
//                     sends a message or asks for help (SOS)
//   {"type":"test"}   – from the Settings screen: "Send test notification" to yourself
//   {"type":"config"} – returns the public notification key the app needs to subscribe
//
// tick/encouragement requests must carry the x-cron-secret header (a random secret the
// function created itself and stored in app_secrets; the scheduler reads it from there).
// test requests must carry the signed-in user's token (Authorization: Bearer …).
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { addDays, localNow } from '../_shared/logic/dates.ts'
import { dueReminders, inQuietHours, type ReminderHabit, type ReminderProfile } from '../_shared/logic/reminders.ts'
import { claimNotification, sendToUser } from '../_shared/sender.ts'
import { getServerConfig } from '../_shared/config.ts'
import { cors, json, signedInUser } from '../_shared/auth.ts'
import type { VapidKeys } from '../_shared/logic/webpush.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const body = await req.json().catch(() => ({}))
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
    const { vapid, cronSecret } = await getServerConfig(admin)
    const fromCron = req.headers.get('x-cron-secret') === cronSecret

    if (body.type === 'config') return json({ vapidPublicKey: vapid.publicKey })

    if (body.type === 'tick') {
      if (!fromCron) return json({ error: 'forbidden' }, 403)
      return json(await tick(admin, vapid))
    }

    if (body.type === 'encouragement') {
      if (!fromCron) return json({ error: 'forbidden' }, 403)
      return json(await encouragement(admin, vapid, String(body.id)))
    }

    if (body.type === 'test') {
      const user = await signedInUser(req)
      if (!user) return json({ error: 'not signed in' }, 401)
      const sent = await sendToUser(admin, vapid, user.id, {
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

/** Someone prayed, sent a message or asked for help: notify the right people. */
async function encouragement(admin: SupabaseClient, vapid: VapidKeys, id: string) {
  const { data: e, error } = await admin.from('encouragements').select('*').eq('id', id).single()
  if (error || !e) return { sent: 0, error: 'not found' }

  const { data: members } = await admin.from('group_members').select('user_id').eq('group_id', e.group_id)
  const memberIds = (members ?? []).map((m) => m.user_id as string)
  const recipients = e.to_user ? [e.to_user as string] : memberIds.filter((u) => u !== e.from_user)
  const { data: profiles } = await admin.from('profiles').select('*').in('id', [...recipients, e.from_user])
  const byId = new Map((profiles ?? []).map((p) => [p.id as string, p]))
  const name = byId.get(e.from_user)?.display_name || 'Someone'

  // Keep the text generic: it may show on a lock screen.
  const body =
    e.kind === 'sos'
      ? `${name} is asking for prayer and support right now`
      : e.kind === 'prayer'
        ? `${name} is praying for you 🙏`
        : e.to_user
          ? `${name} sent you some encouragement`
          : `${name} shared something with your group`

  const now = new Date()
  let sent = 0
  for (const uid of recipients) {
    const p = byId.get(uid)
    if (!p || !memberIds.includes(uid)) continue
    if (e.kind === 'sos') {
      if (!p.notify_sos) continue // SOS ignores quiet hours on purpose
    } else {
      if (!p.notify_encouragement) continue
      if (inQuietHours(localNow(now, p.timezone).minutes, p.quiet_start, p.quiet_end)) continue
    }
    if (!(await claimNotification(admin, uid, 'encouragement', id))) continue
    sent += await sendToUser(admin, vapid, uid, {
      title: e.kind === 'sos' ? 'Steadfast 🙏' : 'Steadfast',
      body,
      url: `#/groups/${e.group_id}`,
      tag: e.kind === 'sos' ? `sos-${id}` : 'encouragement',
    })
  }
  return { sent }
}
