import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import ShareSelect from '../components/ShareSelect'
import ErrorText, { errorMessage } from '../components/ErrorText'
import { useAsync } from '../components/useAsync'
import { listMyGroups, listMyShares, setShare, type Visibility } from '../lib/groups'
import { useData } from '../data/DataProvider'
import Heatmap from '../components/Heatmap'
import { addDays, habitStreak, type Outcome } from '../lib/logic'
import { averageScore, describeAnswer, formatDate, hasMidOutcome, outcomeLabel, OUTCOME_STYLES, shortTime, TYPE_NAMES, WEEKDAYS } from '../lib/outcomes'

export default function HabitDetail() {
  const { id } = useParams()
  const { habits, checkins, today } = useData()
  const habit = habits.find((h) => h.id === id)
  if (!habit) return <div className="page"><p>Habit not found.</p><Link to="/habits" className="btn-secondary mt-4">Back</Link></div>

  const mine = checkins.filter((c) => c.habit_id === habit.id)
  const streak = habitStreak(habit, mine, today)
  const last30 = mine.filter((c) => c.date > addDays(today, -30))
  const counts = (['good', 'mid', 'bad'] as Outcome[]).map((o) => ({ o, n: last30.filter((c) => c.outcome === o).length }))
  const notes = [...mine].filter((c) => c.note || c.tags.length).reverse().slice(0, 10)

  return (
    <div className="page space-y-4">
      <Link to="/habits" className="btn-ghost -ml-4">‹ Habits</Link>
      <header className="flex items-center gap-3">
        <span className="text-4xl" aria-hidden>{habit.icon}</span>
        <div className="flex-1">
          <h1 className="h1">{habit.name}</h1>
          <p className="muted">
            {TYPE_NAMES[habit.type]}
            {habit.type === 'time' && ` · by ${shortTime(habit.target_time)}`}
            {habit.type === 'amount' && ` · ${habit.target_direction === 'at_most' ? 'at most' : 'at least'} ${habit.target_value ?? ''} ${habit.unit ?? ''}`}
            {habit.type === 'scale' && habit.question && ` · “${habit.question}”`}
            {habit.schedule_days.length < 7 && ` · ${habit.schedule_days.map((d) => WEEKDAYS[d]).join(', ')}`}
          </p>
        </div>
        <Link to={`/habits/${habit.id}/edit`} className="btn-secondary">Edit</Link>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <div className="card text-center">
          <div className="text-3xl font-bold">{streak.current}</div>
          <div className="muted">{habit.type === 'avoid' ? 'clean days now' : 'current streak'}</div>
        </div>
        <div className="card text-center">
          <div className="text-3xl font-bold">{streak.longest}</div>
          <div className="muted">longest streak</div>
        </div>
      </div>

      <section className="card">
        <h2 className="h2 mb-3">Last 90 days</h2>
        <Heatmap habit={habit} checkins={mine} today={today} />
      </section>

      <section className="card">
        <h2 className="h2 mb-2">Last 30 days</h2>
        {habit.type === 'scale' && averageScore(last30) && (
          <p className="mb-2">Average score: <strong className="text-xl">{averageScore(last30)}</strong> / 10</p>
        )}
        <ul className="space-y-1">
          {counts.filter(({ o }) => o !== 'mid' || hasMidOutcome(habit.type)).map(({ o, n }) => (
            <li key={o} className="flex items-center gap-2">
              <span className={`h-3 w-3 rounded-full ${OUTCOME_STYLES[o].dot}`} />
              <span className="flex-1">{outcomeLabel(habit, o)}</span>
              <span className="font-semibold">{n}</span>
            </li>
          ))}
        </ul>
      </section>

      <Sharing habitId={habit.id} />

      {notes.length > 0 && (
        <section className="card">
          <h2 className="h2 mb-2">Recent notes</h2>
          <ul className="space-y-3">
            {notes.map((c) => (
              <li key={c.date} className="text-sm">
                <div className="font-semibold">{formatDate(c.date)} · {describeAnswer(habit, c)}</div>
                {c.tags.length > 0 && <div className="muted">{c.tags.join(', ')}</div>}
                {c.note && <div className="whitespace-pre-wrap">{c.note}</div>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

/** Per-group visibility for this habit. */
function Sharing({ habitId }: { habitId: string }) {
  const groups = useAsync(listMyGroups, [])
  const shares = useAsync(listMyShares, [])
  const [error, setError] = useState<string | null>(null)
  if (!groups.data || groups.data.length === 0) return null
  const current = (gid: string): Visibility =>
    shares.data?.find((s) => s.habit_id === habitId && s.group_id === gid)?.visibility ?? 'private'

  return (
    <section className="card space-y-3">
      <h2 className="h2">Sharing</h2>
      {groups.data.map((g) => (
        <div key={g.id}>
          <label htmlFor={`share-${g.id}`} className="label">{g.name}</label>
          <ShareSelect id={`share-${g.id}`} value={current(g.id)} disabled={!shares.data}
            onChange={async (v) => {
              setError(null)
              try { await setShare(habitId, g.id, v); await shares.reload() } catch (e) { setError(errorMessage(e)) }
            }} />
        </div>
      ))}
      <ErrorText error={error} />
    </section>
  )
}
