import { useState, type FormEvent, type ReactNode } from 'react'
import { useData } from '../data/DataProvider'
import ErrorText, { errorMessage } from '../components/ErrorText'
import { supabase } from '../lib/supabase'
import { createGroup, joinGroup } from '../lib/groups'
import { signInWithLoginCode } from '../lib/account'
import { isIos, isStandalone } from '../lib/push'

type Mode = 'join' | 'create' | 'login'

/** Invite links look like …/#/join/ABCD2345: pre-fill that code. */
function codeFromLink(): string {
  const m = window.location.hash.match(/#\/join\/([A-Za-z0-9]+)/)
  return m ? m[1].toUpperCase() : ''
}

/**
 * First screen: no email, no password. Type your name and your group's code.
 * Behind the scenes this creates a private account that lives on this phone
 * (a Supabase "anonymous" account). Login codes let you move it to another phone.
 */
export default function Welcome({ onBusy }: { onBusy: (busy: boolean) => void }) {
  const { reload } = useData()
  const [mode, setMode] = useState<Mode>('join')
  const [name, setName] = useState('')
  const [code, setCode] = useState(codeFromLink)
  const [groupName, setGroupName] = useState('')
  const [loginCode, setLoginCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [skipInstall, setSkipInstall] = useState(false)

  async function run(e: FormEvent, fn: () => Promise<void>) {
    e.preventDefault()
    setBusy(true)
    onBusy(true)
    setError(null)
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

  /** Make (or reuse) this phone's account, then save the name. */
  async function startAccount(): Promise<string> {
    const { data } = await supabase.auth.getSession()
    if (data.session) return data.session.user.id
    const { data: created, error } = await supabase.auth.signInAnonymously()
    if (error) throw error
    return created.user!.id
  }

  async function saveName(userId: string) {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Johannesburg'
    const { error } = await supabase.from('profiles').update({ display_name: name.trim(), timezone }).eq('id', userId)
    if (error) throw error
  }

  // On iPhone the installed app and Safari keep separate storage, so start in the installed app.
  if (isIos() && !isStandalone() && !skipInstall) {
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

  return (
    <Shell>
      {mode === 'join' && (
        <form className="card space-y-4" onSubmit={(e) => run(e, async () => {
          const uid = await startAccount()
          await joinGroup(code)
          await saveName(uid)
        })}>
          <NameField name={name} setName={setName} />
          <div>
            <label htmlFor="code" className="label">Group code</label>
            <input id="code" required className="input text-center text-xl uppercase tracking-widest" maxLength={12} autoComplete="off"
              autoCapitalize="characters" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ABCD2345" />
          </div>
          <button className="btn-primary w-full" disabled={busy || !name.trim() || code.trim().length < 6}>{busy ? 'Joining…' : 'Join'}</button>
        </form>
      )}

      {mode === 'create' && (
        <form className="card space-y-4" onSubmit={(e) => run(e, async () => {
          const uid = await startAccount()
          await createGroup(groupName.trim())
          await saveName(uid)
        })}>
          <NameField name={name} setName={setName} />
          <div>
            <label htmlFor="gname" className="label">Name for your group</label>
            <input id="gname" required className="input" maxLength={50} value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="Tuesday men’s group" />
          </div>
          <button className="btn-primary w-full" disabled={busy || !name.trim() || !groupName.trim()}>{busy ? 'Creating…' : 'Start group'}</button>
          <p className="muted">You’ll get a code to share with the others.</p>
        </form>
      )}

      {mode === 'login' && (
        <form className="card space-y-4" onSubmit={(e) => run(e, () => signInWithLoginCode(loginCode))}>
          <p className="muted">Using Steadfast on a new phone? On your old phone go to <strong>Settings → Login code</strong>, then type that code here.</p>
          <div>
            <label htmlFor="login" className="label">Your login code</label>
            <input id="login" required className="input text-center text-xl uppercase tracking-widest" autoComplete="off" autoCapitalize="characters"
              value={loginCode} onChange={(e) => setLoginCode(e.target.value.toUpperCase())} placeholder="XXXX-XXXX-XXXX" />
          </div>
          <button className="btn-primary w-full" disabled={busy || loginCode.replace(/[^A-Z0-9]/g, '').length < 12}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>
      )}

      <ErrorText error={error} />

      <div className="space-y-1">
        {mode !== 'join' && <button className="btn-ghost w-full" onClick={() => { setMode('join'); setError(null) }}>Join a group with a code</button>}
        {mode !== 'create' && <button className="btn-ghost w-full" onClick={() => { setMode('create'); setError(null) }}>Start a new group</button>}
        {mode !== 'login' && <button className="btn-ghost w-full" onClick={() => { setMode('login'); setError(null) }}>I already use Steadfast</button>}
      </div>
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

function friendly(message: string): string {
  if (/anonymous sign-ins are disabled/i.test(message)) {
    return 'The app’s setup isn’t finished yet (Supabase “anonymous sign-ins” is off). Ask whoever set it up to check the README.'
  }
  if (/failed to fetch|load failed|network/i.test(message)) return 'No internet connection. Please try again when you’re online.'
  return message
}
