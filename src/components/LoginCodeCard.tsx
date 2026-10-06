import { useState } from 'react'
import { useData } from '../data/DataProvider'
import { createLoginCode } from '../lib/account'
import ErrorText, { errorMessage } from './ErrorText'

/** Create and show a personal login code (shown once; making a new one replaces the old). */
export default function LoginCodeCard() {
  const { profile, reload } = useData()
  const [code, setCode] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function make() {
    if (profile?.has_login_code && !confirm('Make a new login code? Your old code will stop working.')) return
    setBusy(true)
    setError(null)
    try {
      setCode(await createLoginCode())
      reload()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card space-y-3">
      {code ? (
        <>
          <p className="muted">Your login code (write it down or copy it now; it won’t be shown again):</p>
          <p className="select-all text-center font-mono text-2xl font-bold tracking-widest">{code}</p>
          <button className="btn-secondary w-full" onClick={async () => { await navigator.clipboard?.writeText(code); setCopied(true) }}>
            {copied ? 'Copied ✓' : 'Copy'}
          </button>
          <p className="muted">Keep it private: anyone with this code can open your account.</p>
        </>
      ) : (
        <>
          {profile?.has_login_code && <p className="text-sm">✅ You already have a login code.</p>}
          <button className="btn-primary w-full" disabled={busy} onClick={make}>
            {busy ? 'Creating…' : profile?.has_login_code ? 'Make a new login code' : '🔑 Create my login code'}
          </button>
        </>
      )}
      <ErrorText error={error} />
    </div>
  )
}
