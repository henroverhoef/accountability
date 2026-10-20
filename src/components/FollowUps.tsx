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
 * this week, and buttons to add yours (tap again to undo). Several people can each add
 * one. The person never sees this (the database doesn't send it to them), and it goes
 * away with the support note once things look better.
 */
export default function FollowUps({ social, about, name }: { social: Social; about: string; name: string }) {
  const [busy, setBusy] = useState(false)
  const list = social.followUps.filter((f) => f.about_user === about)

  async function toggle(kind: FollowUpKind) {
    const mine = list.find((f) => f.kind === kind && f.from_user === social.me)
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
          const done = list.some((f) => f.kind === k.kind && f.from_user === social.me)
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

/** "today", "yesterday", "3 days ago". */
function when(iso: string): string {
  const local = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const days = daysBetween(local(new Date(iso)), local(new Date()))
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`
}
