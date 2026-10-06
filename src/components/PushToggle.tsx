import { useEffect, useState } from 'react'
import { disablePush, enablePush, getPushStatus, isIos, sendTestPush, type PushStatus } from '../lib/push'
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
      {status === 'not-configured' && <p className="muted">Couldn’t reach the notification server. Check your internet, or the setup isn’t finished yet (see README).</p>}
      {status === 'denied' && <BlockedHelp />}
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

/** Notifications were blocked earlier. The browser won't ask again, so explain where to unblock. */
function BlockedHelp() {
  const site = window.location.host
  return (
    <div className="space-y-2 rounded-xl bg-amber-100 p-3 text-sm text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
      <p className="font-semibold">Notifications are blocked for {site}.</p>
      {isIos() ? (
        <p>iPhone: open <strong>Settings → Notifications → Steadfast</strong> and turn on <strong>Allow Notifications</strong>. Then come back here.</p>
      ) : (
        <ol className="ml-5 list-decimal space-y-1">
          <li>Open <strong>Chrome</strong> → <strong>⋮</strong> → <strong>Settings</strong> → <strong>Site settings</strong> → <strong>Notifications</strong>.</li>
          <li>Find <strong>{site}</strong> (under “Blocked”), tap it and choose <strong>Allow</strong>.</li>
          <li>Also check Android <strong>Settings → Apps → Chrome → Notifications</strong> is on.</li>
          <li>Come back here and reopen this screen.</li>
        </ol>
      )}
      <p className="text-xs opacity-80">This permission is shared by every app on {site}, so it may have been blocked by another one.</p>
    </div>
  )
}
