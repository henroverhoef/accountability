import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'node:child_process'

// Shown in Settings ("Version 44b8d9e · 16 Oct"), so it's easy to see whether a phone has
// the latest app. Vercel provides the commit; locally we ask git.
function appVersion(): string {
  let commit = process.env.VERCEL_GIT_COMMIT_SHA ?? ''
  if (!commit) {
    try { commit = execSync('git rev-parse HEAD').toString().trim() } catch { commit = 'dev' }
  }
  const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Africa/Johannesburg' })
  return `${commit.slice(0, 7)} · ${date}`
}
process.env.VITE_APP_VERSION = appVersion()

// Where the app lives:
//  - Vercel (the main home): its own address, e.g. https://steadfast.vercel.app/ → base "/"
//  - GitHub Pages: https://<user>.github.io/<repo>/ → base "/<repo>/"
const base = process.env.VITE_BASE ?? (process.env.VERCEL ? '/' : '/accountability/')

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // We write our own service worker (src/sw.ts) so it can handle push notifications.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: false,
      manifest: {
        // A fixed, unique app identity. Other apps on henroverhoef.github.io (e.g. Beursie)
        // share the same web address, so we never want Chrome to mix them up.
        id: 'steadfast-app',
        name: 'Steadfast',
        short_name: 'Steadfast',
        description: 'Daily habits and encouragement with friends',
        theme_color: '#1e3a5f',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,png,svg}'],
      },
      devOptions: { enabled: false },
    }),
  ],
})
