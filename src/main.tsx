import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import './lib/install' // start listening for the browser's "can install" signal early
import App from './App'

// Install/update the service worker (offline support + notifications).
// An installed app can stay open in the background for days, so also look for a new
// version whenever it comes back to the screen (and hourly); the page then reloads itself.
registerSW({
  immediate: true,
  onRegisteredSW(_url, reg) {
    if (!reg) return
    const check = () => { if (navigator.onLine) reg.update().catch(() => {}) }
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check() })
    setInterval(check, 60 * 60 * 1000)
  },
})

// Make sure the offline copy is complete (another app on this address may have cleared it).
navigator.serviceWorker?.ready.then((reg) => reg.active?.postMessage({ type: 'repair-offline-cache' }))

// When a notification is tapped while the app is already open, the service worker
// asks us to jump to the right screen.
navigator.serviceWorker?.addEventListener('message', (event) => {
  if (event.data?.type === 'navigate' && typeof event.data.url === 'string') window.location.href = event.data.url
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
