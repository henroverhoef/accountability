import { useEffect, useState } from 'react'
import ErrorText, { errorMessage } from './ErrorText'

/**
 * Before a 🙏 is sent: a moment to actually pray. "I prayed" or "I'll set aside time"
 * (with a reminder at the time you pick). Either way the person sees you're praying.
 */
export default function PrayerPrompt({ subject, details, onPrayed, onLater, onClose }: {
  subject: string // "Jesse's Purity", "Jesse", "everyone's No Short-form Video"
  details?: React.ReactNode // what they shared, to pray into
  onPrayed: () => Promise<void>
  onLater?: (at: Date) => Promise<void> // leave out to only offer "I prayed"
  onClose: () => void
}) {
  const [seconds, setSeconds] = useState(0)
  const [later, setLater] = useState(false)
  const [time, setTime] = useState(defaultLaterTime)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => Math.min(s + 1, 60)), 1000)
    return () => clearInterval(t)
  }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
      onClose()
    } catch (e) {
      setError(errorMessage(e))
      setBusy(false)
    }
  }

  const at = laterDate(time)

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-3 text-left font-normal sm:items-center" role="dialog" aria-modal="true" aria-labelledby="pray-title"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="card w-full max-w-md space-y-4 p-5 shadow-2xl">
        <h2 id="pray-title" className="text-xl font-bold">🙏 Pray with intention</h2>
        <p>
          We want to be intentional in prayer, not just send emoji prayers. Take at least a minute now to pray for{' '}
          <strong>{subject}</strong>, or set aside a time later today.
        </p>
        {details && <div className="rounded-lg bg-slate-100 p-3 text-sm dark:bg-slate-800">{details}</div>}

        <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
          <div className="h-full rounded-full bg-amber-400 transition-all duration-1000 ease-linear" style={{ width: `${(seconds / 60) * 100}%` }} />
        </div>
        <p className="muted -mt-2 text-xs">{seconds < 60 ? `${60 - seconds}s of the minute left` : 'A minute well spent 🙌'}</p>

        <ErrorText error={error} />
        {!later ? (
          <div className="space-y-2">
            <button className="btn-primary w-full" disabled={busy} onClick={() => run(onPrayed)}>🙏 I prayed</button>
            {onLater && <button className="btn-secondary w-full" disabled={busy} onClick={() => setLater(true)}>⏰ I’ll set aside time later</button>}
            <button className="btn-ghost w-full" disabled={busy} onClick={onClose}>Cancel</button>
          </div>
        ) : (
          <div className="space-y-2">
            <label htmlFor="pray-at" className="label">When will you pray? We’ll remind you.</label>
            <input id="pray-at" type="time" className="input text-lg" value={time} onChange={(e) => setTime(e.target.value)} />
            <p className="muted text-sm">{at.toDateString() === new Date().toDateString() ? 'Today' : 'Tomorrow'} at {time}</p>
            <button className="btn-primary w-full" disabled={busy || !time} onClick={() => run(() => onLater!(at))}>⏰ Remind me</button>
            <button className="btn-ghost w-full" disabled={busy} onClick={() => setLater(false)}>Back</button>
          </div>
        )}
      </div>
    </div>
  )
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
