/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Same-origin in prod (cookie auth); the dev server proxies /api to the Symfony container.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy: { '/api': process.env.API_PROXY ?? 'http://localhost:8000' } },
  test: { environment: 'jsdom' },
})
