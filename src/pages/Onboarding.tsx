import { useState } from 'react'
import { useData } from '../data/DataProvider'
import ErrorText, { errorMessage } from '../components/ErrorText'
import PushToggle from '../components/PushToggle'
import LoginCodeCard from '../components/LoginCodeCard'
import { TEMPLATES } from '../lib/templates'
import { shortTime, TYPE_NAMES } from '../lib/outcomes'

// Short setup after joining: habits, reminder, privacy, and saving a login code.
const STEPS = ['habits', 'notify', 'privacy', 'code'] as const
type Step = (typeof STEPS)[number]

export default function Onboarding() {
  const { profile, saveProfile, createHabit, habits } = useData()
  const [step, setStep] = useState<Step>('habits')
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

      {step === 'habits' && (
        <section className="space-y-4">
          <h1 className="h1">Welcome, {profile?.display_name} 👋</h1>
          <p className="muted">Pick your habits. Start small: two or three is plenty. You can rename them (e.g. call Purity just “P”) and add more later.</p>
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
            <p>👥 You choose <strong>per habit</strong> what your group may see (on the group’s <em>Sharing</em> tab):</p>
            <ul className="ml-5 list-disc space-y-1">
              <li><strong>Private</strong>: nothing about this habit.</li>
              <li><strong>Check-in only</strong>: that you checked in, not how it went.</li>
              <li><strong>Result</strong>: how it went and your streak.</li>
              <li><strong>Result + notes</strong>: also your tags and notes.</li>
            </ul>
            <p>The app name, icon and notifications never mention what you’re working on.</p>
            <p>Your group can see whether you did your daily check-in, so they know when to reach out.</p>
          </div>
          <button className="btn-primary w-full" onClick={next}>Continue</button>
        </section>
      )}

      {step === 'code' && (
        <section className="space-y-4">
          <h1 className="h1">Don’t lose your account</h1>
          <p className="muted">There’s no password. Your account lives on this phone. Make a login code and keep it somewhere safe (e.g. a note in your password manager). With it you can use Steadfast on a new phone.</p>
          <LoginCodeCard />
          <button className="btn-primary w-full" disabled={busy} onClick={() => run(() => saveProfile({ onboarded: true }))}>
            Finish
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
