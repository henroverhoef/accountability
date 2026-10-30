import { useState, type FormEvent, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useData } from '../data/DataProvider'
import ErrorText, { errorMessage } from '../components/ErrorText'
import { supabase } from '../lib/supabase'
import { createGroup, joinGroup } from '../lib/groups'
import { signInWithLoginCode } from '../lib/account'
import { friendlyAuthError, MIN_PASSWORD, resendConfirmation, sendPasswordReset, signIn, signUp } from '../lib/auth'
import { isIos, isStandalone } from '../lib/push'

type Mode = 'signup' | 'check-email' | 'signin' | 'forgot' | 'setup' | 'code'
type Start = 'join' | 'create'

/** What you filled in when signing up, kept until your email is confirmed (never the password). */
interface Pending { email: string; name: string; start: Start; code: string; groupName: string; groupCreated?: boolean }
const PENDING_KEY = 'steadfast:pending-signup'
function loadPending(): Pending | null {
  try { return JSON.parse(localStorage.getItem(PENDING_KEY) ?? 'null') } catch { return null }
}
function savePending(p: Pending | null) {
  try { if (p) localStorage.setItem(PENDING_KEY, JSON.stringify(p)); else localStorage.removeItem(PENDING_KEY) } catch { /* private mode */ }
}

/** Invite links look like …/#/join/ABCD2345: pre-fill that code. */
function codeFromLink(): string {
  const m = window.location.hash.match(/#\/join\/([A-Za-z0-9]+)/)
  return m ? m[1].toUpperCase() : ''
}

/**
 * First screen: create an account (name, email, password, and your group's code or a new
 * group), confirm your email, and you're in. Or sign in with your email and password on
 * any phone. Accounts from before email sign-in can still come in with a login code.
 */
export default function Welcome({ onBusy }: { onBusy: (busy: boolean) => void }) {
  const { reload, session } = useData()
  const [params] = useSearchParams()
  const [pending, setPending] = useState(loadPending)
  const confirmedHere = params.get('auth') === 'confirmed'
  const [mode, setMode] = useState<Mode>(() => (session ? 'setup' : pending ? 'check-email' : 'signup'))
  const [start, setStart] = useState<Start>(pending?.start ?? 'join')
  const [name, setName] = useState(pending?.name ?? '')
  const [email, setEmail] = useState(pending?.email ?? '')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState(codeFromLink() || pending?.code || '')
  const [groupName, setGroupName] = useState(pending?.groupName ?? '')
  const [loginCode, setLoginCode] = useState('')
  const [continueHere, setContinueHere] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(() => { const e = params.get('auth_error'); return e ? friendly(e) : null })
  const [status, setStatus] = useState<string | null>(null)
  const [skipInstall, setSkipInstall] = useState(false)

  async function run(e: FormEvent | null, fn: () => Promise<void>) {
    e?.preventDefault()
    setBusy(true)
    onBusy(true)
    setError(null)
    setStatus(null)
    try {
      await fn()
      if (window.location.hash.startsWith('#/join/')) window.location.hash = '#/'
      await reload()
    } catch (err) {
      setError(friendly(errorMessage(err)))
    } finally {
      setBusy(false)
      onBusy(false)
    }
  }

  const go = (m: Mode) => { setMode(m); setError(null); setStatus(null) }
  // Signed in but no name yet (e.g. the email link signed you in here): finish setting up.
  const view: Mode = session && !busy ? 'setup' : mode

  /** Signed in: join or start the group and save your name (safe to run again). */
  async function finish(p: Pending) {
    const { data } = await supabase.auth.getSession()
    const userId = data.session?.user.id
    if (!userId) throw new Error('Not signed in yet.')
    if (p.start === 'join') await joinGroup(p.code)
    else if (!p.groupCreated) {
      await createGroup(p.groupName.trim())
      savePending({ ...p, groupCreated: true })
    }
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Johannesburg'
    const { error } = await supabase.from('profiles').update({ display_name: p.name.trim(), timezone }).eq('id', userId)
    if (error) throw error
    savePending(null)
    setPending(null)
  }

  const form = (): Pending => ({ email: email.trim(), name: name.trim(), start, code: code.trim(), groupName: groupName.trim() })

  // On iPhone the installed app and Safari keep separate storage, so start in the installed app
  // (but an email link always opens in Safari: let that through).
  if (isIos() && !isStandalone() && !skipInstall && !confirmedHere && view === 'signup') {
    return (
      <Shell>
        <div className="card space-y-3">
          <h2 className="h2">📲 First, add Steadfast to your Home Screen</h2>
          <ol className="ml-5 list-decimal space-y-1">
            <li>Tap the <strong>Share</strong> button (square with an arrow) at the bottom of Safari.</li>
            <li>Choose <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</li>
            <li>Open Steadfast from the new icon and continue there.</li>
          </ol>
          {code && <p className="muted">Your group code: <strong className="tracking-widest">{code}</strong> (you’ll need it in the app).</p>}
        </div>
        <button className="btn-ghost w-full" onClick={() => setSkipInstall(true)}>Continue in Safari instead</button>
      </Shell>
    )
  }

  // Tapped the email link on a phone where the app itself keeps its own sign-in (iPhone).
  if (session && view === 'setup' && confirmedHere && !pending && !continueHere) {
    return (
      <Shell>
        <div className="card space-y-3 text-center">
          <p className="text-4xl" aria-hidden>✅</p>
          <h2 className="h2">Your email is confirmed</h2>
          <p>Go back to the Steadfast app and tap <strong>“I’ve confirmed my email”</strong>.</p>
        </div>
        <button className="btn-ghost w-full" onClick={() => setContinueHere(true)}>Not using the app? Continue here</button>
      </Shell>
    )
  }

  return (
    <Shell>
      {view === 'signup' && (
        <form className="card space-y-4" onSubmit={(e) => run(e, async () => {
          const p = form()
          savePending(p)
          setPending(p)
          if ((await signUp(p.email, password)) === 'signed-in') await finish(p)
          else go('check-email')
        })}>
          <h2 className="h2">Create your account</h2>
          <NameField name={name} setName={setName} />
          <EmailField email={email} setEmail={setEmail} />
          <PasswordField password={password} setPassword={setPassword} isNew />
          <StartFields start={start} setStart={setStart} code={code} setCode={setCode} groupName={groupName} setGroupName={setGroupName} />
          <button className="btn-primary w-full" disabled={busy || !name.trim() || !email.trim() || password.length < MIN_PASSWORD
            || (start === 'join' ? code.trim().length < 6 : !groupName.trim())}>
            {busy ? 'Creating…' : 'Create account'}
          </button>
          <p className="muted text-sm">We’ll email you a link to confirm your address. Your email is only for signing in; your group sees your first name.</p>
        </form>
      )}

      {view === 'check-email' && pending && (
        <form className="card space-y-4" onSubmit={(e) => run(e, async () => {
          await signIn(pending.email, password)
          await finish(pending)
        })}>
          <p className="text-4xl" aria-hidden>📧</p>
          <h2 className="h2">Check your email</h2>
          <p>We sent a link to <strong>{pending.email}</strong>. Tap it to confirm your address (check your spam folder too), then come back here.</p>
          {!password && <PasswordField password={password} setPassword={setPassword} />}
          <button className="btn-primary w-full" disabled={busy || !password}>{busy ? 'Signing in…' : 'I’ve confirmed my email'}</button>
          <button type="button" className="btn-secondary w-full" disabled={busy}
            onClick={() => run(null, async () => { await resendConfirmation(pending.email); setStatus('Sent again. It can take a minute to arrive.') })}>
            Send the email again
          </button>
          <button type="button" className="btn-ghost w-full" onClick={() => { savePending(null); setPending(null); go('signup') }}>Use a different email</button>
        </form>
      )}

      {view === 'signin' && (
        <form className="card space-y-4" onSubmit={(e) => run(e, async () => {
          await signIn(email, password)
          if (pending && pending.email === email.trim()) await finish(pending)
        })}>
          <h2 className="h2">Sign in</h2>
          <EmailField email={email} setEmail={setEmail} />
          <PasswordField password={password} setPassword={setPassword} />
          <button className="btn-primary w-full" disabled={busy || !email.trim() || !password}>{busy ? 'Signing in…' : 'Sign in'}</button>
          <button type="button" className="btn-ghost w-full" onClick={() => go('forgot')}>Forgot password?</button>
        </form>
      )}

      {view === 'forgot' && (
        <form className="card space-y-4" onSubmit={(e) => run(e, async () => {
          await sendPasswordReset(email)
          setStatus(`If there’s an account for ${email.trim()}, we’ve sent it a link to choose a new password.`)
        })}>
          <h2 className="h2">Forgot your password?</h2>
          <p className="muted">We’ll email you a link to choose a new one.</p>
          <EmailField email={email} setEmail={setEmail} />
          <button className="btn-primary w-full" disabled={busy || !email.trim()}>{busy ? 'Sending…' : 'Send me a link'}</button>
          <button type="button" className="btn-ghost w-full" onClick={() => go('signin')}>Back to sign in</button>
        </form>
      )}

      {view === 'setup' && (
        // Signed in, but the account has no name yet (e.g. confirmed on this phone): finish here.
        <form className="card space-y-4" onSubmit={(e) => run(e, () => finish(form()))}>
          <h2 className="h2">Almost there</h2>
          <NameField name={name} setName={setName} />
          <StartFields start={start} setStart={setStart} code={code} setCode={setCode} groupName={groupName} setGroupName={setGroupName} />
          <button className="btn-primary w-full" disabled={busy || !name.trim() || (start === 'join' ? code.trim().length < 6 : !groupName.trim())}>
            {busy ? 'Saving…' : start === 'join' ? 'Join' : 'Start group'}
          </button>
        </form>
      )}

      {view === 'code' && (
        <form className="card space-y-4" onSubmit={(e) => run(e, () => signInWithLoginCode(loginCode))}>
          <p className="muted">Haven’t added an email to your account yet? On your old phone go to <strong>Settings → Login code</strong>, then type that code here.</p>
          <div>
            <label htmlFor="login" className="label">Your login code</label>
            <input id="login" required className="input text-center text-xl uppercase tracking-widest" autoComplete="off" autoCapitalize="characters"
              value={loginCode} onChange={(e) => setLoginCode(e.target.value.toUpperCase())} placeholder="XXXX-XXXX-XXXX" />
          </div>
          <button className="btn-primary w-full" disabled={busy || loginCode.replace(/[^A-Z0-9]/g, '').length < 12}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>
      )}

      {status && <p className="card text-sm" role="status">{status}</p>}
      <ErrorText error={error} />

      {view !== 'setup' && (
        <div className="space-y-1">
          {view !== 'signin' && <button className="btn-ghost w-full" onClick={() => go('signin')}>I already have an account: sign in</button>}
          {view !== 'signup' && view !== 'check-email' && <button className="btn-ghost w-full" onClick={() => go(pending ? 'check-email' : 'signup')}>Create an account</button>}
          {view !== 'code' && <button className="btn-ghost w-full text-sm" onClick={() => go('code')}>I have a login code</button>}
        </div>
      )}
    </Shell>
  )
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="page flex min-h-dvh flex-col justify-center space-y-4">
      <div className="mb-4 text-center">
        <img src={`${import.meta.env.BASE_URL}icon-192.png`} alt="" className="mx-auto mb-4 h-20 w-20 rounded-3xl" />
        <h1 className="h1">Steadfast</h1>
        <p className="muted mt-1">Daily habits, honest check-ins, brothers who pray.</p>
      </div>
      {children}
    </div>
  )
}

function NameField({ name, setName }: { name: string; setName: (v: string) => void }) {
  return (
    <div>
      <label htmlFor="name" className="label">Your first name</label>
      <input id="name" required className="input" maxLength={40} autoComplete="given-name" value={name} onChange={(e) => setName(e.target.value)} />
    </div>
  )
}

function EmailField({ email, setEmail }: { email: string; setEmail: (v: string) => void }) {
  return (
    <div>
      <label htmlFor="email" className="label">Email</label>
      <input id="email" type="email" required className="input" autoComplete="email" autoCapitalize="none" inputMode="email"
        value={email} onChange={(e) => setEmail(e.target.value)} />
    </div>
  )
}

function PasswordField({ password, setPassword, isNew = false }: { password: string; setPassword: (v: string) => void; isNew?: boolean }) {
  const [show, setShow] = useState(false)
  return (
    <div>
      <label htmlFor="password" className="label">{isNew ? 'Choose a password' : 'Password'}</label>
      <div className="flex gap-2">
        <input id="password" type={show ? 'text' : 'password'} required minLength={isNew ? MIN_PASSWORD : undefined} className="input flex-1"
          autoComplete={isNew ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} />
        <button type="button" className="btn-ghost px-3" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? '🙈' : '👁️'}</button>
      </div>
      {isNew && <p className="muted mt-1 text-xs">At least {MIN_PASSWORD} characters.</p>}
    </div>
  )
}

/** Join your group with its code, or start a new one. */
function StartFields({ start, setStart, code, setCode, groupName, setGroupName }: {
  start: Start; setStart: (s: Start) => void; code: string; setCode: (v: string) => void; groupName: string; setGroupName: (v: string) => void
}) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-200 p-1 dark:bg-slate-800" role="radiogroup" aria-label="Your group">
        {(['join', 'create'] as Start[]).map((s) => (
          <button key={s} type="button" role="radio" aria-checked={start === s} onClick={() => setStart(s)}
            className={`min-h-10 rounded-lg text-sm font-semibold ${start === s ? 'bg-white shadow dark:bg-slate-950' : 'text-slate-600 dark:text-slate-400'}`}>
            {s === 'join' ? 'Join a group' : 'Start a group'}
          </button>
        ))}
      </div>
      {start === 'join' ? (
        <div>
          <label htmlFor="code" className="label">Group code</label>
          <input id="code" required className="input text-center text-xl uppercase tracking-widest" maxLength={12} autoComplete="off"
            autoCapitalize="characters" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ABCD2345" />
        </div>
      ) : (
        <div>
          <label htmlFor="gname" className="label">Name for your group</label>
          <input id="gname" required className="input" maxLength={50} value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="Tuesday men’s group" />
          <p className="muted mt-1 text-xs">You’ll get a code to share with the others.</p>
        </div>
      )}
    </div>
  )
}

function friendly(message: string): string {
  if (/anonymous sign-ins are disabled/i.test(message)) {
    return 'The app’s setup isn’t finished yet (Supabase “anonymous sign-ins” is off). Ask whoever set it up to check the README.'
  }
  if (/failed to fetch|load failed|network/i.test(message)) return 'No internet connection. Please try again when you’re online.'
  return friendlyAuthError(message)
}
