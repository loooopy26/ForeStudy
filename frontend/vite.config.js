import fs from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const frontendRoot = path.resolve(__dirname)
const frontendRealRoot = fs.realpathSync.native(frontendRoot)

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
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
    host: '0.0.0.0',
    port: Number(process.env.PORT) || 4173,
  },
})
