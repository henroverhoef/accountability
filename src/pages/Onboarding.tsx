import { useState } from 'react'
import { useData } from '../data/DataProvider'
import TimezoneSelect from '../components/TimezoneSelect'
import ErrorText, { errorMessage } from '../components/ErrorText'
import { TEMPLATES } from '../lib/templates'
import { shortTime, TYPE_NAMES } from '../lib/outcomes'
import PushToggle from '../components/PushToggle'

const STEPS = ['about', 'habits', 'notify', 'privacy'] as const
type Step = (typeof STEPS)[number]

export default function Onboarding() {
  const { profile, saveProfile, createHabit, habits } = useData()
  const [step, setStep] = useState<Step>('about')
  const [name, setName] = useState(profile?.display_name ?? '')
  const [timezone, setTimezone] = useState(profile?.timezone ?? 'Africa/Johannesburg')
  const [reminder, setReminder] = useState(shortTime(profile?.checkin_reminder_time) || '21:30')
  const [picked, setPicked] = useState<string[]>(['purity', 'quiet-time'])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const index = STEPS.indexOf(step)
  const next = () => setStep(STEPS[Math.min(index + 1, STEPS.length - 1)])

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <p className="muted mb-2">Step {index + 1} of {STEPS.length}</p>

      {step === 'about' && (
        <section className="space-y-4">
          <h1 className="h1">Welcome 👋</h1>
          <p className="muted">Steadfast helps you build good habits, break bad ones, and walk together with a few trusted brothers.</p>
          <div>
            <label htmlFor="name" className="label">Your first name (what your group will see)</label>
            <input id="name" className="input" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" />
          </div>
          <div>
            <label htmlFor="tz" className="label">Your timezone</label>
            <TimezoneSelect id="tz" value={timezone} onChange={setTimezone} />
          </div>
          <button className="btn-primary w-full" disabled={busy || !name.trim()}
            onClick={() => run(async () => { await saveProfile({ display_name: name.trim(), timezone }); next() })}>
            Continue
          </button>
        </section>
      )}

      {step === 'habits' && (
        <section className="space-y-4">
          <h1 className="h1">Pick your habits</h1>
          <p className="muted">Start small: two or three is plenty. You can rename them (e.g. call Purity just “P”) and add more later.</p>
          <ul className="space-y-2">
            {TEMPLATES.map((t) => {
              const on = picked.includes(t.key)
              return (
                <li key={t.key}>
                  <label className={`card flex cursor-pointer items-center gap-3 ${on ? 'ring-2 ring-amber-400' : ''}`}>
                    <input type="checkbox" className="h-5 w-5 accent-amber-500" checked={on}
                      onChange={() => setPicked(on ? picked.filter((k) => k !== t.key) : [...picked, t.key])} />
                    <span className="text-2xl" aria-hidden>{t.habit.icon}</span>
                    <span className="flex-1">
                      <span className="block font-semibold">{t.habit.name}</span>
                      <span className="muted block">{t.description} <em>({TYPE_NAMES[t.habit.type]})</em></span>
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
          <button className="btn-primary w-full" disabled={busy}
            onClick={() => run(async () => {
              // Don't create duplicates if someone goes back and forth.
              const existing = new Set(habits.map((h) => h.name))
              for (const t of TEMPLATES.filter((t) => picked.includes(t.key) && !existing.has(t.habit.name))) {
                await createHabit(t.habit)
              }
              next()
            })}>
            {busy ? 'Saving…' : 'Continue'}
          </button>
        </section>
      )}

      {step === 'notify' && (
        <section className="space-y-4">
          <h1 className="h1">Daily reminder</h1>
          <p className="muted">When should we remind you to check in? Evenings work well for most people. If you forget, you can check in the next morning.</p>
          <div>
            <label htmlFor="remind" className="label">Check-in reminder</label>
            <input id="remind" type="time" className="input" value={reminder} onChange={(e) => setReminder(e.target.value)} />
          </div>
          <div className="card">
            <p className="mb-3 text-sm">Notifications are always discreet: just “Time for your evening check-in”, never what you’re working on.</p>
            <PushToggle showTest={false} />
          </div>
          <button className="btn-primary w-full" disabled={busy || !reminder}
            onClick={() => run(async () => { await saveProfile({ checkin_reminder_time: reminder }); next() })}>
            Continue
          </button>
        </section>
      )}

      {step === 'privacy' && (
        <section className="space-y-4">
          <h1 className="h1">Your privacy</h1>
          <div className="card space-y-3 text-sm leading-relaxed">
            <p>🔒 <strong>Everything is private by default.</strong> Your habits, answers and notes are only visible to you.</p>
            <p>👥 If you join a group, you choose <strong>per habit</strong> what that group may see:</p>
            <ul className="ml-5 list-disc space-y-1">
              <li><strong>Private</strong>: nothing about this habit.</li>
              <li><strong>Check-in only</strong>: that you checked in, not how it went.</li>
              <li><strong>Result</strong>: how it went and your streak.</li>
              <li><strong>Result + notes</strong>: also your tags and notes.</li>
            </ul>
            <p>The app name, icon and notifications never mention what you’re working on.</p>
            <p>Group members can see whether you did your daily check-in, so they know when to reach out.</p>
          </div>
          <p className="muted">Notifications, PIN lock and groups can be set up any time.</p>
          <button className="btn-primary w-full" disabled={busy}
            onClick={() => run(() => saveProfile({ onboarded: true }))}>
            Let’s go
          </button>
        </section>
      )}

      <ErrorText error={error} />
      {index > 0 && (
        <button className="btn-ghost mt-2 w-full" onClick={() => setStep(STEPS[index - 1])}>Back</button>
      )}
    </div>
  )
}
