import { useState } from 'react'
import { errorMessage } from './ErrorText'
import type { Social } from './Reactions'
import { addFollowUp, removeFollowUp, type FollowUpKind } from '../lib/groups'
import { daysBetween } from '../lib/logic'

const KINDS: { kind: FollowUpKind; icon: string; button: (name: string) => string; done: (name: string) => string }[] = [
  { kind: 'call', icon: '📞', button: (n) => `I’ve called ${n}`, done: (n) => `called ${n}` },
  { kind: 'coffee', icon: '☕', button: (n) => `I’ve had coffee with ${n}`, done: (n) => `had coffee with ${n}` },
]

/**
 * When someone could use support: who in the group has called or had coffee with them
 * this week, and buttons to add yours. A button stays ticked for the rest of the day
 * (tap it again to undo) and can be pressed again after midnight; earlier ones stay in
 * the list. Several people can each add theirs. The person never sees this (the database
 * doesn't send it to them), and it goes away with the support note once things look better.
 */
export default function FollowUps({ social, about, name }: { social: Social; about: string; name: string }) {
  const [busy, setBusy] = useState(false)
  const list = social.followUps.filter((f) => f.about_user === about)
  const mineToday = (kind: FollowUpKind) => list.find((f) => f.kind === kind && f.from_user === social.me && daysAgo(f.created_at) <= 0)

  async function toggle(kind: FollowUpKind) {
    const mine = mineToday(kind)
    if (mine && !confirm(`Remove “You ${KINDS.find((k) => k.kind === kind)!.done(name)}”?`)) return
    setBusy(true)
    try {
      await (mine ? removeFollowUp(mine.id) : addFollowUp(social.groupId, about, kind))
      social.onSent()
    } catch (e) {
      alert(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      {list.length === 0 ? (
        <p className="text-sm font-medium">Nobody has called or had coffee with {name} this week yet.</p>
      ) : (
        <ul className="space-y-0.5 text-sm">
          {list.map((f) => {
            const k = KINDS.find((x) => x.kind === f.kind)!
            return (
              <li key={f.id}>
                {k.icon} <strong>{social.nameOf(f.from_user)}</strong> {k.done(name)} <span className="muted">· {when(f.created_at)}</span>
              </li>
            )
          })}
        </ul>
      )}
      <div className="grid grid-cols-2 gap-2">
        {KINDS.map((k) => {
          const done = !!mineToday(k.kind)
          return (
            <button key={k.kind} className={`btn min-h-11 px-2 text-sm ${done
              ? 'bg-emerald-100 text-emerald-950 ring-2 ring-emerald-500 dark:bg-emerald-900/40 dark:text-emerald-50'
              : 'bg-slate-200 text-slate-900 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700'}`}
              disabled={busy} aria-pressed={done} onClick={() => toggle(k.kind)}>
              {done ? `✓ ${k.icon} You ${k.done(name)}` : `${k.icon} ${k.button(name)}`}
            </button>
          )
        })}
      </div>
      <p className="muted text-xs">Only the group sees this, never {name}.</p>
    </div>
  )
}

/** Calendar days ago on this phone's clock (0 = today, since midnight). */
function daysAgo(iso: string): number {
  const local = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return daysBetween(local(new Date(iso)), local(new Date()))
}

/** "today", "yesterday", "3 days ago". */
function when(iso: string): string {
  const days = daysAgo(iso)
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`
}
