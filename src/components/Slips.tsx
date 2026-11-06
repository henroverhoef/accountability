import { useEffect, useState } from 'react'
import { useData } from '../data/DataProvider'
import ErrorText, { errorMessage } from './ErrorText'
import { useAsync } from './useAsync'
import { listMyGroups, listMyShares } from '../lib/groups'
import { addDays, slipAverage, slipDay, slipOutcome, slipText, worseOutcome } from '../lib/logic'
import { outcomeLabel, OUTCOME_STYLES } from '../lib/outcomes'
import { listMySlips, logSlip, undoSlip, type Slip } from '../lib/slips'
import type { Checkin, Habit } from '../lib/types'

/**
 * Home: "✋ I just gave in", for habits you're breaking. Log a slip the moment it happens
 * (+1, +5, or "I lost count") and see today's count next to yesterday and a usual day.
 * Keeping that number down is the point. Your group sees one card per habit per day in
 * the feed (if they see that habit's results), and gets one notification for it.
 */
export default function SlipsCard() {
  const { activeHabits, today } = useData()
  const avoid = activeHabits.filter((h) => h.type === 'avoid')
  const slips = useAsync(() => listMySlips(today), [today])
  const [logging, setLogging] = useState(false)
  if (avoid.length === 0) return null

  const list = slips.data ?? []
  const recent = avoid.filter((h) => list.some((s) => s.habit_id === h.id)) // slipped in the last week

  return (
    <section className="card space-y-3" aria-label="Habits you’re breaking">
      {recent.length > 0 && (
        <ul className="space-y-2">
          {recent.map((h) => {
            const day = slipDay(list, h.id, today)
            const yesterday = slipDay(list, h.id, addDays(today, -1))
            const usual = Math.round(slipAverage(list, h.id, today))
            return (
              <li key={h.id} className="text-sm">
                <div className="flex items-center gap-2">
                  <span aria-hidden>{h.icon}</span>
                  <span className="flex-1 font-medium">{h.name}</span>
                  <span className={`h-2.5 w-2.5 rounded-full ${OUTCOME_STYLES[slipOutcome(day, h.slip_yellow_max ?? 0) ?? 'good'].dot}`} aria-hidden />
                  <span className="font-semibold">{day.logs === 0 ? 'none today' : `${slipText(day, h.unit)} today`}</span>
                </div>
                <p className="muted ml-6 text-xs">
                  Yesterday {yesterday.logs === 0 ? 'none' : slipText(yesterday, h.unit)}{usual > 0 && ` · usually ${usual} a day`}
                </p>
              </li>
            )
          })}
        </ul>
      )}
      <button className="btn w-full border-2 border-slate-300 bg-white py-3 text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        onClick={() => setLogging(true)}>
        ✋ I just gave in
      </button>
      {logging && <SlipLogger habits={avoid} slips={list} onLogged={slips.reload} onClose={() => setLogging(false)} />}
    </section>
  )
}

const AMOUNTS = [1, 2, 5, 10]

/** Which habit, how much (or "I lost count"), and who will see it. */
function SlipLogger({ habits, slips, onLogged, onClose }: { habits: Habit[]; slips: Slip[]; onLogged: () => void; onClose: () => void }) {
  const { checkins, today, saveCheckins } = useData()
  const shares = useAsync(listMyShares, [])
  const groups = useAsync(listMyGroups, [])
  const [habitId, setHabitId] = useState(habits.length === 1 ? habits[0].id : '')
  const [amount, setAmount] = useState<number | 'lost'>(1)
  const [custom, setCustom] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // After logging: what was logged, and the check-in it changed (to put back on undo).
  const [done, setDone] = useState<{ slip: Slip; text: string; before?: Checkin; now?: string } | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const habit = habits.find((h) => h.id === habitId)
  const unit = habit?.unit?.trim() || 'times'
  const count: number | null = amount === 'lost' ? null : custom ? Math.round(Number(custom)) : amount
  const valid = Boolean(habit) && (count === null || (Number.isFinite(count) && count >= 1 && count <= 1000))
  const sharedIn = (groups.data ?? []).filter((g) => shares.data?.some((s) => s.habit_id === habitId && s.group_id === g.id && (s.visibility === 'result' || s.visibility === 'notes')))
  const firstToday = !slips.some((s) => s.habit_id === habitId && s.date === today)

  async function log() {
    if (!habit) return
    setBusy(true)
    setError(null)
    try {
      const slip = await logSlip(habit.id, today, count)
      const day = slipDay([...slips, slip], habit.id, today)
      // A check-in already done today can't stay better than what you just logged.
      const outcome = slipOutcome(day, habit.slip_yellow_max ?? 0)
      const existing = checkins.find((c) => c.habit_id === habit.id && c.date === today)
      let before: Checkin | undefined
      if (outcome && existing && worseOutcome(existing.outcome, outcome) !== existing.outcome) {
        before = existing
        await saveCheckins([{ ...existing, outcome }])
      }
      setDone({ slip, text: `${habit.icon} ${habit.name}: ${slipText(day, habit.unit)} today`, before, now: before && outcome ? outcomeLabel(habit, outcome) : undefined })
      onLogged()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function undo() {
    if (!done) return
    setBusy(true)
    try {
      await undoSlip(done.slip.id)
      if (done.before) await saveCheckins([done.before])
      onLogged()
      onClose()
    } catch (e) {
      setError(errorMessage(e))
      setBusy(false)
    }
  }

  const chip = (on: boolean) => `min-h-11 rounded-xl border-2 px-3 font-semibold ${on
    ? 'border-amber-400 bg-amber-100 text-amber-950 dark:bg-amber-900/40 dark:text-amber-50'
    : 'border-slate-300 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'}`

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-3 text-left font-normal sm:items-center" role="dialog" aria-modal="true" aria-labelledby="slip-title"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="card w-full max-w-md space-y-4 p-5 shadow-2xl">
        {done ? (
          <>
            <h2 id="slip-title" className="text-xl font-bold">Logged</h2>
            <p className="text-lg font-semibold">{done.text}</p>
            {done.now && <p className="text-sm">Your check-in for today now says <strong>{done.now}</strong>.</p>}
            <blockquote className="rounded-lg bg-slate-100 p-3 text-sm italic dark:bg-slate-800">
              “If we confess our sins, He is faithful and just to forgive us our sins and to cleanse us from all unrighteousness.”
              <span className="muted block text-xs not-italic">1 John 1:9</span>
            </blockquote>
            <p className="text-sm">Thank you for being honest. Get up, and keep going.</p>
            <ErrorText error={error} />
            <div className="flex gap-2">
              <button className="btn-ghost flex-1" disabled={busy} onClick={undo}>Undo</button>
              <button className="btn-primary flex-1" disabled={busy} onClick={onClose}>Done</button>
            </div>
          </>
        ) : (
          <>
            <div>
              <h2 id="slip-title" className="text-xl font-bold">✋ I just gave in</h2>
              <p className="muted text-sm">Honest is better than hidden. Log it, then get up again.</p>
            </div>

            {habits.length > 1 && (
              <fieldset className="space-y-2">
                <legend className="label">Which habit?</legend>
                <div className="flex flex-wrap gap-2" role="radiogroup">
                  {habits.map((h) => (
                    <button key={h.id} type="button" role="radio" aria-checked={habitId === h.id} className={chip(habitId === h.id)} onClick={() => setHabitId(h.id)}>
                      {h.icon} {h.name}
                    </button>
                  ))}
                </div>
              </fieldset>
            )}

            {habit && (
              <fieldset className="space-y-2">
                <legend className="label">How many {unit}?</legend>
                <div className="flex flex-wrap gap-2" role="radiogroup">
                  {AMOUNTS.map((n) => (
                    <button key={n} type="button" role="radio" aria-checked={!custom && amount === n} className={chip(!custom && amount === n)}
                      onClick={() => { setAmount(n); setCustom('') }}>
                      +{n}
                    </button>
                  ))}
                  <input type="number" inputMode="numeric" min={1} max={1000} aria-label={`Another number of ${unit}`} placeholder="Other"
                    className="input w-24" value={custom} onChange={(e) => { setCustom(e.target.value); if (amount === 'lost') setAmount(1) }} />
                </div>
                <button type="button" role="radio" aria-checked={amount === 'lost'} className={`${chip(amount === 'lost')} w-full`}
                  onClick={() => { setAmount('lost'); setCustom('') }}>
                  🤷 I lost count
                </button>
              </fieldset>
            )}

            {habit && (
              <p className="muted text-xs">
                {sharedIn.length > 0
                  ? `${sharedIn.map((g) => g.name).join(' and ')} will see today’s total for ${habit.name} in the feed${firstToday ? ', with one notification today' : ''}.`
                  : `Only you see this: ${habit.name} isn’t shared with its result in any group.`}
              </p>
            )}
            <ErrorText error={error} />
            <div className="flex gap-2">
              <button className="btn-ghost flex-1" disabled={busy} onClick={onClose}>Cancel</button>
              <button className="btn-primary flex-1" disabled={busy || !valid} onClick={log}>{busy ? 'Logging…' : 'Log it'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
