import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Absolute URLs for social previews: Netlify exposes the site URL as URL / DEPLOY_PRIME_URL at build time.
const SITE_URL = (process.env.URL || process.env.DEPLOY_PRIME_URL || '').replace(/\/$/, '')

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'site-url',
      transformIndexHtml: (html) => html.replaceAll('%SITE_URL%', SITE_URL),
    },
  ],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 4000,
    assetsInlineLimit: 0,
  },
  server: { host: true },
})
