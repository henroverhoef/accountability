import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useData } from '../data/DataProvider'
import CheckinCard from '../components/CheckinCard'
import ErrorText, { errorMessage } from '../components/ErrorText'
import { addDays, honestyStreak, isDue } from '../lib/logic'
import { formatDate } from '../lib/outcomes'
import { ENCOURAGEMENTS, GRACE_VERSES, pickRandom } from '../lib/verses'
import type { Checkin } from '../lib/types'

type Drafts = Record<string, Checkin>

export default function CheckIn() {
  const { activeHabits, checkins, today, saveCheckins } = useData()
  const [params, setParams] = useSearchParams()

  // Which day are we checking in for? Today, yesterday or the day before.
  const days = [today, addDays(today, -1), addDays(today, -2)]
  const dayParam = params.get('day')
  const date = dayParam === 'yesterday' ? days[1] : dayParam && days.includes(dayParam) ? dayParam : today

  const dueHabits = activeHabits.filter((h) => isDue({ ...h, start_date: addDays(h.start_date, -2) }, date))
  const existing = useMemo(() => {
    const map: Drafts = {}
    for (const c of checkins) if (c.date === date) map[c.habit_id] = c
    return map
  }, [checkins, date])

  const [drafts, setDrafts] = useState<Drafts>(existing)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [queued, setQueued] = useState(false)
  const [result, setResult] = useState<{ message: string; verse?: (typeof GRACE_VERSES)[number] } | null>(null)

  // Start fresh whenever the selected day changes.
  useEffect(() => {
    setDrafts(existing)
    setResult(null)
    setError(null)
    // (only when the day changes, not on every save)
  }, [date])

  const changed = Object.values(drafts).filter((d) => JSON.stringify(pick(d)) !== JSON.stringify(pick(existing[d.habit_id])))
  const answered = dueHabits.filter((h) => drafts[h.id]).length

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const status = await saveCheckins(changed)
      const slipped = changed.some((c) => c.outcome === 'bad' && activeHabits.find((h) => h.id === c.habit_id)?.type === 'avoid')
      setResult(
        slipped
          ? { message: 'Thank you for being honest. A slip doesn’t define you. Get up and keep going; you’re not alone.', verse: pickRandom(GRACE_VERSES) }
          : { message: pickRandom(ENCOURAGEMENTS) },
      )
      setQueued(status === 'queued')
      window.scrollTo({ top: 0 })
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  if (result) {
    const honesty = honestyStreak(activeHabits, checkins, today)
    return (
      <div className="page space-y-4">
        <div className="card space-y-3 text-center">
          <div className="text-5xl" aria-hidden>{result.verse ? '🕊️' : '🙌'}</div>
          <p className="text-lg font-semibold">{result.message}</p>
          {queued && <p className="rounded-lg bg-sky-100 p-2 text-sm text-sky-900 dark:bg-sky-900/40 dark:text-sky-100">📴 You’re offline. Saved on this phone; it will sync automatically when you’re back online.</p>}
          <p className="muted">Honesty streak: <strong>{honesty.current}</strong> day{honesty.current === 1 ? '' : 's'}</p>
        </div>
        {result.verse && (
          <blockquote className="card border-l-4 border-amber-400">
            <p className="italic">“{result.verse.text}”</p>
            <footer className="muted mt-2">{result.verse.ref}</footer>
          </blockquote>
        )}
        {result.verse && <Link to="/sos?mode=share" className="btn-secondary w-full">🤝 Tell my group / reach out to someone</Link>}
        <Link to="/" className="btn-primary w-full">Done</Link>
        <button className="btn-ghost w-full" onClick={() => setResult(null)}>Edit answers</button>
      </div>
    )
  }

  return (
    <div className="page space-y-4">
      <h1 className="h1">Check in</h1>

      <div className="flex gap-2" role="tablist" aria-label="Day">
        {days.map((d, i) => (
          <button key={d} role="tab" aria-selected={d === date}
            className={d === date ? 'chip-on flex-1 justify-center' : 'chip-off flex-1 justify-center'}
            onClick={() => setParams(i === 0 ? {} : { day: d }, { replace: true })}>
            {i === 0 ? 'Today' : i === 1 ? 'Yesterday' : formatDate(d, { weekday: 'short' })}
          </button>
        ))}
      </div>

      {dueHabits.length === 0 ? (
        <div className="card text-center">
          <p>Nothing is scheduled for {date === today ? 'today' : formatDate(date)}.</p>
          {activeHabits.length === 0 && <Link to="/habits/new" className="btn-primary mt-3">Add a habit</Link>}
        </div>
      ) : (
        <ul className="space-y-3">
          {dueHabits.map((h) => (
            <li key={h.id}>
              <CheckinCard
                key={date}
                habit={h}
                date={date}
                draft={drafts[h.id]}
                onChange={(c) => setDrafts((prev) => ({ ...prev, [h.id]: c }))}
              />
            </li>
          ))}
        </ul>
      )}

      <ErrorText error={error} />

      {dueHabits.length > 0 && (
        <div className="sticky bottom-20 z-10 pt-2">
          <button className="btn-primary w-full py-4 text-lg shadow-lg" disabled={busy || changed.length === 0} onClick={save}>
            {busy ? 'Saving…' : changed.length === 0 && answered > 0 ? 'Saved ✓' : `Save check-in (${answered}/${dueHabits.length})`}
          </button>
        </div>
      )}
    </div>
  )
}

/** The fields that matter when deciding whether something changed. */
function pick(c: Checkin | undefined) {
  if (!c) return null
  return { o: c.outcome, n: c.value_number, t: c.value_time?.slice(0, 5) ?? null, g: c.tags, note: c.note ?? '' }
}
