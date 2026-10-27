import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useData } from '../data/DataProvider'
import ErrorText, { errorMessage } from './ErrorText'
import { useAsync } from './useAsync'
import { addCommitmentCheck, listCommitmentChecks, listMyGroups, listMyShares, sendEncouragement } from '../lib/groups'
import { commitmentSnoozed, commitmentStat, strugglingToCommit, type CommitmentAnswer } from '../lib/logic'
import { formatDate, WEEKDAYS } from '../lib/outcomes'

/**
 * "Let your yes be yes": when one habit you committed to has been hard to keep
 * (logic/commitment.ts), Home asks you about it honestly, one habit at a time.
 * Either the Lord called you to it and something needs to change, or it isn't for this
 * season and it's more honest to change it or lay it down. Or you're not sure yet, and
 * you take it back to Him. It asks again after a while if it's still hard.
 */
export default function CommitmentCheck() {
  const { activeHabits, checkins, today, updateHabit } = useData()
  const navigate = useNavigate()
  const answers = useAsync(listCommitmentChecks, [])
  const shares = useAsync(listMyShares, [])
  const groups = useAsync(listMyGroups, [])
  const [step, setStep] = useState<'ask' | 'change' | 'release'>('ask')
  const [note, setNote] = useState('')
  const [share, setShare] = useState(false)
  const [done, setDone] = useState<{ habitId: string; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!answers.data) return null
  const now = new Date()
  const habit = done ? activeHabits.find((h) => h.id === done.habitId)
    : activeHabits.find((h) => strugglingToCommit(h, checkins, today) && !commitmentSnoozed(answers.data!, h.id, now))
  if (done) {
    return (
      <section className="card space-y-3 border-l-4 border-sky-400">
        <p className="text-lg font-semibold">🤝 {habit ? `${habit.icon} ${habit.name}` : 'Thank you'}</p>
        <p>{done.text}</p>
        <button className="btn-secondary w-full" onClick={() => setDone(null)}>Amen</button>
      </section>
    )
  }
  if (!habit) return null

  const stat = commitmentStat(habit, checkins, today)!
  const when = habit.schedule_days.length === 7 ? 'every day' : `on ${habit.schedule_days.map((d) => WEEKDAYS[d]).join(', ')}`
  const before = answers.data.find((a) => a.habit_id === habit.id && a.answer === 'change' && a.note)
  const sharedIn = (groups.data ?? []).filter((g) => shares.data?.some((s) => s.habit_id === habit.id && s.group_id === g.id))

  async function answer(a: CommitmentAnswer, text: string, then?: () => Promise<void> | void) {
    setBusy(true)
    setError(null)
    try {
      await addCommitmentCheck(habit!.id, a, a === 'change' ? note : null)
      if (a === 'change' && share && note.trim()) {
        for (const g of sharedIn) {
          await sendEncouragement({ group_id: g.id, kind: 'message', message: `🤝 Recommitting to ${habit!.icon} ${habit!.name}. What needs to change: ${note.trim()}` })
        }
      }
      await then?.()
      setDone({ habitId: habit!.id, text })
      setStep('ask')
      setNote('')
      setShare(false)
      answers.reload()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card space-y-3 border-l-4 border-sky-400" aria-label="Commitment check">
      <p className="text-lg font-semibold">🤝 Let your yes be yes</p>
      <p className="text-xl font-bold">{habit.icon} {habit.name}</p>
      <p>
        You committed to this {when}, but in the last two weeks you kept it <strong>{stat.kept} of {stat.due}</strong> times
        {stat.partly > 0 && ` (partly ${stat.partly})`}. It looks like you’re struggling to commit to it.
      </p>
      {before && (
        <p className="rounded-lg bg-slate-100 p-3 text-sm dark:bg-slate-800">
          On {formatDate(before.created_at.slice(0, 10))} you said what needed to change: <span className="italic">“{before.note}”</span>
        </p>
      )}
      <ErrorText error={error} />

      {step === 'ask' && (
        <>
          <p>
            You’re the one who said yes to this, hopefully in obedience to the Holy Spirit. We want to back you in it. So, honestly:
            is this what the Lord has called you to in this season?
          </p>
          <div className="space-y-2">
            <button className="btn-primary w-full" disabled={busy} onClick={() => setStep('change')}>✅ Yes. Something needs to change</button>
            <button className="btn-secondary w-full" disabled={busy}
              onClick={() => answer('pray', 'Take it back to the Lord and listen. We’ll ask you again in a few days.')}>
              🙏 I’m not sure. I’ll pray about it again
            </button>
            <button className="btn-secondary w-full" disabled={busy} onClick={() => setStep('release')}>🍂 It’s not for this season</button>
          </div>
          <WhyWeAsk />
        </>
      )}

      {step === 'change' && (
        <div className="space-y-2">
          <label htmlFor="commit-change" className="label">Where do you need to bring change so you can keep it?</label>
          <textarea id="commit-change" className="input" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="E.g. bed by 22:00 so I can train at 06:00, phone in the kitchen at night…" />
          {sharedIn.length > 0 && (
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-amber-500" checked={share} onChange={(e) => setShare(e.target.checked)} />
              <span>
                Share this with {sharedIn.map((g) => g.name).join(' and ')} so they can back you
                <span className="muted block text-xs">It’s posted in the group feed. Otherwise only you see it.</span>
              </span>
            </label>
          )}
          <button className="btn-primary w-full" disabled={busy || !note.trim()}
            onClick={() => answer('change', share
              ? 'We’re with you in this, and so is your group. We’ll ask again in two weeks how it’s going.'
              : 'We’re with you in this. Consider telling someone in your group, so they can back you. We’ll ask again in two weeks how it’s going.')}>
            Recommit
          </button>
          <button className="btn-ghost w-full" disabled={busy} onClick={() => setStep('ask')}>Back</button>
        </div>
      )}

      {step === 'release' && (
        <div className="space-y-2">
          <blockquote className="rounded-lg bg-slate-100 p-3 text-sm italic dark:bg-slate-800">
            “Better not to vow than to vow and not pay.”<span className="muted block text-xs not-italic">Ecclesiastes 5:5</span>
          </blockquote>
          <p>
            If this isn’t what the Lord is asking of you right now, it’s honest to say so. Change the commitment to what He is asking
            (fewer days, a smaller target), or lay it down for this season. Pray about it first.
          </p>
          <button className="btn-primary w-full" disabled={busy}
            onClick={() => answer('release', 'Change it to what you can say a true yes to.', () => navigate(`/habits/${habit.id}/edit`))}>
            ✏️ Change the commitment
          </button>
          <button className="btn-secondary w-full" disabled={busy}
            onClick={() => {
              if (!confirm(`Lay down ${habit.name} for this season? It’s archived with its history, and you can restore it any time under Habits.`)) return
              answer('release', 'Laid down for this season. Its history is kept, and you can restore it any time under Habits.', () => updateHabit(habit.id, { archived: true }))
            }}>
            🍂 Lay it down for this season
          </button>
          <button className="btn-ghost w-full" disabled={busy} onClick={() => setStep('ask')}>Back</button>
        </div>
      )}
      <Link to={`/habits/${habit.id}`} className="block text-sm font-medium text-amber-700 dark:text-amber-400">See how {habit.name} has gone ›</Link>
    </section>
  )
}

/** The scriptures behind the question. */
export function WhyWeAsk() {
  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-medium">Why we ask</summary>
      <div className="mt-2 space-y-2">
        <p>
          <strong>The two sons</strong> (Matthew 21:28–31). One said “I will not go” but later went to work in the vineyard. The
          other said “I will go, sir” and didn’t. Which one did his father’s will?
        </p>
        <p><span className="italic">“Let your ‘Yes’ be ‘Yes,’ and your ‘No,’ ‘No.’”</span> <span className="muted">Matthew 5:37</span></p>
        <p><span className="italic">“Better not to vow than to vow and not pay.”</span> <span className="muted">Ecclesiastes 5:5</span></p>
        <p><span className="italic">“Be doers of the word, and not hearers only, deceiving yourselves.”</span> <span className="muted">James 1:22</span></p>
        <p>It’s better not to say you’ll do something than to say you will and not stay true to your word. We don’t want to deceive ourselves.</p>
      </div>
    </details>
  )
}
