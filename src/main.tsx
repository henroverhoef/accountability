import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import './lib/install' // start listening for the browser's "can install" signal early
import App from './App'

// Install/update the service worker (offline support + notifications).
registerSW({ immediate: true })

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
