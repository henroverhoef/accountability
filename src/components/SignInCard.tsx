import { useState } from 'react'
import { useData } from '../data/DataProvider'
import ErrorText, { errorMessage } from './ErrorText'
import { useAsync } from './useAsync'
import { addEmailAndPassword, friendlyAuthError, MIN_PASSWORD, realEmail, resendEmailChange, setPassword, syncConfirmedEmail } from '../lib/auth'

/**
 * How you sign in: your email and password, on any phone. Accounts from before email
 * sign-in add them here: the password works straight away, the email once you tap the
 * link we send to it. Your email is never shown to your groups.
 */
export default function SignInCard() {
  const { session } = useData()
  // Fresh from the server: you may have confirmed the email in another browser.
  const fresh = useAsync(() => syncConfirmedEmail(session?.user), [])
  const user = fresh.data ?? session?.user
  const email = realEmail(user)
  const waitingFor = user?.new_email && !email ? user.new_email : null
  const [editing, setEditing] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [password, setPw] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run(fn: () => Promise<void>, done: string) {
    setBusy(true)
    setError(null)
    setStatus(null)
    try {
      await fn()
      setStatus(done)
      setPw('')
      setEditing(false)
      fresh.reload()
    } catch (e) {
      setError(friendlyAuthError(errorMessage(e)))
    } finally {
      setBusy(false)
    }
  }

  const passwordField = (label: string) => (
    <div>
      <label htmlFor="new-password" className="label">{label}</label>
      <div className="flex gap-2">
        <input id="new-password" type={show ? 'text' : 'password'} className="input flex-1" autoComplete="new-password" minLength={MIN_PASSWORD}
          value={password} onChange={(e) => setPw(e.target.value)} />
        <button type="button" className="btn-ghost px-3" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? '🙈' : '👁️'}</button>
      </div>
      <p className="muted mt-1 text-xs">At least {MIN_PASSWORD} characters.</p>
    </div>
  )

  return (
    <div className="card space-y-3">
      {email ? (
        <>
          <p>✅ You sign in with <strong>{email}</strong> and your password, on any phone.</p>
          {editing ? (
            <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); run(() => setPassword(password), 'Password changed ✓') }}>
              {passwordField('New password')}
              <button className="btn-primary w-full" disabled={busy || password.length < MIN_PASSWORD}>{busy ? 'Saving…' : 'Change password'}</button>
              <button type="button" className="btn-ghost w-full" onClick={() => setEditing(false)}>Cancel</button>
            </form>
          ) : (
            <button className="btn-secondary w-full" onClick={() => setEditing(true)}>Change password</button>
          )}
        </>
      ) : waitingFor && !editing ? (
        <>
          <p>📧 We sent a link to <strong>{waitingFor}</strong>. Tap it to confirm your email (check your spam folder too). Then you can sign in with it and your password.</p>
          <button className="btn-secondary w-full" disabled={busy} onClick={() => run(() => resendEmailChange(waitingFor), 'Sent again. It can take a minute to arrive.')}>
            Send the email again
          </button>
          <button className="btn-ghost w-full" onClick={() => { setNewEmail(''); setEditing(true) }}>Use a different email</button>
        </>
      ) : (
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); run(() => addEmailAndPassword(newEmail, password), '') }}>
          <p>Add your email and a password, so you can sign in on any phone (no more login codes). Your group never sees your email.</p>
          <div>
            <label htmlFor="add-email" className="label">Email</label>
            <input id="add-email" type="email" className="input" autoComplete="email" autoCapitalize="none" inputMode="email"
              value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
          </div>
          {passwordField('Choose a password')}
          <button className="btn-primary w-full" disabled={busy || !newEmail.trim() || password.length < MIN_PASSWORD}>{busy ? 'Saving…' : 'Add email and password'}</button>
          {waitingFor && <button type="button" className="btn-ghost w-full" onClick={() => setEditing(false)}>Cancel</button>}
        </form>
      )}
      {status && <p className="text-sm font-medium" role="status">{status}</p>}
      <ErrorText error={error} />
    </div>
  )
}
