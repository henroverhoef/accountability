import { Link, useNavigate, useParams } from 'react-router-dom'
import ErrorText from '../components/ErrorText'
import { PrayerWordBox } from '../components/PrayerPrompt'
import { useAsync } from '../components/useAsync'
import { getEncouragement, getOverview, getPrayerReminder, sendPrayerWord } from '../lib/groups'
import { formatDate } from '../lib/outcomes'

/**
 * A moment you set aside to pray (from Home or the reminder). Nothing to tick off: just
 * what it's about, and a place to send what you felt or want to encourage them with.
 */
export default function Pray() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const reminder = useAsync(() => getPrayerReminder(id), [id])
  // What they shared on that check-in, to pray into (if it's still shared with the group).
  const shared = useAsync(async () => {
    const r = reminder.data
    if (!r?.checkin_id || !r.group_id) return null
    const o = await getOverview(r.group_id).catch(() => null)
    const c = o?.checkins.find((x) => x.id === r.checkin_id)
    return c ? { c, habit: o!.habits.find((h) => h.id === c.habit_id) } : null
  }, [reminder.data])
  // Or the feed message it's about.
  const message = useAsync(async () => {
    const r = reminder.data
    return r?.reply_to ? getEncouragement(r.reply_to).catch(() => null) : null
  }, [reminder.data])

  if (reminder.error) {
    return (
      <div className="page space-y-4">
        <p className="card">This prayer moment isn’t there anymore.</p>
        <Link to="/" className="btn-secondary w-full">Home</Link>
      </div>
    )
  }
  if (!reminder.data) return <div className="page muted">Loading…</div>
  const r = reminder.data
  const group = !r.to_user && r.who === 'the group'
  const subject = r.what ? `${group ? 'the group’s' : `${r.who}’s`} ${r.what}` : r.who
  const at = new Date(r.remind_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const c = shared.data?.c

  return (
    <div className="page space-y-4">
      <Link to="/" className="btn-ghost -ml-4">‹ Home</Link>
      <section className="card space-y-4 p-5">
        <div>
          <h1 className="h1">🙏 Praying for {group ? 'the group' : r.who}</h1>
          <p className="muted">{r.what ? `${r.what} · ` : ''}the moment you set aside for {at}</p>
        </div>
        <p>Take a moment now to pray for <strong>{subject}</strong>.</p>
        {c && (c.tags.length > 0 || c.note) && (
          <div className="rounded-lg bg-slate-100 p-3 text-sm dark:bg-slate-800">
            <span className="font-semibold">What {r.who} shared ({formatDate(c.date)}):</span>
            {c.tags.length > 0 && <span className="block">{c.tags.join(', ')}</span>}
            {c.note && <span className="block whitespace-pre-wrap italic">“{c.note}”</span>}
          </div>
        )}
        {message.data?.message && (
          <div className="rounded-lg bg-slate-100 p-3 text-sm dark:bg-slate-800">
            <span className="font-semibold">What {r.who} wrote:</span>
            <span className="block whitespace-pre-wrap italic">“{message.data.message}”</span>
          </div>
        )}
        <PrayerWordBox who={group ? 'the group' : r.who}
          onSend={(message, groupSees) => sendPrayerWord({ group_id: r.group_id!, to_user: r.to_user, checkin_id: r.checkin_id, topic: r.topic, reply_to: r.reply_to, message, group_sees: groupSees }).then(() => undefined)}
          onDone={() => navigate(r.link || '/', { replace: true })} />
        <ErrorText error={shared.error} />
      </section>
      {r.link && <Link to={r.link} className="btn-ghost w-full">See {group ? 'the group' : `${r.who}’s check-ins`} ›</Link>}
    </div>
  )
}
