import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useData } from '../data/DataProvider'
import { dayProgress, habitStreak, honestyStreak, supportReason, weekKey } from '../lib/logic'
import { formatDate } from '../lib/outcomes'
import { useAsync } from '../components/useAsync'
import { listMyGroups, listOpenPrayerReminders, recentEncouragements, type RecentEncouragement } from '../lib/groups'
import QuickTip from '../components/QuickTip'

function timeAgo(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  return days === 1 ? 'yesterday' : `${days} days ago`
}

const ENCOURAGEMENT_TEXT = {
  sos: { icon: '🆘', text: 'asked for prayer' },
  prayer: { icon: '🙏', text: 'is praying for you' },
  kudos: { icon: '👏', text: 'gave you kudos' },
  message: { icon: '✉️', text: '' },
} as const

export default function Home() {
  const { profile, session, habits, activeHabits, checkins, today, yesterday } = useData()
  const todayProgress = dayProgress(activeHabits, checkins, today)
  const yesterdayProgress = dayProgress(activeHabits, checkins, yesterday)
  const honesty = honestyStreak(activeHabits, checkins, today)
  const encouragement = useAsync(() => recentEncouragements(3), [])
  const prayerPlans = useAsync(listOpenPrayerReminders, [])
  // After a hard stretch (hidden rule, see logic/support.ts): encourage reaching out.
  const hardStretch = supportReason(activeHabits, checkins, today) === 'hard'

  /** " about 🛡️ Purity" / " for 🛡️ Purity" when a prayer or kudos was about one of my check-ins. */
  const about = (e: RecentEncouragement) => {
    const c = e.checkin_id ? checkins.find((x) => x.id === e.checkin_id) : undefined
    const h = c && habits.find((x) => x.id === c.habit_id)
    return h ? ` ${e.kind === 'kudos' ? 'for' : 'about'} ${h.icon} ${h.name}` : ''
  }

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

      {hardStretch && <ReachOut week={weekKey(today)} />}

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

      {prayerPlans.data && prayerPlans.data.length > 0 && (
        <section className="card space-y-2 border-l-4 border-amber-400">
          <h2 className="h2">🙏 Time you set aside to pray</h2>
          <ul className="space-y-1">
            {prayerPlans.data.map((r) => (
              <li key={r.id}>
                <Link to={`/pray/${r.id}`} className="flex items-center gap-2 py-1 text-sm">
                  <span className="flex-1">
                    <strong>{r.who === 'the group' ? 'The group' : r.who}</strong>{r.what ? ` · ${r.what}` : ''}
                  </span>
                  <span className="muted">{new Date(r.remind_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  <span className="font-medium text-amber-700 dark:text-amber-400">Pray ›</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {encouragement.data && encouragement.data.length > 0 && (
        <section className="card">
          <h2 className="h2 mb-2">From your groups</h2>
          <ul className="space-y-2">
            {encouragement.data.map((e) => (
              <li key={e.id}>
                {/* Prayers and kudos open your own page in that group (they show on your check-ins); the rest open the feed. */}
                <Link to={e.kind === 'prayer' && !e.to_me ? `/groups/${e.group_id}?tab=overview`
                  : e.kind === 'prayer' || e.kind === 'kudos' ? `/groups/${e.group_id}/member/${session?.user.id}` : `/groups/${e.group_id}?tab=feed`} className="block text-sm">
                  <span aria-hidden>{ENCOURAGEMENT_TEXT[e.kind].icon}</span>{' '}
                  <strong>{e.from_name}</strong>{' '}
                  {e.kind === 'prayer' && !e.to_me ? `prayed for ${e.group_name}`
                    : e.kind !== 'message' ? ENCOURAGEMENT_TEXT[e.kind].text : e.to_me ? 'sent you a message' : `posted in ${e.group_name}`}
                  {(e.kind === 'prayer' || e.kind === 'kudos') && about(e)}
                  <span className="muted"> · {timeAgo(e.created_at)}</span>
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

/**
 * Shown to you (only you) after a hard stretch, to encourage an honest conversation.
 * "Not now" hides it for the rest of the week.
 */
function ReachOut({ week }: { week: string }) {
  const key = `steadfast:reachout-dismissed:${week}`
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(key) === '1' } catch { return false } })
  const groups = useAsync(listMyGroups, [])
  if (hidden) return null
  const only = groups.data?.length === 1 ? groups.data[0] : null
  return (
    <section className="card space-y-3 border-l-4 border-amber-400">
      <p className="text-lg font-semibold">💛 You don’t have to carry this alone</p>
      <p>
        It looks like the last while has been harder. That’s exactly what your brothers are there for.
        Who could you reach out to this week for an honest, unhurried conversation, over coffee or on a call?
      </p>
      <Link to={only ? `/groups/${only.id}?tab=feed` : '/groups'} className="btn-primary w-full">✉️ Reach out to my group</Link>
      <button className="btn-ghost w-full" onClick={() => { try { localStorage.setItem(key, '1') } catch { /* ignore */ } setHidden(true) }}>
        Not now
      </button>
    </section>
  )
}
