/// <reference lib="webworker" />
// The service worker: runs in the background, even when the app is closed.
// 1) Caches the app so it opens offline.
// 2) Shows push notifications and opens the right screen when one is tapped.
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

declare const self: ServiceWorkerGlobalScope

self.skipWaiting()
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)
// Any page navigation inside the app gets the cached index.html (we use #/routes, so this is simple).
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')))

// ---------- Push notifications ----------------------------------------------
interface PushData {
  title?: string
  body?: string
  url?: string // e.g. "#/checkin"
  tag?: string
}

self.addEventListener('push', (event) => {
  let data: PushData = {}
  try {
    data = event.data?.json() ?? {}
  } catch {
    data = { body: event.data?.text() }
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Steadfast', {
      body: data.body || '',
      icon: 'icon-192.png',
      badge: 'favicon.png',
      tag: data.tag,
      data: { url: data.url || '#/' },
    }),
  )
})

// Tapping a notification opens (or focuses) the app on the right screen.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL((event.notification.data?.url as string) || '#/', self.registration.scope).href
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of windows) {
        if (client.url.startsWith(self.registration.scope)) {
          await client.focus()
          client.postMessage({ type: 'navigate', url: target })
          return
        }
      }
      await self.clients.openWindow(target)
    })(),
  )
})
