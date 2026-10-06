import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

// Sign in with a one-time code sent by email (works inside the installed app on iPhone,
// where magic links would open in Safari instead). The email also contains a link for
// people using the app in a normal browser tab.
export default function SignIn() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function sendCode(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMessage(null)
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin + import.meta.env.BASE_URL },
    })
    setBusy(false)
    if (error) setMessage(error.message)
    else setStep('code')
  }

  async function verify(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMessage(null)
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' })
    setBusy(false)
    if (error) setMessage(error.message)
  }

  return (
    <div className="page flex min-h-dvh flex-col justify-center">
      <div className="mb-8 text-center">
        <img src={`${import.meta.env.BASE_URL}icon-192.png`} alt="" className="mx-auto mb-4 h-20 w-20 rounded-3xl" />
        <h1 className="h1">Steadfast</h1>
        <p className="muted mt-1">Daily habits, honest check-ins, brothers who pray.</p>
      </div>

      {step === 'email' ? (
        <form onSubmit={sendCode} className="card space-y-4">
          <div>
            <label htmlFor="email" className="label">Email address</label>
            <input id="email" type="email" required autoComplete="email" inputMode="email" className="input"
              value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </div>
          <button className="btn-primary w-full" disabled={busy}>{busy ? 'Sending…' : 'Send me a sign-in code'}</button>
        </form>
      ) : (
        <form onSubmit={verify} className="card space-y-4">
          <p className="muted">We sent a code to <strong>{email}</strong>. Enter it below (check your spam folder too).</p>
          <div>
            <label htmlFor="code" className="label">Sign-in code</label>
            <input id="code" required autoComplete="one-time-code" inputMode="numeric" className="input text-center text-2xl tracking-widest"
              value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 10))} />
          </div>
          <button className="btn-primary w-full" disabled={busy || code.length < 6}>{busy ? 'Checking…' : 'Sign in'}</button>
          <button type="button" className="btn-ghost w-full" onClick={() => { setStep('email'); setCode('') }}>Use a different email</button>
        </form>
      )}
      {message && <p role="alert" className="mt-4 text-center text-sm text-rose-600 dark:text-rose-400">{message}</p>}
    </div>
  )
}
