import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import ErrorText, { errorMessage } from '../components/ErrorText'
import { joinGroup } from '../lib/groups'

/** Opened from an invite link: #/join/ABCD2345 */
export default function Join() {
  const { code = '' } = useParams()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function join() {
    setBusy(true)
    try {
      navigate(`/groups/${await joinGroup(code)}`, { replace: true })
    } catch (e) {
      setError(errorMessage(e))
      setBusy(false)
    }
  }

  return (
    <div className="page space-y-4 text-center">
      <div className="text-5xl" aria-hidden>👥</div>
      <h1 className="h1">You’ve been invited</h1>
      <p className="muted">Join this group with code <strong className="tracking-widest">{code.toUpperCase()}</strong>? Your habits stay private until you choose to share them.</p>
      <button className="btn-primary w-full" disabled={busy} onClick={join}>Join group</button>
      <Link to="/groups" className="btn-ghost w-full">Not now</Link>
      <ErrorText error={error} />
    </div>
  )
}
