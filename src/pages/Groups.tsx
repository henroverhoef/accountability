import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import ErrorText, { errorMessage } from '../components/ErrorText'
import { useAsync } from '../components/useAsync'
import { createGroup, joinGroup, listMyGroups } from '../lib/groups'

export default function Groups() {
  const { data: groups, error, reload } = useAsync(listMyGroups, [])
  return (
    <div className="page space-y-4">
      <h1 className="h1">Groups</h1>
      <p className="muted">A few trusted brothers who check in on each other and pray. You decide what each group sees.</p>
      <ErrorText error={error} />
      {groups && groups.length > 0 && (
        <ul className="space-y-2">
          {groups.map((g) => (
            <li key={g.id}>
              <Link to={`/groups/${g.id}`} className="card flex min-h-16 items-center gap-3">
                <span className="text-2xl" aria-hidden>👥</span>
                <span className="flex-1 font-semibold">{g.name}</span>
                <span aria-hidden>›</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <JoinOrCreate onDone={reload} />
    </div>
  )
}

/** Join with a code, or start a new group. Also used during onboarding. */
export function JoinOrCreate({ onDone }: { onDone?: (groupId: string) => void | Promise<unknown> }) {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(e: FormEvent, fn: () => Promise<string>) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const id = await fn()
      if (onDone) await onDone(id)
      navigate(`/groups/${id}`)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <form className="card space-y-3" onSubmit={(e) => run(e, () => joinGroup(code))}>
        <h2 className="h2">Join a group</h2>
        <label htmlFor="code" className="label">Invite code</label>
        <input id="code" className="input text-center text-xl uppercase tracking-widest" maxLength={12} autoCapitalize="characters"
          autoComplete="off" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ABCD2345" />
        <button className="btn-primary w-full" disabled={busy || code.trim().length < 6}>Join</button>
      </form>
      <form className="card space-y-3" onSubmit={(e) => run(e, async () => (await createGroup(name)).id)}>
        <h2 className="h2">Start a group</h2>
        <label htmlFor="gname" className="label">Group name</label>
        <input id="gname" className="input" maxLength={50} value={name} onChange={(e) => setName(e.target.value)} placeholder="Tuesday men’s group" />
        <button className="btn-secondary w-full" disabled={busy || !name.trim()}>Create group</button>
      </form>
      <ErrorText error={error} />
    </div>
  )
}
