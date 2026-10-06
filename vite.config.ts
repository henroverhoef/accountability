import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages serves the site from https://<user>.github.io/<repo>/
// so every asset path must start with the repo name. Change this if you rename the repo.
const base = process.env.VITE_BASE ?? '/accountability/'

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
