import { Link, useParams } from 'react-router-dom'
import { useData } from '../data/DataProvider'
import ErrorText from '../components/ErrorText'
import Heatmap from '../components/Heatmap'
import { useAsync } from '../components/useAsync'
import { getOverview, VISIBILITY_LABELS, type SharedCheckin, type SharedHabit } from '../lib/groups'
import { daysBetween, habitStreak, type CheckinLike } from '../lib/logic'
import { averageScore, formatDate } from '../lib/outcomes'
import { AnswerBadge, caughtUpLater, daysSinceCheckin, EncourageButtons } from './GroupDetail'

/**
 * One group member's check-ins: everything they share with this group, per habit.
 * The database only sends what they allowed (see group_overview), so nothing private
 * can show up here.
 */
export default function MemberDetail() {
  const { id = '', userId = '' } = useParams()
  const { session } = useData()
  const me = session!.user.id
  const overview = useAsync(() => getOverview(id), [id])

  if (overview.error) return <div className="page"><ErrorText error={overview.error} /></div>
  if (!overview.data) return <div className="page muted">Loading…</div>
  const o = overview.data
  const m = o.members.find((x) => x.user_id === userId)
  if (!m) return <div className="page"><p>This person isn’t in the group (anymore).</p><Link to={`/groups/${id}`} className="btn-secondary mt-4">Back</Link></div>

  const isMe = m.user_id === me
  const name = m.display_name || 'Someone'
  const habits = o.habits.filter((h) => h.user_id === m.user_id)
  const quietDays = daysSinceCheckin(m)

  return (
    <div className="page space-y-4">
      <Link to={`/groups/${id}`} className="btn-ghost -ml-4">‹ {o.group.name}</Link>

      <header className="space-y-1">
        <h1 className="h1">{name} {isMe && <span className="muted text-base font-normal">(you)</span>}</h1>
        <p className="muted">
          {m.checked_in_today === true ? '✅ Checked in today' : m.checked_in_today === false ? '⏳ Not checked in yet today' : 'Nothing due today'}
          {m.last_checkin_date && m.checked_in_today !== true && ` · last check-in ${formatDate(m.last_checkin_date)}`}
        </p>
        {!isMe && quietDays >= 3 && (
          <p className="rounded-lg bg-amber-100 p-2 text-sm text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
            No check-in for {quietDays} days. A short message or a prayer can mean a lot.
          </p>
        )}
      </header>

      {!isMe && <EncourageButtons groupId={id} toUser={m.user_id} onSent={overview.reload} />}

      {isMe && (
        <p className="card text-sm">This is what your group sees of you. Change it on the group’s <strong>Sharing</strong> tab.</p>
      )}

      {habits.length === 0 ? (
        <p className="card">
          {isMe ? 'You keep all your habits private in this group.' : `${name} keeps their habits private in this group.`} The group can still see whether
          {isMe ? ' you' : ' they'} did the daily check-in.
        </p>
      ) : (
        habits.map((h) => (
          <HabitCard key={h.id} habit={h} checkins={o.checkins.filter((c) => c.habit_id === h.id)} today={m.today}
            canPray={!isMe} groupId={id} onChange={overview.reload} />
        ))
      )}
    </div>
  )
}

function HabitCard({ habit, checkins, today, canPray, groupId, onChange }: {
  habit: SharedHabit; checkins: SharedCheckin[]; today: string; canPray: boolean; groupId: string; onChange: () => void
}) {
  const showsResult = habit.visibility !== 'checkin'
  const streak = showsResult
    ? habitStreak({ ...habit, archived: false }, checkins.filter((c) => c.outcome) as CheckinLike[], today)
    : null
  const recent = checkins.filter((c) => daysBetween(c.date, today) < 14) // already newest first
  const avg = habit.type === 'scale' && showsResult ? averageScore(checkins.filter((c) => daysBetween(c.date, today) < 30)) : null

  return (
    <section className="card space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-2xl" aria-hidden>{habit.icon}</span>
        <h2 className="h2 flex-1">{habit.name}</h2>
        <span className="rounded bg-slate-200 px-1.5 py-0.5 text-xs dark:bg-slate-700">{VISIBILITY_LABELS[habit.visibility].replace(' (default)', '')}</span>
      </div>
      {habit.type === 'scale' && habit.question && <p className="muted">“{habit.question}”</p>}

      {(streak || avg) && (
        <div className="flex gap-4 text-sm">
          {streak && <span>🔥 <strong>{streak.current}</strong> {habit.type === 'avoid' ? 'clean days' : 'in a row'} (best {streak.longest})</span>}
          {avg && <span>Avg (30 days): <strong>{avg}</strong>/10</span>}
        </div>
      )}

      <Heatmap habit={habit} checkins={checkins} today={today} weeks={6} />

      <div>
        <h3 className="label">Last 2 weeks</h3>
        {recent.length === 0 ? (
          <p className="muted">No check-ins yet.</p>
        ) : (
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {recent.map((c) => (
              <li key={c.id} className="space-y-1 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="flex-1 font-medium">
                    {formatDate(c.date)}
                    {caughtUpLater(c) && <span className="muted font-normal"> · caught up next morning</span>}
                  </span>
                  <AnswerBadge habit={habit} checkin={c} />
                </div>
                {c.tags.length > 0 && <div className="flex flex-wrap gap-1">{c.tags.map((t) => <span key={t} className="rounded-full bg-slate-200 px-2 py-0.5 text-xs dark:bg-slate-700">{t}</span>)}</div>}
                {c.note && <p className="whitespace-pre-wrap rounded-lg bg-slate-100 p-2 dark:bg-slate-800">{c.note}</p>}
                {canPray && c.outcome && c.outcome !== 'good' && (
                  <EncourageButtons groupId={groupId} toUser={c.user_id} checkinId={c.id} onSent={onChange} />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {habit.visibility === 'result' && <p className="muted text-xs">Tags and notes for this habit are private.</p>}
      {habit.visibility === 'checkin' && <p className="muted text-xs">Only shows whether they checked in, not how it went.</p>}
    </section>
  )
}
