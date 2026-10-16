import { useEffect, useRef, useState } from 'react'
import { errorMessage } from './ErrorText'
import { sendEncouragement, type Encouragement, type SharedCheckin, type SharedHabit } from '../lib/groups'

// Kudos (👏) and prayers (🙏) are shown as small labels on the check-in they're about
// (or next to a person's name for "praying for you" in general), not in the group feed.

/** What the reaction pieces need to know about the group. */
export interface Social {
  groupId: string
  me: string
  reactions: Encouragement[] // kudos and prayers in this group, newest first
  nameOf: (uid: string) => string
  onSent: () => void
}

export function reactionsFor(social: Social, checkinId: string): Encouragement[] {
  return social.reactions.filter((r) => r.checkin_id === checkinId)
}

/** Prayers for someone "in general" (not about one check-in) in the last week. */
export function generalPrayersFor(social: Social, userId: string): Encouragement[] {
  const weekAgo = Date.now() - 7 * 86400000
  return social.reactions.filter((r) => r.kind === 'prayer' && !r.checkin_id && r.to_user === userId && Date.parse(r.created_at) > weekAgo)
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
 * React to one check-in: 👏 kudos when it went well, 🙏 praying when it was hard.
 * Nothing when the result isn't shared (check-in only). Shows ✓ once you have.
 */
export function CheckinReaction({ checkin, habit, name, social }: { checkin: SharedCheckin; habit: SharedHabit; name: string; social: Social }) {
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  if (!checkin.outcome) return null
  const kind = checkin.outcome === 'good' ? 'kudos' : 'prayer'
  const done = sent || social.reactions.some((r) => r.checkin_id === checkin.id && r.kind === kind && r.from_user === social.me)
  const icon = kind === 'kudos' ? '👏' : '🙏'
  const label = kind === 'kudos' ? `Give ${name} kudos for ${habit.name}` : `Pray for ${name} about ${habit.name}`

  async function send() {
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

  return (
    <button className={`h-10 w-10 shrink-0 rounded-full text-lg ${done ? 'bg-emerald-100 dark:bg-emerald-900/40' : 'bg-slate-100 dark:bg-slate-800'}`}
      aria-label={done ? `${label}: done` : label} title={label} disabled={done || busy} onClick={send}>
      {done ? '✓' : icon}
    </button>
  )
}
