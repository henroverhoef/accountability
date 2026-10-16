import { Link, useNavigate, useParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
import ErrorText, { errorMessage } from '../components/ErrorText'
import { useAsync } from '../components/useAsync'
import { getPrayerReminder, markPrayed } from '../lib/groups'

/** Opened from a "time to pray" reminder: the moment you set aside. */
export default function Pray() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const reminder = useAsync(() => getPrayerReminder(id), [id])
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => Math.min(s + 1, 60)), 1000)
    return () => clearInterval(t)
  }, [])

  if (reminder.error) return <div className="page space-y-4"><ErrorText error={reminder.error} /><Link to="/" className="btn-secondary">Home</Link></div>
  if (!reminder.data) return <div className="page muted">Loading…</div>
  const r = reminder.data
  const subject = r.what ? `${r.who === 'the group' ? 'the group’s' : `${r.who}’s`} ${r.what}` : r.who

  async function done() {
    setError(null)
    try {
      await markPrayed(r.id)
      navigate(r.link || '/', { replace: true })
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  return (
    <div className="page space-y-4">
      <div className="card space-y-4 p-5">
        <h1 className="h1">🙏 Time to pray</h1>
        {r.prayed_at ? (
          <p>You already prayed for <strong>{subject}</strong>. Thank you.</p>
        ) : (
          <>
            <p>You set this time aside to pray for <strong>{subject}</strong>. Take a quiet minute now.</p>
            <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <div className="h-full rounded-full bg-amber-400 transition-all duration-1000 ease-linear" style={{ width: `${(seconds / 60) * 100}%` }} />
            </div>
            <ErrorText error={error} />
            <button className="btn-primary w-full" onClick={done}>🙏 I prayed</button>
          </>
        )}
        <Link to={r.link || '/'} className="btn-ghost w-full">{r.prayed_at ? 'Back' : 'Not now'}</Link>
      </div>
    </div>
  )
}
