import { Link } from 'react-router-dom'
import { useState } from 'react'
import { useData } from '../data/DataProvider'
import { addDays, habitStreak, honestyStreak, weekStart, weeklySummary, type Outcome } from '../lib/logic'
import { formatDate, outcomeLabel, OUTCOME_STYLES } from '../lib/outcomes'

/** Personal weekly review. No comparing with anyone: just your own progress. */
export default function Summary() {
  const { activeHabits, checkins, today } = useData()
  const [weeksBack, setWeeksBack] = useState(0)
  const start = addDays(weekStart(today), -7 * weeksBack)
  const s = weeklySummary(activeHabits, checkins, start, today)
  const honesty = honestyStreak(activeHabits, checkins, today)
  const hardDays = s.habits.reduce((n, h) => n + h.counts.mid + h.counts.bad, 0)

  return (
    <div className="page space-y-4">
      <Link to="/" className="btn-ghost -ml-4">‹ Home</Link>
      <h1 className="h1">Week in review</h1>

      <div className="flex items-center justify-between">
        <button className="btn-secondary w-12" aria-label="Previous week" disabled={weeksBack >= 12} onClick={() => setWeeksBack(weeksBack + 1)}>‹</button>
        <p className="font-semibold">{formatDate(s.start, { day: 'numeric', month: 'short' })} – {formatDate(s.end, { day: 'numeric', month: 'short' })}</p>
        <button className="btn-secondary w-12" aria-label="Next week" disabled={weeksBack === 0} onClick={() => setWeeksBack(weeksBack - 1)}>›</button>
      </div>

      <section className="card text-center">
        <div className="text-4xl font-bold">{s.checkinDays} / {s.daysSoFar}</div>
        <p className="muted">days fully checked in{weeksBack === 0 && s.daysSoFar < 7 ? ' so far' : ''}</p>
        <p className="mt-2">
          {s.checkinDays === s.daysSoFar && s.daysSoFar > 0
            ? 'Every single day. That kind of honesty builds a life. 🙌'
            : s.checkinDays > 0
              ? 'Every honest check-in counts. Keep showing up.'
              : 'A new week is a fresh start. You can begin today.'}
        </p>
        <p className="muted mt-2">🤝 Honesty streak: {honesty.current} day{honesty.current === 1 ? '' : 's'}</p>
      </section>

      {activeHabits.map((h) => {
        const w = s.habits.find((x) => x.habitId === h.id)
        if (!w || w.due === 0) return null
        const outcomes: Outcome[] = h.type === 'avoid' || h.type === 'done' ? ['good', 'mid', 'bad'] : ['good', 'bad']
        return (
          <section key={h.id} className="card">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-2xl" aria-hidden>{h.icon}</span>
              <h2 className="h2 flex-1">{h.name}</h2>
              <span className="text-sm font-semibold">🔥 {habitStreak(h, checkins, today).current}</span>
            </div>
            <ul className="space-y-1 text-sm">
              {outcomes.map((o) => (
                <li key={o} className="flex items-center gap-2">
                  <span className={`h-3 w-3 rounded-full ${OUTCOME_STYLES[o].dot}`} />
                  <span className="flex-1">{outcomeLabel(h, o)}</span>
                  <span className="font-semibold">{w.counts[o]}</span>
                </li>
              ))}
              {w.missed > 0 && (
                <li className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-slate-400" />
                  <span className="flex-1">No check-in</span>
                  <span className="font-semibold">{w.missed}</span>
                </li>
              )}
            </ul>
          </section>
        )
      })}

      {s.topTags.length > 0 && (
        <section className="card">
          <h2 className="h2 mb-1">Patterns on harder days</h2>
          <p className="muted mb-3">Tags you chose on {hardDays} harder day{hardDays === 1 ? '' : 's'} this week. Knowing your triggers helps you plan ahead.</p>
          <ul className="flex flex-wrap gap-2">
            {s.topTags.map((t) => (
              <li key={t.tag} className="chip-off">{t.tag} × {t.count}</li>
            ))}
          </ul>
          <p className="mt-3 text-sm">
            💡 “{s.topTags[0].tag}” came up most. Is there one small change that could help next week?
          </p>
        </section>
      )}
    </div>
  )
}
