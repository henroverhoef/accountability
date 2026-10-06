import { useEffect, useState } from 'react'
import { disablePush, enablePush, getPushStatus, sendTestPush, type PushStatus } from '../lib/push'
import ErrorText, { errorMessage } from './ErrorText'

/** "Turn on notifications" button with friendly help for each situation. */
export default function PushToggle({ showTest = true }: { showTest?: boolean }) {
  const [status, setStatus] = useState<PushStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [info, setInfo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getPushStatus().then(setStatus)
  }, [])

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setError(null)
    setInfo(null)
    try {
      await fn()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  if (status === null) return null

  return (
    <div className="space-y-2">
      {status === 'needs-install' && (
        <p className="rounded-xl bg-amber-100 p-3 text-sm text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
          On iPhone, notifications only work after you add Steadfast to your Home Screen: in Safari tap
          <strong> Share → Add to Home Screen</strong>, then open it from the icon.
        </p>
      )}
      {status === 'unsupported' && <p className="muted">This browser can’t receive notifications. Try Chrome on Android or the installed app on iPhone.</p>}
      {status === 'not-configured' && <p className="muted">Notifications aren’t set up on the server yet (missing VAPID key; see README).</p>}
      {status === 'denied' && (
        <p className="muted">Notifications are blocked. Allow them in your phone’s settings for this app, then come back.</p>
      )}
      {status === 'off' && (
        <button className="btn-primary w-full" disabled={busy} onClick={() => run(async () => setStatus(await enablePush()))}>
          🔔 Turn on notifications
        </button>
      )}
      {status === 'on' && (
        <>
          <p className="font-medium text-emerald-700 dark:text-emerald-400">🔔 Notifications are on for this phone.</p>
          <div className="flex gap-2">
            {showTest && (
              <button className="btn-secondary flex-1" disabled={busy}
                onClick={() => run(async () => { const n = await sendTestPush(); setInfo(n > 0 ? 'Test sent: it should arrive in a few seconds.' : 'No device received it. Try turning notifications off and on.') })}>
                Send test
              </button>
            )}
            <button className="btn-ghost flex-1" disabled={busy} onClick={() => run(async () => { await disablePush(); setStatus('off') })}>
              Turn off
            </button>
          </div>
        </>
      )}
      {info && <p className="muted">{info}</p>}
      <ErrorText error={error} />
    </div>
  )
}
