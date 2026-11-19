import { build } from 'esbuild'
import { copyFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// LiteRT loads its WebAssembly glue with importScripts, which needs a classic worker.
const root = fileURLToPath(new URL('../', import.meta.url))
const focusEntry = path.join(root, 'src/studyFocus.worker.js')
const out = path.join(root, 'public/study-runtime')
async function prepare() {
  await mkdir(out, { recursive: true })
  await build({ entryPoints: [focusEntry], outfile: path.join(out, 'focus-worker.js'),
    format: 'iife', platform: 'browser', target: 'safari17', bundle: true, minify: true })
  for (const variant of ['litert_wasm_internal', 'litert_wasm_compat_internal']) {
    for (const ext of ['js', 'wasm']) {
      const file = variant + '.' + ext
      await copyFile(path.join(root, 'node_modules/@litertjs/core/wasm', file), path.join(out, file))
    }
  }
}

export default function studyCameraAssets() {
  return {
    name: 'study-camera-assets',
    async buildStart() { await prepare() },
    async handleHotUpdate({ file }) {
      if (file === focusEntry) await prepare()
    },
  }
}
