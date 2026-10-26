import { useEffect, useState } from 'react'
import ErrorText, { errorMessage } from './ErrorText'
import WhoSees from './WhoSees'
import { sendEncouragement } from '../lib/groups'

const QUICK = ['Thank you 🙏', 'I really needed this', 'Amen!']

/**
 * A short reply to an encouragement ("I really needed this"): a message to whoever sent
 * it, tagged with what it answers. Only they see it, unless you let the group see it too;
 * that's only offered when the group can see what you're replying to.
 */
export default function ReplyBox({ groupId, to, name, replyTo, quote, groupCanSee, onSent, onClose }: {
  groupId: string
  to: string // who wrote it
  name: string
  replyTo: string // the encouragement you're replying to
  quote?: React.ReactNode // what they sent
  groupCanSee: boolean
  onSent: () => void
  onClose: () => void
}) {
  const [text, setText] = useState('')
  const [groupSees, setGroupSees] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function send() {
    setBusy(true)
    setError(null)
    try {
      await sendEncouragement({ group_id: groupId, kind: 'message', to_user: to, reply_to: replyTo, message: text, group_sees: groupCanSee && groupSees })
      onSent()
      onClose()
    } catch (e) {
      setError(errorMessage(e))
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-3 text-left font-normal sm:items-center" role="dialog" aria-modal="true" aria-labelledby="reply-title"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="card w-full max-w-md space-y-3 p-5 shadow-2xl">
        <h2 id="reply-title" className="text-xl font-bold">💬 Reply to {name}</h2>
        {quote && <div className="rounded-lg bg-slate-100 p-3 text-sm dark:bg-slate-800">{quote}</div>}
        <div className="flex flex-wrap gap-2">
          {QUICK.map((q) => (
            <button key={q} type="button" className="rounded-full bg-slate-200 px-3 py-1.5 text-sm font-medium dark:bg-slate-800" onClick={() => setText(q)}>{q}</button>
          ))}
        </div>
        <label htmlFor="reply-text" className="sr-only">Your reply</label>
        <textarea id="reply-text" className="input" rows={2} maxLength={280} value={text} onChange={(e) => setText(e.target.value)} placeholder="A short reply…" autoFocus />
        {groupCanSee ? <WhoSees name={name} groupSees={groupSees} onChange={setGroupSees} /> : <p className="muted text-xs">Only {name} will see it.</p>}
        <ErrorText error={error} />
        <div className="flex gap-2">
          <button className="btn-ghost flex-1" disabled={busy} onClick={onClose}>Cancel</button>
          <button className="btn-primary flex-1" disabled={busy || !text.trim()} onClick={send}>{busy ? 'Sending…' : 'Send'}</button>
        </div>
      </div>
    </div>
  )
}
