/// <reference lib="webworker" />
// The service worker: runs in the background, even when the app is closed.
// 1) Caches the app so it opens offline.
// 2) Shows push notifications and opens the right screen when one is tapped.
import { cleanupOutdatedCaches, createHandlerBoundToURL, getCacheKeyForURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { cacheNames } from 'workbox-core'

declare const self: ServiceWorkerGlobalScope

self.skipWaiting()
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

const PRECACHE = self.__WB_MANIFEST // the app's files, filled in at build time
cleanupOutdatedCaches()
precacheAndRoute(PRECACHE)
// Any page navigation inside the app gets the cached index.html (we use #/routes, so this is simple).
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')))

// ---------- Repairing the offline copy ------------------------------------------
// Other apps on the same web address (e.g. Beursie) may delete ALL offline caches when
// they update. When the app opens it asks us to check, and we re-download anything missing.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'repair-offline-cache') event.waitUntil(repairPrecache())
})

async function repairPrecache() {
  const cache = await caches.open(cacheNames.precache)
  for (const entry of PRECACHE) {
    const url = new URL(typeof entry === 'string' ? entry : entry.url, self.location.href).href
    const key = getCacheKeyForURL(url) ?? url
    if (await cache.match(key)) continue
    try {
      const response = await fetch(url, { cache: 'reload' })
      if (response.ok) await cache.put(key, response)
    } catch {
      return // offline right now; try again next time
    }
  }
}

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
