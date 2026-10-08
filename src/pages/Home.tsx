import { Link } from 'react-router-dom'
import { useData } from '../data/DataProvider'
import { dayProgress, habitStreak, honestyStreak } from '../lib/logic'
import { formatDate } from '../lib/outcomes'
import { useAsync } from '../components/useAsync'
import { recentEncouragements } from '../lib/groups'
import QuickTip from '../components/QuickTip'

export default function Home() {
  const { profile, activeHabits, checkins, today, yesterday } = useData()
  const todayProgress = dayProgress(activeHabits, checkins, today)
  const yesterdayProgress = dayProgress(activeHabits, checkins, yesterday)
  const honesty = honestyStreak(activeHabits, checkins, today)
  const encouragement = useAsync(() => recentEncouragements(3), [])

  return (
    <div className="page space-y-4">
      <QuickTip />
      <header>
        <p className="muted">{formatDate(today, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        <h1 className="h1">Hi {profile?.display_name || 'friend'}</h1>
      </header>

      {yesterdayProgress.due > 0 && !yesterdayProgress.complete && (
        <section className="card space-y-3 border-l-4 border-amber-400">
          <p className="text-lg font-semibold">🌅 Last night’s check-in is still open</p>
          <p className="muted">
            Missed it? No problem. Honesty counts the next morning too
            {yesterdayProgress.done > 0 ? ` (${yesterdayProgress.done} of ${yesterdayProgress.due} done)` : ''}. Open until midnight tonight.
          </p>
          <Link to="/checkin?day=yesterday" className="btn-primary w-full">Catch up on last night</Link>
        </section>
      )}

      <section className="card space-y-3">
        {todayProgress.due === 0 ? (
          <p>Nothing scheduled today. Rest well.</p>
        ) : todayProgress.complete ? (
          <p className="text-lg font-semibold">✅ You’ve checked in today. Thank you for being honest.</p>
        ) : (
          <p className="text-lg font-semibold">
            {todayProgress.done === 0 ? 'Ready for today’s check-in?' : `${todayProgress.done} of ${todayProgress.due} checked in`}
          </p>
        )}
        <Link to="/checkin" className="btn-primary w-full py-4 text-lg">
          {todayProgress.complete ? 'Review check-in' : 'Check in'}
        </Link>
      </section>

      <Link to="/sos" className="btn w-full border-2 border-rose-300 bg-rose-50 py-3 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
        🆘 I need help
      </Link>

      {profile && !profile.has_login_code && (
        <Link to="/settings" className="card block border-l-4 border-amber-400 text-sm">
          🔑 <strong>Save a login code</strong> so you can get back into your account on a new phone. Tap here, then “Login code”.
        </Link>
      )}

      <section className="card flex items-center gap-4" aria-label="Honesty streak">
        <div className="text-4xl" aria-hidden>🤝</div>
        <div className="flex-1">
          <div className="text-3xl font-bold">{honesty.current} <span className="text-base font-medium">day{honesty.current === 1 ? '' : 's'}</span></div>
          <div className="font-semibold">Honesty streak</div>
          <div className="muted">Days you checked in, whatever the day held. Honesty is the win. (Best: {honesty.longest})</div>
        </div>
      </section>

      {encouragement.data && encouragement.data.length > 0 && (
        <section className="card">
          <h2 className="h2 mb-2">Encouragement</h2>
          <ul className="space-y-2">
            {encouragement.data.map((e) => (
              <li key={e.id}>
                <Link to={`/groups/${e.group_id}`} className="block text-sm">
                  <span aria-hidden>{e.kind === 'sos' ? '🆘' : e.kind === 'prayer' ? '🙏' : '✉️'}</span>{' '}
                  <strong>{e.from_name}</strong>{' '}
                  {e.kind === 'sos' ? 'asked for prayer' : e.kind === 'prayer' ? 'is praying for you' : e.to_me ? 'sent you a message' : `posted in ${e.group_name}`}
                  {e.message && <span className="muted block truncate">“{e.message}”</span>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {activeHabits.length > 0 && (
        <section className="card">
          <h2 className="h2 mb-2">Streaks</h2>
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {activeHabits.map((h) => {
              const s = habitStreak(h, checkins, today)
              return (
                <li key={h.id}>
                  <Link to={`/habits/${h.id}`} className="flex min-h-12 items-center gap-3 py-2">
                    <span className="text-2xl" aria-hidden>{h.icon}</span>
                    <span className="flex-1 font-medium">{h.name}</span>
                    <span className="text-right">
                      <span className="font-bold">{s.current}</span>{' '}
                      <span className="muted">{h.type === 'avoid' ? 'clean days' : 'in a row'}</span>
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <Link to="/summary" className="btn-secondary w-full">📊 Week in review</Link>
    </div>
  )
}
