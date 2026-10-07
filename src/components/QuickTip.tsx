import { useEffect, useState } from 'react'
import { useData } from '../data/DataProvider'
import PushToggle from './PushToggle'
import { canPromptInstall, onInstallChange, promptInstall } from '../lib/install'
import { isIos, isStandalone } from '../lib/push'

/**
 * Shown once per person after setup: how to install the app and turn on notifications.
 * "Got it" remembers it on the profile, so it doesn't come back on other phones either.
 * (Settings → Help can show it again.)
 */
export default function QuickTip() {
  const { profile, saveProfile } = useData()
  const [canInstall, setCanInstall] = useState(canPromptInstall)
  const [installed, setInstalled] = useState(isStandalone)

  useEffect(() => onInstallChange(() => setCanInstall(canPromptInstall())), [])

  if (!profile || !profile.onboarded || profile.quick_tip_seen) return null

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="quicktip-title">
      <div className="card max-h-[90dvh] w-full max-w-md space-y-4 overflow-y-auto">
        <h2 id="quicktip-title" className="h1">💡 Quick tip</h2>
        <p className="muted">Two things make Steadfast work best:</p>

        <section className="space-y-2">
          <h3 className="h2">1. Use it as an app</h3>
          {installed ? (
            <p className="text-emerald-700 dark:text-emerald-400">✅ You’re using the installed app. Nice!</p>
          ) : isIos() ? (
            <ol className="ml-5 list-decimal space-y-1 text-sm">
              <li>In <strong>Safari</strong>, tap the <strong>Share</strong> button (square with an arrow).</li>
              <li>Choose <strong>Add to Home Screen</strong> → <strong>Add</strong>.</li>
              <li>From now on, open Steadfast from the new icon.</li>
            </ol>
          ) : canInstall ? (
            <button className="btn-primary w-full"
              onClick={async () => { if (await promptInstall()) setInstalled(true) }}>
              📲 Install Steadfast
            </button>
          ) : (
            <ol className="ml-5 list-decimal space-y-1 text-sm">
              <li>In <strong>Chrome</strong>, tap <strong>⋮</strong> (top right).</li>
              <li>Choose <strong>Install app</strong> (not “Create shortcut”) → <strong>Install</strong>.</li>
              <li>From now on, open Steadfast from the new icon.</li>
            </ol>
          )}
        </section>

        <section className="space-y-2">
          <h3 className="h2">2. Turn on notifications</h3>
          <p className="text-sm">For your daily check-in reminder, and so you know when a brother is praying for you or needs help.</p>
          <PushToggle />
        </section>

        <button className="btn-secondary w-full" onClick={() => saveProfile({ quick_tip_seen: true })}>Got it</button>
      </div>
    </div>
  )
}
