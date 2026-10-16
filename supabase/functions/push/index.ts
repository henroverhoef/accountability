// Edge Function "push": sends all of Steadfast's notifications.
//
//   {"type":"tick"}   – every 5 minutes from pg_cron: reminders, nudges, wind-down …
//                     prayer reminders people set ("I'll set aside time later"), and once a
//                     day at noon, gentle support prompts (see logic/support.ts)
//   {"type":"encouragement","id":…} – from a database trigger when someone prays,
//                     gives kudos, sends a message or asks for help (SOS)
//   {"type":"test"}   – from the Settings screen: "Send test notification" to yourself
//   {"type":"config"} – returns the public notification key the app needs to subscribe
//
// tick/encouragement requests must carry the x-cron-secret header (a random secret the
// function created itself and stored in app_secrets; the scheduler reads it from there).
// test requests must carry the signed-in user's token (Authorization: Bearer …).
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { addDays, localNow, timeToMinutes } from '../_shared/logic/dates.ts'
import { dueReminders, firesFor, inQuietHours, type ReminderHabit, type ReminderProfile } from '../_shared/logic/reminders.ts'
import { planSupportPrompts } from '../_shared/logic/support.ts'
import { joinNames, prayerMoments } from '../_shared/logic/prayer.ts'
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
  let sent = await prayerReminders(admin, vapid, now)
  if (userIds.length === 0) return { users: 0, sent }

  const utcToday = now.toISOString().slice(0, 10)
  const [profiles, habits, checkins] = await Promise.all([
    admin.from('profiles').select('*').in('id', userIds),
    admin.from('habits').select('*').in('user_id', userIds).eq('archived', false),
    admin.from('checkins').select('user_id, habit_id, date').in('user_id', userIds).gte('date', addDays(utcToday, -3)),
  ])
  if (profiles.error) throw profiles.error
  if (habits.error) throw habits.error
  if (checkins.error) throw checkins.error

  for (const profile of profiles.data ?? []) {
    const mine = (habits.data ?? []).filter((h) => h.user_id === profile.id) as ReminderHabit[]
    const myCheckins = (checkins.data ?? []).filter((c) => c.user_id === profile.id)
    const planned = dueReminders(now, profile as ReminderProfile, mine, myCheckins)

    for (const p of planned) {
      if (!(await claimNotification(admin, profile.id, p.kind, p.ref))) continue // already sent
      sent += await sendToUser(admin, vapid, profile.id, { title: p.title, body: p.body, url: p.url, tag: p.kind })
    }
  }
  sent += await supportPrompts(admin, vapid, now, profiles.data ?? [])
  return { users: userIds.length, sent }
}

/**
 * "I'll set aside a moment to pray later": remind people at the time they picked. Prayers
 * that share a moment get one notification ("Time to pray for Jesse and Jared").
 */
async function prayerReminders(admin: SupabaseClient, vapid: VapidKeys, now: Date) {
  const { data: due, error } = await admin.from('prayer_reminders').select('id, user_id, who, link, remind_at')
    .is('sent_at', null).lte('remind_at', now.toISOString()).limit(200)
  if (error) throw error
  if (!due?.length) return 0
  // Claim them first so each is only ever sent once, even if two runs overlap.
  const { data: claimed, error: claimErr } = await admin.from('prayer_reminders').update({ sent_at: now.toISOString() })
    .in('id', due.map((r) => r.id)).is('sent_at', null).select('id, user_id, who, link, remind_at')
  if (claimErr) throw claimErr

  let sent = 0
  for (const userId of new Set((claimed ?? []).map((r) => r.user_id as string))) {
    for (const moment of prayerMoments((claimed ?? []).filter((r) => r.user_id === userId))) {
      const first = moment.items[0]
      sent += await sendToUser(admin, vapid, userId, {
        title: 'Steadfast 🙏',
        // Names only, never what it's about: it may show on a lock screen.
        body: `Time to pray for ${joinNames(moment.items.map((r) => r.who))}, like you planned`,
        // One prayer: that person's page. Several: Home, which lists them.
        url: moment.items.length === 1 ? `#${first.link || '/'}` : '#/',
        tag: `pray-${userId}-${moment.at}`,
      })
    }
  }
  return sent
}

/** Support prompts go out at this local time (once a week at most per person, see logic/support.ts). */
const SUPPORT_TIME = '12:00'

/** Gentle prompts when someone has had a hard stretch: to them, and to their group. */
async function supportPrompts(admin: SupabaseClient, vapid: VapidKeys, now: Date, profiles: Record<string, any>[]) {
  // Only the people for whom it's prompt time right now (so this runs about once a day per timezone).
  const recipients = profiles.flatMap((p) => {
    const local = localNow(now, p.timezone)
    if (!firesFor(local.date, local.minutes, timeToMinutes(SUPPORT_TIME))) return []
    if (inQuietHours(local.minutes, p.quiet_start, p.quiet_end)) return []
    if (!p.notify_reminders && !p.notify_encouragement) return []
    return [{ id: p.id as string, name: p.display_name as string, today: local.date, self: Boolean(p.notify_reminders), group: Boolean(p.notify_encouragement) }]
  })
  if (recipients.length === 0) return 0

  const ids = recipients.map((r) => r.id)
  const { data: mine, error: mErr } = await admin.from('group_members').select('group_id').in('user_id', ids)
  if (mErr) throw mErr
  const groupIds = [...new Set((mine ?? []).map((m) => m.group_id as string))]
  const { data: members, error: gErr } = groupIds.length
    ? await admin.from('group_members').select('group_id, user_id').in('group_id', groupIds)
    : { data: [], error: null }
  if (gErr) throw gErr
  const peopleIds = [...new Set([...ids, ...(members ?? []).map((m) => m.user_id as string)])]

  const since = addDays(now.toISOString().slice(0, 10), -14)
  const [people, habits, checkins, shares] = await Promise.all([
    admin.from('profiles').select('id, display_name, timezone').in('id', peopleIds),
    admin.from('habits').select('id, user_id, type, schedule_days, start_date, archived').in('user_id', peopleIds).eq('archived', false),
    admin.from('checkins').select('habit_id, user_id, date, outcome').in('user_id', peopleIds).gte('date', since),
    groupIds.length ? admin.from('habit_shares').select('habit_id, group_id, visibility').in('group_id', groupIds) : Promise.resolve({ data: [], error: null }),
  ])
  for (const r of [people, habits, checkins, shares]) if (r.error) throw r.error

  const plan = planSupportPrompts({
    recipients,
    people: (people.data ?? []).map((p) => ({ id: p.id, name: p.display_name, today: localNow(now, p.timezone).date })),
    members: members ?? [],
    habits: habits.data ?? [],
    checkins: checkins.data ?? [],
    shares: shares.data ?? [],
  })
  let sent = 0
  for (const p of plan) {
    if (!(await claimNotification(admin, p.user_id, p.kind, p.ref))) continue // already sent this week
    sent += await sendToUser(admin, vapid, p.user_id, { title: p.title, body: p.body, url: p.url, tag: p.kind })
  }
  return sent
}

/** Someone prayed, gave kudos, sent a message or asked for help: notify the right people. */
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
        ? e.to_user ? `${name} is praying for you 🙏` : `${name} prayed for your group 🙏`
        : e.kind === 'kudos'
          ? `${name} gave you kudos 👏`
          : e.to_user
            ? `${name} sent you a message`
            : `${name} posted a message in your group`

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
      // Messages and SOS open the group's feed; prayers and kudos open your own page in
      // the group, where they show on the check-in they're about.
      // (a prayer for the whole group opens the group's Overview, where it shows on the habit)
      url: e.kind === 'prayer' && !e.to_user ? `#/groups/${e.group_id}?tab=overview`
        : e.kind === 'prayer' || e.kind === 'kudos' ? `#/groups/${e.group_id}/member/${uid}` : `#/groups/${e.group_id}?tab=feed`,
      tag: e.kind === 'sos' ? `sos-${id}` : 'encouragement',
    })
  }
  return { sent }
}
