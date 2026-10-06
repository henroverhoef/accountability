import { useState } from 'react'
import { useData } from '../data/DataProvider'
import TimezoneSelect from '../components/TimezoneSelect'
import ErrorText, { errorMessage } from '../components/ErrorText'
import { supabase } from '../lib/supabase'

export default function Settings() {
  const { profile, saveProfile, session } = useData()
  const [name, setName] = useState(profile?.display_name ?? '')
  const [timezone, setTimezone] = useState(profile?.timezone ?? 'Africa/Johannesburg')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function saveProfileForm() {
    setError(null)
    try {
      await saveProfile({ display_name: name.trim(), timezone })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  return (
    <div className="page space-y-4">
      <h1 className="h1">Settings</h1>

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
        <ErrorText error={error} />
      </section>

      <section className="card space-y-3">
        <h2 className="h2">Account</h2>
        <p className="muted">Signed in as {session?.user.email}</p>
        <button className="btn-secondary w-full" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </section>
    </div>
  )
}
