import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import ErrorText, { errorMessage } from '../components/ErrorText'
import { useAsync } from '../components/useAsync'
import { listMyGroups, sendEncouragement } from '../lib/groups'
import { GRACE_VERSES } from '../lib/verses'

// "I need help": one tap to ask your group(s) for prayer, then a calm screen with next steps.
// With ?mode=share (after a slip) it posts a gentle message instead of an urgent SOS.
export default function Sos() {
  const [params] = useSearchParams()
  const share = params.get('mode') === 'share'
  const groups = useAsync(listMyGroups, [])
  const [selected, setSelected] = useState<string[]>([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [sent, setSent] = useState(false)

  useEffect(() => {
    if (groups.data) setSelected(groups.data.map((g) => g.id))
  }, [groups.data])

  async function send() {
    setBusy(true)
    setError(null)
    const failures: string[] = []
    for (const gid of selected) {
      try {
        await sendEncouragement({
          group_id: gid,
          kind: share ? 'message' : 'sos',
          message: message || (share ? 'I had a hard day. Please pray for me.' : null),
        })
      } catch (e) {
        failures.push(errorMessage(e))
      }
    }
    setBusy(false)
    if (failures.length === selected.length) setError(failures[0])
    else {
      setSent(true)
      setDone(true)
    }
  }

  if (done) return <Calm sent={sent} />

  return (
    <div className="page space-y-4">
      <h1 className="h1">{share ? 'Reach out' : 'I need help'}</h1>
      <p>{share ? 'You don’t have to carry this alone. Let your brothers pray for you.' : 'Your group will get a notification asking them to pray for you right now.'}</p>

      {groups.data && groups.data.length === 0 && (
        <div className="card space-y-2">
          <p>You’re not in a group yet. Call or message a trusted friend now, and consider starting a group.</p>
          <Link to="/groups" className="btn-secondary w-full">Groups</Link>
        </div>
      )}

      {groups.data && groups.data.length > 0 && (
        <>
          <fieldset className="card space-y-2">
            <legend className="sr-only">Send to</legend>
            {groups.data.map((g) => (
              <label key={g.id} className="flex min-h-11 items-center gap-3">
                <input type="checkbox" className="h-5 w-5 accent-rose-600" checked={selected.includes(g.id)}
                  onChange={(e) => setSelected(e.target.checked ? [...selected, g.id] : selected.filter((x) => x !== g.id))} />
                {g.name}
              </label>
            ))}
          </fieldset>
          <div>
            <label htmlFor="sosmsg" className="label">Message (optional)</label>
            <textarea id="sosmsg" className="input" rows={2} maxLength={280} value={message} onChange={(e) => setMessage(e.target.value)}
              placeholder={share ? 'I had a hard day. Please pray for me.' : 'Struggling right now, please pray'} />
          </div>
          <button className={`${share ? 'btn-primary' : 'btn-danger'} w-full py-5 text-lg`} disabled={busy || selected.length === 0} onClick={send}>
            {busy ? 'Sending…' : share ? 'Send to my group' : '🙏 Ask for prayer now'}
          </button>
        </>
      )}
      <ErrorText error={error} />
      <button className="btn-ghost w-full" onClick={() => setDone(true)}>Skip: just help me now</button>
    </div>
  )
}

function Calm({ sent }: { sent?: boolean }) {
  const verse = GRACE_VERSES.find((v) => v.ref === '1 Corinthians 10:13')!
  return (
    <div className="page space-y-4">
      {sent && <p className="text-center font-semibold text-emerald-700 dark:text-emerald-400">Your brothers have been asked to pray. You’re not alone.</p>}
      <div className="flex justify-center py-4" aria-hidden>
        <div className="h-28 w-28 animate-[breathe_10s_ease-in-out_infinite] rounded-full bg-sky-300/60 dark:bg-sky-500/40" />
      </div>
      <p className="muted text-center">Breathe in as the circle grows, out as it shrinks.</p>
      <blockquote className="card border-l-4 border-amber-400">
        <p className="italic">“{verse.text}”</p>
        <footer className="muted mt-2">{verse.ref}</footer>
      </blockquote>
      <section className="card">
        <h2 className="h2 mb-2">Right now, you could…</h2>
        <ul className="space-y-3">
          <li>📵 <strong>Put the phone down</strong>, face down, in another room.</li>
          <li>🚪 <strong>Change rooms</strong>, or step outside for a short walk.</li>
          <li>📞 <strong>Call someone</strong>: a brother, a friend, your pastor. Say it out loud.</li>
          <li>🙏 <strong>Pray</strong>: “Lord, I need you right now. Give me a way out, and the strength to take it.”</li>
          <li>💧 Drink a glass of water, do 20 push-ups, or take a cold shower.</li>
        </ul>
      </section>
      <Link to="/" className="btn-primary w-full">I’m OK for now</Link>
    </div>
  )
}
