import { useEffect, useState } from 'react'
import ErrorText, { errorMessage } from './ErrorText'
import { listUpcomingPrayerReminders } from '../lib/groups'
import { joinNames, prayerMoments } from '../lib/prayer'

/**
 * Before a 🙏 is sent: a moment to actually pray. "I prayed", "Set aside a moment later"
 * (with a reminder at the time you pick), or add it to a moment you've already set aside.
 * Either way the person sees you're praying. After "I prayed", a short word to keep
 * praying, not just tick a box.
 */
export default function PrayerPrompt({ subject, who, details, onPrayed, onLater, onClose }: {
  subject: string // "Jesse's Purity", "Jesse", "everyone's No Short-form Video"
  who?: string // "Jesse", "the group" (defaults to the subject)
  details?: React.ReactNode // what they shared, to pray into
  onPrayed: () => Promise<void>
  onLater?: (at: Date) => Promise<void> // leave out to only offer "I prayed"
  onClose: () => void
}) {
  const [mode, setMode] = useState<'choose' | 'later' | 'add'>('choose')
  const [prayed, setPrayed] = useState(false)
  // Moments you've already set aside (still to come), to add this prayer to.
  const [moments, setMoments] = useState<{ at: number; who: string }[]>([])
  const [time, setTime] = useState(defaultLaterTime)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!onLater) return
    listUpcomingPrayerReminders()
      .then((rows) => setMoments(prayerMoments(rows.filter((r) => !r.sent_at && Date.parse(r.remind_at) > Date.now()))
        .map((m) => ({ at: m.at, who: joinNames(m.items.map((r) => r.who)) }))))
      .catch(() => setMoments([])) // offline: just don't offer it
  }, [onLater])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function run(fn: () => Promise<void>, then: () => void) {
    setBusy(true)
    setError(null)
    try {
      await fn()
      then()
    } catch (e) {
      setError(errorMessage(e))
      setBusy(false)
    }
  }

  const at = laterDate(time)

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-3 text-left font-normal sm:items-center" role="dialog" aria-modal="true" aria-labelledby="pray-title"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      {prayed ? (
        <div className="card w-full max-w-md space-y-4 p-5 text-center shadow-2xl">
          <h2 id="pray-title" className="text-xl font-bold">🙏 Keep on praying unceasingly</h2>
          <blockquote className="italic">“Pray without ceasing.”<footer className="muted mt-1 text-sm not-italic">1 Thessalonians 5:17</footer></blockquote>
          <p>Thank you for praying. Keep listening to the Holy Spirit today: if He brings {who ?? subject} to mind again, pray again.</p>
          <button className="btn-primary w-full" onClick={onClose}>Amen</button>
        </div>
      ) : (
      <div className="card w-full max-w-md space-y-4 p-5 shadow-2xl">
        <h2 id="pray-title" className="text-xl font-bold">🙏 Pray with intention</h2>
        <p>
          We want to be intentional in prayer, not just send emoji prayers. Take a moment now to pray for{' '}
          <strong>{subject}</strong>, or set aside a moment later today.
        </p>
        {details && <div className="rounded-lg bg-slate-100 p-3 text-sm dark:bg-slate-800">{details}</div>}

        <ErrorText error={error} />
        {mode === 'choose' && (
          <div className="space-y-2">
            <button className="btn-primary w-full" disabled={busy} onClick={() => run(onPrayed, () => setPrayed(true))}>🙏 I prayed</button>
            {onLater && <button className="btn-secondary w-full" disabled={busy} onClick={() => setMode('later')}>⏰ Set aside a moment later</button>}
            {onLater && moments.length === 1 && (
              <button className="btn-secondary w-full" disabled={busy} onClick={() => run(() => onLater(new Date(moments[0].at)), onClose)}>
                ➕ Add to my {clock(moments[0].at)} prayer time ({moments[0].who})
              </button>
            )}
            {onLater && moments.length > 1 && (
              <button className="btn-secondary w-full" disabled={busy} onClick={() => setMode('add')}>➕ Add to a prayer time I’ve set</button>
            )}
            <button className="btn-ghost w-full" disabled={busy} onClick={onClose}>Cancel</button>
          </div>
        )}
        {mode === 'later' && (
          <div className="space-y-2">
            <label htmlFor="pray-at" className="label">When will you pray? We’ll remind you.</label>
            <input id="pray-at" type="time" className="input text-lg" value={time} onChange={(e) => setTime(e.target.value)} />
            <p className="muted text-sm">{at.toDateString() === new Date().toDateString() ? 'Today' : 'Tomorrow'} at {time}</p>
            <button className="btn-primary w-full" disabled={busy || !time} onClick={() => run(() => onLater!(at), onClose)}>⏰ Remind me</button>
            <button className="btn-ghost w-full" disabled={busy} onClick={() => setMode('choose')}>Back</button>
          </div>
        )}
        {mode === 'add' && (
          <div className="space-y-2">
            <p className="label">Add {who ?? subject} to which prayer time?</p>
            {moments.map((m) => (
              <button key={m.at} className="btn-secondary w-full justify-start text-left" disabled={busy} onClick={() => run(() => onLater!(new Date(m.at)), onClose)}>
                <span className="w-24 shrink-0 font-bold">{clock(m.at)}</span><span className="truncate font-normal">{m.who}</span>
              </button>
            ))}
            <button className="btn-ghost w-full" disabled={busy} onClick={() => setMode('choose')}>Back</button>
          </div>
        )}
      </div>
      )}
    </div>
  )
}

/** "11:00", or "tomorrow 07:00". */
function clock(at: number): string {
  const d = new Date(at)
  const hhmm = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return d.toDateString() === new Date().toDateString() ? hhmm : `tomorrow ${hhmm}`
}

/** An hour from now, on a quarter hour. */
function defaultLaterTime(): string {
  const d = new Date(Date.now() + 60 * 60000)
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** The next time it's `hh:mm` (today, or tomorrow if that's already past). */
function laterDate(hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number)
  const d = new Date()
  d.setHours(h || 0, m || 0, 0, 0)
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1)
  return d
}
