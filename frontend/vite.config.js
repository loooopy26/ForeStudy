import fs from 'node:fs'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import studyCameraAssets from './scripts/study-camera-assets.js'

const frontendRoot = fileURLToPath(new URL('.', import.meta.url))
const frontendRealRoot = fs.realpathSync.native(frontendRoot)
const { FORESTUDY_HTTPS_CERT: cert, FORESTUDY_HTTPS_KEY: key } = process.env
if (Boolean(key) !== Boolean(cert)) throw new Error('Set both FORESTUDY_HTTPS_CERT and FORESTUDY_HTTPS_KEY')
const https = cert && key ? { cert: fs.readFileSync(cert), key: fs.readFileSync(key) } : undefined
const apiOrigin = process.env.FORESTUDY_DEV_API_ORIGIN
const proxy = apiOrigin ? { '^/(api|auth|items|stats|timer|generated-items|tutor-chat-images|health)(/|$)': apiOrigin } : undefined

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), studyCameraAssets()],
  define: apiOrigin ? { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify('') } : undefined,
  server: {
    https,
    // Route room quiz generation to the local backend during development.
    proxy: proxy ?? { '/api/speed-quiz/round': 'http://127.0.0.1:8000' },
    host: '0.0.0.0',
    port: Number(process.env.PORT) || 5173,
    fs: {
      allow: Array.from(new Set([
        frontendRoot,
        frontendRealRoot,
        process.cwd(),
        fs.realpathSync.native(process.cwd()),
      ])),
    },
  },
  preview: {
    https,
    proxy,
    host: '0.0.0.0',
    port: Number(process.env.PORT) || 4173,
  },
})
