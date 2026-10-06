import { useState, type ReactNode } from 'react'
import { useData } from '../data/DataProvider'
import TimezoneSelect from '../components/TimezoneSelect'
import PushToggle from '../components/PushToggle'
import Toggle from '../components/Toggle'
import LoginCodeCard from '../components/LoginCodeCard'
import ErrorText, { errorMessage } from '../components/ErrorText'
import { deleteMyAccount, downloadBlob, exportMyData } from '../lib/account'
import { clearPin, hasPin, setPin } from '../lib/pin'
import { disablePush } from '../lib/push'
import { shortTime } from '../lib/outcomes'
import type { Profile } from '../lib/types'

export default function Settings() {
  const { profile, saveProfile, signOut } = useData()
  const [name, setName] = useState(profile?.display_name ?? '')
  const [timezone, setTimezone] = useState(profile?.timezone ?? 'Africa/Johannesburg')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!profile) return null

  async function save(changes: Partial<Profile>) {
    setError(null)
    try {
      await saveProfile(changes)
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  async function saveProfileForm() {
    await save({ display_name: name.trim(), timezone })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="page space-y-4">
      <h1 className="h1">Settings</h1>
      <ErrorText error={error} />

      <section className="card space-y-3">
        <h2 className="h2">Profile</h2>
        <div>
          <label htmlFor="name" className="label">Display name</label>
          <input id="name" className="input" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label htmlFor="tz" className="label">Timezone</label>
          <TimezoneSelect id="tz" value={timezone} onChange={setTimezone} />
        </div>
        <button className="btn-primary w-full" onClick={saveProfileForm} disabled={!name.trim()}>{saved ? 'Saved ✓' : 'Save'}</button>
      </section>

      <section className="card space-y-4">
        <h2 className="h2">Notifications</h2>
        <PushToggle />

        <Toggle label="Check-in reminders & nudges" checked={profile.notify_reminders} onChange={(v) => save({ notify_reminders: v })} />

        <Row label="Evening check-in reminder" htmlFor="remind">
          <input id="remind" type="time" className="input w-36" value={shortTime(profile.checkin_reminder_time)}
            onChange={(e) => e.target.value && save({ checkin_reminder_time: e.target.value })} />
        </Row>

        <Toggle label="Nudge me if I haven’t checked in" checked={profile.nudge_enabled} onChange={(v) => save({ nudge_enabled: v })} />
        {profile.nudge_enabled && (
          <>
            <Row label="Nudge after" htmlFor="delay">
              <select id="delay" className="input w-36" value={profile.nudge_delay_minutes}
                onChange={(e) => save({ nudge_delay_minutes: Number(e.target.value) })}>
                {[30, 60, 90, 120].map((m) => <option key={m} value={m}>{m} min</option>)}
              </select>
            </Row>
            <Row label="Morning nudge (if I missed last night)" htmlFor="morning">
              <input id="morning" type="time" className="input w-36" value={shortTime(profile.morning_nudge_time)}
                onChange={(e) => e.target.value && save({ morning_nudge_time: e.target.value })} />
            </Row>
          </>
        )}

        <div>
          <p className="label">Quiet hours (no reminders)</p>
          <div className="flex items-center gap-2">
            <input aria-label="Quiet hours start" type="time" className="input" value={shortTime(profile.quiet_start)}
              onChange={(e) => save({ quiet_start: e.target.value || null })} />
            <span aria-hidden>→</span>
            <input aria-label="Quiet hours end" type="time" className="input" value={shortTime(profile.quiet_end)}
              onChange={(e) => save({ quiet_end: e.target.value || null })} />
          </div>
          {(profile.quiet_start || profile.quiet_end) && (
            <button className="mt-1 text-sm underline" onClick={() => save({ quiet_start: null, quiet_end: null })}>Clear quiet hours</button>
          )}
        </div>
        <Toggle label="Prayers & encouragement from my groups" checked={profile.notify_encouragement} onChange={(v) => save({ notify_encouragement: v })} />
        <Toggle label="“I need help” requests (always, even in quiet hours)" checked={profile.notify_sos} onChange={(v) => save({ notify_sos: v })} />
        <Toggle label="Sunday “week in review”" checked={profile.notify_weekly} onChange={(v) => save({ notify_weekly: v })} />
        <p className="muted">Per-habit reminders (e.g. quiet time at 06:00) are set when you edit a habit.</p>
      </section>

      <section id="login-code" className="space-y-2">
        <h2 className="h2 px-1">Login code</h2>
        <p className="muted px-1">There’s no password: your account lives on this phone. A login code lets you open it on a new phone (or after reinstalling). On the new phone choose “I already use Steadfast”.</p>
        <LoginCodeCard />
      </section>

      <PinSettings />

      <section className="card space-y-3">
        <h2 className="h2">Your data</h2>
        <p className="muted">Download everything Steadfast stores about you as a JSON file.</p>
        <ExportButton />
      </section>

      <section className="card space-y-3">
        <h2 className="h2">Account</h2>
        <button className="btn-secondary w-full" onClick={() => {
          const warning = profile.has_login_code
            ? 'Sign out of this phone? You can come back with your login code.'
            : 'You have no login code yet. If you sign out you can NEVER get back into this account. Sign out anyway?'
          if (confirm(warning)) signOut()
        }}>Sign out</button>
        <DeleteAccount onDeleted={signOut} />
      </section>
    </div>
  )
}

function Row({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
    </div>
  )
}

function PinSettings() {
  const [enabled, setEnabled] = useState(hasPin)
  const [step, setStep] = useState<'idle' | 'enter' | 'confirm'>('idle')
  const [first, setFirst] = useState('')
  const [value, setValue] = useState('')
  const [message, setMessage] = useState<string | null>(null)

  async function submit() {
    if (step === 'enter') {
      setFirst(value)
      setValue('')
      setStep('confirm')
      return
    }
    if (value !== first) {
      setMessage('The PINs didn’t match. Try again.')
      setStep('enter')
      setValue('')
      return
    }
    await setPin(value)
    setEnabled(true)
    setStep('idle')
    setValue('')
    setMessage('PIN set. Steadfast will ask for it when you open the app.')
  }

  return (
    <section className="card space-y-3">
      <h2 className="h2">App lock</h2>
      <p className="muted">Ask for a 4-digit PIN when the app opens, or after it’s been in the background for a minute. Stored only on this phone.</p>
      {step === 'idle' ? (
        enabled ? (
          <div className="flex gap-2">
            <button className="btn-secondary flex-1" onClick={() => { setStep('enter'); setMessage(null) }}>Change PIN</button>
            <button className="btn-ghost flex-1" onClick={() => { clearPin(); setEnabled(false); setMessage('PIN removed.') }}>Remove PIN</button>
          </div>
        ) : (
          <button className="btn-secondary w-full" onClick={() => { setStep('enter'); setMessage(null) }}>🔒 Set a PIN</button>
        )
      ) : (
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); submit() }}>
          <label htmlFor="pin" className="sr-only">{step === 'enter' ? 'New PIN' : 'Repeat PIN'}</label>
          <input id="pin" className="input text-center text-2xl tracking-[0.5em]" type="password" inputMode="numeric" autoComplete="off"
            placeholder={step === 'enter' ? 'New PIN' : 'Repeat'} value={value} onChange={(e) => setValue(e.target.value.replace(/\D/g, '').slice(0, 4))} />
          <button className="btn-primary" disabled={value.length !== 4}>{step === 'enter' ? 'Next' : 'Save'}</button>
        </form>
      )}
      {message && <p className="muted">{message}</p>}
    </section>
  )
}

function ExportButton() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <>
      <button className="btn-secondary w-full" disabled={busy} onClick={async () => {
        setBusy(true)
        setError(null)
        try {
          downloadBlob(await exportMyData(), `steadfast-export-${new Date().toISOString().slice(0, 10)}.json`)
        } catch (e) {
          setError(errorMessage(e))
        } finally {
          setBusy(false)
        }
      }}>
        {busy ? 'Preparing…' : '⬇️ Export my data'}
      </button>
      <ErrorText error={error} />
    </>
  )
}

function DeleteAccount({ onDeleted }: { onDeleted: () => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return <button className="btn-ghost w-full text-rose-600" onClick={() => setOpen(true)}>Delete my account…</button>

  return (
    <div className="space-y-2 rounded-xl border-2 border-rose-300 p-3 dark:border-rose-800">
      <p className="text-sm">This permanently deletes your account, habits, check-ins, notes, group memberships and messages. It cannot be undone. Consider exporting your data first.</p>
      <label htmlFor="del" className="label">Type DELETE to confirm</label>
      <input id="del" className="input" autoComplete="off" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
      <div className="flex gap-2">
        <button className="btn-ghost flex-1" onClick={() => setOpen(false)}>Cancel</button>
        <button className="btn-danger flex-1" disabled={busy || confirmText !== 'DELETE'} onClick={async () => {
          setBusy(true)
          setError(null)
          try {
            await disablePush().catch(() => {})
            await deleteMyAccount()
            await onDeleted()
          } catch (e) {
            setError(errorMessage(e))
            setBusy(false)
          }
        }}>
          Delete forever
        </button>
      </div>
      <ErrorText error={error} />
    </div>
  )
}
