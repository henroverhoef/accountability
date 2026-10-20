import { useEffect, useRef, useState } from 'react'
import { errorMessage } from './ErrorText'
import PrayerPrompt from './PrayerPrompt'
import { addPrayerReminder, sendEncouragement, sendPrayerWord, type Encouragement, type FollowUp, type SharedCheckin, type SharedHabit } from '../lib/groups'

// Kudos (👏) and prayers (🙏) are shown as small labels on what they're about: a check-in,
// a feed message (reply_to), or next to a person's name for "praying for you" in general.

/** What the reaction pieces need to know about the group. */
export interface Social {
  groupId: string
  me: string
  reactions: Encouragement[] // kudos and prayers in this group, newest first
  followUps: FollowUp[] // calls and coffees this week (never the ones about me)
  nameOf: (uid: string) => string
  onSent: () => void
}

export function reactionsFor(social: Social, checkinId: string): Encouragement[] {
  return social.reactions.filter((r) => r.checkin_id === checkinId)
}

/** Kudos and prayers on one feed message. */
export function reactionsForMessage(social: Social, messageId: string): Encouragement[] {
  return social.reactions.filter((r) => r.reply_to === messageId)
}

/** Prayers for someone "in general" (not about one check-in or message) in the last week. */
export function generalPrayersFor(social: Social, userId: string): Encouragement[] {
  const weekAgo = Date.now() - 7 * 86400000
  return social.reactions.filter((r) => r.kind === 'prayer' && !r.checkin_id && !r.reply_to && r.to_user === userId && Date.parse(r.created_at) > weekAgo)
}

/**
 * What "I prayed" and "I'll set aside time later" do: both record the prayer (so the
 * person sees someone is praying); "later" also sets a private reminder for you.
 * onWord sends what you felt or want to encourage them with, tagged with the prayer.
 */
export function prayActions(social: Social, p: {
  toUser?: string | null; checkinId?: string | null; topic?: string | null; replyTo?: string | null
  who: string; what?: string | null; link: string // for the reminder
}) {
  const about = { to_user: p.toUser ?? null, checkin_id: p.checkinId ?? null, topic: p.topic ?? null, reply_to: p.replyTo ?? null }
  const record = () => sendEncouragement({ group_id: social.groupId, kind: 'prayer', ...about }).then(() => undefined)
  return {
    onPrayed: async () => { await record(); social.onSent() },
    onLater: async (at: Date) => {
      await addPrayerReminder({ group_id: social.groupId, who: p.who, what: p.what ?? null, link: p.link, remind_at: at.toISOString(), ...about })
      await record()
      social.onSent()
    },
    onWord: async (message: string) => {
      await sendPrayerWord({ group_id: social.groupId, ...about, message })
      social.onSent()
    },
  }
}

/** Distinct people per kind, in the order they reacted. */
function people(list: Encouragement[]) {
  const out = { prayer: [] as string[], kudos: [] as string[] }
  for (const r of [...list].reverse()) {
    const arr = r.kind === 'prayer' ? out.prayer : r.kind === 'kudos' ? out.kudos : null
    if (arr && !arr.includes(r.from_user)) arr.push(r.from_user)
  }
  return out
}

/**
 * "🙏 2 👏 3": how many people are praying / gave kudos. Tap to see who.
 * Renders nothing when there's nothing yet, so it takes no space.
 */
export function ReactionLabel({ list, social, general = false }: { list: Encouragement[]; social: Social; general?: boolean }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: Event) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  const who = people(list)
  if (who.prayer.length === 0 && who.kudos.length === 0) return null
  const names = (ids: string[]) => ids.map(social.nameOf).join(', ')
  const summary = [
    who.prayer.length ? `${who.prayer.length} praying` : '',
    who.kudos.length ? `${who.kudos.length} kudos` : '',
  ].filter(Boolean).join(', ')

  return (
    <span ref={ref} className="relative inline-block">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={`${summary}. Show who`}
        className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
        {who.prayer.length > 0 && <span>🙏 {who.prayer.length}</span>}
        {who.kudos.length > 0 && <span>👏 {who.kudos.length}</span>}
      </button>
      {open && (
        <span role="dialog" className="absolute right-0 top-full z-20 mt-1 block w-max max-w-[16rem] space-y-1 rounded-xl border border-slate-200 bg-white p-2 text-left text-xs font-normal shadow-lg dark:border-slate-700 dark:bg-slate-900">
          {who.prayer.length > 0 && <span className="block">🙏 {general ? 'Praying this week' : 'Praying'}: <strong>{names(who.prayer)}</strong></span>}
          {who.kudos.length > 0 && <span className="block">👏 Kudos: <strong>{names(who.kudos)}</strong></span>}
        </span>
      )}
    </span>
  )
}

/**
 * React to one check-in: 👏 kudos when it went well, 🙏 praying when it was hard (after a
 * moment to actually pray). Nothing when the result isn't shared (check-in only).
 * Shows ✓ once you have.
 */
export function CheckinReaction({ checkin, habit, name, social }: { checkin: SharedCheckin; habit: SharedHabit; name: string; social: Social }) {
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [praying, setPraying] = useState(false)
  if (!checkin.outcome) return null
  const kind = checkin.outcome === 'good' ? 'kudos' : 'prayer'
  const done = sent || social.reactions.some((r) => r.checkin_id === checkin.id && r.kind === kind && r.from_user === social.me)
  const icon = kind === 'kudos' ? '👏' : '🙏'
  const label = kind === 'kudos' ? `Give ${name} kudos for ${habit.name}` : `Pray for ${name} about ${habit.name}`

  async function kudos() {
    setBusy(true)
    try {
      await sendEncouragement({ group_id: social.groupId, kind, to_user: checkin.user_id, checkin_id: checkin.id })
      setSent(true)
      social.onSent()
    } catch (e) {
      alert(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const pray = prayActions(social, {
    toUser: checkin.user_id, checkinId: checkin.id, who: name, what: habit.name, link: `/groups/${social.groupId}/member/${checkin.user_id}`,
  })
  const details = (checkin.tags.length > 0 || checkin.note) && (
    <>
      <span className="font-semibold">What {name} shared:</span>
      {checkin.tags.length > 0 && <span className="block">{checkin.tags.join(', ')}</span>}
      {checkin.note && <span className="block whitespace-pre-wrap italic">“{checkin.note}”</span>}
    </>
  )

  return (
    <>
      <button className={`h-10 w-10 shrink-0 rounded-full text-lg ${done ? 'bg-emerald-100 dark:bg-emerald-900/40' : 'bg-slate-100 dark:bg-slate-800'}`}
        aria-label={done ? `${label}: done` : label} title={label} disabled={done || busy}
        onClick={() => (kind === 'kudos' ? kudos() : setPraying(true))}>
        {done ? '✓' : icon}
      </button>
      {praying && (
        <PrayerPrompt subject={`${name}’s ${habit.name}`} who={name} details={details || undefined}
          onPrayed={async () => { await pray.onPrayed(); setSent(true) }}
          onLater={async (at) => { await pray.onLater(at); setSent(true) }}
          onWord={pray.onWord}
          onClose={() => setPraying(false)} />
      )}
    </>
  )
}

/**
 * Under a feed message: "🙏 2 👏 1" (tap for who) and two small buttons. Kudos is one tap;
 * praying opens the same pop-up as everywhere else. No kudos on a cry for help (SOS), and
 * no buttons on your own messages.
 */
export function MessageReactions({ e, social }: { e: Encouragement; social: Social }) {
  const [praying, setPraying] = useState(false)
  const [sent, setSent] = useState<{ kudos?: boolean; prayer?: boolean }>({})
  const list = reactionsForMessage(social, e.id)
  const mine = e.from_user === social.me
  const author = social.nameOf(e.from_user)
  const done = (kind: 'kudos' | 'prayer') => sent[kind] || list.some((r) => r.kind === kind && r.from_user === social.me)
  const snippet = (e.message ?? '').length > 60 ? `${e.message!.slice(0, 60)}…` : e.message ?? ''
  const pray = prayActions(social, {
    toUser: e.from_user, replyTo: e.id, who: author, what: e.kind === 'sos' ? 'request for help' : 'message',
    link: `/groups/${social.groupId}?tab=feed`,
  })

  async function kudos() {
    try {
      await sendEncouragement({ group_id: social.groupId, kind: 'kudos', to_user: e.from_user, reply_to: e.id })
      setSent((x) => ({ ...x, kudos: true }))
      social.onSent()
    } catch (err) {
      alert(errorMessage(err))
    }
  }

  const button = 'h-8 w-8 shrink-0 rounded-full text-sm disabled:opacity-100'
  const off = 'bg-slate-100 dark:bg-slate-800'
  const on = 'bg-emerald-100 ring-2 ring-emerald-500 dark:bg-emerald-900/40' // done: you already did
  return (
    <span className="flex items-center gap-1.5">
      <ReactionLabel list={list} social={social} />
      {!mine && (
        <>
          {e.kind !== 'sos' && (
            <button className={`${button} ${done('kudos') ? on : off}`} disabled={done('kudos')} onClick={kudos}
              aria-label={done('kudos') ? `Kudos to ${author}: done` : `Give ${author} kudos`}>👏</button>
          )}
          <button className={`${button} ${done('prayer') ? on : off}`} disabled={done('prayer')} onClick={() => setPraying(true)}
            aria-label={done('prayer') ? `Praying for ${author}: done` : `Pray for ${author} about this`}>🙏</button>
        </>
      )}
      {praying && (
        <PrayerPrompt subject={e.kind === 'sos' ? `${author}, who asked for help` : `${author} and what they shared`} who={author}
          details={snippet ? <span className="italic">“{snippet}”</span> : undefined}
          onPrayed={async () => { await pray.onPrayed(); setSent((x) => ({ ...x, prayer: true })) }}
          onLater={async (at) => { await pray.onLater(at); setSent((x) => ({ ...x, prayer: true })) }}
          onWord={pray.onWord}
          onClose={() => setPraying(false)} />
      )}
    </span>
  )
}
