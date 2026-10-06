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
