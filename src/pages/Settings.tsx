import { useState, type ReactNode } from 'react'
import { useData } from '../data/DataProvider'
import TimezoneSelect from '../components/TimezoneSelect'
import PushToggle from '../components/PushToggle'
import Toggle from '../components/Toggle'
import ErrorText, { errorMessage } from '../components/ErrorText'
import { supabase } from '../lib/supabase'
import { shortTime } from '../lib/outcomes'
import type { Profile } from '../lib/types'

export default function Settings() {
  const { profile, saveProfile, session } = useData()
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
        <p className="muted">Per-habit reminders (e.g. quiet time at 06:00) are set when you edit a habit.</p>
      </section>

      <section className="card space-y-3">
        <h2 className="h2">Account</h2>
        <p className="muted">Signed in as {session?.user.email}</p>
        <button className="btn-secondary w-full" onClick={() => supabase.auth.signOut()}>Sign out</button>
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
