import { useState } from 'react'
import { Link } from 'react-router-dom'
import ErrorText, { errorMessage } from '../components/ErrorText'
import { friendlyAuthError, MIN_PASSWORD, setPassword } from '../lib/auth'
import { isIos, isStandalone } from '../lib/push'

/** From the "reset your password" email: you're signed in by the link; choose a new password. */
export default function NewPassword() {
  const [password, setPw] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await setPassword(password)
      setDone(true)
    } catch (err) {
      setError(friendlyAuthError(errorMessage(err)))
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="page space-y-4">
        <section className="card space-y-3 text-center">
          <p className="text-4xl" aria-hidden>✅</p>
          <h1 className="h1">Password changed</h1>
          {/* The email link opens in Safari, which doesn't share the installed app's sign-in. */}
          {isIos() && !isStandalone() && <p>Go back to the Steadfast app and sign in with your email and new password.</p>}
        </section>
        <Link to="/" className="btn-primary w-full">Continue</Link>
      </div>
    )
  }

  return (
    <div className="page space-y-4">
      <h1 className="h1">Choose a new password</h1>
      <form className="card space-y-3" onSubmit={save}>
        <div>
          <label htmlFor="new-password" className="label">New password</label>
          <div className="flex gap-2">
            <input id="new-password" type={show ? 'text' : 'password'} className="input flex-1" autoComplete="new-password" minLength={MIN_PASSWORD} required
              value={password} onChange={(e) => setPw(e.target.value)} />
            <button type="button" className="btn-ghost px-3" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? '🙈' : '👁️'}</button>
          </div>
          <p className="muted mt-1 text-xs">At least {MIN_PASSWORD} characters.</p>
        </div>
        <button className="btn-primary w-full" disabled={busy || password.length < MIN_PASSWORD}>{busy ? 'Saving…' : 'Save new password'}</button>
      </form>
      <ErrorText error={error} />
    </div>
  )
}
